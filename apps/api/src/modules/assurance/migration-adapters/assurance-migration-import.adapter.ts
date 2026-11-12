import { Injectable } from '@nestjs/common';
import type { MigrationRevertBlocker } from '@iwana/shared';
import {
  MigrationSupportImportPort,
  type ImportedTicketInput,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
  type MigrationWriteContext,
} from '../../migration/ports/migration-import.ports';

/**
 * Adaptador de Soporte (MOD09) de la importación desde UISP (ADR-110 D3, D7; spec §3.2).
 * Crea tickets históricos con `source = 'MIGRATION'`, número `UISP-<id>` (no consume la
 * numeración `TK-`) y sus comentarios; el comentario no público de UISP queda interno.
 */
@Injectable()
export class AssuranceMigrationImportAdapter extends MigrationSupportImportPort {
  async findTickets(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (externalIds.length === 0) return result;
    const rows = (await ctx.manager.query(
      `SELECT id::text, external_id FROM support_tickets
        WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
      [ctx.tenantId, externalIds],
    )) as Array<{ id: string; external_id: string }>;
    for (const row of rows) result.set(row.external_id, row.id);
    return result;
  }

  async createImportedTicket(
    ctx: MigrationWriteContext,
    input: ImportedTicketInput,
  ): Promise<string> {
    const closed = input.status === 'CLOSED';
    const rows = (await ctx.manager.query(
      `INSERT INTO support_tickets (
         tenant_id, ticket_number, type, status, source, subject, requester_type,
         requester_ref_id, subject_type, subject_ref_id, created_by_user_id, created_at,
         closed_at, external_id, import_batch_id)
       VALUES ($1, $2, 'CUSTOMER_INCIDENT', $3::ticket_status, 'MIGRATION', $4, 'SUBSCRIBER',
         $5, 'SUBSCRIBER', $5, $6, COALESCE($7::timestamptz, now()),
         CASE WHEN $8 THEN COALESCE($7::timestamptz, now()) END, $9, $10)
       RETURNING id::text`,
      [
        ctx.tenantId,
        `UISP-${input.sourceId}`.slice(0, 30),
        input.status,
        (input.subject.trim() || 'Ticket importado').slice(0, 200),
        input.subscriberId,
        ctx.actorId,
        input.createdAt,
        closed,
        input.externalId,
        ctx.batchId,
      ],
    )) as Array<{ id: string }>;
    const ticketId = rows[0]!.id;
    for (const comment of input.comments) {
      if (!comment.body.trim()) continue;
      await ctx.manager.query(
        `INSERT INTO ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
        [ticketId, ctx.tenantId, comment.body, comment.internal, ctx.actorId, comment.createdAt],
      );
    }
    return ticketId;
  }

  async revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]> {
    const refs = [...ids.subscriberIds, ...ids.contractIds];
    if (refs.length === 0) return [];
    const rows = (await ctx.manager.query(
      `SELECT
         (SELECT COUNT(*) FROM support_tickets
           WHERE tenant_id = $1 AND import_batch_id IS DISTINCT FROM $3
             AND (requester_ref_id = ANY($2::varchar[]) OR subject_ref_id = ANY($2::varchar[])))::int
           AS tickets,
         ((SELECT COUNT(*) FROM support_tickets
            WHERE tenant_id = $1 AND import_batch_id = $3 AND work_order_id IS NOT NULL)
        + (SELECT COUNT(*) FROM ticket_work_order_links l
             JOIN support_tickets t ON t.id = l.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3))::int AS work_orders,
         ((SELECT COUNT(*) FROM ticket_pqr_records r
             JOIN support_tickets t ON t.id = r.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3)
        + (SELECT COUNT(*) FROM ticket_timeline_events e
             JOIN support_tickets t ON t.id = e.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3))::int AS activity`,
      [ctx.tenantId, refs, batchId],
    )) as Array<{ tickets: number; work_orders: number; activity: number }>;
    const row = rows[0] ?? { tickets: 0, work_orders: 0, activity: 0 };
    const result: MigrationRevertBlocker[] = [];
    const tickets = Number(row.tickets) + Number(row.activity);
    if (tickets > 0) result.push({ motivo: 'TICKET_POSTERIOR', cantidad: tickets });
    if (Number(row.work_orders) > 0) {
      result.push({ motivo: 'ORDEN_DE_TRABAJO', cantidad: Number(row.work_orders) });
    }
    return result;
  }

  async revertBatch(ctx: MigrationWriteContext): Promise<{ tickets: number }> {
    await ctx.manager.query(
      `DELETE FROM ticket_comments c
        USING support_tickets t
        WHERE c.ticket_id = t.id AND t.tenant_id = $1 AND t.import_batch_id = $2`,
      [ctx.tenantId, ctx.batchId],
    );
    const deleted = (await ctx.manager.query(
      `DELETE FROM support_tickets WHERE tenant_id = $1 AND import_batch_id = $2 RETURNING id`,
      [ctx.tenantId, ctx.batchId],
    )) as unknown;
    const rows = Array.isArray(deleted) && Array.isArray(deleted[0]) ? deleted[0] : deleted;
    return { tickets: Array.isArray(rows) ? rows.length : 0 };
  }
}
