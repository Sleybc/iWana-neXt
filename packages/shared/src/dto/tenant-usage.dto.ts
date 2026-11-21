import { PlatformRole } from '../enums/platform-role.enum';

/**
 * Roles de plataforma que ven el uso por empresa (ADR-114 §6, CTO 2026-11-21:
 * «System_Admin, y a los roles que se les dé permiso»). Conceder a otro rol es
 * añadirlo aquí; el endpoint y la consola leen esta lista.
 */
export const PLATFORM_TENANT_USAGE_ROLES: readonly PlatformRole[] = [PlatformRole.SYSTEM_ADMIN];

/** Uso de una empresa `ACTIVE`. Solo conteos; sin datos de suscriptores. */
export interface TenantUsageItem {
  tenantId: string;
  name: string;
  /** `null` si la empresa aún no tiene medición (sin dato, nunca 0). */
  activeSubscribers: number | null;
  /** Cupo contratado; `null` si no tiene cupo. */
  maxSubscribers: number | null;
  /** ISO 8601 de la medición; `null` si no hay. Más de 2 h = desactualizada. */
  measuredAt: string | null;
}

/**
 * Uso por empresa — contrato P4 v1.0 congelado (2026-11-21, ADR-114,
 * PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4-v1.0). Respuesta de
 * `GET /api/v1/tenants/usage` envuelta en `{ data }`. Fuente:
 * `public.tenant_usage_snapshots`.
 */
export interface TenantUsage {
  items: TenantUsageItem[];
  /** ISO 8601. */
  generatedAt: string;
}
