import type { TenantStatus } from '../enums/tenant-status.enum';

/** Empresa que requiere atención en el resumen de plataforma. Sin PII. */
export interface TenantStatusSummaryAttentionItem {
  id: string;
  name: string;
  status: TenantStatus;
  /** ISO 8601. */
  updatedAt: string;
}

/** Altas y bajas de un mes calendario (America/Bogota). Fuente: `public.platform_audit_logs`. */
export interface TenantStatusSummaryMonth {
  /** `YYYY-MM`. */
  month: string;
  /** Eventos `CREATE` de `Tenant`: empresas dadas de alta en el mes. */
  created: number;
  /** Eventos `DELETE` de `Tenant` (empresa distinta): empresas marcadas para eliminación en el mes. */
  removed: number;
}

/**
 * Resumen de estados de empresas — contrato v1.1 congelado (2026-11-21,
 * PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0; v1.0 en PROMPT-WEB-DASHBOARD-OLA1-v1.0).
 * (PROMPT-WEB-DASHBOARD-OLA1-v1.0). Respuesta de `GET /api/v1/tenants/summary`
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
  /** v1.1 — 12 meses, del más antiguo al actual, meses sin eventos en 0. */
  monthly: TenantStatusSummaryMonth[];
  /** v1.1 — ISO 8601 del `createdAt` de la empresa más antigua en `PROVISIONING`; `null` si no hay. */
  oldestProvisioningAt: string | null;
}
