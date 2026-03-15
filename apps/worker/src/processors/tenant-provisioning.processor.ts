import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
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

/**
 * Processor BullMQ para el provisioning de schemas de tenant.
 *
 * Responsabilidad:
 * 1. Leer tenant_template.sql del disco.
 * 2. Reemplazar __SCHEMA_NAME__ con el schemaName validado.
 * 3. Ejecutar el DDL via pg.Pool directamente (NO via TypeORM — el DDL
 *    de CREATE SCHEMA/TABLE no puede ejecutarse en migraciones de TypeORM
 *    facilmente para este patron).
 * 4. Actualizar tenant.status → ACTIVE en el schema PUBLIC via TypeORM.
 * 5. En caso de fallo: actualizar tenant.status → PROVISIONING_FAILED.
 *
 * SEGURIDAD:
 * - schemaName DEBE pasar isValidSchemaName() antes de la interpolacion.
 *   Si no pasa, el job falla de inmediato sin ejecutar SQL.
 * - Nunca interpolar user input sin validar (previene SQL injection en DDL).
 *
 * TRANSACCIONALIDAD (Risk R1):
 * - tenant_template.sql ya incluye BEGIN/COMMIT.
 * - Se ejecuta como un unico pool.query(sql) para respetar la transaccion del template.
 *
 * PGBOUNCER (Risk R2):
 * - SET LOCAL en el template revierte al final de la transaccion.
 * - Compatible con pgBouncer en transaction pooling mode.
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

    try {
      const tenant = await this.dataSource.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new UnrecoverableError(`Tenant ${tenantId} no encontrado en public.tenants.`);
      }

      // Leer el template SQL desde el paquete @iwana/db
      const templatePath = path.resolve(
        __dirname,
        '../../../../packages/database/src/templates/tenant_template.sql',
      );
      const templateSql = fs.readFileSync(templatePath, 'utf-8');

      // Interpolar schemaName validado (ya paso regex — seguro)
      const ddlSql = templateSql.replaceAll('__SCHEMA_NAME__', schemaName);

      // Ejecutar el DDL como una sola query para honrar el BEGIN/COMMIT del template
      const client = await this.pgPool.connect();
      try {
        await client.query(ddlSql);
        this.logger.log(
          `[provisioning] Schema "${schemaName}" creado exitosamente para tenant ${tenantSlug}`,
        );
      } finally {
        client.release();
      }

      await this.tenantSeedService.seedInitialAdmin({
        tenantId,
        tenantSlug,
        schemaName,
        adminEmail: tenant.contactEmail,
      });

      this.logger.log(`[provisioning] Seed inicial del ADMIN completado para tenant ${tenantSlug}`);

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

      await this.markFailed(tenantId);

      // Relanzar para que BullMQ gestione reintentos solo en fallos transitorios.
      // Los errores de tipo UnrecoverableError ya vienen clasificados como permanentes.
      throw error;
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
}
