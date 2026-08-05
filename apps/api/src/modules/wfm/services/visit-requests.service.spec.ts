import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { VisitRequestsService } from './visit-requests.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { OperatingWindowResolverService } from './operating-window-resolver.service';
import { WorkOrdersService } from './work-orders.service';
import { ExpedienteService } from '../../crm/expedientes/expediente.service';
import { EXECUTION_ORDER_SCHEDULING_PORT } from '../../tasks/ports/execution-order-scheduling.port';
import {
  PlatformRole,
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { VISIT_REQUEST_MISSING_FILTER_VALUE } from '../dto';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

const TENANT_CONTEXT = {
  tenantId: 'tenant-001',
  schemaName: 'tenant_test',
};

function buildManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn().mockImplementation(async (_entity, entity) => ({
      id: 'vr-generated',
      status: VisitRequestStatus.NEEDS_CONTEXT,
      ...entity,
    })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

function buildRawQueryBuilder(rawRows: Array<Record<string, unknown>>) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
}

function buildEntityQueryBuilder(items: unknown[], total: number) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([items, total]),
  };
}

describe('VisitRequestsService', () => {
  let service: VisitRequestsService;
  let workOrdersService: { createWithinManager: jest.Mock };
  let expedienteService: { findDisplayNameById: jest.Mock; findDisplayNameByShortCode: jest.Mock };
  let tenantService: { getTimezone: jest.Mock };
  let operatingWindowResolver: { resolveWithManager: jest.Mock };
  let usersService: { findAll: jest.Mock };
  let executionOrdersService: { createFromSchedulingWithManager: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-01T08:00:00Z'));

    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(TENANT_CONTEXT);

    workOrdersService = {
      createWithinManager: jest.fn(),
    };

    expedienteService = {
      findDisplayNameById: jest.fn().mockResolvedValue(null),
      findDisplayNameByShortCode: jest.fn().mockResolvedValue(null),
    };

    tenantService = {
      getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
    };

    operatingWindowResolver = {
      resolveWithManager: jest.fn().mockResolvedValue({
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      }),
    };

    usersService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440000' }),
          buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440010' }),
        ],
        meta: {
          nextCursor: null,
          total: 2,
        },
      }),
    };

    executionOrdersService = {
      createFromSchedulingWithManager: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitRequestsService,
        { provide: DataSource, useValue: {} },
        { provide: WfmTenantSettingsReadPort, useValue: tenantService },
        { provide: OperatingWindowResolverService, useValue: operatingWindowResolver },
        { provide: ScheduleConflictService, useValue: { hasConflictWithManager: jest.fn() } },
        { provide: WorkOrdersService, useValue: workOrdersService },
        { provide: ExpedienteService, useValue: expedienteService },
        { provide: UsersService, useValue: usersService },
        { provide: EXECUTION_ORDER_SCHEDULING_PORT, useValue: executionOrdersService },
      ],
    }).compile();

    service = module.get<VisitRequestsService>(VisitRequestsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildUserResponse(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-001',
      email: 'operativo@test.com',
      firstName: 'Olga',
      lastName: 'Operativa',
      role: UserRole.TECHNICIAN,
      status: 'ACTIVE',
      tenantId: TENANT_CONTEXT.tenantId,
      mfaEnabled: false,
      mfaRequired: false,
      isOperationalResource: true,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      deletedAt: null,
      jobTitle: 'Técnica de campo',
      phone: null,
      documentType: null,
      avatarUrl: null,
      documentNumber: null,
      ...overrides,
    };
  }

  it('restringe a SALES para crear solicitudes no originadas en CRM', async () => {
    await expect(
      service.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.ASSURANCE,
          workType: WfmWorkType.SUPPORT,
          title: 'Visita Assurance',
          priority: WorkOrderPriority.NORMAL,
        },
        {
          sub: 'sales-001',
          role: UserRole.SALES,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a task-originated visit request without opening a second intake model', async () => {
    const duplicateQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const actor = {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never;

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.TASKS,
        originRef: 'task-001',
        originLabel: 'Tarea OT-001',
        workType: WfmWorkType.TECHNICAL_VISIT,
        title: 'Visita derivada de tarea',
        municipality: 'Bogotá',
        address: 'Cra 1 # 2-3',
        priority: WorkOrderPriority.NORMAL,
      },
      actor,
    );

    expect(result.originContext).toBe(WorkOrderSourceContext.TASKS);
    expect(result.originRef).toBe('task-001');
  });

  it('creates an execution order when a visit request is scheduled', async () => {
    const visitRequest = {
      id: 'vr-001',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.TASKS,
      originRef: 'task-001',
      originLabel: 'Tarea task-001',
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Visita derivada',
      description: 'Atender novedad',
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      executionOrderId: null,
    };

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest
        .fn()
        .mockImplementationOnce(async (_entity, entity) => ({ id: 'se-001', ...entity }))
        .mockImplementationOnce(async (_entity, entity) => entity),
    });

    executionOrdersService.createFromSchedulingWithManager.mockResolvedValue({
      id: 'eo-001',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-001',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-24T14:00:00.000Z',
        scheduledEndAt: '2026-06-24T16:00:00.000Z',
        createWorkOrder: false,
      },
      {
        sub: 'support-001',
        role: UserRole.SUPPORT,
      } as never,
    );

    expect(executionOrdersService.createFromSchedulingWithManager).toHaveBeenCalledWith(
      manager,
      TENANT_CONTEXT.tenantId,
      expect.objectContaining({
        visitRequestId: 'vr-001',
        scheduleEventId: 'se-001',
      }),
      expect.objectContaining({ sub: 'support-001' }),
    );
    expect(result.executionOrderId).toBe('eo-001');
  });

  it('rechaza con 409 cuando el indice unico detecta carrera (safety net)', async () => {
    const duplicate = {
      id: 'vr-dup',
      tenantId: TENANT_CONTEXT.tenantId,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-001',
      workType: WfmWorkType.INSTALLATION,
      status: VisitRequestStatus.NEEDS_CONTEXT,
    };

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate),
    };
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn().mockRejectedValue({
        code: '23505',
        constraint: 'idx_visit_requests_active_origin_unique',
      }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await expect(
      service.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'exp-001',
          workType: WfmWorkType.INSTALLATION,
          title: 'Instalación expediente',
          priority: WorkOrderPriority.NORMAL,
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('enriquece solicitudes CRM con el nombre del cliente desde expedienteId', async () => {
    const visitRequest = {
      id: 'vr-crm-name',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: null,
      originLabel: 'Oportunidad ABCD1234',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación ABCD1234',
      expedienteId: '550e8400-e29b-41d4-a716-446655440000',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    expedienteService.findDisplayNameById.mockResolvedValue('Cliente Operativo');

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.getVisitRequestById('vr-crm-name', {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(expedienteService.findDisplayNameById).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result.customerDisplayName).toBe('Cliente Operativo');
  });

  it('enriquece solicitudes CRM legacy con nombre por codigo de oportunidad', async () => {
    const visitRequest = {
      id: 'vr-crm-code',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: null,
      originLabel: 'Oportunidad 30CE4263',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación 30CE4263',
      expedienteId: null,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    expedienteService.findDisplayNameByShortCode.mockResolvedValue({
      id: '30ce4263-e29b-41d4-a716-446655440000',
      displayName: 'Alcaldía San Antonio del Tequendama',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.getVisitRequestById('vr-crm-code', {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(expedienteService.findDisplayNameByShortCode).toHaveBeenCalledWith('30CE4263');
    expect(result.customerDisplayName).toBe('Alcaldía San Antonio del Tequendama');
  });

  it('normaliza a READY_TO_SCHEDULE una solicitud stale al obtenerla por id', async () => {
    const visitRequest = {
      id: 'vr-stale-get',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.NEEDS_CONTEXT,
      originContext: WorkOrderSourceContext.CRM,
      originRef: null,
      originLabel: 'Oportunidad STALE001',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación stale',
      expedienteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.getVisitRequestById('vr-stale-get', {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(result.status).toBe(VisitRequestStatus.READY_TO_SCHEDULE);
  });

  it('normaliza estados stale al listar solicitudes', async () => {
    const staleVisitRequest = {
      id: 'vr-stale-list',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.NEEDS_CONTEXT,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-003',
      originLabel: 'Oportunidad STALE-LIST',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación stale list',
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
    };
    const qb = buildEntityQueryBuilder([staleVisitRequest], 1);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.listVisitRequests({ page: 1, limit: 20 }, {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(result.items[0]?.status).toBe(VisitRequestStatus.READY_TO_SCHEDULE);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE visit_requests vr'),
      [TENANT_CONTEXT.tenantId],
    );
  });

  it('persiste organizationSiteId cuando llega en la solicitud', async () => {
    const duplicateQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.CRM,
        originRef: 'exp-002',
        workType: WfmWorkType.INSTALLATION,
        title: 'Instalación con sede organization',
        organizationSiteId: '77777777-7777-4777-8777-777777777777',
        priority: WorkOrderPriority.NORMAL,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationSiteId: '77777777-7777-4777-8777-777777777777',
      }),
    );
    expect(result.organizationSiteId).toBe('77777777-7777-4777-8777-777777777777');
  });

  it('lista personas activas agendables y excluye roles de plataforma para WFM', async () => {
    usersService.findAll.mockResolvedValueOnce({
      data: [
        buildUserResponse({
          id: 'eligible-001',
          firstName: 'Paula',
          lastName: 'Plaza',
          isOperationalResource: true,
          deletedAt: null,
        }),
        buildUserResponse({
          id: 'support-001',
          role: UserRole.SUPPORT,
          isOperationalResource: false,
        }),
        buildUserResponse({
          id: 'inactive-001',
          status: 'INACTIVE',
        }),
        buildUserResponse({
          id: 'deleted-001',
          deletedAt: new Date('2026-06-10T00:00:00.000Z'),
        }),
        buildUserResponse({
          id: 'platform-001',
          role: PlatformRole.IWANA_SUPPORT,
          isOperationalResource: true,
        }),
      ],
      meta: {
        nextCursor: null,
        total: 5,
      },
    });

    const result = await service.listEligibleOperationalAssignees({
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(result).toEqual([
      expect.objectContaining({
        id: 'eligible-001',
        firstName: 'Paula',
        lastName: 'Plaza',
      }),
      expect.objectContaining({
        id: 'support-001',
        role: UserRole.SUPPORT,
        isOperationalResource: false,
      }),
    ]);
    expect(usersService.findAll).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 100,
      status: 'ACTIVE',
    });
  });

  it('agenda sin crear Work Order cuando createWorkOrder=false', async () => {
    const visitRequest = {
      id: 'vr-ready',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación prioritaria',
      description: 'Coordinar visita con portería',
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-001',
    };
    const savedEvent = { id: 'se-001', workOrderId: null };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockResolvedValue(savedEvent),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-ready',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(workOrdersService.createWithinManager).not.toHaveBeenCalled();
    expect(result.workOrderId).toBeNull();
    expect(result.scheduleEventId).toBe('se-001');
  });

  it('rechaza agendar solicitudes en el pasado', async () => {
    jest.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    mockRunInTenantSchema.mockClear();

    await expect(
      service.scheduleVisitRequest(
        'vr-ready',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T14:00:00Z',
          scheduledEndAt: '2026-06-01T15:00:00Z',
          createWorkOrder: false,
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      ),
    ).rejects.toThrow('No se pueden agendar tareas en una fecha u hora anterior al momento actual');

    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('propaga expediente CRM desde originRef al agendar cuando expedienteId es null', async () => {
    const expedienteId = '550e8400-e29b-41d4-a716-446655440000';
    const visitRequest = {
      id: 'vr-crm-origin-ref',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación para cliente CRM',
      description: 'Coordinar visita con portería',
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: expedienteId,
      originLabel: 'Cliente Luis Alberto Segura Corredor',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'se-crm',
        workOrderId: null,
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.scheduleVisitRequest(
      'vr-crm-origin-ref',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expedienteId,
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-crm-origin-ref', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({
        expedienteId,
      }),
    );
  });

  it('permite agendar una solicitud stale cuando el contexto real ya está listo', async () => {
    const visitRequest = {
      id: 'vr-stale-schedule',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.NEEDS_CONTEXT,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación stale schedule',
      description: 'Coordinar visita con portería',
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-stale-schedule',
    };
    const savedEvent = { id: 'se-002', workOrderId: null };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockResolvedValue(savedEvent),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-stale-schedule',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(result.scheduleEventId).toBe('se-002');
    expect(result.status).toBe(VisitRequestStatus.SCHEDULED);
  });

  it('rechaza candidatos no operativos al preparar recomendaciones', async () => {
    const visitRequest = {
      id: 'vr-ready-invalid-candidate',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      requestedWindowStartAt: new Date('2026-06-02T13:00:00.000Z'),
      requestedWindowEndAt: new Date('2026-06-02T18:00:00.000Z'),
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    usersService.findAll.mockResolvedValue({
      data: [buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440000' })],
      meta: { nextCursor: null, total: 1 },
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await expect(
      service.prepareVisitRequestRecommendation(
        'vr-ready-invalid-candidate',
        {
          durationMinutes: 120,
          candidateUserIds: [
            '550e8400-e29b-41d4-a716-446655440000',
            '550e8400-e29b-41d4-a716-446655440099',
          ],
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Los candidatos seleccionados deben ser personas activas y agendables del tenant: 550e8400-e29b-41d4-a716-446655440099.',
      ),
    );
  });

  it('rechaza asignar una solicitud a un usuario no operativo', async () => {
    const visitRequest = {
      id: 'vr-ready-invalid-assignee',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación inválida',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-invalid-assignee',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    usersService.findAll.mockResolvedValue({
      data: [buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440111' })],
      meta: { nextCursor: null, total: 1 },
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await expect(
      service.scheduleVisitRequest(
        'vr-ready-invalid-assignee',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T14:00:00Z',
          scheduledEndAt: '2026-06-01T15:00:00Z',
          createWorkOrder: false,
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'La persona asignada debe ser una persona activa y agendable del tenant.',
      ),
    );
  });

  it('rechaza agendar instalaciones fuera del horario operativo del tenant', async () => {
    const visitRequest = {
      id: 'vr-ready-outside-window',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación fuera de ventana',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-002',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    operatingWindowResolver.resolveWithManager.mockResolvedValueOnce({
      status: 'CLOSED',
      source: 'HOLIDAY_BLACKOUT',
      startTime: null,
      endTime: null,
      reason: 'Festivo nacional',
    });

    await expect(
      service.scheduleVisitRequest(
        'vr-ready-outside-window',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T11:00:00Z',
          scheduledEndAt: '2026-06-01T13:00:00Z',
          createWorkOrder: false,
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      ),
    ).rejects.toThrow('La instalacion debe quedar dentro del horario operativo configurado.');
  });

  it('acepta agendar una solicitud en REQUIRES_RESCHEDULE (F1.1)', async () => {
    const visitRequest = {
      id: 'vr-requires-reschedule',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 1,
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Visita que vuelve tras intento fallido',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-reschedule',
    };

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockImplementation(async (_entity, data) => ({
        id: 'evt-reschedule',
        status: 'SCHEDULED',
        ...data,
      })),
    });

    // Agendabilidad: REQUIRES_RESCHEDULE es agendable sin degradar el status emitido (ADR-077 D3)
    usersService.findAll.mockResolvedValue({
      data: [buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440000' })],
      meta: { nextCursor: null, total: 1 },
    });

    operatingWindowResolver.resolveWithManager.mockResolvedValue({
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '07:00',
      endTime: '18:00',
      reason: null,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-requires-reschedule',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(result.status).toBe(VisitRequestStatus.SCHEDULED);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-requires-reschedule', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({ status: VisitRequestStatus.SCHEDULED }),
    );
  });

  it('preserva REQUIRES_RESCHEDULE al obtener por id (B1 / ADR-077 D3)', async () => {
    const visitRequest = {
      id: 'vr-requires-get',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 2,
      originContext: WorkOrderSourceContext.CRM,
      originRef: null,
      originLabel: 'Oportunidad RETRY001',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Reintento visible',
      expedienteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.getVisitRequestById('vr-requires-get', {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(result.status).toBe(VisitRequestStatus.REQUIRES_RESCHEDULE);
    expect(result.retryCount).toBe(2);
  });

  it('preserva REQUIRES_RESCHEDULE al corregir contexto (B1)', async () => {
    const visitRequest = {
      id: 'vr-requires-ctx',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 1,
      address: 'Calle vieja',
      municipality: 'Bogotá',
      requestedWindowStartAt: null,
      requestedWindowEndAt: null,
      description: null,
      sector: null,
      latitude: null,
      longitude: null,
      organizationSiteId: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      slaDueAt: null,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.updateVisitRequestContext(
      'vr-requires-ctx',
      { address: 'Calle nueva 10' },
      { sub: 'admin-001', role: UserRole.ADMIN } as never,
    );

    expect(result.status).toBe(VisitRequestStatus.REQUIRES_RESCHEDULE);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-requires-ctx', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({ status: VisitRequestStatus.REQUIRES_RESCHEDULE }),
    );
  });

  it('exige attemptDecision cuando retryCount >= 3 (B4)', async () => {
    const visitRequest = {
      id: 'vr-limit',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 3,
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Límite de intentos',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: null,
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-limit',
      scheduleEventId: null,
      slaPausedAt: null,
    };

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await expect(
      service.scheduleVisitRequest(
        'vr-limit',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T14:00:00Z',
          scheduledEndAt: '2026-06-01T15:00:00Z',
          createWorkOrder: false,
        },
        { sub: 'admin-001', role: UserRole.ADMIN } as never,
      ),
    ).rejects.toThrow(/attemptDecision/);
  });

  it('FORCE_RESCHEDULE agenda con retryCount >= 3 (B4)', async () => {
    const visitRequest = {
      id: 'vr-force',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 3,
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Forzar reprogramación',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: null,
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-force',
      scheduleEventId: null,
      slaPausedAt: null,
    };

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockImplementation(async (_entity, data) => ({
        id: 'evt-force',
        status: 'SCHEDULED',
        ...data,
      })),
    });

    usersService.findAll.mockResolvedValue({
      data: [buildUserResponse({ id: '550e8400-e29b-41d4-a716-446655440000' })],
      meta: { nextCursor: null, total: 1 },
    });

    operatingWindowResolver.resolveWithManager.mockResolvedValue({
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '07:00',
      endTime: '18:00',
      reason: null,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-force',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
        attemptDecision: 'FORCE_RESCHEDULE',
      },
      { sub: 'admin-001', role: UserRole.ADMIN } as never,
    );

    expect(result.status).toBe(VisitRequestStatus.SCHEDULED);
  });

  it('CLOSE_CASE cierra sin agendar cuando retryCount >= 3 (B4)', async () => {
    const visitRequest = {
      id: 'vr-close',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      retryCount: 3,
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Cerrar caso',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: null,
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-close',
      scheduleEventId: null,
      slaPausedAt: null,
    };

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-close',
      {
        assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
        attemptDecision: 'CLOSE_CASE',
      },
      { sub: 'admin-001', role: UserRole.ADMIN } as never,
    );

    expect(result.status).toBe(VisitRequestStatus.CANCELLED);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-close', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({ status: VisitRequestStatus.CANCELLED }),
    );
  });

  it('rechaza agendar cuando el evento vinculado está EXPIRED (B2)', async () => {
    const visitRequest = {
      id: 'vr-expired-link',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.SCHEDULED,
      retryCount: 0,
      scheduleEventId: 'evt-expired',
      workType: WfmWorkType.TECHNICAL_VISIT,
      priority: WorkOrderPriority.NORMAL,
      title: 'Agendada con evento vencido',
      description: null,
      organizationSiteId: null,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: null,
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-expired',
    };

    const manager = buildManager({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(visitRequest)
        .mockResolvedValueOnce({ id: 'evt-expired', status: 'EXPIRED' }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await expect(
      service.scheduleVisitRequest(
        'vr-expired-link',
        {
          assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
          scheduledStartAt: '2026-06-01T14:00:00Z',
          scheduledEndAt: '2026-06-01T15:00:00Z',
          createWorkOrder: false,
        },
        { sub: 'admin-001', role: UserRole.ADMIN } as never,
      ),
    ).rejects.toThrow(/vencido/);
  });

  it('mueve una solicitud PENDING a READY_TO_SCHEDULE cuando ya tiene direccion y municipio', async () => {
    const visitRequest = {
      id: 'vr-pending',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.PENDING,
      address: null,
      municipality: null,
      requestedWindowStartAt: null,
      requestedWindowEndAt: null,
      description: null,
      sector: null,
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.updateVisitRequestContext(
      'vr-pending',
      {
        address: 'Cra 8 # 10-20',
        municipality: 'Bogotá',
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-pending', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({ status: VisitRequestStatus.READY_TO_SCHEDULE }),
    );
    expect(result.status).toBe(VisitRequestStatus.READY_TO_SCHEDULE);
  });

  it('limpia campos de contexto cuando recibe null explicito', async () => {
    const visitRequest = {
      id: 'vr-clear-context',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      address: 'Cra 8 # 10-20',
      municipality: 'Bogotá',
      requestedWindowStartAt: new Date('2026-06-01T13:00:00.000Z'),
      requestedWindowEndAt: new Date('2026-06-01T18:00:00.000Z'),
      description: 'Coordinar con portería',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: null,
      ticketId: null,
      contractId: null,
      organizationSiteId: null,
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.updateVisitRequestContext(
      'vr-clear-context',
      {
        address: null,
        municipality: null,
        description: null,
        requestedWindowStartAt: null,
        requestedWindowEndAt: null,
        sector: null,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-clear-context', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({
        address: null,
        municipality: null,
        description: null,
        requestedWindowStartAt: null,
        requestedWindowEndAt: null,
        sector: null,
        status: VisitRequestStatus.NEEDS_CONTEXT,
      }),
    );
    expect(result.address).toBeNull();
    expect(result.municipality).toBeNull();
    expect(result.requestedWindowStartAt).toBeNull();
    expect(result.requestedWindowEndAt).toBeNull();
    expect(result.status).toBe(VisitRequestStatus.NEEDS_CONTEXT);
  });

  it('retorna opciones territoriales activas con conteos y datos faltantes', async () => {
    const municipalityQb = buildRawQueryBuilder([
      { value: 'Bogotá', count: '3' },
      { value: VISIT_REQUEST_MISSING_FILTER_VALUE, count: '2' },
    ]);
    const sectorQb = buildRawQueryBuilder([
      { value: 'Chapinero', municipality: 'Bogotá', count: '2' },
      {
        value: VISIT_REQUEST_MISSING_FILTER_VALUE,
        municipality: VISIT_REQUEST_MISSING_FILTER_VALUE,
        count: '1',
      },
    ]);
    const manager = buildManager({
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(municipalityQb)
        .mockReturnValueOnce(sectorQb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.getFilterOptions({}, {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(result.municipalities).toEqual([
      { value: 'Bogotá', label: 'Bogotá', count: 3 },
      { value: VISIT_REQUEST_MISSING_FILTER_VALUE, label: 'Sin dato', count: 2 },
    ]);
    expect(result.sectors).toEqual([
      { value: 'Chapinero', label: 'Chapinero', count: 2, municipality: 'Bogotá' },
      {
        value: VISIT_REQUEST_MISSING_FILTER_VALUE,
        label: 'Sin dato',
        count: 1,
        municipality: VISIT_REQUEST_MISSING_FILTER_VALUE,
      },
    ]);
    expect(municipalityQb.andWhere).toHaveBeenCalledWith(
      'vr.status NOT IN (:...excludedStatuses)',
      {
        excludedStatuses: [
          VisitRequestStatus.SCHEDULED,
          VisitRequestStatus.CANCELLED,
          VisitRequestStatus.REJECTED,
          VisitRequestStatus.EXPIRED,
        ],
      },
    );
  });

  it('filtra sectores por municipio al cargar opciones territoriales', async () => {
    const municipalityQb = buildRawQueryBuilder([{ value: 'Bogotá', count: '3' }]);
    const sectorQb = buildRawQueryBuilder([
      { value: 'Chapinero', municipality: 'Bogotá', count: '2' },
    ]);
    const manager = buildManager({
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(municipalityQb)
        .mockReturnValueOnce(sectorQb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.getFilterOptions({ municipality: 'Bogotá' }, {
      sub: 'admin-001',
      role: UserRole.ADMIN,
    } as never);

    expect(sectorQb.andWhere).toHaveBeenCalledWith('vr.municipality ILIKE :municipality', {
      municipality: '%Bogotá%',
    });
  });

  it('prepara recomendaciones con horizonte de busqueda sin ventana persistida', async () => {
    const visitRequest = {
      id: 'vr-ready',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      requestedWindowStartAt: null,
      requestedWindowEndAt: null,
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.prepareVisitRequestRecommendation(
      'vr-ready',
      {
        durationMinutes: 120,
        candidateUserIds: ['550e8400-e29b-41d4-a716-446655440000'],
        searchHorizonDays: 7,
        maxResults: 5,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        workType: WfmWorkType.INSTALLATION,
        durationMinutes: 120,
        candidateUserIds: ['550e8400-e29b-41d4-a716-446655440000'],
        municipality: 'Bogotá',
        sector: 'Centro',
        maxResults: 5,
      }),
    );
    expect(result.windowStartAt).toEqual(expect.any(String));
    expect(result.windowEndAt).toEqual(expect.any(String));
    expect(new Date(result.windowEndAt).getTime()).toBeGreaterThan(
      new Date(result.windowStartAt).getTime(),
    );
  });

  it('prioriza el horizonte de busqueda sobre la ventana persistida cuando no llega ventana explicita', async () => {
    const persistedStartAt = new Date('2030-01-01T08:00:00.000Z');
    const persistedEndAt = new Date('2030-01-02T18:00:00.000Z');
    const visitRequest = {
      id: 'vr-ready-with-window',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      requestedWindowStartAt: persistedStartAt,
      requestedWindowEndAt: persistedEndAt,
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.prepareVisitRequestRecommendation(
      'vr-ready-with-window',
      {
        durationMinutes: 120,
        candidateUserIds: ['550e8400-e29b-41d4-a716-446655440000'],
        searchHorizonDays: 1,
      },
      {
        sub: 'admin-001',
        role: UserRole.ADMIN,
      } as never,
    );

    expect(result.windowStartAt).not.toBe(persistedStartAt.toISOString());
    expect(result.windowEndAt).not.toBe(persistedEndAt.toISOString());
    expect(new Date(result.windowEndAt).getTime()).toBeGreaterThan(
      new Date(result.windowStartAt).getTime(),
    );
  });

  it('limita el horizonte Hoy al cierre del dia local del tenant', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-05T15:00:00.000Z'));

    const visitRequest = {
      id: 'vr-ready-today',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      address: 'Cra 1 # 2-3',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      requestedWindowStartAt: null,
      requestedWindowEndAt: null,
      originContext: WorkOrderSourceContext.CRM,
    };
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    try {
      const result = await service.prepareVisitRequestRecommendation(
        'vr-ready-today',
        {
          durationMinutes: 120,
          candidateUserIds: ['550e8400-e29b-41d4-a716-446655440000'],
          searchHorizonDays: 1,
        },
        {
          sub: 'admin-001',
          role: UserRole.ADMIN,
        } as never,
      );

      expect(result.windowStartAt).toBe('2026-06-05T15:00:00.000Z');
      expect(result.windowEndAt).toBe('2026-06-06T04:59:59.999Z');
    } finally {
      jest.useRealTimers();
    }
  });
});
