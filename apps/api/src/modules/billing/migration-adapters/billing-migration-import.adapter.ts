import { Injectable } from '@nestjs/common';
import type { MigrationRevertBlocker, MigrationRevertBlockReason } from '@iwana/shared';
import {
  MigrationBillingImportPort,
  type BillingRevertResult,
  type BillingTotals,
  type ImportedBillingDocumentInput,
  type ImportedPaymentInput,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
  type MigrationWriteContext,
} from '../../migration/ports/migration-import.ports';

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

/** `uisp:invoice:12` → `uisp_invoice_12` (el CHECK de origen ya limita a [A-Za-z0-9._-]). */
function storageSafe(externalId: string): string {
  return externalId.replace(/[^A-Za-z0-9._-]/gu, '_');
}

function blocker(motivo: MigrationRevertBlockReason, cantidad: number): MigrationRevertBlocker[] {
  return cantidad > 0 ? [{ motivo, cantidad }] : [];
}

/**
 * Adaptador MOD14 de la importación desde UISP (ADR-110 D5, D6, D7). Crea documentos de cobro
 * `IMPORTADO` (sin número propio, periodo, emisión, eventos ni anulación), pagos con origen
 * importado (`import_batch_id`) y aplicaciones con la marca de transacción que exige el trigger
 * de la 199. Solo toca tablas de Billing.
 */
@Injectable()
export class BillingMigrationImportAdapter extends MigrationBillingImportPort {
  async findDocuments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    return this.idsByExternal(ctx, 'billing_documents', externalIds);
  }

  async findPayments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    return this.idsByExternal(ctx, 'billing_payments', externalIds);
  }

  async createImportedDocument(
    ctx: MigrationWriteContext,
    input: ImportedBillingDocumentInput,
  ): Promise<string> {
    const rows = (await ctx.manager.query(
      `INSERT INTO billing_documents (
         tenant_id, period_id, contract_id, subscriber_id, status, number, issue_date, due_date,
         subtotal, tax_total, total, unbilled_additional_count, created_by,
         external_id, external_number, import_batch_id, external_pdf_key)
       VALUES ($1, NULL, $2, $3, 'IMPORTADO', NULL, $4::date, $5::date,
         $6::numeric, 0, $6::numeric, 0, $7, $8, $9, $10, $11)
       RETURNING id::text`,
      [
        ctx.tenantId,
        input.contractId,
        input.subscriberId,
        input.issueDate,
        input.dueDate,
        money(input.total),
        ctx.actorId,
        input.externalId,
        input.externalNumber?.slice(0, 40) ?? null,
        ctx.batchId,
        input.pdfKey,
      ],
    )) as Array<{ id: string }>;
    const documentId = rows[0]!.id;
    let position = 1;
    for (const line of input.lines) {
      await ctx.manager.query(
        `INSERT INTO billing_document_lines (
           tenant_id, document_id, kind, description, quantity, unit_price, base_amount,
           tax_amount, total, vat_treatment, vat_rate, vat_legal_basis, position)
         VALUES ($1, $2, 'PLAN', $3, $4::numeric, $5::numeric, $6::numeric, 0, $6::numeric,
           'IMPORTADO', 0, NULL, $7)`,
        [
          ctx.tenantId,
          documentId,
          (line.description.trim() || 'Concepto importado').slice(0, 200),
          line.quantity,
          money(line.unitPrice),
          money(line.total),
          position,
        ],
      );
      position += 1;
    }
    return documentId;
  }

  /** `<schema>/billing-imported/<external_id saneado>.pdf`: determinista por `external_id`. */
  importedPdfStorageKey(schemaName: string, externalId: string): string {
    return `${schemaName}/billing-imported/${storageSafe(externalId)}.pdf`;
  }

  async createImportedPayment(
    ctx: MigrationWriteContext,
    input: ImportedPaymentInput,
  ): Promise<string> {
    const rows = (await ctx.manager.query(
      `INSERT INTO billing_payments (
         tenant_id, subscriber_id, method, amount, paid_at, idempotency_key, status,
         created_by, external_id, import_batch_id)
       VALUES ($1, $2, $3, $4::numeric, $5::date, $6, 'REGISTRADO', $7, $6, $8)
       RETURNING id::text`,
      [
        ctx.tenantId,
        input.subscriberId,
        input.method,
        money(input.amount),
        input.paidAt,
        input.externalId,
        ctx.actorId,
        ctx.batchId,
      ],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  async allocateImported(
    ctx: MigrationWriteContext,
    input: { paymentId: string; documentId: string; amount: number },
  ): Promise<boolean> {
    const existing = (await ctx.manager.query(
      `SELECT 1 FROM billing_payment_allocations
        WHERE tenant_id = $1 AND payment_id = $2 AND document_id = $3 AND reversed_at IS NULL`,
      [ctx.tenantId, input.paymentId, input.documentId],
    )) as unknown[];
    if (existing.length > 0) return false;
    await ctx.manager.query(`SET LOCAL iwana.import_promotion = 'on'`);
    // Sin `finally`: si el INSERT falla la transacción queda abortada y otro SET LOCAL
    // enmascararía el error original (25P02); el rollback (o el del savepoint) ya revierte
    // la marca.
    await ctx.manager.query(
      `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount, created_by)
       VALUES ($1, $2, $3, $4::numeric, $5)`,
      [ctx.tenantId, input.paymentId, input.documentId, money(input.amount), ctx.actorId],
    );
    await ctx.manager.query(`SET LOCAL iwana.import_promotion = 'off'`);
    return true;
  }

  async totalsBySubscriber(
    ctx: MigrationReadContext,
    subscriberIds: string[],
  ): Promise<Map<string, BillingTotals>> {
    const result = new Map<string, BillingTotals>();
    if (subscriberIds.length === 0) return result;
    for (const id of subscriberIds) result.set(id, { billedCents: 0, paidCents: 0 });
    const billed = (await ctx.manager.query(
      `SELECT subscriber_id::text, round(SUM(total) * 100)::bigint AS cents
         FROM billing_documents
        WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[])
          AND status IN ('EMITIDO', 'IMPORTADO')
        GROUP BY subscriber_id`,
      [ctx.tenantId, subscriberIds],
    )) as Array<{ subscriber_id: string; cents: string }>;
    for (const row of billed) result.get(row.subscriber_id)!.billedCents = Number(row.cents);
    const paid = (await ctx.manager.query(
      `SELECT subscriber_id::text, round(SUM(amount) * 100)::bigint AS cents
         FROM billing_payments
        WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[]) AND status = 'REGISTRADO'
        GROUP BY subscriber_id`,
      [ctx.tenantId, subscriberIds],
    )) as Array<{ subscriber_id: string; cents: string }>;
    for (const row of paid) result.get(row.subscriber_id)!.paidCents = Number(row.cents);
    return result;
  }

  async revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]> {
    const rows = (await ctx.manager.query(
      `SELECT
         ((SELECT COUNT(*) FROM billing_documents
            WHERE tenant_id = $1 AND import_batch_id IS DISTINCT FROM $4
              AND (subscriber_id = ANY($2::uuid[]) OR contract_id = ANY($3::uuid[])))
        + (SELECT COUNT(*) FROM billing_periods
            WHERE tenant_id = $1 AND contract_id = ANY($3::uuid[]))
        + (SELECT COUNT(*) FROM billing_contract_policy WHERE contract_id = ANY($3::uuid[])))::int
           AS documents,
         (SELECT COUNT(*) FROM billing_payments
           WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[])
             AND import_batch_id IS DISTINCT FROM $4)::int AS payments,
         (SELECT COUNT(*) FROM billing_payment_allocations a
            JOIN billing_documents d ON d.id = a.document_id
            JOIN billing_payments p ON p.id = a.payment_id
           WHERE a.tenant_id = $1
             AND (d.import_batch_id = $4 OR p.import_batch_id = $4)
             AND (d.import_batch_id IS DISTINCT FROM $4 OR p.import_batch_id IS DISTINCT FROM $4
                  OR a.reversed_at IS NOT NULL))::int AS allocations`,
      [ctx.tenantId, ids.subscriberIds, ids.contractIds, batchId],
    )) as Array<{ documents: number; payments: number; allocations: number }>;
    const row = rows[0] ?? { documents: 0, payments: 0, allocations: 0 };
    return [
      ...blocker('DOCUMENTO_POSTERIOR', Number(row.documents)),
      ...blocker('PAGO_POSTERIOR', Number(row.payments)),
      ...blocker('APLICACION_POSTERIOR', Number(row.allocations)),
    ];
  }

  async revertBatch(ctx: MigrationWriteContext): Promise<BillingRevertResult> {
    const allocations = rowsOf(
      await ctx.manager.query(
        `DELETE FROM billing_payment_allocations a
          USING billing_documents d
          WHERE a.document_id = d.id AND a.tenant_id = $1 AND d.import_batch_id = $2
         RETURNING a.id`,
        [ctx.tenantId, ctx.batchId],
      ),
    );
    const pdfRows = rowsOf<{ external_pdf_key: string | null }>(
      await ctx.manager.query(
        `DELETE FROM billing_documents WHERE tenant_id = $1 AND import_batch_id = $2
         RETURNING external_pdf_key`,
        [ctx.tenantId, ctx.batchId],
      ),
    );
    const payments = rowsOf(
      await ctx.manager.query(
        `DELETE FROM billing_payments WHERE tenant_id = $1 AND import_batch_id = $2 RETURNING id`,
        [ctx.tenantId, ctx.batchId],
      ),
    );
    return {
      documents: pdfRows.length,
      payments: payments.length,
      allocations: allocations.length,
      pdfKeys: pdfRows
        .map((row) => row.external_pdf_key)
        .filter((key): key is string => typeof key === 'string'),
    };
  }

  private async idsByExternal(
    ctx: MigrationReadContext,
    table: 'billing_documents' | 'billing_payments',
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (externalIds.length === 0) return result;
    const rows = (await ctx.manager.query(
      `SELECT id::text, external_id FROM ${table}
        WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
      [ctx.tenantId, externalIds],
    )) as Array<{ id: string; external_id: string }>;
    for (const row of rows) result.set(row.external_id, row.id);
    return result;
  }
}
