import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import {
  applyTenantMigrationsInOrder,
  grantTenantSchemaAppPrivileges,
  resolveAppDbRole,
  resolveMigrationDbCredentials,
  TENANT_MIGRATIONS,
  Tenant,
  isValidSchemaName,
} from '@iwana/db';
import { TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantSeedService } from '../services/tenant-seed.service';

/**
 * Payload del job de provisioning (debe coincidir con la definicion en api).
 */
// Importado de @iwana/shared: la declaración local duplicaba la del API sin
// vínculo de compilación, de modo que un campo añadido en un lado y olvidado
// en el otro llegaba como `undefined` en ejecución.

/**
 * Processor BullMQ para el provisioning de schemas de tenant.
 *
 * Responsabilidad:
 * 1. Validar el schemaName del payload (previene SQL injection en DDL).
 * 2. Crear el schema PostgreSQL con CREATE SCHEMA IF NOT EXISTS via pg.Pool.
 * 3. Ejecutar migraciones TypeORM de tenant (runMigrationsForSchema) para crear tablas.
 * 4. Otorgar privilegios SEC-04 al rol app (USAGE/DML) antes del seed.
 * 5. Ejecutar TenantSeedService.seedInitialAdmin para sembrar el admin del tenant.
 * 6. Actualizar tenant.status → ACTIVE en el schema PUBLIC via TypeORM.
 * 7. En caso de fallo: actualizar tenant.status → PROVISIONING_FAILED.
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
    // Pool DDL: SEC-04 migrator cuando DB_MIGRATOR_USER está definido;
    // fallback a DB_USER (compat pnpm dev). Runtime TypeORM del worker sigue en DB_USER.
    const migrator = resolveMigrationDbCredentials();
    this.pgPool = new Pool({
      host: process.env['DB_HOST'] ?? 'localhost',
      port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
      database: process.env['DB_NAME'] ?? 'iwana',
      user: migrator.username,
      password: migrator.password,
      max: 3, // Pool pequeño solo para DDL de provisioning
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Procesa un job de provisioning de schema de tenant.
   */
  async process(job: Job<ProvisioningJobPayload>): Promise<void> {
    const { tenantId, schemaName, tenantSlug, adminEmail } = job.data;

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
          `[provisioning] Schema "${schemaName}" ya existe — verificando estado real del provisioning`,
        );

        // DEF-08: la mera existencia del schema NO prueba que el tenant este
        // provisionado. Un schema preexistente (creado a mano, restaurado de un
        // backup, o dejado a medias por un crash) activaria un tenant vacio o
        // apuntando a datos ajenos. Solo se considera provisionado si TODAS las
        // migraciones de tenant estan aplicadas.
        const migrationsComplete = await this.checkTenantMigrationsComplete(schemaName);

        if (!migrationsComplete) {
          this.logger.warn(
            `[provisioning] Schema "${schemaName}" existe pero con migraciones incompletas — ` +
              `se completara el provisioning antes de activar el tenant ${tenantSlug}`,
          );
          // No retornamos: el flujo normal es idempotente (CREATE SCHEMA IF NOT
          // EXISTS + migraciones en orden + seed que omite lo ya existente).
        } else {
          // Schema completo: recuperacion idempotente de un job que fallo despues
          // de migrar pero antes de actualizar el status (worker crash, restart).
          // Reaplicar grants SEC-04 por si el fallo ocurrió tras DDL y antes del GRANT.
          await this.grantAppSchemaPrivileges(schemaName);
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
              `[provisioning] Tenant ${tenantSlug} activado (schema ya migrado, status corregido a ACTIVE)`,
            );
          } else {
            this.logger.log(
              `[provisioning] Tenant ${tenantSlug} ya estaba ACTIVE — nada que hacer`,
            );
          }
          return;
        }
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

      // SEC-04: DDL como migrator; seed/runtime como app. Sin USAGE el search_path
      // omite el schema y el seed falla con "relation users does not exist".
      await this.grantAppSchemaPrivileges(schemaName);

      await this.tenantSeedService.seedInitialAdmin({
        tenantId,
        tenantSlug,
        schemaName,
        adminEmail,
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

  /**
   * Verifica que el schema tenga aplicadas TODAS las migraciones de tenant.
   *
   * DEF-08: guarda de seguridad antes de activar un tenant sobre un schema
   * preexistente. Si la tabla de migraciones no existe, o el numero de
   * migraciones aplicadas es menor al esperado, el schema NO esta provisionado.
   *
   * Ante cualquier duda (error de consulta) devuelve false: es preferible
   * re-ejecutar un provisioning idempotente que activar un tenant incompleto.
   */
  private async checkTenantMigrationsComplete(schemaName: string): Promise<boolean> {
    // schemaName ya paso isValidSchemaName() al inicio de process().
    try {
      const result = await this.pgPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = 'typeorm_migrations'`,
        [schemaName],
      );

      if (Number(result.rows[0]?.count ?? '0') === 0) {
        return false;
      }

      const applied = await this.pgPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${schemaName}"."typeorm_migrations"`,
      );

      return Number(applied.rows[0]?.count ?? '0') >= TENANT_MIGRATIONS.length;
    } catch (error) {
      this.logger.warn(
        `[provisioning] No se pudo verificar el estado de migraciones de "${schemaName}": ` +
          `${(error as Error).message}. Se asume incompleto.`,
      );
      return false;
    }
  }

  private async runMigrationsForSchema(schemaName: string): Promise<void> {
    let tenantDs: DataSource | null = null;
    try {
      const migrator = resolveMigrationDbCredentials();
      tenantDs = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
        database: process.env['DB_NAME'] ?? 'iwana',
        username: migrator.username,
        password: migrator.password,
        schema: schemaName,
        name: `tenant-${schemaName}`,
        migrationsTableName: 'typeorm_migrations',
        migrations: TENANT_MIGRATIONS,
        synchronize: false,
        extra: { options: `-c search_path="${schemaName}"` },
      });
      await tenantDs.initialize();
      const migrationEnv = await this.resolvePiiContractEnv();
      await applyTenantMigrationsInOrder(tenantDs, migrationEnv);
    } finally {
      if (tenantDs?.isInitialized) {
        await tenantDs.destroy();
      }
    }
  }

  /**
   * Resuelve el entorno de migración para un tenant nuevo (N-1).
   *
   * Un schema recién provisionado no tiene datos pre-SEC-P1: no necesita los
   * digests SHA-256 como respaldo. Si la flota ACTIVE existente ya cerró la
   * ventana 2 (aplicó la 109), el tenant nuevo debe nacer con el contract
   * aplicado; si naciera en 105 mientras el resto está en 106, la paridad por
   * código (F-2) lo marcaría como divergente en cada corrida posterior y el
   * `checkTenantMigrationsComplete` (>= TENANT_MIGRATIONS.length) lo dejaría
   * sin activar. A la inversa, en un entorno pre-contract (flota en ventana 1)
   * el tenant nuevo se provisiona sin el contract para mantener la paridad.
   *
   * Decisión de flota (R2-2): se pregunta si **alguna** ACTIVE ya tiene la 109
   * (no solo el primer schema por nombre). Ante error de consulta (R2-1):
   * fail-closed — la excepción sube a `process()` y BullMQ reintenta; no se
   * activa un tenant asumiendo pre-contract.
   */
  private async resolvePiiContractEnv(): Promise<NodeJS.ProcessEnv> {
    const tenants = await this.pgPool.query<{ schema_name: string }>(
      `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' ORDER BY schema_name`,
    );

    for (const row of tenants.rows ?? []) {
      const schemaName = row.schema_name;
      if (!isValidSchemaName(schemaName)) {
        throw new UnrecoverableError(
          `resolvePiiContractEnv: schema inválido en public.tenants: "${schemaName}"`,
        );
      }
      const contract = await this.pgPool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM "${schemaName}"."typeorm_migrations"
           WHERE "name" = 'DropPiiSha256HashColumns1090000000000'
         ) AS exists`,
      );
      if ((contract.rows ?? [])[0]?.exists) {
        return { ...process.env, IWANA_APPLY_PII_CONTRACT: 'true' };
      }
    }

    return process.env;
  }

  /**
   * Otorga privilegios del contrato SEC-04 al rol app sobre el schema tenant.
   * Fallo aquí aborta el provisioning (no se siembra a ciegas).
   */
  private async grantAppSchemaPrivileges(schemaName: string): Promise<void> {
    const appRole = resolveAppDbRole();
    const migratorRole = resolveMigrationDbCredentials().username;
    await grantTenantSchemaAppPrivileges(this.pgPool, schemaName, {
      appRole,
      migratorRole,
    });
    this.logger.log(
      `[provisioning] Privilegios SEC-04 otorgados en "${schemaName}" (app=${appRole}, migrator=${migratorRole})`,
    );
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
