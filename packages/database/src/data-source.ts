import 'reflect-metadata';
import { resolve } from 'path';
import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';
import { AccessPermissionCatalog } from './entities/access-permission-catalog.entity';
import { AccessProfile } from './entities/access-profile.entity';
import { AccessProfilePermission } from './entities/access-profile-permission.entity';
import { MediaAsset } from './entities/media-asset.entity';
import { OrganizationSite } from './entities/organization-site.entity';
import { OrganizationSiteAssignment } from './entities/organization-site-assignment.entity';
import { OrganizationSiteBusinessHour } from './entities/organization-site-business-hour.entity';
import { OrganizationCompanyBusinessHours } from './entities/organization-company-business-hours.entity';
import { OrganizationBusinessHoursException } from './entities/organization-business-hours-exception.entity';
import { OrganizationSiteCapabilityEntity } from './entities/organization-site-capability.entity';
import { OrganizationSiteResponsibilityEntity } from './entities/organization-site-responsibility.entity';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { PlatformBrandingSettings } from './entities/platform-branding-settings.entity';
import { PlatformUser } from './entities/platform-user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { ScheduleEvent } from './entities/schedule-event.entity';
import { ScheduleRescheduleLog } from './entities/schedule-reschedule-log.entity';
import { TechnicianAvailability } from './entities/technician-availability.entity';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { UserAccessProfile } from './entities/user-access-profile.entity';
import { WorkOrder } from './entities/work-order.entity';
import { WorkOrderTask } from './entities/work-order-task.entity';

/**
 * Carga variables de entorno cuando este archivo se ejecuta desde el runner
 * de TypeORM fuera del bootstrap NestJS.
 *
 * En `apps/api`, `ConfigModule` ya resolvió el `.env` antes de construir
 * `TypeOrmModule`, así que este fallback solo actúa cuando faltan variables
 * críticas como `DB_HOST` o `DB_PASSWORD`.
 */
function ensureDatabaseEnvLoaded(): void {
  if (process.env['DB_HOST'] && process.env['DB_USER'] && process.env['DB_PASSWORD']) {
    return;
  }

  const loadEnvFile = (
    process as NodeJS.Process & {
      loadEnvFile?: (path?: string) => void;
    }
  ).loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  const workspaceRoot = resolve(__dirname, '..', '..', '..');

  // `.env.development.local` va PRIMERO y es deliberado.
  //
  // `loadEnvFile` no sobrescribe claves ya presentes en process.env, así que el
  // orden de esta lista fija la precedencia. Esta función corre en tiempo de
  // import (línea final del bloque), y `apps/api/src/app.module.ts` importa
  // `@iwana/db` en su línea 10 — es decir, antes de que el cuerpo del módulo
  // llame a `preloadDevelopmentLocalEnv`. Al volcar el fichero versionado
  // completo (no solo las `DB_*` que este comentario promete), cargarlo primero
  // dejaba el `.local` con precedencia INFERIOR para toda clave compartida: el
  // override local se ignoraba en silencio.
  //
  // Síntoma real que lo destapó: `PLATFORM_SUPER_ADMIN_EMAIL` del `.local` nunca
  // llegaba a `PlatformBootstrapService`, que seguía viendo el email versionado
  // y registraba "bootstrap omitido: el usuario ya existe".
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Ignoramos archivos ausentes para permitir otros entornos/controladores.
    }

    if (process.env['DB_HOST'] && process.env['DB_USER'] && process.env['DB_PASSWORD']) {
      return;
    }
  }
}

ensureDatabaseEnvLoaded();

/**
 * Opciones de configuracion del DataSource TypeORM.
 *
 * MULTI-TENANT: El schema de la conexion no se fija aqui.
 * - Entidades de schema publico: usan schema: 'public' en @Entity() — TypeORM
 *   las califica como "public"."tabla" siempre.
 * - Entidades de schema tenant: SIN schema en @Entity() — TypeORM las genera
 *   sin calificar ("tabla"), PostgreSQL las resuelve via search_path.
 *
 * PGBOUNCER (Riesgo R2): Usar SET LOCAL search_path al inicio de cada
 * transaccion — no usar SET (persistente) que no sobrevive entre
 * conexiones en transaction pooling mode.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 + ADR-018
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env['DB_HOST'] ?? 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  username: process.env['DB_USER'] ?? 'iwana',
  password: process.env['DB_PASSWORD'] ?? '',
  database: process.env['DB_NAME'] ?? 'iwana',
  // Sin 'schema' aqui: las entidades publicas lo tienen en @Entity(),
  // las de tenant usan search_path por transaccion.
  entities: [
    Tenant,
    PlatformUser,
    PlatformAuditLog,
    PlatformBrandingSettings,
    MediaAsset,
    User,
    RefreshToken,
    AuditLog,
    OrganizationSite,
    OrganizationSiteCapabilityEntity,
    OrganizationSiteBusinessHour,
    OrganizationCompanyBusinessHours,
    OrganizationBusinessHoursException,
    OrganizationSiteAssignment,
    OrganizationSiteResponsibilityEntity,
    AccessPermissionCatalog,
    AccessProfile,
    AccessProfilePermission,
    UserAccessProfile,
    // MOD09 — WFM / Programacion Fase 1
    ScheduleEvent,
    WorkOrder,
    WorkOrderTask,
    ScheduleRescheduleLog,
    TechnicianAvailability,
  ],
  migrations: ['dist/migrations/public/*.js'],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
  synchronize: false, // Solo migraciones versionadas — nunca synchronize en produccion
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  logging: process.env['NODE_ENV'] !== 'production' ? ['error', 'migration'] : ['error'],
  extra: {
    // Tamano del pool: ajustado para un solo pod en MVP on-premise
    max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
    min: parseInt(process.env['DB_POOL_MIN'] ?? '2', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  },
};

/** DataSource principal para uso via NestJS DI (TypeOrmModule.forRootAsync) */
export const AppDataSource = new DataSource(dataSourceOptions);

/**
 * Nombre de schema valido: solo letras minusculas, numeros y guiones_bajos.
 * Prefijo obligatorio "tenant_" para distinguir de schemas del sistema.
 * Longitud maxima PostgreSQL: 63 caracteres.
 * Regex: ^tenant_[a-z][a-z0-9_]{0,54}$
 */
export function isValidSchemaName(schemaName: string): boolean {
  return /^tenant_[a-z][a-z0-9_]{0,54}$/.test(schemaName);
}

/**
 * Ejecuta una funcion dentro de una transaccion con el search_path
 * del schema de tenant indicado.
 *
 * Garantiza:
 * 1. SET LOCAL search_path (compatible con pgBouncer transaction pooling)
 * 2. Rollback automatico en caso de error
 * 3. Release del QueryRunner en finally (sin leak de conexiones)
 *
 * @throws Error si schemaName no es un schema de tenant valido
 */
export async function runInTenantSchema<T>(
  dataSource: DataSource,
  schemaName: string,
  fn: (qr: QueryRunner) => Promise<T>,
): Promise<T> {
  // Validar nombre de schema antes de interpolarlo en SQL (prevencion de injection)
  if (!isValidSchemaName(schemaName)) {
    throw new Error(`Schema name invalido: "${schemaName}". Solo se aceptan schemas tenant_*.`);
  }

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    // SET LOCAL revierte al fin de la transaccion — compatible con pgBouncer
    await qr.query(`SET LOCAL search_path TO "${schemaName}"`);
    const result = await fn(qr);
    await qr.commitTransaction();
    return result;
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }
}
