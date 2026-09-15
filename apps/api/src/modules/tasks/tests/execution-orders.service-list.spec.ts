import { BadRequestException } from '@nestjs/common';
import { ZodError } from 'zod';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../services/execution-orders.service';

// requireActual conserva el resto de exports reales de @iwana/db (enums y
// entidades que la cadena de imports del servicio consume, p. ej. MediaUsage);
// solo se parchea el contexto de tenant y el runner de schema.
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

type QbMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
};

function buildQb(rows: Array<Record<string, unknown>>, total?: number): QbMock {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total ?? rows.length]),
  };
}

function mockSchema(qb: QbMock): void {
  const mockRun = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  mockRun.mockImplementation(async (_ds, _schema, fn) =>
    fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } } as never),
  );
}

/**
 * Construye el servicio con un mock de `UsersService` en la última posición
 * del constructor (SEC-D4: lookup batch de `assignee.displayLabel`).
 */
function buildServiceWithUsers(usersService: {
  findDisplayLabelsByIds: jest.Mock;
}): ExecutionOrdersService {
  return new ExecutionOrdersService(
    {} as DataSource,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    usersService as never,
  );
}

function buildOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    executionOrderNumber: 'OTE-20260913-001',
    status: ExecutionOrderStatus.ASSIGNED,
    result: null,
    workType: WfmWorkType.INSTALLATION,
    scheduleEventId: '33333333-3333-4333-8333-333333333333',
    plannedWindowStartAt: new Date('2026-09-13T14:00:00.000Z'),
    plannedWindowEndAt: new Date('2026-09-13T16:00:00.000Z'),
    assignedTechnicianId: 'tech-001',
    assignedCrewId: null,
    customerDisplayLabel: 'Cliente ejemplo',
    municipality: 'Bogotá',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z'),
    ...overrides,
  };
}

describe('ExecutionOrdersService.list (MOD11 F1)', () => {
  let service: ExecutionOrdersService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const adminActor: JwtPayload = {
    sub: 'admin-001',
    email: 'admin@example.test',
    role: UserRole.ADMIN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-admin',
    type: 'tenant',
  };
  const techActor: JwtPayload = { ...adminActor, sub: 'tech-001', role: UserRole.TECHNICIAN };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new ExecutionOrdersService({} as DataSource);
    jest.clearAllMocks();
    // TenantContext.getOrThrow se mockea a nivel de módulo; clearAllMocks lo
    // vacía: se restaura el valor por defecto en cada caso.
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('ordena por ventana planificada DESC con desempate obligatorio por id (ADR-065 §12)', async () => {
    const qb = buildQb([buildOrder()]);
    mockSchema(qb);

    await service.list({}, adminActor);

    expect(qb.orderBy).toHaveBeenCalledWith('order.planned_window_start_at', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('order.id', 'DESC');
  });

  it('aplica scoping por actor a técnicos y no a supervisores (D1)', async () => {
    const techQb = buildQb([]);
    mockSchema(techQb);
    await service.list({}, techActor);
    const techPredicates = techQb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(techPredicates.some((p) => p.includes('order.assigned_technician_id = :actorSub'))).toBe(
      true,
    );
    expect(
      techPredicates.some(
        (p) => p.includes('order.assigned_crew_id IS NULL') && p.includes(':poolExcludedStatus'),
      ),
    ).toBe(true);
    expect(techQb.andWhere).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorSub: 'tech-001', poolExcludedStatus: 'CREATED' }),
    );

    const adminQb = buildQb([]);
    mockSchema(adminQb);
    await service.list({}, adminActor);
    const adminPredicates = adminQb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(adminPredicates.some((p) => p.includes(':actorSub'))).toBe(false);
  });

  it('incluye CONTRACTOR en el scoping restringido (SEC-D1)', async () => {
    // SEC-D1: el rol CONTRACTOR comparte rama con TECHNICIAN. Este caso existe
    // para que retirarlo de LIST_RESTRICTED_ROLES no pase inadvertido.
    const contractorActor: JwtPayload = {
      ...adminActor,
      sub: 'contractor-001',
      role: UserRole.CONTRACTOR,
    };
    const qb = buildQb([]);
    mockSchema(qb);

    await service.list({}, contractorActor);

    const predicates = qb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(predicates.some((p) => p.includes('order.assigned_technician_id = :actorSub'))).toBe(
      true,
    );
    expect(
      predicates.some(
        (p) => p.includes('order.assigned_crew_id IS NULL') && p.includes(':poolExcludedStatus'),
      ),
    ).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorSub: 'contractor-001', poolExcludedStatus: 'CREATED' }),
    );
  });

  it('aplica los filtros de spec §4.7.1', async () => {
    const qb = buildQb([]);
    mockSchema(qb);

    await service.list(
      {
        status: ExecutionOrderStatus.IN_PROGRESS,
        result: ExecutionOrderResult.EXECUTED,
        workType: WfmWorkType.INSTALLATION,
        assigneeId: '44444444-4444-4444-8444-444444444444',
        organizationSiteId: '55555555-5555-4555-8555-555555555555',
        ticketId: 'ticket-1',
        taskId: 'task-1',
        visitRequestId: '66666666-6666-4666-8666-666666666666',
        windowFrom: '2026-09-13T00:00:00.000Z',
        windowTo: '2026-09-14T00:00:00.000Z',
      },
      adminActor,
    );

    expect(qb.andWhere).toHaveBeenCalledWith('order.status = :status', {
      status: ExecutionOrderStatus.IN_PROGRESS,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.result = :result', {
      result: ExecutionOrderResult.EXECUTED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.work_type = :workType', {
      workType: WfmWorkType.INSTALLATION,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(order.assigned_technician_id = :assigneeId OR order.assigned_crew_id = :assigneeId)',
      { assigneeId: '44444444-4444-4444-8444-444444444444' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('order.organization_site_id = :organizationSiteId', {
      organizationSiteId: '55555555-5555-4555-8555-555555555555',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.ticket_id = :ticketId', {
      ticketId: 'ticket-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.task_id = :taskId', { taskId: 'task-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('order.visit_request_id = :visitRequestId', {
      visitRequestId: '66666666-6666-4666-8666-666666666666',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.planned_window_start_at >= :windowFrom', {
      windowFrom: '2026-09-13T00:00:00.000Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('order.planned_window_start_at <= :windowTo', {
      windowTo: '2026-09-14T00:00:00.000Z',
    });
  });

  it('proyecta exactamente spec §4.7.1, sin campos pesados ni contacto', async () => {
    const qb = buildQb([
      buildOrder({ result: ExecutionOrderResult.EXECUTED, ticketId: 'ticket-9' }),
      buildOrder({
        id: '22222222-2222-4222-8222-222222222222',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: null,
        assignedCrewId: '77777777-7777-4777-8777-777777777777',
        result: null,
      }),
    ]);
    mockSchema(qb);

    const result = await service.list({}, adminActor);

    expect(result.data).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        number: 'OTE-20260913-001',
        status: ExecutionOrderStatus.ASSIGNED,
        // MOD11 T2 (contrato v1.4): el discriminador viaja en la fila.
        annulled: false,
        result: ExecutionOrderResult.EXECUTED,
        workType: WfmWorkType.INSTALLATION,
        schedule: {
          eventId: '33333333-3333-4333-8333-333333333333',
          window: {
            startAt: '2026-09-13T14:00:00.000Z',
            endAt: '2026-09-13T16:00:00.000Z',
          },
        },
        assignee: { type: 'TECHNICIAN', id: 'tech-001' },
        customerDisplayLabel: 'Cliente ejemplo',
        municipality: 'Bogotá',
        ticketId: 'ticket-9',
        taskId: null,
        visitRequestId: null,
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-13T10:00:00.000Z',
      },
      expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        assignee: { type: 'CREW', id: '77777777-7777-4777-8777-777777777777' },
      }),
    ]);
    // `result` solo viaja cuando la OT está cerrada.
    expect(result.data[1]).not.toHaveProperty('result');
    for (const row of result.data) {
      expect(row).not.toHaveProperty('serviceAddress');
      expect(row).not.toHaveProperty('workInstructions');
      expect(row).not.toHaveProperty('completion');
      expect(row).not.toHaveProperty('syncState');
      expect(row).not.toHaveProperty('inventoryReconciliation');
      expect(row).not.toHaveProperty('templateRequirementsSnapshot');
      expect(row).not.toHaveProperty('cursor');
    }
  });

  it('omite assignee cuando la OT está sin asignar (pool)', async () => {
    const qb = buildQb([buildOrder({ assignedTechnicianId: null, assignedCrewId: null })]);
    mockSchema(qb);

    const result = await service.list({}, adminActor);

    expect(result.data[0]).not.toHaveProperty('assignee');
  });

  it('emite meta completa ADR-065 con lista blanca vacía y sort null', async () => {
    const qb = buildQb([buildOrder(), buildOrder()], 42);
    mockSchema(qb);

    const result = await service.list({ page: 2, limit: 20 }, adminActor);

    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result.meta).toEqual({
      nextCursor: null,
      total: 42,
      totalIsEstimate: false,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasMore: true,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    });
  });

  it('ignora sortBy/sortDir con la lista blanca vacía (conserva el default)', async () => {
    const qb = buildQb([]);
    mockSchema(qb);

    const result = await service.list({ sortBy: 'status', sortDir: 'asc' }, adminActor);

    // applySort no reescribe el ORDER BY: solo el default + desempate.
    expect(qb.orderBy).toHaveBeenCalledTimes(1);
    expect(result.meta.sort).toBeNull();
  });

  it('rechaza page*limit sobre el tope con 400 (clampPage)', async () => {
    await expect(service.list({ page: 101, limit: 100 }, adminActor)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('rechaza query con cursor o campos desconocidos (schema strict; el pipe HTTP lo traduce a 400)', async () => {
    // El patrón del módulo (tasks.service.ts:223) es Schema.parse() en el
    // servicio: ZodError crudo para callers internos; el ZodValidationPipe del
    // controlador es quien lo convierte en 400 en el path HTTP, y el caso 9e
    // del e2e lo cubre de extremo a extremo (pendiente de entorno, D-2).
    // Nota (SEC-O1): el suite HTTP no tiene caso `?cursor=abc`.
    await expect(
      service.list({ cursor: 'abc' } as unknown as Record<string, unknown>, adminActor),
    ).rejects.toThrow(ZodError);
  });

  it('nunca invoca getCompletion, getSyncState ni getInventoryReconciliation', async () => {
    const qb = buildQb([buildOrder()]);
    mockSchema(qb);
    const completionSpy = jest.spyOn(service, 'getCompletion');
    const syncSpy = jest.spyOn(service, 'getSyncState');

    await service.list({}, adminActor);

    expect(completionSpy).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
    completionSpy.mockRestore();
    syncSpy.mockRestore();
  });

  // ─── SEC-D4: displayLabel del asignado con lookup batch por página ──────

  it('emite displayLabel del técnico asignado con un solo lookup batch por página (SEC-D4)', async () => {
    const technicianId = '99999999-9999-4999-8999-999999999999';
    const crewId = '77777777-7777-4777-8777-777777777777';
    const qb = buildQb([
      buildOrder({ assignedTechnicianId: technicianId }),
      buildOrder({
        id: '22222222-2222-4222-8222-222222222222',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: technicianId,
      }),
      buildOrder({
        id: '33333333-3333-4333-8333-333333333333',
        executionOrderNumber: 'OTE-20260913-003',
        assignedTechnicianId: null,
        assignedCrewId: crewId,
      }),
    ]);
    mockSchema(qb);
    const findDisplayLabelsByIds = jest
      .fn()
      .mockResolvedValue(new Map([[technicianId, 'Ana Torres']]));
    service = buildServiceWithUsers({ findDisplayLabelsByIds });

    const result = await service.list({}, adminActor);

    // Una sola query por página con ids distintos: nunca una por fila.
    expect(findDisplayLabelsByIds).toHaveBeenCalledTimes(1);
    expect(findDisplayLabelsByIds).toHaveBeenCalledWith([technicianId]);
    expect(result.data[0]!.assignee).toEqual({
      type: 'TECHNICIAN',
      id: technicianId,
      displayLabel: 'Ana Torres',
    });
    expect(result.data[1]!.assignee).toEqual({
      type: 'TECHNICIAN',
      id: technicianId,
      displayLabel: 'Ana Torres',
    });
    // La cuadrilla no es un usuario del directorio: sin consulta y sin etiqueta.
    expect(result.data[2]!.assignee).toEqual({ type: 'CREW', id: crewId });
  });

  it('omite displayLabel cuando el técnico no es resoluble (campo opcional del contrato)', async () => {
    const technicianId = '99999999-9999-4999-8999-999999999999';
    const qb = buildQb([buildOrder({ assignedTechnicianId: technicianId })]);
    mockSchema(qb);
    service = buildServiceWithUsers({
      findDisplayLabelsByIds: jest.fn().mockResolvedValue(new Map()),
    });

    const result = await service.list({}, adminActor);

    expect(result.data[0]!.assignee).toEqual({ type: 'TECHNICIAN', id: technicianId });
    expect(result.data[0]!.assignee).not.toHaveProperty('displayLabel');
  });

  it('no consulta etiquetas cuando la página no tiene técnicos asignados', async () => {
    const qb = buildQb([
      buildOrder({
        assignedTechnicianId: null,
        assignedCrewId: '77777777-7777-4777-8777-777777777777',
      }),
      buildOrder({
        id: '22222222-2222-4222-8222-222222222222',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: null,
        assignedCrewId: null,
      }),
    ]);
    mockSchema(qb);
    const findDisplayLabelsByIds = jest.fn().mockResolvedValue(new Map());
    service = buildServiceWithUsers({ findDisplayLabelsByIds });

    await service.list({}, adminActor);

    expect(findDisplayLabelsByIds).not.toHaveBeenCalled();
  });
});
