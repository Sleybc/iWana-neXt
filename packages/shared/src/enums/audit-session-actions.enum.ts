import { AuditAction } from './audit-action.enum';

/**
 * Acciones de sesión que el Centro de control oculta de «Actividad reciente».
 * `GET /api/v1/platform-audit-logs?excludeSessionEvents=true` las filtra en servidor
 * (contrato 2026-11-21, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0).
 */
export const AUDIT_SESSION_ACTIONS = [
  AuditAction.LOGIN,
  AuditAction.LOGOUT,
  AuditAction.LOGIN_FAILED,
  AuditAction.REFRESH,
] as const;

/**
 * Lecturas auditadas (p. ej. `GET tenants/usage`, ADR-114): se conservan en el historial, pero no
 * son actividad. `GET /api/v1/platform-audit-logs?excludeAccessEvents=true` las saca del feed.
 */
export const PLATFORM_AUDIT_ACCESS_ACTIONS = [
  AuditAction.LIST_ACCESS,
  AuditAction.RECORD_ACCESS,
] as const;
