import { Injectable } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { QueryRunner } from 'typeorm';
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

    const documents = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (status = 'BORRADOR' OR (status IN ('EMITIDO', 'ANULADO') AND
                 (buyer_document_encrypted IS NOT NULL OR
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
            AND (reference IS NOT NULL OR note IS NOT NULL)`,
      [tenantId, subscriberIds],
    );

    let changedDocuments = 0;
    let changedLines = 0;
    let changedPayments = 0;
    if (mode === 'apply') {
      const updatedDocuments = (await qr.query(
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
                updated_at = now()
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND status IN ('EMITIDO', 'ANULADO')
            AND (buyer_document_encrypted IS NOT NULL OR
                 (buyer_snapshot IS NOT NULL AND (
                   (buyer_snapshot ? 'displayName' AND buyer_snapshot->>'displayName' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'documentType' AND buyer_snapshot->>'documentType' IS DISTINCT FROM $3) OR
                   (buyer_snapshot ? 'address' AND buyer_snapshot->>'address' IS DISTINCT FROM $3)
                 )))
          RETURNING id::text AS id`,
        [tenantId, subscriberIds, SUPPRESSION_MARKER],
      )) as IdRow[];
      changedDocuments += updatedDocuments.length;

      const deletedDrafts = (await qr.query(
        `DELETE FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND status = 'BORRADOR'
          RETURNING id::text AS id`,
        [tenantId, subscriberIds],
      )) as IdRow[];
      changedDocuments += deletedDrafts.length;
      changedLines = lines;

      const updatedPayments = (await qr.query(
        `UPDATE billing_payments
            SET reference = NULL, note = NULL
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (reference IS NOT NULL OR note IS NOT NULL)
          RETURNING id::text AS id`,
        [tenantId, subscriberIds],
      )) as IdRow[];
      changedPayments = updatedPayments.length;
    }

    const documentResiduals = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count
           FROM billing_documents
          WHERE tenant_id = $1::uuid
            AND subscriber_id = ANY($2::uuid[])
            AND (status = 'BORRADOR' OR buyer_document_encrypted IS NOT NULL OR
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
            AND (reference IS NOT NULL OR note IS NOT NULL)`,
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
