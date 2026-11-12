import { Inject, Injectable, Optional } from '@nestjs/common';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { TenantContext } from '@iwana/db';
import type { QueryRunner } from 'typeorm';
import { normalizeErasureRows } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

const SUPPRESSION_MARKER = 'ANONIMIZADO';

type CountRow = { count: number | string };
type IdRow = { id: string };

@Injectable()
export class BillingTitularErasureParticipant implements TitularErasureParticipant {
  constructor(@Optional() @Inject(STORAGE_PORT) private readonly storage?: StoragePort) {}

  async plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, 'dry-run');
  }

  async apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, mode);
  }

  private async run(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    const subscriberIds = [...new Set(scope.subscriberIds)];
    if (subscriberIds.length === 0) return this.emptyResults();
    const tenantId = TenantContext.getOrThrow().tenantId;
    // `external_pdf_key` llega con la 199 (ADR-110 D5); schemas anteriores no la tienen.
    const pdfColumn = (await qr.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = current_schema() AND table_name = 'billing_documents'
                         AND column_name = 'external_pdf_key') AS present`,
    )) as Array<{ present: boolean }>;
    const hasPdf = pdfColumn[0]?.present === true;
    const pdfResidual = hasPdf ? 'external_pdf_key IS NOT NULL OR' : '';
    const pdfClear = hasPdf ? 'external_pdf_key = NULL,' : '';

    const documents = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (status = 'BORRADOR' OR (status IN ('EMITIDO', 'ANULADO', 'IMPORTADO') AND
                 (void_note IS NOT NULL OR buyer_document_encrypted IS NOT NULL OR ${pdfResidual}
                  (buyer_snapshot IS NOT NULL AND (
                    (buyer_snapshot ? 'displayName' AND buyer_snapshot->>'displayName' IS DISTINCT FROM $3) OR
                    (buyer_snapshot ? 'documentType' AND buyer_snapshot->>'documentType' IS DISTINCT FROM $3) OR
                    (buyer_snapshot ? 'address' AND buyer_snapshot->>'address' IS DISTINCT FROM $3)
                  )))))`,
      [tenantId, subscriberIds, SUPPRESSION_MARKER],
    );
    const lines = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_document_lines AS line
           JOIN billing_documents AS document
             ON document.id = line.document_id
            AND document.tenant_id = line.tenant_id
          WHERE document.tenant_id = $1::uuid
            AND document.subscriber_id = ANY($2::uuid[])
            AND document.status = 'BORRADOR'`,
      [tenantId, subscriberIds],
    );
    const payments = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_payments
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (reference IS NOT NULL OR note IS NOT NULL OR void_note IS NOT NULL)`,
      [tenantId, subscriberIds],
    );

    let changedDocuments = 0;
    let changedLines = 0;
    let changedPayments = 0;
    if (mode === 'apply') {
      // PDF histórico de UISP (ADR-110 D5): trae datos del titular y no se puede redactar; se
      // retira el objeto (solo del schema en curso, H6) y la clave queda en NULL abajo.
      const pdfKeys = !hasPdf
        ? []
        : normalizeErasureRows<{ key: string; schema: string }>(
            await qr.query(
              `SELECT external_pdf_key AS key, current_schema() AS schema
             FROM billing_documents
            WHERE tenant_id = $1::uuid AND subscriber_id = ANY($2::uuid[])
              AND external_pdf_key IS NOT NULL
            FOR UPDATE`,
              [tenantId, subscriberIds],
            ),
          );
      if (pdfKeys.length > 0 && !this.storage) {
        throw new Error('La supresión requiere storage para retirar los PDF importados.');
      }
      for (const { key, schema } of pdfKeys) {
        if (!schema || !key.startsWith(`${schema}/`)) {
          throw new Error('Clave de PDF importado fuera del schema del tenant.');
        }
        await this.storage!.deleteObject(key);
      }
      const updatedDocuments = normalizeErasureRows<IdRow>(
        await qr.query(
          `UPDATE billing_documents
            SET buyer_snapshot = CASE
                  WHEN buyer_snapshot IS NULL THEN NULL
                  ELSE
                    (CASE WHEN buyer_snapshot ? 'displayName'
                      THEN jsonb_set(buyer_snapshot, '{displayName}', to_jsonb($3::text))
                      ELSE buyer_snapshot END)
                    || (CASE WHEN buyer_snapshot ? 'documentType'
                      THEN jsonb_build_object('documentType', $3::text)
                      ELSE '{}'::jsonb END)
                    || (CASE WHEN buyer_snapshot ? 'address'
                      THEN jsonb_build_object('address', $3::text)
                      ELSE '{}'::jsonb END)
                END,
                buyer_document_encrypted = NULL,
                void_note = NULL,
                ${pdfClear}
                updated_at = now()
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND status IN ('EMITIDO', 'ANULADO', 'IMPORTADO')
            AND (void_note IS NOT NULL OR buyer_document_encrypted IS NOT NULL OR ${pdfResidual}
                 (buyer_snapshot IS NOT NULL AND (
                   (buyer_snapshot ? 'displayName' AND buyer_snapshot->>'displayName' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'documentType' AND buyer_snapshot->>'documentType' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'address' AND buyer_snapshot->>'address' IS DISTINCT FROM $3)
                 )))
          RETURNING id::text AS id`,
          [tenantId, subscriberIds, SUPPRESSION_MARKER],
        ),
      );
      changedDocuments += updatedDocuments.length;

      const deletedDrafts = normalizeErasureRows<IdRow>(
        await qr.query(
          `DELETE FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND status = 'BORRADOR'
          RETURNING id::text AS id`,
          [tenantId, subscriberIds],
        ),
      );
      changedDocuments += deletedDrafts.length;
      changedLines = lines;

      const updatedPayments = normalizeErasureRows<IdRow>(
        await qr.query(
          `UPDATE billing_payments
            SET reference = NULL, note = NULL, void_note = NULL
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (reference IS NOT NULL OR note IS NOT NULL OR void_note IS NOT NULL)
          RETURNING id::text AS id`,
          [tenantId, subscriberIds],
        ),
      );
      changedPayments = updatedPayments.length;
    }

    const documentResiduals = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (status = 'BORRADOR' OR void_note IS NOT NULL OR buyer_document_encrypted IS NOT NULL OR ${pdfResidual}
                 (buyer_snapshot IS NOT NULL AND (
                   (buyer_snapshot ? 'displayName' AND buyer_snapshot->>'displayName' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'documentType' AND buyer_snapshot->>'documentType' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'address' AND buyer_snapshot->>'address' IS DISTINCT FROM $3)
                 )))`,
      [tenantId, subscriberIds, SUPPRESSION_MARKER],
    );
    const lineResiduals = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_document_lines AS line
           JOIN billing_documents AS document
             ON document.id = line.document_id
            AND document.tenant_id = line.tenant_id
          WHERE document.tenant_id = $1::uuid
            AND document.subscriber_id = ANY($2::uuid[])
            AND document.status = 'BORRADOR'`,
      [tenantId, subscriberIds],
    );
    const paymentResiduals = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_payments
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (reference IS NOT NULL OR note IS NOT NULL OR void_note IS NOT NULL)`,
      [tenantId, subscriberIds],
    );

    return [
      {
        table: 'billing_documents',
        category: 'FISCAL',
        selected: documents,
        changed: changedDocuments,
        residual: documentResiduals,
      },
      {
        table: 'billing_document_lines',
        category: 'FISCAL',
        selected: lines,
        changed: changedLines,
        residual: lineResiduals,
      },
      {
        table: 'billing_payments',
        category: 'COMERCIAL',
        selected: payments,
        changed: changedPayments,
        residual: paymentResiduals,
      },
    ];
  }

  private async count(qr: QueryRunner, sql: string, parameters: unknown[]): Promise<number> {
    const rows = (await qr.query(sql, parameters)) as CountRow[];
    return Number(rows[0]?.count ?? 0);
  }

  private emptyResults(): TitularErasureTableResult[] {
    return [
      { table: 'billing_documents', category: 'FISCAL', selected: 0, changed: 0, residual: 0 },
      { table: 'billing_document_lines', category: 'FISCAL', selected: 0, changed: 0, residual: 0 },
      { table: 'billing_payments', category: 'COMERCIAL', selected: 0, changed: 0, residual: 0 },
    ];
  }
}
