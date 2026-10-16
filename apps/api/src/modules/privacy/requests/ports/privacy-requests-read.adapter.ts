import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { addColombiaBusinessDays, type ErasureCategory, type RequestSummary } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { bogotaCivilDate, withPrivacyTenant } from '../../ports/privacy-tenant-query';
import { IPrivacyRequestsReadPort } from './privacy-requests-read.port';

type SummaryRow = {
  id: string;
  kind: RequestSummary['kind'];
  right: RequestSummary['right'];
  purpose: RequestSummary['purpose'];
  status: RequestSummary['status'];
  received_at: Date | string;
  due_at: Date | string;
  extended_until: Date | string | null;
  erased_at: Date | string | null;
  erasure_categories: string[] | null;
};

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

@Injectable()
export class PrivacyRequestsReadAdapter implements IPrivacyRequestsReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listForParty(partyId: string): Promise<RequestSummary[]> {
    const today = bogotaCivilDate(new Date());
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        `SELECT id::text, kind, "right", purpose, status, received_at, due_at, extended_until,
                erased_at, erasure_categories
         FROM data_subject_requests WHERE party_id = $1
         ORDER BY received_at DESC, id DESC`,
        [partyId],
      )) as SummaryRow[];
      const transferEvents =
        rows.length === 0
          ? []
          : ((await manager.query(
              `SELECT request_id::text AS request_id, occurred_at
               FROM data_subject_request_events
               WHERE request_id = ANY($1::uuid[]) AND to_status = 'TRASLADADA'`,
              [rows.map((row) => row.id)],
            )) as Array<{ request_id: string; occurred_at: Date | string }>);
      const transferByRequest = new Map(
        transferEvents.map((event) => [event.request_id, event.occurred_at]),
      );

      return rows.map((row) => {
        const dueAt = dateOnly(row.due_at);
        const extendedUntil = row.extended_until ? dateOnly(row.extended_until) : null;
        const effectiveDueAt = extendedUntil && extendedUntil > dueAt ? extendedUntil : dueAt;
        const receivedAt =
          row.received_at instanceof Date
            ? row.received_at.toISOString()
            : new Date(row.received_at).toISOString();
        const transferDueAt = addColombiaBusinessDays(bogotaCivilDate(new Date(receivedAt)), 2);
        const transferOccurredAt = transferByRequest.get(row.id);
        return {
          id: row.id,
          kind: row.kind,
          right: row.right,
          purpose: row.purpose,
          status: row.status,
          receivedAt,
          dueAt,
          extendedUntil,
          isOverdue:
            !['DESISTIDA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'].includes(row.status) &&
            effectiveDueAt < today,
          transferDueAt,
          transferredLate:
            transferOccurredAt === undefined
              ? null
              : bogotaCivilDate(new Date(transferOccurredAt)) > transferDueAt,
          erasedAt: row.erased_at ? new Date(row.erased_at).toISOString() : null,
          erasureCategories: (Array.isArray(row.erasure_categories)
            ? row.erasure_categories
            : []) as ErasureCategory[],
        };
      });
    });
  }

  async dueCounts(today: string): Promise<{
    overdue: number;
    dueSoon: number;
    overdueTasks: number;
  }> {
    const dueSoonUntil = addColombiaBusinessDays(today, 2);
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE status IN ('RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA')
               AND COALESCE(extended_until, due_at) < $1::date
           )::int AS overdue,
           COUNT(*) FILTER (
             WHERE status IN ('RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA')
               AND COALESCE(extended_until, due_at) BETWEEN $1::date AND $2::date
           )::int AS due_soon,
           (
             SELECT COUNT(*)::int
             FROM data_subject_request_tasks task
             INNER JOIN data_subject_requests request ON request.id = task.request_id
             WHERE request.kind = 'SUPLANTACION'
               AND task.done_at IS NULL
               AND task.due_at < $1::date
           ) AS overdue_tasks
         FROM data_subject_requests`,
        [today, dueSoonUntil],
      )) as Array<{ overdue: number; due_soon: number; overdue_tasks: number }>;
      return {
        overdue: Number(rows[0]?.overdue ?? 0),
        dueSoon: Number(rows[0]?.due_soon ?? 0),
        overdueTasks: Number(rows[0]?.overdue_tasks ?? 0),
      };
    });
  }
}
