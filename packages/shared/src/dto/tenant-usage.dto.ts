import { z } from 'zod';
import { PlatformRole } from '../enums/platform-role.enum';

/**
 * Rol que ve el uso por empresa siempre (ADR-114 §9, CTO 2026-11-23). No es configurable:
 * el ajuste solo concede o retira a los demás roles de plataforma.
 */
export const TENANT_USAGE_ALWAYS_VIEWER_ROLE = PlatformRole.SYSTEM_ADMIN;

/** Roles de plataforma que el administrador puede autorizar: todos menos el fijo. */
export const TENANT_USAGE_GRANTABLE_ROLES = [PlatformRole.IWANA_SUPPORT] as const;
export type TenantUsageGrantableRole = (typeof TENANT_USAGE_GRANTABLE_ROLES)[number];

/** Escritura del ajuste (`PUT /api/v1/tenants/usage/visibility`, solo `SYSTEM_ADMIN`). */
export const UpdateTenantUsageVisibilitySchema = z
  .object({
    grantedRoles: z
      .array(z.enum(TENANT_USAGE_GRANTABLE_ROLES))
      .max(TENANT_USAGE_GRANTABLE_ROLES.length)
      .refine((roles) => new Set(roles).size === roles.length, 'Roles repetidos.'),
  })
  .strict();
export type UpdateTenantUsageVisibility = z.infer<typeof UpdateTenantUsageVisibilitySchema>;

/**
 * Lectura del ajuste (`GET /api/v1/tenants/usage/visibility`, `{ data }`). `canView` es la
 * respuesta del API para el usuario actual; la consola monta el área con ella y no repite la regla.
 */
export interface TenantUsageVisibility {
  grantedRoles: TenantUsageGrantableRole[];
  canView: boolean;
}

/** Regla única: el rol fijo o uno concedido. La aplica el API en cada petición. */
export function canRoleViewTenantUsage(
  role: string | null | undefined,
  grantedRoles: readonly string[],
): boolean {
  if (!role) return false;
  return role === TENANT_USAGE_ALWAYS_VIEWER_ROLE || grantedRoles.includes(role);
}

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
