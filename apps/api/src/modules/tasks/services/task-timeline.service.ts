import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  TaskAssignmentHistory,
  TaskTimelineEvent,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { TaskTimelineEventType } from '@iwana/shared';

export interface RecordTaskTimelineEventInput {
  taskId: string;
  tenantId: string;
  eventType: TaskTimelineEventType;
  payload?: Record<string, unknown>;
  actorUserId: string | null;
}

@Injectable()
export class TaskTimelineService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async recordWithManager(
    manager: EntityManager,
    input: RecordTaskTimelineEventInput,
  ): Promise<TaskTimelineEvent> {
    const event = manager.create(TaskTimelineEvent, {
      taskId: input.taskId,
      tenantId: input.tenantId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      actorUserId: input.actorUserId,
      occurredAt: new Date(),
    });

    return manager.save(TaskTimelineEvent, event);
  }

  async listTimeline(taskId: string): Promise<TaskTimelineEvent[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager
        .createQueryBuilder(TaskTimelineEvent, 'tte')
        .where('tte.task_id = :taskId', { taskId })
        .andWhere('tte.tenant_id = :tenantId', { tenantId })
        .orderBy('tte.occurred_at', 'ASC')
        .getMany();
    });
  }

  async listAssignmentHistory(taskId: string): Promise<TaskAssignmentHistory[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager
        .createQueryBuilder(TaskAssignmentHistory, 'tah')
        .where('tah.task_id = :taskId', { taskId })
        .andWhere('tah.tenant_id = :tenantId', { tenantId })
        .orderBy('tah.created_at', 'ASC')
        .getMany();
    });
  }
}
