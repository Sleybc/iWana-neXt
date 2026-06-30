'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AppDataSource = exports.dataSourceOptions = void 0;
exports.isValidSchemaName = isValidSchemaName;
exports.runInTenantSchema = runInTenantSchema;
require('reflect-metadata');
const path_1 = require('path');
const typeorm_1 = require('typeorm');
const audit_log_entity_1 = require('./entities/audit-log.entity');
const access_permission_catalog_entity_1 = require('./entities/access-permission-catalog.entity');
const access_profile_entity_1 = require('./entities/access-profile.entity');
const access_profile_permission_entity_1 = require('./entities/access-profile-permission.entity');
const media_asset_entity_1 = require('./entities/media-asset.entity');
const organization_site_entity_1 = require('./entities/organization-site.entity');
const organization_site_assignment_entity_1 = require('./entities/organization-site-assignment.entity');
const organization_site_business_hour_entity_1 = require('./entities/organization-site-business-hour.entity');
const organization_company_business_hours_entity_1 = require('./entities/organization-company-business-hours.entity');
const organization_business_hours_exception_entity_1 = require('./entities/organization-business-hours-exception.entity');
const organization_site_capability_entity_1 = require('./entities/organization-site-capability.entity');
const organization_site_responsibility_entity_1 = require('./entities/organization-site-responsibility.entity');
const platform_audit_log_entity_1 = require('./entities/platform-audit-log.entity');
const platform_branding_settings_entity_1 = require('./entities/platform-branding-settings.entity');
const platform_user_entity_1 = require('./entities/platform-user.entity');
const refresh_token_entity_1 = require('./entities/refresh-token.entity');
const schedule_event_entity_1 = require('./entities/schedule-event.entity');
const schedule_reschedule_log_entity_1 = require('./entities/schedule-reschedule-log.entity');
const technician_availability_entity_1 = require('./entities/technician-availability.entity');
const tenant_entity_1 = require('./entities/tenant.entity');
const user_entity_1 = require('./entities/user.entity');
const user_access_profile_entity_1 = require('./entities/user-access-profile.entity');
const work_order_entity_1 = require('./entities/work-order.entity');
const work_order_task_entity_1 = require('./entities/work-order-task.entity');
/**
 * Carga variables de entorno cuando este archivo se ejecuta desde el runner
 * de TypeORM fuera del bootstrap NestJS.
 *
 * En `apps/api`, `ConfigModule` ya resolvió el `.env` antes de construir
 * `TypeOrmModule`, así que este fallback solo actúa cuando faltan variables
 * críticas como `DB_HOST` o `DB_PASSWORD`.
 */
function ensureDatabaseEnvLoaded() {
  if (process.env['DB_HOST'] && process.env['DB_USER'] && process.env['DB_PASSWORD']) {
    return;
  }
  const loadEnvFile = process.loadEnvFile;
  if (!loadEnvFile) {
    return;
  }
  const workspaceRoot = (0, path_1.resolve)(__dirname, '..', '..', '..');
  for (const candidate of ['.env.development', '.env']) {
    try {
      loadEnvFile((0, path_1.resolve)(workspaceRoot, candidate));
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
exports.dataSourceOptions = {
  type: 'postgres',
  host: process.env['DB_HOST'] ?? 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  username: process.env['DB_USER'] ?? 'iwana',
  password: process.env['DB_PASSWORD'] ?? '',
  database: process.env['DB_NAME'] ?? 'iwana',
  // Sin 'schema' aqui: las entidades publicas lo tienen en @Entity(),
  // las de tenant usan search_path por transaccion.
  entities: [
    tenant_entity_1.Tenant,
    platform_user_entity_1.PlatformUser,
    platform_audit_log_entity_1.PlatformAuditLog,
    platform_branding_settings_entity_1.PlatformBrandingSettings,
    media_asset_entity_1.MediaAsset,
    user_entity_1.User,
    refresh_token_entity_1.RefreshToken,
    audit_log_entity_1.AuditLog,
    organization_site_entity_1.OrganizationSite,
    organization_site_capability_entity_1.OrganizationSiteCapabilityEntity,
    organization_site_business_hour_entity_1.OrganizationSiteBusinessHour,
    organization_company_business_hours_entity_1.OrganizationCompanyBusinessHours,
    organization_business_hours_exception_entity_1.OrganizationBusinessHoursException,
    organization_site_assignment_entity_1.OrganizationSiteAssignment,
    organization_site_responsibility_entity_1.OrganizationSiteResponsibilityEntity,
    access_permission_catalog_entity_1.AccessPermissionCatalog,
    access_profile_entity_1.AccessProfile,
    access_profile_permission_entity_1.AccessProfilePermission,
    user_access_profile_entity_1.UserAccessProfile,
    // MOD09 — WFM / Programacion Fase 1
    schedule_event_entity_1.ScheduleEvent,
    work_order_entity_1.WorkOrder,
    work_order_task_entity_1.WorkOrderTask,
    schedule_reschedule_log_entity_1.ScheduleRescheduleLog,
    technician_availability_entity_1.TechnicianAvailability,
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
exports.AppDataSource = new typeorm_1.DataSource(exports.dataSourceOptions);
/**
 * Nombre de schema valido: solo letras minusculas, numeros y guiones_bajos.
 * Prefijo obligatorio "tenant_" para distinguir de schemas del sistema.
 * Longitud maxima PostgreSQL: 63 caracteres.
 * Regex: ^tenant_[a-z][a-z0-9_]{0,54}$
 */
function isValidSchemaName(schemaName) {
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
async function runInTenantSchema(dataSource, schemaName, fn) {
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
//# sourceMappingURL=data-source.js.map
