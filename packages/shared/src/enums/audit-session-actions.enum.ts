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
