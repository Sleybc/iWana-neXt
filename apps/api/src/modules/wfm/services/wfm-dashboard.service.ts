import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus, VisitRequestStatus, WorkOrderPriority } from '@iwana/shared';

/** Carga de un tecnico para el resumen del dashboard. */
export type WfmTechnicianLoadRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type WfmDashboardAlertSeverity = 'critical' | 'warning' | 'info';
export type WfmDashboardAlertType =
  | 'OVERDUE_EVENT'
  | 'DRAFT_STARTING_SOON'
  | 'HIGH_TECHNICIAN_LOAD';

export interface TechnicianLoadItem {
  assignedUserId: string;
  todayCount: number;
  overdueCount: number;
  totalScheduledMinutes: number;
  utilizationPercent: number;
  riskLevel: WfmTechnicianLoadRiskLevel;
}

/** Alerta derivada para supervision WFM; no se persiste. */
export interface WfmDashboardAlert {
  id: string;
  type: WfmDashboardAlertType;
  severity: WfmDashboardAlertSeverity;
  title: string;
  description: string;
  eventId: string | null;
  assignedUserId: string | null;
  scheduledStartAt: string | null;
}

/** Estructura del resumen de dashboard WFM. */
export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  activeCount: number;
  enRouteCount: number;
  atRiskCount: number;
  pendingInbox: {
    totalOpen: number;
    readyToScheduleCount: number;
    needsContextCount: number;
    overdueSlaCount: number;
    highPriorityOpenCount: number;
  };
  alerts: WfmDashboardAlert[];
  technicianLoad: TechnicianLoadItem[];
}

/** Estados activos para computo de metricas de agenda. */
const ACTIVE_STATUSES = [
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
];

const EXPECTED_DAILY_MINUTES = 480;
const STARTING_SOON_MINUTES = 60;
const ALERT_LIMIT = 12;
const ACTIVE_STATUS_FILTER = 'se.status = ANY(CAST(:statuses AS schedule_event_status[]))';
const PENDING_VISIT_OPEN_STATUSES = [
  VisitRequestStatus.PENDING,
  VisitRequestStatus.NEEDS_CONTEXT,
  VisitRequestStatus.READY_TO_SCHEDULE,
];
const HIGH_PRIORITIES = [WorkOrderPriority.HIGH, WorkOrderPriority.URGENT];

function toCount(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateRiskLevel(utilizationPercent: number): WfmTechnicianLoadRiskLevel {
  if (utilizationPercent >= 80) return 'HIGH';
  if (utilizationPercent >= 50) return 'MEDIUM';
  return 'LOW';
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function buildEffectiveVisitRequestStatusSql(alias: string): string {
  return `CASE
    WHEN ${alias}.status IN ('${VisitRequestStatus.READY_TO_SCHEDULE}', '${VisitRequestStatus.NEEDS_CONTEXT}')
    THEN CASE
      WHEN NULLIF(TRIM(${alias}.address), '') IS NOT NULL
       AND NULLIF(TRIM(${alias}.municipality), '') IS NOT NULL
      THEN '${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status
      ELSE '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status
    END
    ELSE ${alias}.status
  END`;
}

function buildVisitRequestStatusReconciliationSql(alias: string): string {
  return `CASE
    WHEN NULLIF(TRIM(${alias}.address), '') IS NOT NULL
     AND NULLIF(TRIM(${alias}.municipality), '') IS NOT NULL
    THEN '${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status
    ELSE '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status
  END`;
}

@Injectable()
export class WfmDashboardService {
  private readonly logger = new Logger(WfmDashboardService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Devuelve metricas de agenda para el dashboard operativo del tenant. */
  async getSummary(): Promise<WfmDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // Eventos programados para hoy
      const todayResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'todayCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at >= :todayStart', { todayStart })
        .andWhere('se.scheduled_start_at <= :todayEnd', { todayEnd })
        .getRawOne();
      const todayCount = todayResult?.todayCount ?? '0';

      // Eventos vencidos (fecha de inicio ya paso y siguen activos)
      const overdueResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'overdueCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_end_at < :now', { now })
        .getRawOne();
      const overdueCount = overdueResult?.overdueCount ?? '0';

      // Proximos 7 dias
      const sevenDaysLater = new Date(now);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      const upcomingResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'upcomingCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at > :now', { now })
        .andWhere('se.scheduled_start_at <= :sevenDaysLater', { sevenDaysLater })
        .getRawOne();
      const upcomingCount = upcomingResult?.upcomingCount ?? '0';

      const activeResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'activeCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .getRawOne();

      const enRouteResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'enRouteCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.status = :status', { status: ScheduleEventStatus.EN_ROUTE })
        .andWhere('se.deleted_at IS NULL')
        .getRawOne();

      const startingSoonEnd = new Date(now);
      startingSoonEnd.setMinutes(startingSoonEnd.getMinutes() + STARTING_SOON_MINUTES);

      const atRiskResult = await qr.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'atRiskCount')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.status = :status', { status: ScheduleEventStatus.DRAFT })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at >= :now', { now })
        .andWhere('se.scheduled_start_at <= :startingSoonEnd', { startingSoonEnd })
        .getRawOne();

      let pendingInbox = {
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      };

      try {
        const reconciledStatusSql = buildVisitRequestStatusReconciliationSql('vr');

        await qr.manager.query(
          `UPDATE visit_requests vr
           SET status = ${reconciledStatusSql},
               updated_at = NOW()
           WHERE vr.tenant_id = $1
             AND vr.deleted_at IS NULL
             AND vr.status IN ('${VisitRequestStatus.READY_TO_SCHEDULE}'::visit_request_status, '${VisitRequestStatus.NEEDS_CONTEXT}'::visit_request_status)
             AND vr.status IS DISTINCT FROM ${reconciledStatusSql}`,
          [tenantId],
        );

        const effectiveStatusSql = buildEffectiveVisitRequestStatusSql('vr');
        const pendingInboxResult = await qr.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'total_open')
          .addSelect(
            `SUM(CASE WHEN ${effectiveStatusSql} = :readyToScheduleStatus THEN 1 ELSE 0 END)`,
            'ready_to_schedule_count',
          )
          .addSelect(
            `SUM(CASE WHEN ${effectiveStatusSql} = :needsContextStatus THEN 1 ELSE 0 END)`,
            'needs_context_count',
          )
          .addSelect(
            'SUM(CASE WHEN vr.sla_due_at IS NOT NULL AND vr.sla_due_at < :now THEN 1 ELSE 0 END)',
            'overdue_sla_count',
          )
          .addSelect(
            'SUM(CASE WHEN vr.priority = ANY(CAST(:highPriorities AS work_order_priority[])) THEN 1 ELSE 0 END)',
            'high_priority_open_count',
          )
          .from('visit_requests', 'vr')
          .where('vr.tenant_id = :tenantId', { tenantId })
          .andWhere('vr.deleted_at IS NULL')
          .andWhere('vr.status = ANY(CAST(:openStatuses AS visit_request_status[]))', {
            openStatuses: PENDING_VISIT_OPEN_STATUSES,
          })
          .setParameter('readyToScheduleStatus', VisitRequestStatus.READY_TO_SCHEDULE)
          .setParameter('needsContextStatus', VisitRequestStatus.NEEDS_CONTEXT)
          .setParameter('highPriorities', HIGH_PRIORITIES)
          .setParameter('now', now)
          .getRawOne<{
            total_open?: string;
            ready_to_schedule_count?: string;
            needs_context_count?: string;
            overdue_sla_count?: string;
            high_priority_open_count?: string;
          }>();

        pendingInbox = {
          totalOpen: toCount(pendingInboxResult?.total_open),
          readyToScheduleCount: toCount(pendingInboxResult?.ready_to_schedule_count),
          needsContextCount: toCount(pendingInboxResult?.needs_context_count),
          overdueSlaCount: toCount(pendingInboxResult?.overdue_sla_count),
          highPriorityOpenCount: toCount(pendingInboxResult?.high_priority_open_count),
        };
      } catch (error) {
        this.logger.warn(
          `No fue posible resolver el resumen de bandeja pendiente para el tenant ${tenantId}.`,
          error instanceof Error ? error.message : String(error),
        );
      }

      // Carga por tecnico para hoy
      const technicianLoadRows: {
        assigned_user_id: string;
        count?: string;
        today_count?: string;
        overdue_count?: string;
        total_minutes?: string;
      }[] = await qr.manager
        .createQueryBuilder()
        .select('se.assigned_user_id', 'assigned_user_id')
        .addSelect('COUNT(*)', 'today_count')
        .addSelect('SUM(CASE WHEN se.scheduled_end_at < :now THEN 1 ELSE 0 END)', 'overdue_count')
        .addSelect(
          'COALESCE(SUM(EXTRACT(EPOCH FROM (se.scheduled_end_at - se.scheduled_start_at)) / 60), 0)',
          'total_minutes',
        )
        .setParameter('now', now)
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at >= :todayStart', { todayStart })
        .andWhere('se.scheduled_start_at <= :todayEnd', { todayEnd })
        .groupBy('se.assigned_user_id')
        .orderBy('today_count', 'DESC')
        .getRawMany();

      const technicianLoad = technicianLoadRows.map((row) => {
        const totalScheduledMinutes = toCount(row.total_minutes);
        const utilizationPercent = Math.min(
          100,
          Math.round((totalScheduledMinutes / EXPECTED_DAILY_MINUTES) * 100),
        );

        return {
          assignedUserId: row.assigned_user_id,
          todayCount: toCount(row.today_count ?? row.count),
          overdueCount: toCount(row.overdue_count),
          totalScheduledMinutes,
          utilizationPercent,
          riskLevel: calculateRiskLevel(utilizationPercent),
        };
      });

      const overdueAlertRows: {
        id?: string;
        title?: string;
        assigned_user_id?: string;
        scheduled_start_at?: Date | string;
      }[] = await qr.manager
        .createQueryBuilder()
        .select('se.id', 'id')
        .addSelect('se.title', 'title')
        .addSelect('se.assigned_user_id', 'assigned_user_id')
        .addSelect('se.scheduled_start_at', 'scheduled_start_at')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere(ACTIVE_STATUS_FILTER, { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_end_at < :now', { now })
        .orderBy('se.scheduled_end_at', 'ASC')
        .limit(ALERT_LIMIT)
        .getRawMany();

      const draftSoonAlertRows: {
        id?: string;
        title?: string;
        assigned_user_id?: string;
        scheduled_start_at?: Date | string;
      }[] = await qr.manager
        .createQueryBuilder()
        .select('se.id', 'id')
        .addSelect('se.title', 'title')
        .addSelect('se.assigned_user_id', 'assigned_user_id')
        .addSelect('se.scheduled_start_at', 'scheduled_start_at')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.status = :status', { status: ScheduleEventStatus.DRAFT })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at >= :now', { now })
        .andWhere('se.scheduled_start_at <= :startingSoonEnd', { startingSoonEnd })
        .orderBy('se.scheduled_start_at', 'ASC')
        .limit(ALERT_LIMIT)
        .getRawMany();

      const overdueAlerts: WfmDashboardAlert[] = overdueAlertRows
        .filter((row) => row.id)
        .map((row) => ({
          id: `overdue-${row.id}`,
          type: 'OVERDUE_EVENT',
          severity: 'critical',
          title: 'Evento atrasado',
          description: row.title ?? 'Evento pendiente fuera de la franja programada.',
          eventId: row.id ?? null,
          assignedUserId: row.assigned_user_id ?? null,
          scheduledStartAt: toIsoString(row.scheduled_start_at),
        }));

      const draftSoonAlerts: WfmDashboardAlert[] = draftSoonAlertRows
        .filter((row) => row.id)
        .map((row) => ({
          id: `draft-soon-${row.id}`,
          type: 'DRAFT_STARTING_SOON',
          severity: 'warning',
          title: 'Borrador inicia pronto',
          description: row.title ?? 'Evento en borrador con inicio cercano.',
          eventId: row.id ?? null,
          assignedUserId: row.assigned_user_id ?? null,
          scheduledStartAt: toIsoString(row.scheduled_start_at),
        }));

      const highLoadAlerts: WfmDashboardAlert[] = technicianLoad
        .filter((item) => item.riskLevel === 'HIGH')
        .map((item) => ({
          id: `high-load-${item.assignedUserId}`,
          type: 'HIGH_TECHNICIAN_LOAD',
          severity: 'warning',
          title: 'Técnico con saturación alta',
          description: `${item.todayCount} eventos activos en la jornada.`,
          eventId: null,
          assignedUserId: item.assignedUserId,
          scheduledStartAt: null,
        }));

      return {
        todayCount: toCount(todayCount),
        overdueCount: toCount(overdueCount),
        upcomingCount: toCount(upcomingCount),
        activeCount: toCount(activeResult?.activeCount),
        enRouteCount: toCount(enRouteResult?.enRouteCount),
        atRiskCount: toCount(atRiskResult?.atRiskCount),
        pendingInbox,
        alerts: [...overdueAlerts, ...draftSoonAlerts, ...highLoadAlerts].slice(0, ALERT_LIMIT),
        technicianLoad,
      };
    });
  }
}
