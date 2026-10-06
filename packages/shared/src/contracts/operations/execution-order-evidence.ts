/** Restricciones compartidas para subir evidencia de una OT. */
export const EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS = {
  /** Tamaño máximo aceptado por el servicio de assets. */
  MAX_BYTES: 25 * 1024 * 1024,
  /** MIME permitidos por validación de contenido del servicio de assets. */
  ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  /** El lienzo de firma produce un PNG. */
  SIGNATURE_MIMES: ['image/png'],
} as const;
