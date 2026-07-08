import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  TaskType,
  UserRole,
  UserStatus,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { TasksService } from '../services/tasks.service';
import { TaskTimelineService } from '../services/task-timeline.service';

jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  OperationalTask: class OperationalTask {},
}));

describe('TasksService', () => {
  let service: TasksService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  let timelineService: jest.Mocked<TaskTimelineService>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue(undefined),
      listTimeline: jest.fn(),
      listAssignmentHistory: jest.fn(),
    } as unknown as jest.Mocked<TaskTimelineService>;
    usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-123',
        role: UserRole.SUPPORT,
        status: UserStatus.ACTIVE,
        isOperationalResource: false,
      }),
    };

    service = new TasksService(
      {} as DataSource,
      timelineService,
      usersService as unknown as UsersService,
    );
    jest.clearAllMocks();
  });

  it('creates an operational task with explicit responsible and recipient', async () => {
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'task-001',
        tenantId: 'tenant-001',
        taskNumber: 'TSK-20260622-001',
        createdAt: new Date('2026-06-22T14:00:00.000Z'),
        updatedAt: new Date('2026-06-22T14:00:00.000Z'),
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.create(
      {
        type: TaskType.INTERNAL_OPERATION,
        priority: TaskPriority.NORMAL,
        title: 'Validar equipo retirado',
        description: 'Revisar devolucion en bodega central',
        originContext: TaskOriginContext.MANUAL,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-123',
        recipientType: TaskRecipientType.INTERNAL_AREA,
        recipientRefId: 'operations-area',
        recipientLabel: 'Operaciones',
        executionMode: TaskExecutionMode.IMMEDIATE,
        scheduledRequired: false,
      },
      actor,
    );

    expect(result.status).toBe(TaskStatus.OPEN);
    expect(result.responsibleRefId).toBe('user-123');
    expect(result.recipientType).toBe(TaskRecipientType.INTERNAL_AREA);
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: TaskTimelineEventType.CREATED,
        actorUserId: actor.sub,
      }),
    );
  });

  it('records a timeline event when a task is created from a ticket reference', async () => {
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn().mockImplementation(async (_entity, payload) => ({
        id: 'task-002',
        tenantId: 'tenant-001',
        taskNumber: 'TSK-20260707-001',
        createdAt: new Date('2026-07-07T18:00:00.000Z'),
        updatedAt: new Date('2026-07-07T18:00:00.000Z'),
        ...payload,
      })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await service.create(
      {
        type: TaskType.CUSTOMER_SUPPORT,
        priority: TaskPriority.HIGH,
        title: 'Atender ticket escalado',
        originContext: TaskOriginContext.ASSURANCE,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-123',
        recipientType: TaskRecipientType.INTERNAL_AREA,
        recipientRefId: 'support-area',
        recipientLabel: 'Soporte',
        executionMode: TaskExecutionMode.IMMEDIATE,
        scheduledRequired: false,
        ticketId: 'ticket-123',
      },
      actor,
    );

    expect(timelineService.recordWithManager).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: TaskTimelineEventType.CREATED,
      }),
    );
    expect(timelineService.recordWithManager).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: TaskTimelineEventType.TASK_CREATED_FROM_TICKET,
        payload: { ticketId: 'ticket-123' },
        actorUserId: actor.sub,
      }),
    );
  });

  it('filters list to own tasks for technician role', async () => {
    const techActor: JwtPayload = { ...actor, sub: 'tech-001', role: UserRole.TECHNICIAN };
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      } as never),
    );

    await service.list({}, techActor);

    expect(andWhere).toHaveBeenCalledWith('task.responsible_ref_id = :responsibleRefId', {
      responsibleRefId: 'tech-001',
    });
  });

  it('denies technician access to tasks assigned to others', async () => {
    const techActor: JwtPayload = { ...actor, sub: 'tech-001', role: UserRole.TECHNICIAN };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'task-001',
            tenantId: 'tenant-001',
            responsibleRefId: 'other-user',
          }),
        },
      } as never),
    );

    await expect(service.getById('task-001', techActor)).rejects.toThrow(ForbiddenException);
  });

  it('links schedule event and work order without reading WFM tables', async () => {
    const update = jest.fn();
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'task-001',
        tenantId: 'tenant-001',
        scheduleEventId: null,
        workOrderId: null,
        executionMode: TaskExecutionMode.SCHEDULED,
        scheduledRequired: true,
        responsibleRefId: actor.sub,
      })
      .mockResolvedValueOnce({
        id: 'task-001',
        tenantId: 'tenant-001',
        scheduleEventId: '11111111-1111-4111-8111-111111111111',
        workOrderId: null,
        executionMode: TaskExecutionMode.FIELD_SERVICE,
        scheduledRequired: true,
        responsibleRefId: actor.sub,
      })
      .mockResolvedValueOnce({
        id: 'task-001',
        tenantId: 'tenant-001',
        scheduleEventId: '11111111-1111-4111-8111-111111111111',
        workOrderId: '33333333-3333-4333-8333-333333333333',
        executionMode: TaskExecutionMode.FIELD_SERVICE,
        scheduledRequired: true,
        responsibleRefId: actor.sub,
      });

    const save = jest.fn().mockImplementation(async (_entity, payload) => payload);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: {
          findOne,
          save,
          update,
        },
      } as never),
    );

    await service.linkScheduleEvent(
      'task-001',
      { scheduleEventId: '11111111-1111-4111-8111-111111111111' },
      actor,
    );
    await service.linkWorkOrder(
      'task-001',
      { workOrderId: '33333333-3333-4333-8333-333333333333' },
      actor,
    );

    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduleEventId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workOrderId: '33333333-3333-4333-8333-333333333333' }),
    );
    expect(timelineService.recordWithManager).toHaveBeenCalledTimes(2);
  });

  it('filters sales list to installation tasks created from CRM by the same actor', async () => {
    const salesActor: JwtPayload = { ...actor, sub: 'sales-001', role: UserRole.SALES };
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      } as never),
    );

    await service.list({}, salesActor);

    expect(andWhere).toHaveBeenCalledWith('task.origin_context = :originContext', {
      originContext: TaskOriginContext.CRM,
    });
    expect(andWhere).toHaveBeenCalledWith('task.type = :type', {
      type: TaskType.INSTALLATION,
    });
    expect(andWhere).toHaveBeenCalledWith('task.created_by_user_id = :createdByUserId', {
      createdByUserId: 'sales-001',
    });
  });

  it('rejects invalid sales task creation outside the authorized CRM flow', async () => {
    await expect(
      service.create(
        {
          type: TaskType.INTERNAL_OPERATION,
          priority: TaskPriority.NORMAL,
          title: 'Tarea inválida para ventas',
          originContext: TaskOriginContext.MANUAL,
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'user-123',
          recipientType: TaskRecipientType.INTERNAL_AREA,
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        { ...actor, role: UserRole.SALES },
      ),
    ).rejects.toThrow(
      'El rol comercial solo puede crear tareas de instalación originadas desde CRM.',
    );
  });

  it('rejects transitions from terminal states', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: {
          findOne: jest.fn().mockResolvedValue({
            id: 'task-001',
            tenantId: 'tenant-001',
            responsibleType: TaskResponsibleType.USER,
            responsibleRefId: actor.sub,
            status: TaskStatus.RESOLVED,
          }),
        },
      } as never),
    );

    await expect(
      service.transitionStatus('task-001', { status: TaskStatus.IN_PROGRESS }, actor),
    ).rejects.toThrow('La transición RESOLVED -> IN_PROGRESS no está permitida para esta tarea.');
  });
});
