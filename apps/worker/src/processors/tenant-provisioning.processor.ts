import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import { Pool } from 'pg';
import { DataSource, MigrationInterface } from 'typeorm';
import { Tenant, isValidSchemaName } from '@iwana/db';
import { TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import { TenantSeedService } from '../services/tenant-seed.service';

/**
 * Payload del job de provisioning (debe coincidir con la definicion en api).
 */
interface ProvisioningJobPayload {
  tenantId: string;
  schemaName: string;
  tenantSlug: string;
}

type MigrationConstructor = new () => MigrationInterface;

const requireTenantMigration = createRequire(__filename);

/**
 * Processor BullMQ para el provisioning de schemas de tenant.
 *
 * Responsabilidad:
 * 1. Validar el schemaName del payload (previene SQL injection en DDL).
 * 2. Crear el schema PostgreSQL con CREATE SCHEMA IF NOT EXISTS via pg.Pool.
 * 3. Ejecutar migraciones TypeORM de tenant (runMigrationsForSchema) para crear tablas.
 * 4. Ejecutar TenantSeedService.seedInitialAdmin para sembrar el admin del tenant.
 * 5. Actualizar tenant.status → ACTIVE en el schema PUBLIC via TypeORM.
 * 6. En caso de fallo: actualizar tenant.status → PROVISIONING_FAILED.
 *
 * SEGURIDAD:
 * - schemaName DEBE pasar isValidSchemaName() antes de la interpolacion.
 *   Si no pasa, el job falla de inmediato sin ejecutar SQL.
 * - Nunca interpolar user input sin validar (previene SQL injection en DDL).
 *
 * PGBOUNCER (Risk R2):
 * - Compatible con pgBouncer en transaction pooling mode.
 * - Las tablas se crean via migraciones TypeORM, no via template SQL monolítico.
 *
 * RISK R3 (AsyncLocalStorage):
 * - Este worker NO usa TenantContext.getOrThrow().
 * - Todos los datos de tenant vienen del job payload.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/tenant)
 * ADR-017: Multi-tenant schema-per-tenant isolation
 */
@Processor(TENANT_PROVISIONING_QUEUE)
export class TenantProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantProvisioningProcessor.name);

  private static readonly PROVISIONING_LOCK_NAMESPACE = 42;

  /** Pool de conexiones pg directo para ejecutar DDL (CREATE SCHEMA, CREATE TABLE) */
  private readonly pgPool: Pool;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantSeedService: TenantSeedService,
  ) {
    super();
    // Pool independiente para DDL — no usa el pool de TypeORM
    this.pgPool = new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
      database: process.env['DB_NAME'] ?? 'iwana',
      user: process.env['DB_USER'] ?? 'postgres',
      password: process.env['DB_PASSWORD'] ?? '',
      max: 3, // Pool pequeño solo para DDL de provisioning
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Procesa un job de provisioning de schema de tenant.
   */
  async process(job: Job<ProvisioningJobPayload>): Promise<void> {
    const { tenantId, schemaName, tenantSlug } = job.data;

    this.logger.log(
      `[provisioning] Iniciando provisioning de schema "${schemaName}" para tenant ${tenantSlug} (${tenantId})`,
    );

    // Validar schemaName ANTES de cualquier interpolacion SQL (previene injection)
    if (!isValidSchemaName(schemaName)) {
      const msg = `schemaName "${schemaName}" no pasa la validacion de seguridad. Job abortado.`;
      this.logger.error(`[provisioning] ${msg}`);
      await this.markFailed(tenantId);
      throw new UnrecoverableError(msg);
    }

    const lockResource = this.hashSchemaName(schemaName);
    await this.acquireTenantLock(lockResource);

    try {
      const schemaExists = await this.checkSchemaExists(schemaName);
      if (schemaExists) {
        this.logger.warn(
          `[provisioning] Schema "${schemaName}" ya existe — verificando status del tenant ${tenantSlug}`,
        );
        // Si el schema ya existe pero el tenant sigue en PROVISIONING, lo activamos.
        // Cubre el caso donde el job falló después de crear el schema pero antes de
        // actualizar el status (worker crash, restart, etc.). Idempotencia garantizada.
        const existing = await this.dataSource.getRepository(Tenant).findOne({
          where: { id: tenantId },
        });
        if (existing && existing.status !== 'ACTIVE') {
          await this.dataSource
            .createQueryBuilder()
            .update('public.tenants')
            .set({ status: 'ACTIVE' })
            .where('id = :id', { id: tenantId })
            .execute();
          this.logger.log(
            `[provisioning] Tenant ${tenantSlug} activado (schema ya existía, status corregido a ACTIVE)`,
          );
        } else {
          this.logger.log(`[provisioning] Tenant ${tenantSlug} ya estaba ACTIVE — nada que hacer`);
        }
        return;
      }
      const tenant = await this.dataSource.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new UnrecoverableError(`Tenant ${tenantId} no encontrado en public.tenants.`);
      }

      // Crear el schema de PostgreSQL para el tenant.
      // La creación de tablas se delega completamente a las migraciones TypeORM
      // (incluyendo 000_initial_tenant_schema). Este enfoque reemplaza el patrón
      // anterior basado en tenant_template.sql (eliminado en el ciclo de vida de migraciones).
      const client = await this.pgPool.connect();
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
        this.logger.log(
          `[provisioning] Schema "${schemaName}" creado exitosamente para tenant ${tenantSlug}`,
        );
      } finally {
        client.release();
      }

      await this.runMigrationsForSchema(schemaName);
      this.logger.log(`[provisioning] Migraciones ejecutadas para schema "${schemaName}"`);

      await this.tenantSeedService.seedInitialAdmin({
        tenantId,
        tenantSlug,
        schemaName,
      });

      this.logger.log(`[provisioning] Seed inicial del ADMIN completado para tenant ${tenantSlug}`);

      await this.tenantSeedService.seedTaxPresets(schemaName);
      this.logger.log(`[provisioning] Tax presets sembrados para schema "${schemaName}"`);

      // Actualizar status del tenant a ACTIVE en el schema publico
      await this.dataSource
        .createQueryBuilder()
        .update('public.tenants')
        .set({ status: 'ACTIVE' })
        .where('id = :id', { id: tenantId })
        .execute();

      this.logger.log(`[provisioning] Tenant ${tenantSlug} activado exitosamente (status=ACTIVE)`);
    } catch (error) {
      this.logger.error(
        `[provisioning] Fallo al provisionar schema "${schemaName}" para tenant ${tenantId}: ${(error as Error).message}`,
      );

      await this.rollbackProvisioning(schemaName, tenantId, error as Error);

      throw error;
    } finally {
      await this.releaseTenantLock(lockResource);
    }
  }

  /**
   * Marca el tenant como fallo de provisioning en la DB publica.
   */
  private async markFailed(tenantId: string): Promise<void> {
    try {
      await this.dataSource
        .createQueryBuilder()
        .update('public.tenants')
        .set({ status: 'PROVISIONING_FAILED' })
        .where('id = :id', { id: tenantId })
        .execute();
    } catch (updateError) {
      this.logger.error(
        `[provisioning] No se pudo actualizar status a PROVISIONING_FAILED para tenant ${tenantId}: ${(updateError as Error).message}`,
      );
    }
  }

  private hashSchemaName(schemaName: string): number {
    let hash = 2166136261;
    for (let i = 0; i < schemaName.length; i++) {
      hash ^= schemaName.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash | 0;
  }

  private async acquireTenantLock(resource: number): Promise<void> {
    await this.pgPool.query(`SELECT pg_advisory_lock($1, $2)`, [42, resource]);
  }

  private async releaseTenantLock(resource: number): Promise<void> {
    await this.pgPool.query(`SELECT pg_advisory_unlock($1, $2)`, [42, resource]);
  }

  private async checkSchemaExists(schemaName: string): Promise<boolean> {
    const result = await this.pgPool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async runMigrationsForSchema(schemaName: string): Promise<void> {
    let tenantDs: DataSource | null = null;
    try {
      const migrationsDirectory = path.join(
        __dirname,
        '../../../../packages/database/dist/migrations/tenant',
      );
      const migrations = await this.loadTenantMigrationClasses(migrationsDirectory);

      tenantDs = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
        database: process.env['DB_NAME'] ?? 'iwana',
        username: process.env['DB_USER'] ?? 'postgres',
        password: process.env['DB_PASSWORD'] ?? '',
        schema: schemaName,
        name: `tenant-${schemaName}`,
        migrationsTableName: 'typeorm_migrations',
        migrations,
        synchronize: false,
        extra: { options: `-c search_path="${schemaName}"` },
      });
      await tenantDs.initialize();
      await tenantDs.runMigrations();
    } finally {
      if (tenantDs?.isInitialized) {
        await tenantDs.destroy();
      }
    }
  }

  private async loadTenantMigrationClasses(
    migrationsDirectory: string,
  ): Promise<MigrationConstructor[]> {
    const fileNames = fs
      .readdirSync(migrationsDirectory)
      .filter((fileName) => fileName.endsWith('.js') && fileName !== 'runner.js')
      .sort();

    const migrations: MigrationConstructor[] = [];

    for (const fileName of fileNames) {
      const modulePath = path.join(migrationsDirectory, fileName);
      const migrationModule = requireTenantMigration(modulePath) as Record<string, unknown>;

      for (const exportedValue of Object.values(migrationModule)) {
        if (this.isMigrationConstructor(exportedValue)) {
          migrations.push(exportedValue);
        }
      }
    }

    return migrations;
  }

  private isMigrationConstructor(value: unknown): value is MigrationConstructor {
    if (typeof value !== 'function') {
      return false;
    }

    const prototype = (value as { prototype?: { up?: unknown; down?: unknown } }).prototype;
    return typeof prototype?.up === 'function' && typeof prototype?.down === 'function';
  }

  private async rollbackProvisioning(
    schemaName: string,
    tenantId: string,
    error: Error,
  ): Promise<void> {
    this.logger.error(
      `[provisioning] Rollback iniciado para schema "${schemaName}": ${error.message}`,
    );
    // Eliminar el schema parcialmente creado para que un reintento parta de cero
    await this.pgPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    // Actualizar status a PROVISIONING_FAILED con solo columnas existentes en la entidad
    await this.markFailed(tenantId);
  }
}
