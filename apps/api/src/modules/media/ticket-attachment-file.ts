import {
  TICKET_ATTACHMENT_CONTENT_TYPES,
  TICKET_ATTACHMENT_FILENAME_MAX_LENGTH,
  TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE,
  type TicketAttachmentContentType,
} from '@iwana/shared';
import type {
  TicketAttachmentFileInput,
  TicketAttachmentInspection,
} from '../assurance/ports/ticket-attachment-media.port';
import { detectMagicMime } from './magic-bytes';

/**
 * Reglas puras de los adjuntos de tickets (spec MOD09 adjuntos §2.1 y §4): tipo por firma real,
 * límite por tipo y nombre saneado. Sin E/S: las usan la subida manual y la importación.
 */

/** Extensiones aceptadas por tipo real; la primera es la canónica. */
const EXTENSIONS: Readonly<Record<TicketAttachmentContentType, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4', 'm4v'],
};

/** Tipos que el navegador manda cuando no reconoce el archivo: no contradicen la firma. */
const GENERIC_DECLARED_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const MIB = 1024 * 1024;

export function ticketAttachmentExtension(contentType: TicketAttachmentContentType): string {
  return EXTENSIONS[contentType][0] as string;
}

/**
 * Decide por la firma real. El tipo declarado (cabecera o extensión) nunca rescata un archivo
 * sin firma admitida; si declara otro tipo concreto distinto del real, también se rechaza.
 */
export function inspectTicketAttachmentFile(
  file: TicketAttachmentFileInput,
): TicketAttachmentInspection {
  const size = file.buffer?.length ?? 0;
  if (size === 0) {
    return { ok: false, code: 'ARCHIVO_VACIO', message: 'El archivo está vacío.' };
  }
  const detected = detectMagicMime(
    file.buffer,
    TICKET_ATTACHMENT_CONTENT_TYPES,
  ) as TicketAttachmentContentType | null;
  if (!detected) {
    return {
      ok: false,
      code: 'TIPO_NO_PERMITIDO',
      message: 'Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4.',
    };
  }
  const declared = (file.declaredContentType ?? '').trim().toLowerCase();
  if (!GENERIC_DECLARED_TYPES.has(declared) && declared !== detected) {
    return {
      ok: false,
      code: 'FIRMA_NO_COINCIDE',
      message: 'El contenido del archivo no coincide con el tipo declarado.',
    };
  }
  const maxBytes = TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE[detected];
  if (size > maxBytes) {
    return {
      ok: false,
      code: 'TAMANO_EXCEDIDO',
      message: `El archivo supera el tamaño máximo de ${Math.round(maxBytes / MIB)} MB para su tipo.`,
    };
  }
  return {
    ok: true,
    contentType: detected,
    sizeBytes: size,
    filename: sanitizeTicketAttachmentFilename(file.originalName, detected),
  };
}

/** Caracteres de control, separadores de línea y controles bidireccionales (suplantan la extensión). */
const UNSAFE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

/**
 * Nombre seguro para guardar y para `Content-Disposition`: solo el último segmento (sin rutas),
 * sin caracteres de control ni bidireccionales, sin puntos iniciales, ≤ 200 caracteres y con la
 * extensión del tipo real (si falta o no coincide, se añade la canónica). Nunca queda vacío.
 */
export function sanitizeTicketAttachmentFilename(
  originalName: string | null | undefined,
  contentType: TicketAttachmentContentType,
): string {
  const segments = String(originalName ?? '').split(/[/\\]/u);
  let name = (segments[segments.length - 1] ?? '')
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^\.+/u, '')
    .trim();

  const allowed = EXTENSIONS[contentType];
  const dot = name.lastIndexOf('.');
  const originalExt = dot > 0 ? name.slice(dot + 1) : '';
  const currentExt = originalExt.toLowerCase();
  let ext = originalExt;
  let base = dot > 0 ? name.slice(0, dot) : name;
  if (!allowed.includes(currentExt)) {
    ext = allowed[0] as string;
    base = name;
  }
  base = base.replace(/[.\s]+$/u, '');
  if (base.length === 0) base = 'adjunto';
  const maxBase = TICKET_ATTACHMENT_FILENAME_MAX_LENGTH - ext.length - 1;
  base = truncateUtf16(base, maxBase);
  name = `${base.trimEnd()}.${ext}`;
  return name;
}

/** Corta sin partir pares sustitutos: la longitud cuenta en UTF-16 (Zod) y nunca supera la de PG. */
function truncateUtf16(value: string, max: number): string {
  if (value.length <= max) return value;
  let result = '';
  for (const char of value) {
    if (result.length + char.length > max) break;
    result += char;
  }
  return result;
}

/**
 * `Content-Disposition` RFC 6266: `filename` ASCII de respaldo (sin comillas, barras ni
 * caracteres fuera de ASCII imprimible) y `filename*` UTF-8 codificado por porcentaje.
 */
export function buildContentDisposition(
  filename: string,
  disposition: 'inline' | 'attachment',
): string {
  const fallback =
    filename
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .replace(/[^\x20-\x7e]/gu, '_')
      .replace(/["\\;%]/gu, '_')
      .trim() || 'adjunto';
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
