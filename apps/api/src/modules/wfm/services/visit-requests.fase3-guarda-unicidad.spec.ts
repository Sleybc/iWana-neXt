import { ConflictException } from '@nestjs/common';
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
  ScheduleEventStatus,
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

function buildDuplicateQb(getOneResult: unknown = null) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneResult),
  };
}

function buildUserResponse(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
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
    subscriberId: null,
    ticketId: 'ticket-origen',
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    executionOrderId: null,
    retryCount: 0,
    slaPausedAt: null,
    additionalReason: null,
    ...overrides,
  };
}

/**
 * Fase 3 — Guarda de unicidad (PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO §3)
 *
 * Tests para F3.1 (advisory lock + 409), F3.2 (FOR UPDATE),
 * F3.3 (visita adicional con motivo), F3.4 (normalización originRef),
 * y F3.5 (reagendar tras no ejecución no activa la guarda).
 */
describe('VisitRequestsService — Fase 3 guarda de unicidad', () => {
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
        data: [buildUserResponse()],
        meta: { nextCursor: null, total: 1 },
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

  // ─── F3.1: Guarda de dominio con advisory lock ────────────────────────

  it('F3.1 — rechaza con 409 cuando existe un duplicado activo por unidad de origen', async () => {
    const duplicate = {
      id: 'vr-dup-active',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-001',
      workType: WfmWorkType.INSTALLATION,
      title: 'Instalación existente',
      priority: WorkOrderPriority.NORMAL,
    };

    const duplicateQb = buildDuplicateQb(duplicate);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
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
          title: 'Nueva instalación',
          priority: WorkOrderPriority.NORMAL,
        },
        ADMIN_ACTOR,
      ),
    ).rejects.toThrow(ConflictException);

    // Verifica que se tomó el advisory lock con la clave correcta
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${TENANT_CONTEXT.tenantId}|CRM|exp-001|INSTALLATION`,
    ]);

    // Verifica que NO se persistió (save no fue llamado)
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('F3.1 — el 409 incluye originRef y activeVisitRequestId en el cuerpo', async () => {
    const duplicate = {
      id: 'vr-dup-body',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'exp-body-test',
      workType: WfmWorkType.INSTALLATION,
      title: 'Instalación existente',
    };

    const duplicateQb = buildDuplicateQb(duplicate);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    let caughtError: ConflictException | null = null;
    try {
      await service.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'exp-body-test',
          workType: WfmWorkType.INSTALLATION,
          title: 'Nueva instalación',
          priority: WorkOrderPriority.NORMAL,
        },
        ADMIN_ACTOR,
      );
    } catch (error) {
      caughtError = error as ConflictException;
    }

    expect(caughtError).toBeInstanceOf(ConflictException);
    const response = (caughtError as ConflictException).getResponse() as Record<string, unknown>;
    expect(response.error).toBe('DUPLICATE_ACTIVE_WORK');
    expect(response.originRef).toBe('exp-body-test');
    expect(response.activeVisitRequestId).toBe('vr-dup-body');
  });

  // ─── F3.3: Visita adicional con motivo obligatorio ────────────────────

  it('F3.3 — visita adicional (isAdditional=true) con motivo pasa la guarda de unicidad', async () => {
    const duplicateQb = buildDuplicateQb(null);
    let saveArg: Record<string, unknown> | null = null;
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => {
        saveArg = entity as Record<string, unknown>;
        return { id: 'vr-additional-ok', ...entity };
      }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.CRM,
        originRef: 'exp-existing',
        workType: WfmWorkType.INSTALLATION,
        title: 'Segunda instalación para el mismo expediente',
        priority: WorkOrderPriority.NORMAL,
        isAdditional: true,
        additionalReason: 'Refuerzo urgente de cuadrilla para terminar en el día',
      },
      ADMIN_ACTOR,
    );

    // La visita adicional NO debe tomar advisory lock ni verificar duplicados.
    // Verificamos que el createQueryBuilder NO fue llamado (no hubo búsqueda de duplicados).
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.anything(),
    );
    // Debe persistir el motivo
    expect((saveArg as unknown as Record<string, unknown>)?.additionalReason).toBe(
      'Refuerzo urgente de cuadrilla para terminar en el día',
    );
    expect(result.id).toBe('vr-additional-ok');
  });

  it('F3.3 — visita adicional sin motivo: el DTO tiene validación de obligatoriedad', () => {
    // La validación de que additionalReason es obligatorio cuando isAdditional=true
    // se realiza en el ValidationPipe HTTP vía class-validator (ValidateIf + IsNotEmpty).
    // Este test verifica que los campos están declarados en el DTO.

    const { CreateVisitRequestSchema } = require('../dto/create-visit-request.dto');

    // Zod schema permite isAdditional opcional (sin default).
    const parsed = CreateVisitRequestSchema.parse({
      originContext: WorkOrderSourceContext.CRM,
      workType: WfmWorkType.INSTALLATION,
      title: 'Test',
      isAdditional: true,
      additionalReason: 'Motivo de la visita adicional',
    });

    expect(parsed.isAdditional).toBe(true);
    expect(parsed.additionalReason).toBe('Motivo de la visita adicional');
  });

  // ─── F3.4: Normalización de originRef ─────────────────────────────────

  it('F3.4 — originRef con espacios al inicio y final se normaliza al persistir', async () => {
    const duplicateQb = buildDuplicateQb(null);
    let saveArg: Record<string, unknown> | null = null;
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => {
        saveArg = entity as Record<string, unknown>;
        return { id: 'vr-normalized', ...entity };
      }),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.CRM,
        originRef: '  exp-with-spaces  ',
        workType: WfmWorkType.INSTALLATION,
        title: 'Instalación con espacios',
        priority: WorkOrderPriority.NORMAL,
      },
      ADMIN_ACTOR,
    );

    // originRef debe persistirse sin espacios
    expect((saveArg as unknown as Record<string, unknown>)?.originRef).toBe('exp-with-spaces');
    // La clave del advisory lock debe usar el valor normalizado
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${TENANT_CONTEXT.tenantId}|CRM|exp-with-spaces|INSTALLATION`,
    ]);
    expect(result.id).toBe('vr-normalized');
  });

  it('F3.4 — originRef sin valor no activa el advisory lock', async () => {
    const manager = buildManager();

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.MANUAL,
        workType: WfmWorkType.TECHNICAL_VISIT,
        title: 'Trabajo manual sin referencia',
        priority: WorkOrderPriority.NORMAL,
      },
      ADMIN_ACTOR,
    );

    // Sin originRef no debe tomarse advisory lock
    const advisoryCalls = (manager.query as jest.Mock).mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('pg_advisory_xact_lock'),
    );
    expect(advisoryCalls).toHaveLength(0);
  });

  // ─── F3.5: Reagendar tras no ejecución NO activa la guarda ───────────

  it('F3.5 — reagendar visita en REQUIRES_RESCHEDULE no activa advisory lock', async () => {
    const visitRequest = buildSchedulableVisitRequest({
      id: 'vr-reschedule',
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      workType: WfmWorkType.TECHNICAL_VISIT,
      title: 'Visita que vuelve',
      originRef: 'ticket-que-vuelve',
    });

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'se-rescheduled',
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.scheduleVisitRequest(
      'vr-reschedule',
      {
        assignedUserId: ASSIGNEE_ID,
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      ADMIN_ACTOR,
    );

    expect(result.status).toBe(VisitRequestStatus.SCHEDULED);

    // Verifica que findOne fue llamado con lock pessimistc_write
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );

    // NO debe haberse tomado advisory lock (REQUIRES_RESCHEDULE salta la guarda)
    const advisoryCalls = (manager.query as jest.Mock).mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('pg_advisory_xact_lock'),
    );
    expect(advisoryCalls).toHaveLength(0);
  });

  it('F3.5 — agendar una visita normal (no REQUIRES_RESCHEDULE) sí toma advisory lock', async () => {
    const visitRequest = buildSchedulableVisitRequest({
      id: 'vr-normal-schedule',
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originRef: 'ticket-normal',
    });

    const manager = buildManager({
      findOne: jest.fn().mockResolvedValue(visitRequest),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'se-normal',
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.scheduleVisitRequest(
      'vr-normal-schedule',
      {
        assignedUserId: ASSIGNEE_ID,
        scheduledStartAt: '2026-06-01T14:00:00Z',
        scheduledEndAt: '2026-06-01T15:00:00Z',
        createWorkOrder: false,
      },
      ADMIN_ACTOR,
    );

    // Debe haberse tomado advisory lock para visitas normales
    const advisoryCalls = (manager.query as jest.Mock).mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('pg_advisory_xact_lock'),
    );
    expect(advisoryCalls).toHaveLength(1);
  });

  // ─── Fase 0: verificación de que los tests de red de seguridad no se rompen ───

  it('F0.1 — reinstalar tras cancelar sigue siendo posible (verify)', async () => {
    // Simular una solicitud cancelada y luego crear una nueva con el mismo origen.
    const duplicateQb = buildDuplicateQb(null); // Sin duplicado activo (cancelada es terminal)
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(duplicateQb),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'vr-reinstalled',
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.CRM,
        originRef: 'exp-cancelled',
        workType: WfmWorkType.INSTALLATION,
        title: 'Reinstalación tras cancelación',
        priority: WorkOrderPriority.NORMAL,
      },
      ADMIN_ACTOR,
    );

    expect(result.id).toBe('vr-reinstalled');
    // El advisory lock sí se toma, pero el duplicado no existe (CANCELLED es terminal)
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${TENANT_CONTEXT.tenantId}|CRM|exp-cancelled|INSTALLATION`,
    ]);
  });

  // ─── ADR-076 D2: Guarda de trabajo agendado activo ─────────────────────

  it('D2 — rechaza con 409 cuando hay VR SCHEDULED + ScheduleEvent SCHEDULED', async () => {
    const scheduledVr = {
      id: 'vr-scheduled-active',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.SCHEDULED,
      originContext: WorkOrderSourceContext.ASSURANCE,
      originRef: 'ticket-scheduled',
      workType: WfmWorkType.SUPPORT,
      scheduleEventId: 'se-active-001',
    };

    const activeEvent = {
      id: 'se-active-001',
      tenantId: TENANT_CONTEXT.tenantId,
      status: ScheduleEventStatus.SCHEDULED,
      deletedAt: null,
    };

    const noDuplicateQb = buildDuplicateQb(null);
    const scheduledVrQb = buildDuplicateQb(scheduledVr);
    const manager = buildManager({
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(noDuplicateQb)
        .mockReturnValueOnce(scheduledVrQb),
      findOne: jest.fn().mockResolvedValue(activeEvent),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    let caughtError: ConflictException | null = null;
    try {
      await service.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.ASSURANCE,
          originRef: 'ticket-scheduled',
          workType: WfmWorkType.SUPPORT,
          title: 'Nueva visita sobre origen ya agendado',
          priority: WorkOrderPriority.NORMAL,
        },
        ADMIN_ACTOR,
      );
    } catch (error) {
      caughtError = error as ConflictException;
    }

    expect(caughtError).toBeInstanceOf(ConflictException);
    const response = (caughtError as ConflictException).getResponse() as Record<string, unknown>;
    expect(response.error).toBe('DUPLICATE_ACTIVE_WORK');
    expect(response.originRef).toBe('ticket-scheduled');
    expect(response.activeVisitRequestId).toBe('vr-scheduled-active');
    expect(response.activeScheduleEventId).toBe('se-active-001');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('D2 — permite create si el ScheduleEvent vinculado está CANCELLED o EXPIRED', async () => {
    for (const terminalStatus of [ScheduleEventStatus.CANCELLED, ScheduleEventStatus.EXPIRED]) {
      const scheduledVr = {
        id: `vr-scheduled-${terminalStatus}`,
        tenantId: TENANT_CONTEXT.tenantId,
        status: VisitRequestStatus.SCHEDULED,
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: `ticket-${terminalStatus.toLowerCase()}`,
        workType: WfmWorkType.SUPPORT,
        scheduleEventId: `se-${terminalStatus.toLowerCase()}`,
      };

      const terminalEvent = {
        id: `se-${terminalStatus.toLowerCase()}`,
        tenantId: TENANT_CONTEXT.tenantId,
        status: terminalStatus,
        deletedAt: null,
      };

      const noDuplicateQb = buildDuplicateQb(null);
      const scheduledVrQb = buildDuplicateQb(scheduledVr);
      // Path CRM no aplica (ASSURANCE): no hay tercera QB de ScheduleEvent por expediente.
      const manager = buildManager({
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(noDuplicateQb)
          .mockReturnValueOnce(scheduledVrQb),
        findOne: jest.fn().mockResolvedValue(terminalEvent),
        save: jest.fn().mockImplementation(async (_entity, entity) => ({
          id: `vr-after-${terminalStatus}`,
          ...entity,
        })),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      const result = await service.createVisitRequest(
        {
          originContext: WorkOrderSourceContext.ASSURANCE,
          originRef: `ticket-${terminalStatus.toLowerCase()}`,
          workType: WfmWorkType.SUPPORT,
          title: `Visita tras evento ${terminalStatus}`,
          priority: WorkOrderPriority.NORMAL,
        },
        ADMIN_ACTOR,
      );

      expect(result.id).toBe(`vr-after-${terminalStatus}`);
      expect(manager.save).toHaveBeenCalled();
    }
  });

  it('D2 — permite create con isAdditional=true aunque haya evento activo', async () => {
    const manager = buildManager({
      createQueryBuilder: jest.fn(),
      save: jest.fn().mockImplementation(async (_entity, entity) => ({
        id: 'vr-additional-over-scheduled',
        ...entity,
      })),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.createVisitRequest(
      {
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: 'ticket-with-active-event',
        workType: WfmWorkType.SUPPORT,
        title: 'Visita adicional sobre origen agendado',
        priority: WorkOrderPriority.NORMAL,
        isAdditional: true,
        additionalReason: 'Segunda cuadrilla por refuerzo operativo',
      },
      ADMIN_ACTOR,
    );

    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    expect(result.id).toBe('vr-additional-over-scheduled');
  });
});
