import type { TenantStatus } from '../enums/tenant-status.enum';

/** Empresa que requiere atención en el resumen de plataforma. Sin PII. */
export interface TenantStatusSummaryAttentionItem {
  id: string;
  name: string;
  status: TenantStatus;
  /** ISO 8601. */
  updatedAt: string;
}

/**
 * Resumen de estados de empresas — contrato v1.0 congelado
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
}
