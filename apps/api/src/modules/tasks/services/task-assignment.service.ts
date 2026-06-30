import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  OperationalTask,
  TaskAssignmentHistory,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  UserRole,
  UserStatus,
} from '@iwana/shared';
import { AssignTaskInput, AssignTaskSchema } from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { TaskTimelineService } from './task-timeline.service';

const ASSIGNABLE_RESPONSIBLE_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
]);

@Injectable()
export class TaskAssignmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TaskTimelineService,
    private readonly usersService: UsersService,
  ) {}

  async assign(id: string, input: AssignTaskInput, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = AssignTaskSchema.parse(input);
    await this.assertResponsibleIsAllowed(validated.responsibleType, validated.responsibleRefId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOne(OperationalTask, {
        where: { id, tenantId },
      });

      if (!task) {
        throw new NotFoundException('Tarea no encontrada');
      }
      if ([TaskStatus.RESOLVED, TaskStatus.CANCELLED].includes(task.status)) {
        throw new BadRequestException('No puedes reasignar una tarea cerrada o cancelada.');
      }

      const previousResponsibleRefId = task.responsibleRefId;
      const previousResponsibleType = task.responsibleType;

      if (
        previousResponsibleType === validated.responsibleType &&
        previousResponsibleRefId === validated.responsibleRefId
      ) {
        return task;
      }

      task.responsibleType = validated.responsibleType;
      task.responsibleRefId = validated.responsibleRefId;
      const saved = await qr.manager.save(OperationalTask, task);

      await qr.manager.save(
        TaskAssignmentHistory,
        qr.manager.create(TaskAssignmentHistory, {
          tenantId,
          taskId: id,
          previousResponsibleType,
          previousResponsibleRefId,
          newResponsibleType: validated.responsibleType,
          newResponsibleRefId: validated.responsibleRefId,
          reason: validated.reason ?? null,
          actorUserId: actor.sub,
        }),
      );

      await this.timelineService.recordWithManager(qr.manager, {
        taskId: id,
        tenantId,
        eventType: TaskTimelineEventType.REASSIGNED,
        payload: {
          previousResponsibleRefId,
          newResponsibleRefId: validated.responsibleRefId,
        },
        actorUserId: actor.sub,
      });

      return saved;
    });
  }

  private async assertResponsibleIsAllowed(
    responsibleType: TaskResponsibleType,
    responsibleRefId: string,
  ): Promise<void> {
    if (responsibleType !== TaskResponsibleType.USER) {
      throw new BadRequestException(
        'En esta fase solo se soportan responsables individuales de tipo usuario.',
      );
    }

    const user = await this.usersService.findOne(responsibleRefId);
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('El responsable seleccionado no está activo.');
    }
    if (!ASSIGNABLE_RESPONSIBLE_ROLES.has(user.role)) {
      throw new BadRequestException(
        'El responsable seleccionado no es elegible para tareas operativas.',
      );
    }
  }
}
