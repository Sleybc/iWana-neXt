import { TenantContext, runInTenantSchema } from '@iwana/db';
import { WorkOrder } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ScheduleEventStatus } from '@iwana/shared';

/** Intervalo de eventos activos — cualquier estado que no sea terminal/inactivo. */
const ACTIVE_STATUSES: ScheduleEventStatus[] = [
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
];

export interface ConflictCheckParams {
  tenantId: string;
  assignedUserId: string;
  scheduledStartAt: Date | string;
  scheduledEndAt: Date | string;
  /** Excluir este eventId para no conflictar consigo mismo en updates/reschedule. */
  excludeEventId?: string;
}

/** Servicio de deteccion de conflictos de agenda por tecnico. SPEC-MOD09 §10 regla 2. */
@Injectable()
export class ScheduleConflictService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async hasConflictWithManager(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    params: ConflictCheckParams,
  ): Promise<boolean> {
    const { tenantId, assignedUserId, scheduledStartAt, scheduledEndAt, excludeEventId } = params;

    const qb = manager
      .createQueryBuilder()
      .select('1')
      .from('schedule_events', 'se')
      .where('se.tenant_id = :tenantId', { tenantId })
      .andWhere('se.assigned_user_id = :uid', { uid: assignedUserId })
      .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
      .andWhere('se.deleted_at IS NULL')
      .andWhere('se.scheduled_start_at < :endAt', { endAt: scheduledEndAt })
      .andWhere('se.scheduled_end_at > :startAt', { startAt: scheduledStartAt });

    if (excludeEventId) {
      qb.andWhere('se.id != :excludeId', { excludeId: excludeEventId });
    }

    const result = await qb.getRawOne();
    return result !== undefined;
  }

  /**
   * Comprueba si el tecnico indicado tiene un evento activo solapado en el mismo rango horario.
   * Usa query SQL en el schema del tenant via runInTenantSchema.
   */
  async hasConflict(params: ConflictCheckParams): Promise<boolean> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.hasConflictWithManager(qr.manager, params),
    );
  }
}
