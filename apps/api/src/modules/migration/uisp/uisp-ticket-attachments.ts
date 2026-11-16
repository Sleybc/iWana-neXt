import {
  MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS,
  migrationTicketAttachmentExternalId,
  type MigrationTicketAttachmentSkipReason,
  type MigrationTicketAttachmentsReport,
} from '@iwana/shared';
import { ticketCommentEntries } from './uisp-promotion-mapping';

/**
 * Adjuntos de los comentarios de un ticket de UISP (spec MOD09 adjuntos §2.3). Pura: sin I/O
 * ni nombres de archivo en logs.
 *
 * UISP referencia cada adjunto en `activity[].comment.attachments[]` (`id`, `filename`,
 * `mimeType`, `size`) y guarda el archivo en `tickets/<ticket>/<filename>` del ZIP. El nombre
 * del JSON no es confiable: nunca se usa para construir una ruta fuera de la carpeta de su
 * ticket; solo se compara contra las entradas ya leídas (y validadas) del ZIP.
 */
type Raw = Record<string, unknown> | null | undefined;

export interface UispTicketAttachmentRef {
  uispId: string;
  /** `uisp:ticket_attachment:<id>`. */
  externalId: string;
  /** Nombre tal como lo trae UISP (lo sanea Soporte al guardarlo). */
  filename: string;
  /** `mimeType` declarado (no confiable: decide la firma). */
  declaredContentType: string | null;
}

export interface UispCommentAttachments {
  refs: UispTicketAttachmentRef[];
  /** Referencias sin id válido o con nombre inseguro: `NOMBRE_INVALIDO`. */
  invalid: number;
}

export interface UispTicketAttachmentPlan {
  /** Uno por comentario importado, en el mismo orden que `ticketCommentEntries`. */
  byComment: UispCommentAttachments[];
  /** Adjuntos de comentarios que no se importan (sin texto): `COMENTARIO_NO_IMPORTADO`. */
  orphaned: number;
}

/** Id de UISP: entero positivo (número o texto de dígitos). */
const UISP_ID = /^[1-9]\d{0,18}$/u;
/** Límite de un segmento de ruta del lector seguro de ZIP. */
const MAX_FILENAME_LENGTH = 255;
const UNSAFE_FILENAME = /[/\\\u0000-\u001f\u007f]/u;

function uispId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === 'string' && UISP_ID.test(value.trim()) ? value.trim() : null;
}

/** Un solo segmento de ruta: sin separadores, controles, `.` ni `..`, y no vacío. */
export function isSafeTicketAttachmentFilename(name: string): boolean {
  if (name.trim().length === 0 || name.length > MAX_FILENAME_LENGTH) return false;
  if (name === '.' || name === '..') return false;
  return !UNSAFE_FILENAME.test(name);
}

function attachmentsOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function commentAttachments(value: unknown): UispCommentAttachments {
  const result: UispCommentAttachments = { refs: [], invalid: 0 };
  for (const item of attachmentsOf(value)) {
    const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const id = uispId(entry?.['id']);
    const filename = entry?.['filename'];
    if (!id || typeof filename !== 'string' || !isSafeTicketAttachmentFilename(filename)) {
      result.invalid += 1;
      continue;
    }
    const declared = entry?.['mimeType'];
    result.refs.push({
      uispId: id,
      externalId: migrationTicketAttachmentExternalId(id),
      filename,
      declaredContentType: typeof declared === 'string' ? declared : null,
    });
  }
  return result;
}

export function ticketAttachmentPlan(raw: Raw): UispTicketAttachmentPlan {
  const imported = ticketCommentEntries(raw);
  const byComment = imported.map((entry) => commentAttachments(entry.attachments));
  const activity = Array.isArray(raw?.['activity']) ? (raw['activity'] as Raw[]) : [];
  let total = 0;
  for (const entry of activity) {
    const comment = entry?.['comment'] as Raw;
    total += attachmentsOf(comment?.['attachments']).length;
  }
  const referenced = byComment.reduce((sum, item) => sum + item.refs.length + item.invalid, 0);
  return { byComment, orphaned: Math.max(0, total - referenced) };
}

/** Carpeta `tickets/<id>/` del ticket, o `null` si el id no es un segmento seguro. */
export function ticketAttachmentFolder(ticketSourceId: string): string | null {
  return /^[A-Za-z0-9_-]{1,64}$/u.test(ticketSourceId) ? `tickets/${ticketSourceId}/` : null;
}

/**
 * Bytes de `tickets/<ticket>/<filename>` entre las entradas del ZIP (relativas a `client.json`),
 * o `null`. Compara primero exacto y después con la forma Unicode NFC (los ZIP de macOS guardan
 * NFD). Nunca construye una ruta fuera de la carpeta del ticket.
 */
export function findTicketAttachmentFile(
  entries: ReadonlyMap<string, Buffer>,
  ticketSourceId: string,
  filename: string,
): Buffer | null {
  const folder = ticketAttachmentFolder(ticketSourceId);
  if (!folder || !isSafeTicketAttachmentFilename(filename)) return null;
  const exact = entries.get(`${folder}${filename}`);
  if (exact) return exact;
  const wanted = filename.normalize('NFC');
  for (const [path, content] of entries) {
    if (!path.startsWith(folder)) continue;
    const name = path.slice(folder.length);
    if (name.includes('/')) continue;
    if (name.normalize('NFC') === wanted) return content;
  }
  return null;
}

// ── Conteos del informe («Adjuntos de tickets no importados: N» por motivo) ─────────────

export function emptyTicketAttachmentsReport(): MigrationTicketAttachmentsReport {
  return { importados: 0, existentes: 0, noImportados: {} };
}

export type TicketAttachmentCount =
  | { status: 'CREATED' }
  | { status: 'EXISTING' }
  | { status: 'SKIPPED'; reason: MigrationTicketAttachmentSkipReason };

export function addTicketAttachmentCount(
  report: MigrationTicketAttachmentsReport,
  outcome: TicketAttachmentCount,
  times = 1,
): void {
  if (times <= 0) return;
  if (outcome.status === 'CREATED') report.importados += times;
  else if (outcome.status === 'EXISTING') report.existentes += times;
  else report.noImportados[outcome.reason] = (report.noImportados[outcome.reason] ?? 0) + times;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

/** Suma un conteo guardado en `promotion_meta` (jsonb no confiable: ignora lo desconocido). */
export function sumTicketAttachmentReports(
  total: MigrationTicketAttachmentsReport,
  stored: unknown,
): void {
  if (!stored || typeof stored !== 'object') return;
  const value = stored as Record<string, unknown>;
  total.importados += count(value['importados']);
  total.existentes += count(value['existentes']);
  const skipped = value['noImportados'];
  if (!skipped || typeof skipped !== 'object') return;
  for (const reason of MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS) {
    const n = count((skipped as Record<string, unknown>)[reason]);
    if (n > 0) total.noImportados[reason] = (total.noImportados[reason] ?? 0) + n;
  }
}
