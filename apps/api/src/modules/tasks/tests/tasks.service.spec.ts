import { ForbiddenException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
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
      addOrderBy: jest.fn().mockReturnThis(),
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
      addOrderBy: jest.fn().mockReturnThis(),
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

  // ═══════════════════════════════════════════════════════════════════
  // create — retry loop + responsible/recipient validation
  // ═══════════════════════════════════════════════════════════════════
  it('retries task number generation on duplicate key', async () => {
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ taskNumber: 'TSK-20260622-001' }),
      }),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockRejectedValueOnce(
          (() => {
            const err = new QueryFailedError('query', [], new Error('duplicate key'));
            (err as any).code = '23505';
            return err;
          })(),
        )
        .mockImplementation(async (_entity, payload) => ({
          id: 'task-retried',
          tenantId: 'tenant-001',
          taskNumber: 'TSK-20260622-002',
          ...payload,
        })),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.create(
      {
        type: TaskType.INTERNAL_OPERATION,
        priority: TaskPriority.NORMAL,
        title: 'Tarea con reintento',
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

    expect(result.id).toBe('task-retried');
    expect(result.taskNumber).toMatch(/^TSK-\d{8}-002$/);
  });

  it('rejects creation when responsible is not USER type', async () => {
    await expect(
      service.create(
        {
          type: TaskType.INTERNAL_OPERATION,
          priority: TaskPriority.NORMAL,
          title: 'Tarea con responsable inválido',
          originContext: TaskOriginContext.MANUAL,
          responsibleType: TaskResponsibleType.QUEUE,
          responsibleRefId: 'admin-role',
          recipientType: TaskRecipientType.INTERNAL_AREA,
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        actor,
      ),
    ).rejects.toThrow('En esta fase solo se soportan responsables individuales de tipo usuario.');
  });

  it('rejects creation when responsible user is inactive', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: 'user-inactive',
      role: UserRole.SUPPORT,
      status: UserStatus.INACTIVE,
      isOperationalResource: false,
    } as any);

    await expect(
      service.create(
        {
          type: TaskType.INTERNAL_OPERATION,
          priority: TaskPriority.NORMAL,
          title: 'Tarea con usuario inactivo',
          originContext: TaskOriginContext.MANUAL,
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'user-inactive',
          recipientType: TaskRecipientType.INTERNAL_AREA,
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        actor,
      ),
    ).rejects.toThrow('El responsable seleccionado no está activo.');
  });

  it('rejects creation when responsible user is not an eligible role', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: 'user-123',
      role: 'GUEST' as UserRole,
      status: UserStatus.ACTIVE,
      isOperationalResource: false,
    } as any);

    await expect(
      service.create(
        {
          type: TaskType.INTERNAL_OPERATION,
          priority: TaskPriority.NORMAL,
          title: 'Tarea con rol no elegible',
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
      ),
    ).rejects.toThrow('El responsable seleccionado no es elegible para tareas operativas.');
  });

  it('rejects creation when technician is not operational resource', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: 'tech-001',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      isOperationalResource: false,
    } as any);

    await expect(
      service.create(
        {
          type: TaskType.INTERNAL_OPERATION,
          priority: TaskPriority.NORMAL,
          title: 'Tarea con técnico no operativo',
          originContext: TaskOriginContext.MANUAL,
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'tech-001',
          recipientType: TaskRecipientType.INTERNAL_AREA,
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        actor,
      ),
    ).rejects.toThrow(
      'Los recursos técnicos o contratistas deben estar habilitados como recurso operativo.',
    );
  });

  it('rejects sales creation without originRefId', async () => {
    const salesActor: JwtPayload = { ...actor, sub: 'sales-001', role: UserRole.SALES };

    await expect(
      service.create(
        {
          type: TaskType.INSTALLATION,
          priority: TaskPriority.NORMAL,
          title: 'Instalación sin originRef',
          originContext: TaskOriginContext.CRM,
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'user-123',
          recipientType: TaskRecipientType.SUBSCRIBER,
          recipientRefId: 'sub-001',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        salesActor,
      ),
    ).rejects.toThrow('Las tareas creadas desde CRM deben incluir originRefId.');
  });

  it('rejects sales creation with non-allowed recipient type', async () => {
    const salesActor: JwtPayload = { ...actor, sub: 'sales-001', role: UserRole.SALES };

    await expect(
      service.create(
        {
          type: TaskType.INSTALLATION,
          priority: TaskPriority.NORMAL,
          title: 'Instalación con recipient inválido',
          originContext: TaskOriginContext.CRM,
          originRefId: 'opp-001',
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'user-123',
          recipientType: TaskRecipientType.INTERNAL_AREA,
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
        },
        salesActor,
      ),
    ).rejects.toThrow(
      'El rol comercial solo puede crear tareas dirigidas a prospectos o suscriptores.',
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // getById — not found
  // ═══════════════════════════════════════════════════════════════════
  it('throws NotFoundException when task does not exist', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: { findOne: jest.fn().mockResolvedValue(null) },
      } as never),
    );

    await expect(service.getById('task-nonexistent', actor)).rejects.toThrow('Tarea no encontrada');
  });

  // ═══════════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════════
  it('updates editable fields of a task', async () => {
    const task = {
      id: 'task-001',
      tenantId: 'tenant-001',
      title: 'Título original',
      priority: TaskPriority.NORMAL,
      dueAt: null,
      status: TaskStatus.OPEN,
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: actor.sub,
      recipientType: TaskRecipientType.INTERNAL_AREA,
      recipientRefId: 'operations-area',
    };

    const manager = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockImplementation(async (_entity, data) => data),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.update(
      'task-001',
      { title: 'Título actualizado', priority: TaskPriority.HIGH },
      actor,
    );

    expect(result.title).toBe('Título actualizado');
    expect(result.priority).toBe(TaskPriority.HIGH);
  });

  it('rejects update of resolved or cancelled task', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        status: TaskStatus.CANCELLED,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: actor.sub,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(service.update('task-001', { title: 'Intento de update' }, actor)).rejects.toThrow(
      'No puedes editar una tarea cerrada o cancelada.',
    );
  });

  it('rejects update when task not found', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(service.update('task-nonexistent', { title: 'No existe' }, actor)).rejects.toThrow(
      'Tarea no encontrada',
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // transitionStatus — full coverage
  // ═══════════════════════════════════════════════════════════════════
  it('transitions task status and records timeline', async () => {
    const task = {
      id: 'task-001',
      tenantId: 'tenant-001',
      status: TaskStatus.OPEN,
      resolvedAt: null,
      closedAt: null,
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: actor.sub,
      originContext: TaskOriginContext.MANUAL,
      type: TaskType.INTERNAL_OPERATION,
      createdByUserId: actor.sub,
    };

    const manager = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockImplementation(async (_entity, data) => data),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.transitionStatus(
      'task-001',
      { status: TaskStatus.IN_PROGRESS },
      actor,
    );

    expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ eventType: TaskTimelineEventType.STATUS_CHANGED }),
    );
  });

  it('handles transition to same status gracefully', async () => {
    const task = {
      id: 'task-001',
      tenantId: 'tenant-001',
      status: TaskStatus.IN_PROGRESS,
      resolvedAt: null,
      closedAt: null,
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: actor.sub,
    };

    const manager = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn().mockImplementation(async (_entity, data) => data),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await service.transitionStatus('task-001', { status: TaskStatus.IN_PROGRESS }, actor);

    expect(timelineService.recordWithManager).toHaveBeenCalled();
  });

  it('rejects transition from task not found', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { findOne: jest.fn().mockResolvedValue(null) } } as never),
    );

    await expect(
      service.transitionStatus('task-nonexistent', { status: TaskStatus.IN_PROGRESS }, actor),
    ).rejects.toThrow('Tarea no encontrada');
  });

  it('rejects transition to status not allowed for technician', async () => {
    const techActor: JwtPayload = { ...actor, sub: 'tech-001', role: UserRole.TECHNICIAN };
    const task = {
      id: 'task-001',
      tenantId: 'tenant-001',
      status: TaskStatus.OPEN,
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: techActor.sub,
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: { findOne: jest.fn().mockResolvedValue(task) },
      } as never),
    );

    await expect(
      service.transitionStatus('task-001', { status: TaskStatus.READY }, techActor),
    ).rejects.toThrow(ForbiddenException);
  });

  // ═══════════════════════════════════════════════════════════════════
  // linkScheduleEvent — edge cases
  // ═══════════════════════════════════════════════════════════════════
  it('rejects schedule link when task does not require scheduling', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        executionMode: TaskExecutionMode.IMMEDIATE,
        scheduledRequired: false,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: actor.sub,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkScheduleEvent(
        'task-001',
        { scheduleEventId: '11111111-1111-4111-8111-111111111111' },
        actor,
      ),
    ).rejects.toThrow('La tarea no requiere agenda para vincular un evento.');
  });

  it('rejects schedule link when task already has a different event linked', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        executionMode: TaskExecutionMode.SCHEDULED,
        scheduledRequired: true,
        scheduleEventId: '11111111-1111-4111-8111-111111111111',
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: actor.sub,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkScheduleEvent(
        'task-001',
        { scheduleEventId: '22222222-2222-4222-8222-222222222222' },
        actor,
      ),
    ).rejects.toThrow('La tarea ya tiene un evento de agenda vinculado.');
  });

  it('rejects schedule link when task not found', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkScheduleEvent(
        'task-nonexistent',
        { scheduleEventId: '11111111-1111-4111-8111-111111111111' },
        actor,
      ),
    ).rejects.toThrow('Tarea no encontrada');
  });

  // ═══════════════════════════════════════════════════════════════════
  // linkWorkOrder — edge cases
  // ═══════════════════════════════════════════════════════════════════
  it('rejects work order link when task is not FIELD_SERVICE', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        executionMode: TaskExecutionMode.SCHEDULED,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: actor.sub,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkWorkOrder(
        'task-001',
        { workOrderId: '33333333-3333-4333-8333-333333333333' },
        actor,
      ),
    ).rejects.toThrow('Solo las tareas de trabajo de campo admiten orden de trabajo.');
  });

  it('rejects work order link when task already has a different work order', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        executionMode: TaskExecutionMode.FIELD_SERVICE,
        workOrderId: '11111111-1111-4111-8111-111111111111',
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: actor.sub,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkWorkOrder(
        'task-001',
        { workOrderId: '22222222-2222-4222-8222-222222222222' },
        actor,
      ),
    ).rejects.toThrow('La tarea ya tiene una orden de trabajo vinculada.');
  });

  it('rejects work order link when task not found', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.linkWorkOrder(
        'task-nonexistent',
        { workOrderId: '33333333-3333-4333-8333-333333333333' },
        actor,
      ),
    ).rejects.toThrow('Tarea no encontrada');
  });

  // ═══════════════════════════════════════════════════════════════════
  // list — filter coverage
  // ═══════════════════════════════════════════════════════════════════
  it('applies status and type filters to list query', async () => {
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
    );

    await service.list({ status: TaskStatus.OPEN, type: TaskType.INTERNAL_OPERATION }, actor);

    expect(andWhere).toHaveBeenCalledWith('task.status = :status', { status: TaskStatus.OPEN });
    expect(andWhere).toHaveBeenCalledWith('task.type = :type', {
      type: TaskType.INTERNAL_OPERATION,
    });
  });

  it('applies responsibleRefId and ticketId filters to list query', async () => {
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
    );

    await service.list(
      {
        responsibleRefId: 'user-999',
        ticketId: 'ticket-123',
      },
      actor,
    );

    expect(andWhere).toHaveBeenCalledWith('task.responsible_ref_id = :filterResponsible', {
      filterResponsible: 'user-999',
    });
    expect(andWhere).toHaveBeenCalledWith('task.ticket_id = :ticketId', {
      ticketId: 'ticket-123',
    });
  });
});
