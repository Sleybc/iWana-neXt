import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupportTicket, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  ASSURANCE_WORK_QUEUES,
  SlaBreachStatus,
  TicketStatus,
  type AssuranceWorkQueueCounts,
} from '@iwana/shared';
import {
  ACTIVE_TICKET_SQL,
  SLA_BREACH_CASE_SQL,
  WORK_QUEUE_PREDICATE_SQL,
} from './ticket-list-sql';

export interface AssuranceDashboardSummary {
  openCount: number;
  assignedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  breachedCount: number;
  resolvedTodayCount: number;
  fieldServicePendingCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  /** Casos activos por área (`queue_name`). */
  byQueue: Record<string, number>;
  /** Spec MOD10 bandeja §3 J: conteo por cola de trabajo, relativo a quien consulta. */
  byWorkQueue: AssuranceWorkQueueCounts;
}

const STATUS_COUNTS = {
  openCount: TicketStatus.OPEN,
  assignedCount: TicketStatus.ASSIGNED,
  inProgressCount: TicketStatus.IN_PROGRESS,
  fieldServicePendingCount: TicketStatus.FIELD_SERVICE_REQUESTED,
} as const;

/**
 * Resumen operativo de la Mesa de ayuda con agregados SQL (spec MOD10 bandeja CA-11): ningún
 * ticket se carga en memoria. Las colas usan los mismos predicados que el listado (CA-10).
 */
@Injectable()
export class AssuranceDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary(actorId: string): Promise<AssuranceDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    // Mismos límites del día que el cálculo anterior en memoria: medianoche local del proceso.
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const base = () =>
        qr.manager
          .createQueryBuilder(SupportTicket, 'st')
          .where('st.tenant_id = :tenantId', { tenantId });

      const totals = base()
        .select([])
        .setParameters({ workQueueActorId: actorId, todayStart, todayEnd });
      for (const [key, status] of Object.entries(STATUS_COUNTS)) {
        totals.addSelect(`COUNT(*) FILTER (WHERE st.status = '${status}')::int`, key);
      }
      totals
        .addSelect(
          `COUNT(*) FILTER (WHERE (${SLA_BREACH_CASE_SQL}) = '${SlaBreachStatus.AT_RISK}')::int`,
          'atRiskCount',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE st.resolved_at IS NOT NULL AND st.resolved_at >= :todayStart AND st.resolved_at <= :todayEnd)::int`,
          'resolvedTodayCount',
        );
      for (const queue of ASSURANCE_WORK_QUEUES) {
        totals.addSelect(
          `COUNT(*) FILTER (WHERE ${WORK_QUEUE_PREDICATE_SQL[queue]})::int`,
          `queue_${queue}`,
        );
      }
      const row = ((await totals.getRawOne()) ?? {}) as Record<string, number | null>;

      const groupBy = async (column: 'priority' | 'type' | 'queue_name') => {
        const rows = (await base()
          .andWhere(ACTIVE_TICKET_SQL)
          .andWhere(`st.${column} IS NOT NULL`)
          .select(`st.${column}::text`, 'key')
          .addSelect('COUNT(*)::int', 'count')
          .groupBy(`st.${column}`)
          .getRawMany()) as Array<{ key: string; count: number }>;
        return Object.fromEntries(rows.map((item) => [item.key, Number(item.count)]));
      };

      const count = (key: string) => Number(row[key] ?? 0);
      const byWorkQueue = Object.fromEntries(
        ASSURANCE_WORK_QUEUES.map((queue) => [queue, count(`queue_${queue}`)]),
      ) as AssuranceWorkQueueCounts;

      return {
        openCount: count('openCount'),
        assignedCount: count('assignedCount'),
        inProgressCount: count('inProgressCount'),
        atRiskCount: count('atRiskCount'),
        breachedCount: byWorkQueue.breached,
        resolvedTodayCount: count('resolvedTodayCount'),
        fieldServicePendingCount: count('fieldServicePendingCount'),
        byPriority: await groupBy('priority'),
        byType: await groupBy('type'),
        byQueue: await groupBy('queue_name'),
        byWorkQueue,
      };
    });
  }
}
