import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TenantContext } from '@iwana/db';
import {
  IPqrRetentionReadPort,
  type PqrRetentionScope,
  type PqrRetentionStanding,
} from '../../privacy/requests/ports/pqr-retention-read.port';
import {
  readTenantColumns,
  tableExists,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import { ticketScopePredicates } from './ticket-scope';

@Injectable()
export class PqrRetentionReadAdapter extends IPqrRetentionReadPort {
  async read(
    scope: PqrRetentionScope,
    ctx: { manager: EntityManager },
  ): Promise<PqrRetentionStanding> {
    const empty = { hasUnanswered: false, lastResponseAt: null };
    if (!scope.subscriberIds.length && !scope.contractIds.length && !scope.expedienteIds.length)
      return empty;
    const qr = ctx.manager.queryRunner;
    if (!qr?.isTransactionActive)
      throw new Error('La lectura de retención exige una transacción tenant activa.');
    const columns = await readTenantColumns(qr);
    if (!tableExists(columns, 'support_tickets') || !tableExists(columns, 'ticket_pqr_records'))
      return empty;
    const parameters: unknown[] = [TenantContext.getOrThrow().tenantId];
    const predicates = ticketScopePredicates(scope, columns, parameters);
    if (!predicates.length) return empty;
    const rows = (await ctx.manager.query(
      `WITH responses AS (
      SELECT t.id, max(COALESCE(p.notified_at, p.resolved_at)) AS response_at
      FROM support_tickets t LEFT JOIN ticket_pqr_records p ON p.ticket_id = t.id AND p.tenant_id = t.tenant_id AND p.deadline_type::text = 'FINAL_RESOLUTION'
      WHERE t.tenant_id = $1 AND t.type::text = 'PQR' AND (${predicates.join(' OR ')}) GROUP BY t.id
    ) SELECT COALESCE(bool_or(response_at IS NULL), false) AS has_unanswered, max(response_at) AS last_response_at FROM responses`,
      parameters,
    )) as Array<{ has_unanswered: boolean; last_response_at: Date | string | null }>;
    const last = rows[0]?.last_response_at;
    return {
      hasUnanswered: rows[0]?.has_unanswered === true,
      lastResponseAt: last ? new Date(last).toISOString() : null,
    };
  }
}
