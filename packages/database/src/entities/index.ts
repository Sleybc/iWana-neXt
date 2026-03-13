/**
 * Barrel export de entidades TypeORM del paquete @iwana/db.
 * Sprint 1 — Entidades de MOD01: Auth + Tenant + Audit.
 */

// Schema publico
export { Tenant } from './tenant.entity';
export { PlatformUser } from './platform-user.entity';
export { PlatformAuditLog } from './platform-audit-log.entity';

// Schema por tenant (dinamico via SET LOCAL search_path)
export { User } from './user.entity';
export { RefreshToken } from './refresh-token.entity';
export { AuditLog } from './audit-log.entity';
