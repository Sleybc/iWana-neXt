import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
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
  summarizeErrorForLog,
} from '@iwana/db';
import { TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import type { ProvisioningJobPayload } from '@iwana/shared';
import { TenantSeedService } from '../services/tenant-seed.service';

/** DT-4: código estable del rechazo de un job sobre un tenant no aprovisionable. */
export const TENANT_NOT_PROVISIONABLE = 'TENANT_NOT_PROVISIONABLE';
/** DT-4: código estable del aviso cuando el estado cambia durante el aprovisionamiento. */
export const TENANT_STATUS_CHANGED_DURING_PROVISIONING =
  'TENANT_STATUS_CHANGED_DURING_PROVISIONING';

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
 * DT-4 (spec 2026-11-09-plat-ops-dt4): solo se aprovisiona un tenant en PROVISIONING; ACTIVE
 * es no-op y cualquier otro estado rechaza el job (TENANT_NOT_PROVISIONABLE).
 * Las transiciones a ACTIVE y a PROVISIONING_FAILED son condicionales a PROVISIONING.
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
  @SanitizeFailedReason()
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
      // DT-4 (spec 2026-11-09-plat-ops-dt4 §3.1): el estado del tenant se lee bajo el lock y
      // ANTES de cualquier DDL. Solo PROVISIONING se aprovisiona; el job de un
      // tenant marcado, suspendido, inactivo o fallido no puede reactivarlo.
      // Esta guarda queda fuera del try de rollback: su rechazo nunca hace DROP
      // SCHEMA ni markFailed.
      const tenant = await this.dataSource.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });

      if (!tenant) {
        // Sin fila no hay estado que proteger ni esquema que atribuirle: se marca
        // como antes (no-op) y se rechaza sin reintento, sin DROP.
        await this.markFailed(tenantId);
        throw new UnrecoverableError(`Tenant ${tenantId} no encontrado en public.tenants.`);
      }

      if (tenant.status === 'ACTIVE') {
        await this.completeActiveTenantNoop(schemaName, tenantSlug);
        return;
      }

      if (tenant.status !== 'PROVISIONING') {
        this.logger.warn(
          `[provisioning] ${TENANT_NOT_PROVISIONABLE}: tenant ${tenantId} en estado ${tenant.status}; ` +
            'job rechazado sin DDL ni cambio de estado',
        );
        throw this.notProvisionableError(tenantId, tenant.status);
      }

      await this.provisionTenant(tenantId, schemaName, tenantSlug, adminEmail);
    } finally {
      await this.releaseTenantLock(lockResource);
    }
  }

  /**
   * Flujo de aprovisionamiento de un tenant en PROVISIONING (completo, o
   * recuperación si el esquema ya está migrado). Cualquier error dispara el
   * rollback (DROP SCHEMA + markFailed condicional).
   */
  private async provisionTenant(
    tenantId: string,
    schemaName: string,
    tenantSlug: string,
    adminEmail: ProvisioningJobPayload['adminEmail'],
  ): Promise<void> {
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
          if (await this.activateIfStillProvisioning(tenantId, tenantSlug)) {
            this.logger.log(
              `[provisioning] Tenant ${tenantSlug} activado (schema ya migrado, status corregido a ACTIVE)`,
            );
          }
          return;
        }
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

      // Actualizar status del tenant a ACTIVE en el schema publico (solo si
      // sigue en PROVISIONING: DT-4 §3.2).
      if (await this.activateIfStillProvisioning(tenantId, tenantSlug)) {
        this.logger.log(
          `[provisioning] Tenant ${tenantSlug} activado exitosamente (status=ACTIVE)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[provisioning] Fallo al provisionar schema "${schemaName}" para tenant ${tenantId}: ${summarizeErrorForLog(error)}`,
      );

      await this.rollbackProvisioning(schemaName, tenantId, error as Error);

      throw error;
    }
  }

  /**
   * DT-4 §3.2: paso a ACTIVE con compare-and-set sobre PROVISIONING. Si no
   * afecta filas, el estado cambió durante el aprovisionamiento (p. ej. un
   * DELETE): se registra y el job termina sin reintento, sin DROP ni markFailed;
   * el esquema queda retenido para la purga como el de cualquier tenant marcado.
   *
   * @returns true si el tenant quedó ACTIVE.
   */
  private async activateIfStillProvisioning(
    tenantId: string,
    tenantSlug: string,
  ): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update('public.tenants')
      .set({ status: 'ACTIVE' })
      .where('id = :id AND status = :expectedStatus', {
        id: tenantId,
        expectedStatus: 'PROVISIONING',
      })
      .execute();

    if ((result?.affected ?? 0) === 0) {
      this.logger.warn(
        `[provisioning] ${TENANT_STATUS_CHANGED_DURING_PROVISIONING}: tenant ${tenantSlug} (${tenantId}) ` +
          'dejó de estar en PROVISIONING durante el aprovisionamiento; no se activa ni se borra el esquema',
      );
      return false;
    }
    return true;
  }

  /**
   * DT-4 §3.1: un job sobre un tenant ya ACTIVE es un no-op idempotente. Solo
   * reaplica los grants SEC-04 si el esquema existe; nunca hace DDL ni cambia
   * el estado, y un fallo aquí no dispara rollback (el tenant está en uso).
   */
  private async completeActiveTenantNoop(schemaName: string, tenantSlug: string): Promise<void> {
    if (await this.checkSchemaExists(schemaName)) {
      await this.grantAppSchemaPrivileges(schemaName);
    }
    this.logger.log(`[provisioning] Tenant ${tenantSlug} ya estaba ACTIVE — nada que hacer`);
  }

  /**
   * Error no reintentable con código estable. `SanitizeFailedReason` sustituye
   * el mensaje por el resumen seguro, que conserva solo `code=TENANT_NOT_PROVISIONABLE`:
   * el estado leído NO llega al `failedReason` del job; solo queda en el `warn`
   * que `process()` registra antes de lanzar este error.
   */
  private notProvisionableError(tenantId: string, status: string): UnrecoverableError {
    const error = new UnrecoverableError(
      `${TENANT_NOT_PROVISIONABLE}: tenant ${tenantId} en estado ${status}`,
    );
    Object.defineProperty(error, 'code', {
      value: TENANT_NOT_PROVISIONABLE,
      enumerable: true,
      configurable: true,
      writable: false,
    });
    return error;
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
        // DT-4 §3.2: un fallo nunca saca a un tenant de MARKED_FOR_DELETION
        // (ni de ningún otro estado distinto de PROVISIONING).
        .where('id = :id AND status = :expectedStatus', {
          id: tenantId,
          expectedStatus: 'PROVISIONING',
        })
        .execute();
    } catch (updateError) {
      this.logger.error(
        `[provisioning] No se pudo actualizar status a PROVISIONING_FAILED para tenant ${tenantId}: ${summarizeErrorForLog(updateError)}`,
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
          `${summarizeErrorForLog(error)}. Se asume incompleto.`,
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
   *
   * Gobernanza: es un gate de PRIMERA APLICACIÓN, no un gate por corrida. A
   * partir del primer contract aplicado en la flota, el provisioning lo
   * replica solo, sin intervención humana; nadie debe leer el flag en el
   * runbook como «hace falta autorización cada vez».
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
        // Gate de PRIMERA APLICACIÓN, no por corrida: si la flota ya aplicó el
        // contract, el provisioning lo propaga solo y sin intervención humana.
        // La autorización es la decisión de abrir la ventana 2, no esta rama.
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
      `[provisioning] Rollback iniciado para schema "${schemaName}": ${summarizeErrorForLog(error)}`,
    );
    // Eliminar el schema parcialmente creado para que un reintento parta de cero
    await this.pgPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    // Actualizar status a PROVISIONING_FAILED con solo columnas existentes en la entidad
    await this.markFailed(tenantId);
  }
}
