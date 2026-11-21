import type { PlatformRole } from '../enums/platform-role.enum';

/**
 * Resumen de usuarios internos de plataforma — contrato v1.0 congelado
 * (2026-11-21, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0). Respuesta de
 * `GET /api/v1/platform-users/summary` envuelta en `{ data }`. Solo conteos,
 * solo `public.platform_users`, excluye borrados lógicos. Sin PII.
 */
export interface PlatformUsersSummary {
  /** Usuarios no borrados, cualquier estado. */
  total: number;
  /** Todas las claves de `PlatformRole`, en 0 si no hay. */
  byRole: Record<PlatformRole, number>;
  /** Usuarios con `mfaEnabled = false`. */
  withoutMfa: number;
  /** Usuarios sin `lastLoginAt` o con `lastLoginAt` anterior a `generatedAt − 30 días`. */
  withoutAccess30d: number;
  /** ISO 8601. */
  generatedAt: string;
}
