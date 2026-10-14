import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { addColombiaBusinessDays, type RequestSummary } from '@iwana/shared';
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
        `SELECT id::text, kind, "right", purpose, status, received_at, due_at, extended_until
         FROM data_subject_requests WHERE party_id = $1
         ORDER BY received_at DESC, id DESC`,
        [partyId],
      )) as SummaryRow[];

      return rows.map((row) => {
        const dueAt = dateOnly(row.due_at);
        const extendedUntil = row.extended_until ? dateOnly(row.extended_until) : null;
        const effectiveDueAt = extendedUntil && extendedUntil > dueAt ? extendedUntil : dueAt;
        return {
          id: row.id,
          kind: row.kind,
          right: row.right,
          purpose: row.purpose,
          status: row.status,
          receivedAt:
            row.received_at instanceof Date
              ? row.received_at.toISOString()
              : new Date(row.received_at).toISOString(),
          dueAt,
          extendedUntil,
          isOverdue:
            !['DESISTIDA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'].includes(row.status) &&
            effectiveDueAt < today,
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
