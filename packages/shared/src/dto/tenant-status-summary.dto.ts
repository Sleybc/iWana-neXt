import { z } from 'zod';
import type { TenantStatus } from '../enums/tenant-status.enum';

/** Empresa que requiere atención en el resumen de plataforma. Sin PII. */
export interface TenantStatusSummaryAttentionItem {
  id: string;
  name: string;
  status: TenantStatus;
  /** ISO 8601. */
  updatedAt: string;
}

/** v1.2 — largos admitidos de la serie mensual, contando el mes en curso como último punto. */
export const TENANT_STATUS_SUMMARY_PERIOD_MONTHS = [6, 12, 24] as const;

export type TenantStatusSummaryPeriodMonths = (typeof TENANT_STATUS_SUMMARY_PERIOD_MONTHS)[number];

/** v1.2 — largo de la serie cuando la petición no trae `months`. */
export const TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS: TenantStatusSummaryPeriodMonths = 12;

export function isTenantStatusSummaryPeriodMonths(
  value: number,
): value is TenantStatusSummaryPeriodMonths {
  return (TENANT_STATUS_SUMMARY_PERIOD_MONTHS as readonly number[]).includes(value);
}

/**
 * v1.2 — query de `GET /api/v1/tenants/summary`: `months` = `6`, `12` o `24` (texto exacto de
 * la URL); 12 si se omite. Cualquier otro valor o parámetro → 400.
 */
export const TenantStatusSummaryQuerySchema = z
  .object({
    months: z
      .enum(['6', '12', '24'])
      .optional()
      .transform((value): TenantStatusSummaryPeriodMonths => {
        const months = Number(value ?? TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS);
        return isTenantStatusSummaryPeriodMonths(months)
          ? months
          : TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS;
      }),
  })
  .strict();

export type TenantStatusSummaryQuery = z.infer<typeof TenantStatusSummaryQuerySchema>;

/** Un mes calendario (America/Bogota) de la tendencia. Fuente: `public.platform_audit_logs`. */
export interface TenantStatusSummaryMonth {
  /** `YYYY-MM`. */
  month: string;
  /**
   * Empresas cuyo primer evento `CREATE` de `Tenant` cae en el mes (altas). Un `CREATE` posterior
   * de la misma empresa (p. ej. de branding) no es un alta (semántica aprobada por AI-EM-ARCH, H5).
   */
  created: number;
  /** Eventos `DELETE` de `Tenant` (empresa distinta): empresas marcadas para eliminación en el mes. */
  removed: number;
  /**
   * v1.2 — empresas en `ACTIVE` al último instante del mes (America/Bogota); en el mes en curso,
   * el valor de hoy (= `byStatus.ACTIVE`). `null` (nunca 0) si el estado al cierre de alguna
   * empresa no se puede reconstruir con certeza desde el historial de cambios de estado: sin
   * eventos auditados antes del cierre, o en aprovisionamiento al cierre sin prueba de que no se
   * activó antes de él (la activación del aprovisionador no se audita).
   */
  activeAtClose: number | null;
}

/**
 * Resumen de estados de empresas — contrato v1.2 congelado (2026-11-22, F2-D2, dirección v1.2
 * §8.3; v1.1 en PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0; v1.0 en
 * PROMPT-WEB-DASHBOARD-OLA1-v1.0). Respuesta de `GET /api/v1/tenants/summary?months=6|12|24`
 * envuelta en `{ data }`.
 */
export interface TenantStatusSummary {
  total: number;
  /** Todas las claves de `TenantStatus`, en 0 si no hay empresas en ese estado. */
  byStatus: Record<TenantStatus, number>;
  updatedLast7Days: number;
  /** Máximo 5; severidad PROVISIONING_FAILED, MARKED_FOR_DELETION, SUSPENDED y luego updatedAt desc. */
  attention: TenantStatusSummaryAttentionItem[];
  /** ISO 8601. */
  generatedAt: string;
  /** v1.1 — mes en curso; igual al último elemento de `monthly`. */
  period: TenantStatusSummaryMonth;
  /**
   * v1.1 — serie del más antiguo al actual, meses sin eventos en 0. v1.2: `months` elementos
   * (6, 12 o 24; 12 por defecto).
   */
  monthly: TenantStatusSummaryMonth[];
  /** v1.1 — ISO 8601 del `createdAt` de la empresa más antigua en `PROVISIONING`; `null` si no hay. */
  oldestProvisioningAt: string | null;
}
