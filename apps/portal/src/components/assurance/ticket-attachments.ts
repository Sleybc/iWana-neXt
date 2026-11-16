import {
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  TICKET_ATTACHMENT_CONTENT_TYPES,
  TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES,
  isTicketAttachmentContentType,
  ticketAttachmentMaxBytes,
  type TicketAttachmentContentType,
  type TicketAttachmentStatus,
} from '@iwana/shared';
import type { AssuranceTicketAttachmentLink } from '@/lib/api-client';

/**
 * Reglas y textos de los adjuntos de comentarios de tickets en el portal
 * (spec 2026-11-16 «adjuntos en tickets» §2.2). Los límites vienen del contrato
 * compartido; la API vuelve a validar por la firma real del archivo.
 */

export type TicketAttachmentKind = 'image' | 'pdf' | 'video';

const MIB = 1024 * 1024;

const EXTENSION_CONTENT_TYPES: Readonly<Record<string, TicketAttachmentContentType>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
};

/** Valor del `accept` del selector: tipos y extensiones admitidos. */
export const TICKET_ATTACHMENT_ACCEPT = [
  ...TICKET_ATTACHMENT_CONTENT_TYPES,
  ...Object.keys(EXTENSION_CONTENT_TYPES).map((extension) => `.${extension}`),
].join(',');

export const TICKET_ATTACHMENT_HINT =
  'Fotos (JPG, PNG, WebP o GIF) y PDF hasta 25 MB; videos MP4 hasta 100 MB. Máximo 10 archivos.';

export const TICKET_ATTACHMENT_STATUS_LABELS: Readonly<
  Record<Exclude<TicketAttachmentStatus, 'AVAILABLE'>, string>
> = {
  IN_REVIEW: 'En revisión',
  BLOCKED: 'Archivo bloqueado',
};

export function getTicketAttachmentKind(contentType: string): TicketAttachmentKind {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'video/mp4') return 'video';
  return 'image';
}

const KIND_LABELS: Readonly<Record<TicketAttachmentKind, string>> = {
  image: 'Foto',
  pdf: 'PDF',
  video: 'Video',
};

export function getTicketAttachmentKindLabel(contentType: string): string {
  return KIND_LABELS[getTicketAttachmentKind(contentType)];
}

const sizeFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export function formatTicketAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MIB) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / MIB)} MB`;
}

export function formatTicketAttachmentCount(count: number): string {
  return count === 1 ? '1 adjunto' : `${count} adjuntos`;
}

/** Tipo del archivo según el navegador; si no lo sabe, por la extensión. */
function resolveContentType(file: File): TicketAttachmentContentType | null {
  if (isTicketAttachmentContentType(file.type)) return file.type;
  if (file.type && file.type !== 'application/octet-stream') return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_CONTENT_TYPES[extension] ?? null;
}

export interface TicketAttachmentSelectionIssue {
  filename: string;
  message: string;
}

export interface TicketAttachmentSelection {
  files: File[];
  issues: TicketAttachmentSelectionIssue[];
}

function isSameFile(left: File, right: File): boolean {
  return (
    left.name === right.name && left.size === right.size && left.lastModified === right.lastModified
  );
}

/**
 * Suma `incoming` a la selección actual con la validación previa del navegador:
 * tipo, tamaño por tipo, máximo de archivos y total del comentario.
 */
export function addTicketAttachmentFiles(
  current: readonly File[],
  incoming: readonly File[],
): TicketAttachmentSelection {
  const files = [...current];
  const issues: TicketAttachmentSelectionIssue[] = [];
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  for (const file of incoming) {
    if (files.some((selected) => isSameFile(selected, file))) continue;

    const reject = (message: string) => issues.push({ filename: file.name, message });
    const contentType = resolveContentType(file);
    const maxBytes = contentType ? ticketAttachmentMaxBytes(contentType) : null;

    if (file.size === 0) {
      reject('El archivo está vacío.');
    } else if (!contentType || maxBytes === null) {
      reject('Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4.');
    } else if (file.size > maxBytes) {
      reject(`Supera el tamaño máximo de ${Math.round(maxBytes / MIB)} MB para su tipo.`);
    } else if (files.length >= TICKET_ATTACHMENTS_MAX_PER_COMMENT) {
      reject(`Un comentario admite como máximo ${TICKET_ATTACHMENTS_MAX_PER_COMMENT} archivos.`);
    } else if (totalBytes + file.size > TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES) {
      reject(
        `Los archivos del comentario superarían ${Math.round(
          TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES / MIB,
        )} MB en total.`,
      );
    } else {
      files.push(file);
      totalBytes += file.size;
    }
  }

  return { files, issues };
}

/**
 * Lee `status` y `code` de un `ApiError` por su forma: no depende de la clase (las pruebas
 * que sustituyen `@/lib/api-client` no la exponen).
 */
function readApiError(error: unknown): { status: number; code: string; message: string } | null {
  if (!(error instanceof Error)) return null;
  const { status, code } = error as Error & { status?: unknown; code?: unknown };
  return typeof status === 'number' && typeof code === 'string'
    ? { status, code, message: error.message }
    : null;
}

/**
 * Mensaje del rechazo de un comentario con archivos. La API ya nombra el archivo y el
 * motivo en español (400/411/413/503 con código `TICKET_ATTACHMENT…`); otros errores
 * devuelven `null` para que la pantalla use su mensaje genérico.
 */
export function getTicketCommentAttachmentError(error: unknown): string | null {
  const apiError = readApiError(error);
  return apiError?.code.startsWith('TICKET_ATTACHMENT') ? apiError.message : null;
}

export type TicketAttachmentLinkFailure =
  | { kind: 'status'; status: Exclude<TicketAttachmentStatus, 'AVAILABLE'> }
  | { kind: 'error'; message: string };

/** Traduce el fallo al pedir un enlace: 409 actualiza el estado; el resto es un error visible. */
export function getTicketAttachmentLinkFailure(error: unknown): TicketAttachmentLinkFailure {
  const apiError = readApiError(error);
  if (apiError) {
    if (apiError.code === 'TICKET_ATTACHMENT_IN_REVIEW') {
      return { kind: 'status', status: 'IN_REVIEW' };
    }
    if (apiError.code === 'TICKET_ATTACHMENT_BLOCKED') return { kind: 'status', status: 'BLOCKED' };
    if (apiError.status === 404) {
      return { kind: 'error', message: 'Este archivo ya no está disponible.' };
    }
  }
  return { kind: 'error', message: 'No pudimos abrir el archivo. Intenta de nuevo.' };
}

/** Margen para no usar un enlace a punto de vencer (vive 5 min). */
const LINK_EXPIRY_MARGIN_MS = 15_000;

export function isTicketAttachmentLinkFresh(
  link: Pick<AssuranceTicketAttachmentLink, 'expiresAt'> | null,
  now = Date.now(),
): boolean {
  if (!link) return false;
  const expiresAt = Date.parse(link.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now > LINK_EXPIRY_MARGIN_MS;
}

/** Solo URLs http(s): un enlace firmado nunca debe ser `javascript:` ni `data:`. */
export function toSafeTicketAttachmentUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
