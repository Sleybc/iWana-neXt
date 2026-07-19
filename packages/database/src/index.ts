/**
 * @iwana/db — Capa de acceso a datos con TypeORM.
 *
 * Sprint 1 — MOD01: entidades, DataSource, TenantContext y migracion publica.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 * - ADR-017 (Multi-tenant schema isolation)
 * - ADR-018 (TypeORM como ORM principal)
 */

// Entidades TypeORM
export * from './entities';

// DataSource y utilidades de schema routing
export {
  AppDataSource,
  dataSourceOptions,
  isValidSchemaName,
  runInTenantSchema,
} from './data-source';
export {
  applyTenantMigrationsInOrder,
  runTenantMigrations,
  TENANT_MIGRATIONS,
} from './migrations/tenant/runner';
export {
  DESTRUCTIVE_DOWN_ENV_VAR,
  MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG,
  planTenantRevert,
  revertTenantMigrations,
} from './migrations/tenant/revert';
export type {
  TenantRevertOptions,
  TenantRevertPlan,
  TenantRevertStep,
} from './migrations/tenant/revert';

// Contexto de tenant por request (AsyncLocalStorage)
export {
  TenantContext,
  TenantContextMissingError,
  isTenantContextMissingError,
} from './tenant-context';
export type { TenantContextPayload } from './tenant-context';
