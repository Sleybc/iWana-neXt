import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus } from '@iwana/shared';

/** Carga de un tecnico para el resumen del dashboard. */
export interface TechnicianLoadItem {
  assignedUserId: string;
  todayCount: number;
}

/** Estructura del resumen de dashboard WFM. */
export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  technicianLoad: TechnicianLoadItem[];
}

/** Estados activos para computo de metricas de agenda. */
const ACTIVE_STATUSES = [
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
];

@Injectable()
export class WfmDashboardService {
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
        .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
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
        .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
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
        .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at > :now', { now })
        .andWhere('se.scheduled_start_at <= :sevenDaysLater', { sevenDaysLater })
        .getRawOne();
      const upcomingCount = upcomingResult?.upcomingCount ?? '0';

      // Carga por tecnico para hoy
      const technicianLoad: { assigned_user_id: string; count: string }[] = await qr.manager
        .createQueryBuilder()
        .select('se.assigned_user_id', 'assigned_user_id')
        .addSelect('COUNT(*)', 'count')
        .from('schedule_events', 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at >= :todayStart', { todayStart })
        .andWhere('se.scheduled_start_at <= :todayEnd', { todayEnd })
        .groupBy('se.assigned_user_id')
        .orderBy('count', 'DESC')
        .getRawMany();

      return {
        todayCount: parseInt(todayCount, 10) || 0,
        overdueCount: parseInt(overdueCount, 10) || 0,
        upcomingCount: parseInt(upcomingCount, 10) || 0,
        technicianLoad: technicianLoad.map((row) => ({
          assignedUserId: row.assigned_user_id,
          todayCount: parseInt(row.count, 10),
        })),
      };
    });
  }
}
