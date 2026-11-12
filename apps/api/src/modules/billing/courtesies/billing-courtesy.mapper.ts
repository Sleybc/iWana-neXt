import {
  BillingCourtesyResponseSchema,
  type BillingCourtesyApplication,
  type BillingCourtesyReason,
  type BillingCourtesyResponse,
  type BillingCourtesyStatus,
  type BillingCourtesyTarget,
  type BillingCourtesyVoidReason,
} from '@iwana/shared';
import type { EntityManager } from 'typeorm';

export interface CourtesyRow {
  id: string;
  document_id: string;
  subscriber_id: string;
  application: BillingCourtesyApplication;
  target: BillingCourtesyTarget;
  source_line_id: string | null;
  line_id: string | null;
  amount: string;
  reason_code: BillingCourtesyReason;
  note: string | null;
  status: BillingCourtesyStatus;
  void_reason_code: BillingCourtesyVoidReason | null;
  void_note: string | null;
  voided_at: Date | string | null;
  voided_by: string | null;
  void_idempotency_key?: string | null;
  created_by: string;
  created_at: Date | string;
}

export const COURTESY_COLUMNS = `c.id::text, c.document_id::text, c.subscriber_id::text,
  c.application, c.target, c.source_line_id::text, c.line_id::text,
  c.amount::numeric(14,2)::text AS amount, c.reason_code, c.note, c.status,
  c.void_reason_code, c.void_note, c.voided_at, c.voided_by::text, c.void_idempotency_key,
  c.created_by::text, c.created_at`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toCourtesyResponse(row: CourtesyRow): BillingCourtesyResponse {
  return BillingCourtesyResponseSchema.parse({
    id: row.id,
    documentId: row.document_id,
    subscriberId: row.subscriber_id,
    application: row.application,
    target: row.target,
    sourceLineId: row.source_line_id,
    lineId: row.line_id,
    amount: row.amount,
    reasonCode: row.reason_code,
    note: row.note,
    status: row.status,
    voidReasonCode: row.void_reason_code,
    voidNote: row.void_note,
    voidedAt: row.voided_at == null ? null : iso(row.voided_at),
    voidedBy: row.voided_by,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  });
}

/**
 * Cortesía sin sus notas de texto libre: el lector no puede ver los datos de un titular con
 * DATOS_BLOQUEADOS (mismo criterio que `buyerProtected`).
 */
export function redactCourtesyNotes(courtesy: BillingCourtesyResponse): BillingCourtesyResponse {
  return { ...courtesy, note: null, voidNote: null };
}

/** Cortesías de varios documentos, de la más reciente a la más antigua. */
export async function courtesiesByDocument(
  manager: Pick<EntityManager, 'query'>,
  tenantId: string,
  documentIds: string[],
): Promise<Map<string, BillingCourtesyResponse[]>> {
  const grouped = new Map<string, BillingCourtesyResponse[]>();
  if (documentIds.length === 0) return grouped;
  const rows = (await manager.query(
    `SELECT ${COURTESY_COLUMNS} FROM billing_courtesies c
      WHERE c.tenant_id = $1 AND c.document_id = ANY($2::uuid[])
      ORDER BY c.created_at DESC, c.id DESC`,
    [tenantId, documentIds],
  )) as CourtesyRow[];
  for (const row of rows) {
    const list = grouped.get(row.document_id) ?? [];
    list.push(toCourtesyResponse(row));
    grouped.set(row.document_id, list);
  }
  return grouped;
}
