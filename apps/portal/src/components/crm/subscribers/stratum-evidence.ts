import { ApiError } from '@/lib/api-client';

/**
 * Reglas del soporte de estrato (C-MEDIA-1 v1.0 y C-API-4 v1.0): PDF o imagen
 * JPG, PNG o WEBP, de hasta 10 MiB. La validación de aquí solo evita una subida
 * que el servidor rechazaría; el servidor valida los bytes y es la autoridad.
 */
export const STRATUM_EVIDENCE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Valor del atributo `accept` del control de archivo. */
export const STRATUM_EVIDENCE_ACCEPT = STRATUM_EVIDENCE_MIME_TYPES.join(',');

export const STRATUM_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/** Código del 422 cuando el archivo no es de un tipo admitido (C-API-4 v1.0). */
export const STRATUM_EVIDENCE_TYPE_NOT_ALLOWED = 'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED';

/** Formatos en lenguaje de negocio: la UI nunca muestra códigos MIME. */
export const STRATUM_EVIDENCE_FORMATS_LABEL = 'PDF o imagen JPG, PNG o WEBP, hasta 10 MB';

export const STRATUM_EVIDENCE_TYPE_MESSAGE = `Ese tipo de archivo no está admitido. Formatos admitidos: ${STRATUM_EVIDENCE_FORMATS_LABEL}.`;

export const STRATUM_EVIDENCE_SIZE_MESSAGE =
  'El archivo supera el máximo de 10 MB. Adjunta uno más liviano.';

export const STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE =
  'No se pudo cargar el soporte. Intenta de nuevo.';

/** Error de validación local del archivo; `null` si el archivo es admisible. */
export function stratumEvidenceFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(STRATUM_EVIDENCE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return STRATUM_EVIDENCE_TYPE_MESSAGE;
  }
  if (file.size > STRATUM_EVIDENCE_MAX_BYTES) {
    return STRATUM_EVIDENCE_SIZE_MESSAGE;
  }
  return null;
}

/**
 * Mensaje de negocio para un fallo al subir el soporte. No reenvía el texto del
 * servidor: el 422 de tipo tiene mensaje propio y cualquier otro fallo, el genérico.
 */
export function stratumEvidenceUploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === STRATUM_EVIDENCE_TYPE_NOT_ALLOWED) {
    return STRATUM_EVIDENCE_TYPE_MESSAGE;
  }
  return STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE;
}
