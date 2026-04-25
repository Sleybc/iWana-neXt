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
export { AppDataSource, dataSourceOptions, isValidSchemaName, runInTenantSchema } from './data-source';

// Contexto de tenant por request (AsyncLocalStorage)
export { TenantContext } from './tenant-context';
export type { TenantContextPayload } from './tenant-context';

