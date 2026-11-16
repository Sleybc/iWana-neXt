import { Injectable } from '@nestjs/common';
import type { MigrationRevertBlocker } from '@iwana/shared';
import {
  MigrationSupportImportPort,
  type ImportedAuthorsRefreshContext,
  type ImportedTicketAuthors,
  type ImportedTicketAuthorsResult,
  type ImportedTicketInput,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
  type MigrationWriteContext,
} from '../../migration/ports/migration-import.ports';
import { matchImportedComments } from './imported-comment-matching';

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
         closed_at, external_id, import_batch_id, assigned_user_id)
       VALUES ($1, $2, 'CUSTOMER_INCIDENT', $3::ticket_status, 'MIGRATION', $4, 'SUBSCRIBER',
         $5, 'SUBSCRIBER', $5, $6, COALESCE($7::timestamptz, now()),
         CASE WHEN $8 THEN COALESCE($7::timestamptz, now()) END, $9, $10, $11::uuid)
       RETURNING id::text`,
      [
        ctx.tenantId,
        `UISP-${input.sourceId}`.slice(0, 30),
        input.status,
        (input.subject.trim() || 'Ticket importado').slice(0, 200),
        input.subscriberId,
        input.createdByUserId ?? ctx.actorId,
        input.createdAt,
        closed,
        input.externalId,
        ctx.batchId,
        // Asignación histórica por SQL: no pasa por TicketsService, no notifica ni emite eventos.
        input.assignedUserId ?? null,
      ],
    )) as Array<{ id: string }>;
    const ticketId = rows[0]!.id;
    for (const comment of input.comments) {
      if (!comment.body.trim()) continue;
      await ctx.manager.query(
        `INSERT INTO ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
        [
          ticketId,
          ctx.tenantId,
          comment.body,
          comment.internal,
          comment.authorUserId ?? ctx.actorId,
          comment.createdAt,
        ],
      );
    }
    return ticketId;
  }

  /**
   * «Actualizar autores» (spec «usuarios» §2.7). Solo tickets de este lote. El asignado se fija
   * solo si sigue vacío (la importación lo dejaba vacío); creador y autores, solo si siguen a
   * nombre de quien importó. Lo que alguien cambió después se respeta y se cuenta. Sin eventos,
   * timeline ni notificaciones; `updated_at` no cambia (es atribución histórica).
   */
  async refreshImportedAuthors(
    ctx: ImportedAuthorsRefreshContext,
    tickets: ImportedTicketAuthors[],
  ): Promise<ImportedTicketAuthorsResult> {
    const importers = new Set(ctx.importerIds);
    const result: ImportedTicketAuthorsResult = {
      tickets: 0,
      comments: 0,
      respected: 0,
      changes: [],
    };
    for (const item of tickets) {
      const rows = (await ctx.manager.query(
        `SELECT assigned_user_id::text AS assigned, created_by_user_id::text AS created_by
           FROM support_tickets
          WHERE id = $1 AND tenant_id = $2 AND import_batch_id = $3
          FOR UPDATE`,
        [item.ticketId, ctx.tenantId, ctx.batchId],
      )) as Array<{ assigned: string | null; created_by: string }>;
      const ticket = rows[0];
      if (!ticket) continue;
      let assigned: string | null = null;
      if (item.assignedUserId !== null && ticket.assigned !== item.assignedUserId) {
        if (ticket.assigned === null) assigned = item.assignedUserId;
        else result.respected += 1;
      }
      let createdBy: string | null = null;
      if (item.createdByUserId !== null && ticket.created_by !== item.createdByUserId) {
        if (importers.has(ticket.created_by)) createdBy = item.createdByUserId;
        else result.respected += 1;
      }
      if (assigned !== null || createdBy !== null) {
        await ctx.manager.query(
          `UPDATE support_tickets
              SET assigned_user_id = COALESCE($4::uuid, assigned_user_id),
                  created_by_user_id = COALESCE($5::uuid, created_by_user_id)
            WHERE id = $1 AND tenant_id = $2 AND import_batch_id = $3`,
          [item.ticketId, ctx.tenantId, ctx.batchId, assigned, createdBy],
        );
        result.tickets += 1;
        if (assigned !== null) {
          result.changes.push({
            entity: 'TICKET',
            id: item.ticketId,
            field: 'assigned_user_id',
            from: ticket.assigned,
            to: assigned,
          });
        }
        if (createdBy !== null) {
          result.changes.push({
            entity: 'TICKET',
            id: item.ticketId,
            field: 'created_by_user_id',
            from: ticket.created_by,
            to: createdBy,
          });
        }
      }

      if (!item.comments.some((comment) => comment.authorUserId !== null)) continue;
      const stored = (await ctx.manager.query(
        `SELECT id::text, body, created_at, author_user_id::text AS author
           FROM ticket_comments WHERE ticket_id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [item.ticketId, ctx.tenantId],
      )) as Array<{ id: string; body: string; created_at: Date; author: string }>;
      const matches = matchImportedComments(
        stored.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.created_at,
          authorUserId: row.author,
        })),
        item.comments,
        ctx.importerIds,
      );
      for (const match of matches) {
        if (match.current === match.target) continue;
        if (!importers.has(match.current)) {
          result.respected += 1;
          continue;
        }
        await ctx.manager.query(
          `UPDATE ticket_comments SET author_user_id = $3::uuid
            WHERE id = $1 AND tenant_id = $2`,
          [match.id, ctx.tenantId, match.target],
        );
        result.comments += 1;
        result.changes.push({
          entity: 'TICKET_COMMENT',
          id: match.id,
          field: 'author_user_id',
          from: match.current,
          to: match.target,
        });
      }
    }
    return result;
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
