import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { VisitRequestsService } from './visit-requests.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { OperatingWindowResolverService } from './operating-window-resolver.service';
import { WorkOrdersService } from './work-orders.service';
import {
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

describe('VisitRequestsService', () => {
  let service: VisitRequestsService;
  let workOrdersService: { createWithinManager: jest.Mock };
  let tenantService: { getTimezone: jest.Mock };
  let operatingWindowResolver: { resolveWithManager: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(TENANT_CONTEXT);

    workOrdersService = {
      createWithinManager: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitRequestsService,
        { provide: DataSource, useValue: {} },
        { provide: WfmTenantSettingsReadPort, useValue: tenantService },
        { provide: OperatingWindowResolverService, useValue: operatingWindowResolver },
        { provide: ScheduleConflictService, useValue: { hasConflictWithManager: jest.fn() } },
        { provide: WorkOrdersService, useValue: workOrdersService },
      ],
    }).compile();

    service = module.get<VisitRequestsService>(VisitRequestsService);
  });

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

  it('retorna el duplicado activo cuando el indice unico detecta carrera', async () => {
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

    const result = await service.createVisitRequest(
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
    );

    expect(result).toBe(duplicate);
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
      operatingSiteId: null,
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

  it('rechaza agendar instalaciones fuera del horario operativo del tenant', async () => {
    const visitRequest = {
      id: 'vr-ready-outside-window',
      tenantId: TENANT_CONTEXT.tenantId,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación fuera de ventana',
      description: null,
      operatingSiteId: null,
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

  it('mueve una solicitud PENDING a NEEDS_CONTEXT cuando se guarda contexto parcial', async () => {
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
      expect.objectContaining({ status: VisitRequestStatus.NEEDS_CONTEXT }),
    );
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
});
