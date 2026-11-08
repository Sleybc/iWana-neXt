import { Injectable } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { EntityManager } from 'typeorm';
import { IBillingStandingReadPort } from '../../privacy/requests/ports/billing-standing-read.port';

@Injectable()
export class BillingStandingReadAdapter implements IBillingStandingReadPort {
  async lastFiscalDocumentAt(
    subscriberIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<string | null> {
    const ids = [...new Set(subscriberIds)];
    if (ids.length === 0) return null;

    const tenantId = TenantContext.getOrThrow().tenantId;
    const rows = (await ctx.manager.query(
      `SELECT MAX(issue_date)::text AS last_fiscal_document_at
         FROM billing_documents
        WHERE tenant_id = $1::uuid
          AND subscriber_id = ANY($2::uuid[])
          AND status IN ('EMITIDO', 'ANULADO')
          AND issue_date IS NOT NULL`,
      [tenantId, ids],
    )) as Array<{ last_fiscal_document_at: string | null }>;
    return rows[0]?.last_fiscal_document_at ?? null;
  }

  /**
   * Reloj fiscal sin conciliar (H-EXP B2-R3 P1, D-EXP-1): algún documento
   * EMITIDO/ANULADO carece de `issue_date` válida (basta uno; la fecha de otro
   * no lo sustituye). Se distingue de «sin documentos» para fallar cerrado en
   * lugar de liberar al titular.
   */
  async hasUnreconciledFiscalClock(
    subscriberIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<boolean> {
    const ids = [...new Set(subscriberIds)];
    if (ids.length === 0) return false;
    const tenantId = TenantContext.getOrThrow().tenantId;
    const rows = (await ctx.manager.query(
      `SELECT count(*)::int AS total,
              count(issue_date)::int AS with_date
         FROM billing_documents
        WHERE tenant_id = $1::uuid
          AND subscriber_id = ANY($2::uuid[])
          AND status IN ('EMITIDO', 'ANULADO')`,
      [tenantId, ids],
    )) as Array<{ total: number; with_date: number }>;
    const total = Number(rows[0]?.total ?? 0);
    const withDate = Number(rows[0]?.with_date ?? 0);
    return withDate < total;
  }
}
