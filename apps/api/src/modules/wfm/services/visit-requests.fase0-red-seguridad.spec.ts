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
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';

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

const ADMIN_ACTOR = {
  sub: 'admin-001',
  role: UserRole.ADMIN,
} as never;

const ASSIGNEE_ID = '550e8400-e29b-41d4-a716-446655440000';
const SHARED_SUBSCRIBER_ID = '11111111-2222-4333-8444-555555555555';
const EXPEDIENTE_ID = '33333333-4444-4555-8666-777777777777';

function buildManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn().mockImplementation(async (_entity, entity) => ({
      id: 'vr-generated',
      ...entity,
    })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

function buildDuplicateQb(getOne: jest.Mock) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne,
  };
}

function buildSchedulableVisitRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-001',
    tenantId: TENANT_CONTEXT.tenantId,
    status: VisitRequestStatus.READY_TO_SCHEDULE,
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRef: 'ticket-origen',
    originLabel: 'Ticket ticket-origen',
    workType: WfmWorkType.SUPPORT,
    priority: WorkOrderPriority.NORMAL,
    title: 'Visita de soporte',
    description: null,
    organizationSiteId: null,
    address: 'Cra 1 # 2-3',
    municipality: 'Bogotá',
    sector: 'Centro',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: SHARED_SUBSCRIBER_ID,
    ticketId: 'ticket-origen',
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    executionOrderId: null,
    ...overrides,
  };
}

/**
 * Fase 0 — red de seguridad (PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO §3).
 *
 * Estos tests congelan el comportamiento ACTUAL del sistema: la única deduplicación
 * vigente es por unidad de origen (originContext + originRef + workType) entre
 * solicitudes no terminales. NO existe guarda por suscriptor, nodo ni trabajo manual.
 * Las fases 1–4 del plan deben mantener estos escenarios en verde.
 */
describe('VisitRequestsService — Fase 0 red de seguridad (unicidad por origen)', () => {
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
          {
            id: ASSIGNEE_ID,
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
          },
        ],
        meta: {
          nextCursor: null,
          total: 1,
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
        {
          provide: ScheduleConflictService,
          useValue: { hasConflictWithManager: jest.fn().mockResolvedValue(false) },
        },
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

  it('F0.1 — reinstalar tras cancelar sigue siendo posible', async () => {
    // La deduplicación por origen excluye los estados terminales (CANCELLED entre
    // ellos), así que una nueva instalación sobre el mismo expediente crea una
    // solicitud nueva en lugar de quedar bloqueada por la cancelada.
    const cancelledVisitRequest = buildSchedulableVisitRequest({
      id: 'vr-001',
      originContext: WorkOrderSourceContext.CRM,
      originRef: EXPEDIENTE_ID,
      workType: WfmWorkType.INSTALLATION,
      title: 'Instalación cancelada',
      ticketId: null,
    });
    const duplicateQb = buildDuplicateQb(jest.fn().mockResolvedValue(null));
    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(cancelledVisitRequest),
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'vr-reinstalacion-001',
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const cancelled = await service.cancelVisitRequest(
      'vr-001',
      { cancelReason: 'El cliente desiste de la instalación' },
      ADMIN_ACTOR,
    );

    expect(cancelled.status).toBe(VisitRequestStatus.CANCELLED);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'vr-001', tenantId: TENANT_CONTEXT.tenantId },
      expect.objectContaining({ status: VisitRequestStatus.CANCELLED }),
    );

    const reinstalled = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.CRM,
        originRef: EXPEDIENTE_ID,
        workType: WfmWorkType.INSTALLATION,
        title: 'Reinstalación tras cancelación',
        priority: WorkOrderPriority.NORMAL,
        expedienteId: EXPEDIENTE_ID,
      },
      ADMIN_ACTOR,
    );

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(reinstalled.id).toBe('vr-reinstalacion-001');
    expect(reinstalled.originRef).toBe(EXPEDIENTE_ID);
    const terminalFilterCall = duplicateQb.andWhere.mock.calls.find(
      ([clause]) => clause === 'vr.status NOT IN (:...terminalStatuses)',
    );
    expect(terminalFilterCall).toBeDefined();
    expect(terminalFilterCall?.[1]).toEqual(
      expect.objectContaining({
        terminalStatuses: expect.arrayContaining([VisitRequestStatus.CANCELLED]),
      }),
    );
  });

  it('F0.2 — dos tickets simultáneos del mismo suscriptor generan dos visitas sin bloqueo', async () => {
    // El suscriptor NO es eje de unicidad: dos tickets distintos del mismo
    // suscriptor producen dos solicitudes porque el origen (ticketId) difiere.
    const duplicateQb = buildDuplicateQb(jest.fn().mockResolvedValue(null));
    let saveCalls = 0;
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => {
        saveCalls += 1;
        return { id: `vr-suscriptor-${saveCalls}`, ...entity };
      }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const first = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-A',
        workType: WfmWorkType.SUPPORT,
        title: 'Visita soporte ticket A',
        priority: WorkOrderPriority.NORMAL,
        ticketId: 'ticket-A',
        subscriberId: SHARED_SUBSCRIBER_ID,
      },
      ADMIN_ACTOR,
    );
    const second = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-B',
        workType: WfmWorkType.SUPPORT,
        title: 'Visita soporte ticket B',
        priority: WorkOrderPriority.NORMAL,
        ticketId: 'ticket-B',
        subscriberId: SHARED_SUBSCRIBER_ID,
      },
      ADMIN_ACTOR,
    );

    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(first.id).not.toBe(second.id);
    expect(first.originRef).toBe('ticket-A');
    expect(second.originRef).toBe('ticket-B');
    expect(first.subscriberId).toBe(SHARED_SUBSCRIBER_ID);
    expect(second.subscriberId).toBe(SHARED_SUBSCRIBER_ID);
    // La deduplicación jamás filtra por suscriptor: solo por origen.
    const andWhereClauses = duplicateQb.andWhere.mock.calls.map(([clause]) => String(clause));
    expect(andWhereClauses.some((clause) => clause.includes('subscriber'))).toBe(false);
  });

  it('F0.3 — dos tickets sobre el mismo nodo generan dos trabajos sin bloqueo', async () => {
    // El nodo (TicketSubjectType.NETWORK_NODE) vive en el ticket de Assurance y no
    // se propaga a la VisitRequest: la unicidad nunca lo consulta. Dos tickets del
    // mismo nodo producen dos solicitudes, dos eventos y dos órdenes de trabajo.
    const duplicateQb = buildDuplicateQb(jest.fn().mockResolvedValue(null));
    let saveCalls = 0;
    const manager = buildManager({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(
          buildSchedulableVisitRequest({
            id: 'vr-nodo-a',
            originRef: 'ticket-C',
            ticketId: 'ticket-C',
          }),
        )
        .mockResolvedValueOnce(
          buildSchedulableVisitRequest({
            id: 'vr-nodo-b',
            originRef: 'ticket-D',
            ticketId: 'ticket-D',
          }),
        ),
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => {
        saveCalls += 1;
        if (saveCalls === 3) {
          return { id: 'se-001', ...entity };
        }
        if (saveCalls === 5) {
          return { id: 'se-002', ...entity };
        }
        return { id: `vr-nodo-saved-${saveCalls}`, ...entity };
      }),
    });

    workOrdersService.createWithinManager
      .mockResolvedValueOnce({ id: 'wo-001' })
      .mockResolvedValueOnce({ id: 'wo-002' });
    executionOrdersService.createFromSchedulingWithManager
      .mockResolvedValueOnce({ id: 'eo-001' })
      .mockResolvedValueOnce({ id: 'eo-002' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-C',
        workType: WfmWorkType.SUPPORT,
        title: 'Visita soporte ticket C',
        priority: WorkOrderPriority.NORMAL,
        ticketId: 'ticket-C',
        subscriberId: SHARED_SUBSCRIBER_ID,
      },
      ADMIN_ACTOR,
    );
    await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-D',
        workType: WfmWorkType.SUPPORT,
        title: 'Visita soporte ticket D',
        priority: WorkOrderPriority.NORMAL,
        ticketId: 'ticket-D',
        subscriberId: SHARED_SUBSCRIBER_ID,
      },
      ADMIN_ACTOR,
    );

    await service.scheduleVisitRequest(
      'vr-nodo-a',
      {
        assignedUserId: ASSIGNEE_ID,
        scheduledStartAt: '2026-06-02T14:00:00.000Z',
        scheduledEndAt: '2026-06-02T15:00:00.000Z',
      },
      ADMIN_ACTOR,
    );
    await service.scheduleVisitRequest(
      'vr-nodo-b',
      {
        assignedUserId: ASSIGNEE_ID,
        scheduledStartAt: '2026-06-02T16:00:00.000Z',
        scheduledEndAt: '2026-06-02T17:00:00.000Z',
      },
      ADMIN_ACTOR,
    );

    expect(workOrdersService.createWithinManager).toHaveBeenCalledTimes(2);
    const workOrderEventIds = workOrdersService.createWithinManager.mock.calls.map(
      (call) => call[5] as string,
    );
    expect(workOrderEventIds).toEqual(['se-001', 'se-002']);
    expect(executionOrdersService.createFromSchedulingWithManager).toHaveBeenCalledTimes(2);
    const executionOrderEventIds =
      executionOrdersService.createFromSchedulingWithManager.mock.calls.map(
        (call) => (call[2] as { scheduleEventId: string }).scheduleEventId,
      );
    expect(executionOrderEventIds).toEqual(['se-001', 'se-002']);
    const andWhereClauses = duplicateQb.andWhere.mock.calls.map(([clause]) => String(clause));
    expect(andWhereClauses.some((clause) => clause.includes('subscriber'))).toBe(false);
    expect(andWhereClauses.some((clause) => clause.includes('node'))).toBe(false);
  });

  it('F0.4 — un trabajo manual sin ticket no queda bloqueado', async () => {
    // Sin originRef la deduplicación no aplica (retorna antes de consultar), así
    // que los trabajos manuales se crean siempre, incluso en ráfaga.
    const createQueryBuilder = jest.fn();
    let saveCalls = 0;
    const manager = buildManager({
      createQueryBuilder,
      save: jest.fn().mockImplementation(async (_entity, entity) => {
        saveCalls += 1;
        return { id: `vr-manual-${saveCalls}`, ...entity };
      }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const first = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.MANUAL,
        workType: WfmWorkType.TECHNICAL_VISIT,
        title: 'Trabajo manual de mantenimiento',
        priority: WorkOrderPriority.NORMAL,
      },
      ADMIN_ACTOR,
    );
    const second = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.MANUAL,
        workType: WfmWorkType.TECHNICAL_VISIT,
        title: 'Segundo trabajo manual de mantenimiento',
        priority: WorkOrderPriority.NORMAL,
      },
      ADMIN_ACTOR,
    );

    expect(createQueryBuilder).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(first.id).not.toBe(second.id);
    expect(first.originContext).toBe(WorkOrderSourceContext.MANUAL);
    expect(second.originContext).toBe(WorkOrderSourceContext.MANUAL);
    expect(first.ticketId).toBeNull();
    expect(second.ticketId).toBeNull();
  });
});
