/** Cola de los envíos por correo de Facturación (spec MOD05↔MOD14 2026-11-13 D5, D9). */
export const BILLING_EMAIL_QUEUE = 'billing-email-send';
export const BILLING_EMAIL_JOB = 'billing-email-send';

/** Reintentos del envío; al agotarlos la fila pasa a `ERROR` / `FALLO_DE_ENVIO`. */
export const BILLING_EMAIL_ATTEMPTS = 5;

/** Un trabajo por fila del registro: reencolar la misma fila no duplica el envío. */
export function billingEmailJobId(logId: string): string {
  return `billing-email-${logId}`;
}

/** Payload sin PII: contexto tenant explícito (no se propaga solo a BullMQ) y la fila del registro. */
export interface BillingEmailJobPayload {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  logId: string;
}
