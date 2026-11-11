import { z } from 'zod';

/**
 * Trabajo interno API → worker para incrustar la firma en el PDF del contrato (bloque D;
 * ADR-109 D1). Solo identificadores: la imagen de la firma viaja cifrada en medios.
 * La API espera el resultado para responder la firma con la huella del PDF firmado.
 */
export const ContractSignedPdfJobPayloadSchema = z
  .object({
    tenantId: z.string().uuid(),
    contractId: z.string().uuid(),
    generationId: z.string().uuid(),
    /** idempotencyKey de la firma: fija las claves de los objetos y el jobId. */
    signingKey: z.string().uuid(),
  })
  .strict();
export type ContractSignedPdfJobPayload = z.infer<typeof ContractSignedPdfJobPayloadSchema>;

export const ContractSignedPdfJobResultSchema = z
  .object({
    signedDocumentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    bytes: z.number().int().positive(),
  })
  .strict();
export type ContractSignedPdfJobResult = z.infer<typeof ContractSignedPdfJobResultSchema>;

/** jobId sin ':' (BullMQ). Determinista: reintentar la firma reutiliza el mismo trabajo. */
export function contractSignedPdfJobId(signingKey: string): string {
  return `contract-signed-pdf-${signingKey}`;
}

/** Claves deterministas de los objetos cifrados de la firma en el almacenamiento de medios. */
export function contractSignatureObjectKeys(
  schemaName: string,
  contractId: string,
  generationId: string,
  signingKey: string,
): { signatureImage: string; signedDocument: string } {
  const base = `${schemaName}/contracts/${contractId}`;
  return {
    signatureImage: `${base}/signatures/${signingKey}.png.enc`,
    signedDocument: `${base}/${generationId}.signed.${signingKey}.pdf.enc`,
  };
}
