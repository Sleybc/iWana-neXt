import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { OperationalTask, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  TaskType,
  UserRole,
  UserStatus,
} from '@iwana/shared';
import {
  CreateTaskInput,
  CreateTaskSchema,
  LinkScheduleEventInput,
  LinkScheduleEventSchema,
  LinkTaskWorkOrderInput,
  LinkTaskWorkOrderSchema,
  ListTaskQueryInput,
  ListTaskQuerySchema,
  ListTasksResponseDto,
  TransitionTaskInput,
  TransitionTaskSchema,
  UpdateTaskInput,
  UpdateTaskSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { TaskTimelineService } from './task-timeline.service';

const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_TASK_NUMBER_RETRIES = 3;

const ALLOWED_RESPONSIBLE_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
]);

const SALES_ALLOWED_RECIPIENT_TYPES = new Set<TaskRecipientType>([
  TaskRecipientType.SUBSCRIBER,
  TaskRecipientType.PROSPECT,
]);

const TERMINAL_STATUSES = new Set<TaskStatus>([TaskStatus.RESOLVED, TaskStatus.CANCELLED]);

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [
    TaskStatus.READY,
    TaskStatus.IN_PROGRESS,
    TaskStatus.PENDING_INTERNAL,
    TaskStatus.PENDING_EXTERNAL,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.READY]: [
    TaskStatus.SCHEDULED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.SCHEDULED]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.PENDING_INTERNAL,
    TaskStatus.PENDING_EXTERNAL,
    TaskStatus.BLOCKED,
    TaskStatus.RESOLVED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.PENDING_INTERNAL]: [
    TaskStatus.READY,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.PENDING_EXTERNAL]: [
    TaskStatus.READY,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.BLOCKED]: [TaskStatus.READY, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.RESOLVED]: [],
  [TaskStatus.CANCELLED]: [],
};

const TECHNICIAN_ALLOWED_TARGET_STATUSES = new Set<TaskStatus>([
  TaskStatus.IN_PROGRESS,
  TaskStatus.PENDING_INTERNAL,
  TaskStatus.PENDING_EXTERNAL,
  TaskStatus.BLOCKED,
  TaskStatus.RESOLVED,
]);

@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TaskTimelineService,
    private readonly usersService: UsersService,
  ) {}

  async generateTaskNumber(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `TSK-${datePart}-`;

    const latestTask = await manager
      .createQueryBuilder(OperationalTask, 'task')
      .where('task.tenant_id = :tenantId', { tenantId })
      .andWhere('task.task_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('task.task_number', 'DESC')
      .getOne();

    const latestSequence = latestTask?.taskNumber.split('-').at(-1) ?? '000';
    const seq = (Number.parseInt(latestSequence, 10) + 1).toString().padStart(3, '0');
    return `${prefix}${seq}`;
  }

  async create(input: CreateTaskInput, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateTaskSchema.parse(input);
    await this.assertCreatePolicy(validated, actor);
    await this.assertResponsibleIsAllowed(validated.responsibleType, validated.responsibleRefId);
    await this.assertRecipientIsAllowed(validated.recipientType, validated.recipientRefId ?? null);

    for (let attempt = 0; attempt < MAX_TASK_NUMBER_RETRIES; attempt += 1) {
      try {
        return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
          const taskNumber = await this.generateTaskNumber(qr.manager, tenantId);
          const {
            dueAt,
            description,
            originRefId,
            ticketId,
            recipientRefId,
            recipientLabel,
            queueName,
            ...rest
          } = validated;

          const entity = qr.manager.create(OperationalTask, {
            ...rest,
            tenantId,
            taskNumber,
            status: TaskStatus.OPEN,
            createdByUserId: actor.sub,
            description: description ?? null,
            originRefId: originRefId ?? null,
            ticketId: ticketId ?? null,
            recipientRefId: recipientRefId ?? null,
            recipientLabel: recipientLabel ?? null,
            queueName: queueName ?? null,
            dueAt: dueAt ? new Date(dueAt) : null,
          });
          const saved = await qr.manager.save(OperationalTask, entity);

          await this.timelineService.recordWithManager(qr.manager, {
            taskId: saved.id,
            tenantId,
            eventType: TaskTimelineEventType.CREATED,
            payload: {
              status: saved.status,
              responsibleRefId: saved.responsibleRefId,
              recipientType: saved.recipientType,
            },
            actorUserId: actor.sub,
          });

          if (validated.ticketId) {
            await this.timelineService.recordWithManager(qr.manager, {
              taskId: saved.id,
              tenantId,
              eventType: TaskTimelineEventType.TASK_CREATED_FROM_TICKET,
              payload: {
                ticketId: validated.ticketId,
              },
              actorUserId: actor.sub,
            });
          }

          return saved;
        });
      } catch (error) {
        if (!this.isTaskNumberUniqueViolation(error) || attempt === MAX_TASK_NUMBER_RETRIES - 1) {
          throw error;
        }
      }
    }

    throw new ConflictException('No fue posible generar un consecutivo único para la tarea.');
  }

  async list(query: ListTaskQueryInput, actor: JwtPayload): Promise<ListTasksResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListTaskQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(OperationalTask, 'task')
        .where('task.tenant_id = :tenantId', { tenantId })
        .orderBy('task.created_at', 'DESC');

      if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
        qb.andWhere('task.responsible_type = :responsibleType', {
          responsibleType: TaskResponsibleType.USER,
        });
        qb.andWhere('task.responsible_ref_id = :responsibleRefId', {
          responsibleRefId: actor.sub,
        });
      }

      if (actor.role === UserRole.SALES) {
        qb.andWhere('task.origin_context = :originContext', {
          originContext: TaskOriginContext.CRM,
        });
        qb.andWhere('task.type = :type', { type: TaskType.INSTALLATION });
        qb.andWhere('task.created_by_user_id = :createdByUserId', {
          createdByUserId: actor.sub,
        });
      }

      if (validated.status) {
        qb.andWhere('task.status = :status', { status: validated.status });
      }
      if (validated.type) {
        qb.andWhere('task.type = :type', { type: validated.type });
      }
      if (validated.responsibleRefId) {
        qb.andWhere('task.responsible_ref_id = :filterResponsible', {
          filterResponsible: validated.responsibleRefId,
        });
      }
      if (validated.ticketId) {
        qb.andWhere('task.ticket_id = :ticketId', { ticketId: validated.ticketId });
      }

      const page = validated.page ?? DEFAULT_PAGE;
      const limit = validated.limit ?? DEFAULT_LIMIT;
      qb.skip((page - 1) * limit).take(limit);

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    });
  }

  async getById(id: string, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOne(OperationalTask, { where: { id, tenantId } });
      if (!task) {
        throw new NotFoundException('Tarea no encontrada');
      }
      this.assertTaskAccess(task, actor);
      return task;
    });
  }

  async update(id: string, input: UpdateTaskInput, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateTaskSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOne(OperationalTask, { where: { id, tenantId } });
      if (!task) {
        throw new NotFoundException('Tarea no encontrada');
      }
      this.assertTaskAccess(task, actor);
      if (TERMINAL_STATUSES.has(task.status)) {
        throw new BadRequestException('No puedes editar una tarea cerrada o cancelada.');
      }

      await this.assertRecipientIsAllowed(
        validated.recipientType ?? task.recipientType,
        validated.recipientRefId !== undefined
          ? (validated.recipientRefId ?? null)
          : task.recipientRefId,
      );

      Object.assign(task, {
        ...validated,
        dueAt:
          validated.dueAt !== undefined
            ? validated.dueAt
              ? new Date(validated.dueAt)
              : null
            : task.dueAt,
      });

      return qr.manager.save(OperationalTask, task);
    });
  }

  async transitionStatus(
    id: string,
    input: TransitionTaskInput,
    actor: JwtPayload,
  ): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = TransitionTaskSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return this.transitionStatusWithManager(qr.manager, tenantId, id, validated, actor);
    });
  }

  async transitionStatusWithManager(
    manager: EntityManager,
    tenantId: string,
    id: string,
    input: TransitionTaskInput,
    actor: JwtPayload,
  ): Promise<OperationalTask> {
    const validated = TransitionTaskSchema.parse(input);

    const task = await manager.findOne(OperationalTask, { where: { id, tenantId } });
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }
    this.assertTaskAccess(task, actor);
    this.assertTransitionAllowed(task, validated.status, actor);

    task.status = validated.status;
    if (validated.status === TaskStatus.RESOLVED) {
      task.resolvedAt = new Date();
      task.closedAt = null;
    }
    if (validated.status === TaskStatus.CANCELLED) {
      task.closedAt = new Date();
      task.resolvedAt = null;
    }
    if (![TaskStatus.RESOLVED, TaskStatus.CANCELLED].includes(validated.status)) {
      task.resolvedAt = null;
      task.closedAt = null;
    }

    const saved = await manager.save(OperationalTask, task);

    await this.timelineService.recordWithManager(manager, {
      taskId: id,
      tenantId,
      eventType: this.mapTransitionEventType(validated.status),
      payload: { to: validated.status },
      actorUserId: actor.sub,
    });

    return saved;
  }

  async linkScheduleEvent(
    id: string,
    input: LinkScheduleEventInput,
    actor: JwtPayload,
  ): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = LinkScheduleEventSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOne(OperationalTask, { where: { id, tenantId } });
      if (!task) {
        throw new NotFoundException('Tarea no encontrada');
      }
      this.assertTaskAccess(task, actor);
      if (
        ![TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(
          task.executionMode,
        ) &&
        !task.scheduledRequired
      ) {
        throw new BadRequestException('La tarea no requiere agenda para vincular un evento.');
      }
      if (task.scheduleEventId && task.scheduleEventId !== validated.scheduleEventId) {
        throw new ConflictException('La tarea ya tiene un evento de agenda vinculado.');
      }

      task.scheduleEventId = validated.scheduleEventId;
      const saved = await qr.manager.save(OperationalTask, task);

      await this.timelineService.recordWithManager(qr.manager, {
        taskId: id,
        tenantId,
        eventType: TaskTimelineEventType.SCHEDULE_LINKED,
        payload: { scheduleEventId: validated.scheduleEventId },
        actorUserId: actor.sub,
      });

      return saved;
    });
  }

  async linkWorkOrder(
    id: string,
    input: LinkTaskWorkOrderInput,
    actor: JwtPayload,
  ): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = LinkTaskWorkOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOne(OperationalTask, { where: { id, tenantId } });
      if (!task) {
        throw new NotFoundException('Tarea no encontrada');
      }
      this.assertTaskAccess(task, actor);
      if (task.executionMode !== TaskExecutionMode.FIELD_SERVICE) {
        throw new BadRequestException(
          'Solo las tareas de trabajo de campo admiten orden de trabajo.',
        );
      }
      if (task.workOrderId && task.workOrderId !== validated.workOrderId) {
        throw new ConflictException('La tarea ya tiene una orden de trabajo vinculada.');
      }

      task.workOrderId = validated.workOrderId;
      const saved = await qr.manager.save(OperationalTask, task);

      await this.timelineService.recordWithManager(qr.manager, {
        taskId: id,
        tenantId,
        eventType: TaskTimelineEventType.WORK_ORDER_LINKED,
        payload: { workOrderId: validated.workOrderId },
        actorUserId: actor.sub,
      });

      return saved;
    });
  }

  private assertTaskAccess(task: OperationalTask, actor: JwtPayload): void {
    if (
      RESTRICTED_ROLES.includes(actor.role as UserRole) &&
      (task.responsibleType !== TaskResponsibleType.USER || task.responsibleRefId !== actor.sub)
    ) {
      throw new ForbiddenException('No tienes acceso a esta tarea');
    }

    if (actor.role === UserRole.SALES) {
      const isAllowedSalesTask =
        task.originContext === TaskOriginContext.CRM &&
        task.type === TaskType.INSTALLATION &&
        task.createdByUserId === actor.sub;

      if (!isAllowedSalesTask) {
        throw new ForbiddenException('No tienes acceso a esta tarea');
      }
    }
  }

  private async assertCreatePolicy(input: CreateTaskInput, actor: JwtPayload): Promise<void> {
    if (actor.role !== UserRole.SALES) {
      return;
    }

    if (input.originContext !== TaskOriginContext.CRM || input.type !== TaskType.INSTALLATION) {
      throw new ForbiddenException(
        'El rol comercial solo puede crear tareas de instalación originadas desde CRM.',
      );
    }

    if (!input.originRefId) {
      throw new BadRequestException('Las tareas creadas desde CRM deben incluir originRefId.');
    }

    if (!SALES_ALLOWED_RECIPIENT_TYPES.has(input.recipientType)) {
      throw new ForbiddenException(
        'El rol comercial solo puede crear tareas dirigidas a prospectos o suscriptores.',
      );
    }
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
    if (!ALLOWED_RESPONSIBLE_ROLES.has(user.role)) {
      throw new BadRequestException(
        'El responsable seleccionado no es elegible para tareas operativas.',
      );
    }
    if (
      [UserRole.TECHNICIAN, UserRole.CONTRACTOR].includes(user.role) &&
      !user.isOperationalResource
    ) {
      throw new BadRequestException(
        'Los recursos técnicos o contratistas deben estar habilitados como recurso operativo.',
      );
    }
  }

  private async assertRecipientIsAllowed(
    recipientType: TaskRecipientType,
    recipientRefId: string | null,
  ): Promise<void> {
    if (recipientType !== TaskRecipientType.INTERNAL_USER || !recipientRefId) {
      return;
    }

    const user = await this.usersService.findOne(recipientRefId);
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('El destinatario interno seleccionado no está activo.');
    }
  }

  private assertTransitionAllowed(
    task: OperationalTask,
    nextStatus: TaskStatus,
    actor: JwtPayload,
  ): void {
    if (task.status === nextStatus) {
      return;
    }

    if (!STATUS_TRANSITIONS[task.status].includes(nextStatus)) {
      throw new BadRequestException(
        `La transición ${task.status} -> ${nextStatus} no está permitida para esta tarea.`,
      );
    }

    if (actor.role === UserRole.TECHNICIAN && !TECHNICIAN_ALLOWED_TARGET_STATUSES.has(nextStatus)) {
      throw new ForbiddenException('El rol técnico no puede ejecutar esta transición.');
    }
  }

  private mapTransitionEventType(status: TaskStatus): TaskTimelineEventType {
    switch (status) {
      case TaskStatus.BLOCKED:
        return TaskTimelineEventType.BLOCKED;
      case TaskStatus.RESOLVED:
        return TaskTimelineEventType.RESOLVED;
      case TaskStatus.CANCELLED:
        return TaskTimelineEventType.CANCELLED;
      default:
        return TaskTimelineEventType.STATUS_CHANGED;
    }
  }

  private isTaskNumberUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      'code' in error &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    );
  }
}
