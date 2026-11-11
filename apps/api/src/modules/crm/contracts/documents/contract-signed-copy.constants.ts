/** Cola de la copia del contrato firmado al correo del titular (bloque G; CA-9). */
export const CONTRACT_SIGNED_COPY_QUEUE = 'crm-contract-signed-copy';
export const CONTRACT_SIGNED_COPY_JOB = 'crm-contract-signed-copy-send';

/** Un trabajo por firma: repetir la firma (replay) no encola otro. */
export function contractSignedCopyJobId(signatureId: string): string {
  return `contract-signed-copy-${signatureId}`;
}

/** Resultado del envío persistido en `contract_signatures.copy_email_status` (migración 189). */
export const CONTRACT_SIGNED_COPY_STATUSES = ['SENT', 'NO_EMAIL', 'TITULAR_RESTRICTED'] as const;
export type ContractSignedCopyStatus = (typeof CONTRACT_SIGNED_COPY_STATUSES)[number];

/** Payload sin PII: contexto tenant explícito (no se propaga solo a BullMQ) y la firma. */
export interface ContractSignedCopyJobPayload {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  signatureId: string;
}
