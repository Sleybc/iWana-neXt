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

const ESTADOS_PROGRAMABLES = [
  VisitRequestStatus.PENDING,
  VisitRequestStatus.NEEDS_CONTEXT,
  VisitRequestStatus.READY_TO_SCHEDULE,
  VisitRequestStatus.REQUIRES_RESCHEDULE,
];

const ESTADOS_TERMINALES_EVENTO = [
  ScheduleEventStatus.COMPLETED,
  ScheduleEventStatus.CANCELLED,
  ScheduleEventStatus.EXPIRED,
  ScheduleEventStatus.NO_SHOW,
];

function buildManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
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

type EntityQueryBuilderMock = ReturnType<typeof buildEntityQueryBuilder>;

/** Localiza la llamada andWhere cuyo SQL contiene el fragmento dado. */
function findAndWhereCall(
  qb: EntityQueryBuilderMock,
  sqlFragment: string,
): [string, Record<string, unknown>] | undefined {
  const call = (qb.andWhere as jest.Mock).mock.calls.find(
    (candidate) => typeof candidate[0] === 'string' && candidate[0].includes(sqlFragment),
  );
  return call as [string, Record<string, unknown>] | undefined;
}

function buildListedVisitRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-001',
    tenantId: TENANT_CONTEXT.tenantId,
    status: VisitRequestStatus.READY_TO_SCHEDULE,
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRef: 'ticket-001',
    originLabel: 'Ticket ticket-001',
    workType: WfmWorkType.SUPPORT,
    priority: 'NORMAL',
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
    ticketId: 'ticket-001',
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    executionOrderId: null,
    ...overrides,
  };
}

/**
 * scope=actionable en el listado de solicitudes de visita.
 *
 * Verifica las exclusiones server-side para el panel "Pendientes por
 * programar": solo estados programables + sin trabajo de campo ya agendado
 * (vínculo estructural por schedule_event_id o por expediente CRM + workType,
 * semántica ADR-076 D2 / findActiveScheduleWorkByOrigin).
 */
describe('VisitRequestsService — listVisitRequests scope=actionable', () => {
  let service: VisitRequestsService;
  let expedienteService: {
    findDisplayNameById: jest.Mock;
    findDisplayNameByShortCode: jest.Mock;
    findDisplayNamesByIds: jest.Mock;
  };
  let tenantService: { getTimezone: jest.Mock };
  let usersService: { findAll: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(TENANT_CONTEXT);

    expedienteService = {
      findDisplayNameById: jest.fn().mockResolvedValue(null),
      findDisplayNameByShortCode: jest.fn().mockResolvedValue(null),
      findDisplayNamesByIds: jest.fn().mockResolvedValue(new Map()),
    };

    tenantService = {
      getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
    };

    usersService = {
      findAll: jest.fn().mockResolvedValue({
        data: [],
        meta: { nextCursor: null, total: 0 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitRequestsService,
        { provide: DataSource, useValue: {} },
        { provide: WfmTenantSettingsReadPort, useValue: tenantService },
        {
          provide: OperatingWindowResolverService,
          useValue: { resolveWithManager: jest.fn() },
        },
        {
          provide: ScheduleConflictService,
          useValue: { hasConflictWithManager: jest.fn() },
        },
        { provide: WorkOrdersService, useValue: {} },
        { provide: ExpedienteService, useValue: expedienteService },
        { provide: UsersService, useValue: usersService },
        { provide: EXECUTION_ORDER_SCHEDULING_PORT, useValue: {} },
      ],
    }).compile();

    service = module.get<VisitRequestsService>(VisitRequestsService);
  });

  it('scope=actionable filtra a los 4 estados programables y excluye SCHEDULED/IN_EXECUTION/CLOSED/CANCELLED/REJECTED/EXPIRED', async () => {
    const qb = buildEntityQueryBuilder([], 0);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.listVisitRequests({ page: 1, limit: 20, scope: 'actionable' }, ADMIN_ACTOR);

    const statusCall = findAndWhereCall(qb, 'vr.status IN (:...actionableStatuses)');
    expect(statusCall).toBeDefined();
    const statuses = statusCall?.[1].actionableStatuses as VisitRequestStatus[];
    expect(statuses).toEqual(ESTADOS_PROGRAMABLES);
    expect(statuses).not.toContain(VisitRequestStatus.SCHEDULED);
    expect(statuses).not.toContain(VisitRequestStatus.IN_EXECUTION);
    expect(statuses).not.toContain(VisitRequestStatus.CLOSED);
    expect(statuses).not.toContain(VisitRequestStatus.CANCELLED);
    expect(statuses).not.toContain(VisitRequestStatus.REJECTED);
    expect(statuses).not.toContain(VisitRequestStatus.EXPIRED);
  });

  it('scope=actionable excluye por drift: VR READY_TO_SCHEDULE con schedule_event_id apuntando a evento activo', async () => {
    const qb = buildEntityQueryBuilder([], 0);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.listVisitRequests({ page: 1, limit: 20, scope: 'actionable' }, ADMIN_ACTOR);

    const driftCall = findAndWhereCall(qb, 'se.id = vr.schedule_event_id');
    expect(driftCall).toBeDefined();

    const [sql, params] = driftCall as [string, Record<string, unknown>];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('se.deleted_at IS NULL');
    expect(sql).toContain('se.status NOT IN');
    // La exclusión es solo por vínculo estructural, sin heurísticas de título.
    expect(sql).not.toContain('title');
    expect(sql).not.toContain('ILIKE');
    expect(params.terminalLinkedEventStatuses).toEqual(
      expect.arrayContaining(ESTADOS_TERMINALES_EVENTO),
    );
  });

  it('scope=actionable excluye VR CRM con evento activo mismo expediente_id + work_type aunque schedule_event_id sea null', async () => {
    const qb = buildEntityQueryBuilder([], 0);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    await service.listVisitRequests({ page: 1, limit: 20, scope: 'actionable' }, ADMIN_ACTOR);

    const crmCall = findAndWhereCall(qb, 'se_exp.expediente_id = vr.expediente_id');
    expect(crmCall).toBeDefined();

    const [sql, params] = crmCall as [string, Record<string, unknown>];
    expect(sql).toContain('vr.origin_context = :crmOriginContext');
    expect(sql).toContain('vr.expediente_id IS NOT NULL');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('se_exp.type = vr.work_type');
    expect(sql).toContain('se_exp.deleted_at IS NULL');
    expect(sql).toContain('se_exp.status NOT IN');
    expect(params.crmOriginContext).toBe(WorkOrderSourceContext.CRM);
    expect(params.terminalExpedienteEventStatuses).toEqual(
      expect.arrayContaining(ESTADOS_TERMINALES_EVENTO),
    );
  });

  it('scope=actionable NO excluye REQUIRES_RESCHEDULE con evento terminal (NO_SHOW) ni VR sin eventos; el total cuenta solo supervivientes', async () => {
    const survivor = buildListedVisitRequest({
      id: 'vr-requires-reschedule',
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      scheduleEventId: null,
    });
    const qb = buildEntityQueryBuilder([survivor], 1);
    const manager = buildManager({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
      callback({ manager }),
    );

    const result = await service.listVisitRequests(
      { page: 1, limit: 20, scope: 'actionable' },
      ADMIN_ACTOR,
    );

    // REQUIRES_RESCHEDULE sobrevive al filtro de estados programables.
    const statusCall = findAndWhereCall(qb, 'vr.status IN (:...actionableStatuses)');
    const statuses = statusCall?.[1].actionableStatuses as VisitRequestStatus[];
    expect(statuses).toContain(VisitRequestStatus.REQUIRES_RESCHEDULE);

    // El evento NO_SHOW está dentro del set terminal del NOT IN: un evento
    // terminal no satisface la subconsulta, así que NO dispara la exclusión.
    const driftCall = findAndWhereCall(qb, 'se.id = vr.schedule_event_id');
    const terminalStatuses = driftCall?.[1].terminalLinkedEventStatuses as ScheduleEventStatus[];
    expect(terminalStatuses).toEqual(
      expect.arrayContaining([ScheduleEventStatus.NO_SHOW, ScheduleEventStatus.COMPLETED]),
    );

    // VR sin schedule_event_id: la subconsulta por vínculo estructural nunca
    // coincide (se.id = NULL), así que la solicitud no se excluye.
    const [driftSql] = driftCall as [string, Record<string, unknown>];
    expect(driftSql).toContain('se.id = vr.schedule_event_id');
    expect(driftSql).not.toContain('se.id IS NOT NULL OR');

    // meta.total refleja solo las filas que sobreviven a las exclusiones.
    expect(result.meta.total).toBe(1);
    expect(result.items[0]?.id).toBe('vr-requires-reschedule');
  });

  it('scope ausente o all no altera el listado actual (backward-compatible)', async () => {
    const cases: Array<{ page: number; limit: number; scope?: 'all' | 'actionable' }> = [
      { page: 1, limit: 20 },
      { page: 1, limit: 20, scope: 'all' },
    ];

    for (const query of cases) {
      const survivor = buildListedVisitRequest();
      const qb = buildEntityQueryBuilder([survivor], 1);
      const manager = buildManager({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schemaName, callback) =>
        callback({ manager }),
      );

      const result = await service.listVisitRequests(query, ADMIN_ACTOR);

      expect(findAndWhereCall(qb, 'actionableStatuses')).toBeUndefined();
      expect(findAndWhereCall(qb, 'NOT EXISTS')).toBeUndefined();
      expect(findAndWhereCall(qb, 'crmOriginContext')).toBeUndefined();

      // Los filtros base siguen intactos.
      expect(qb.where).toHaveBeenCalledWith('vr.tenant_id = :tenantId', {
        tenantId: TENANT_CONTEXT.tenantId,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('vr.deleted_at IS NULL');

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    }
  });
});
