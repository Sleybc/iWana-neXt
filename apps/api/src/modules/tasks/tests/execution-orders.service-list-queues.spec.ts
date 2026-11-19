import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  EXECUTION_ORDER_QUEUES,
  EXECUTION_ORDER_TERMINAL_STATUSES,
  ExecutionOrderStatus,
  UserRole,
  WfmWorkType,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ListExecutionOrdersQuerySchema } from '../dto/execution-orders.dto';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import {
  buildExecutionOrderQueuePredicate,
  escapeLikePattern,
} from '../services/execution-order-queues';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: { getOrThrow: jest.fn() },
  runInTenantSchema: jest.fn(),
}));

function buildQb(rows: Array<Record<string, unknown>>, rawCounts?: Record<string, unknown>) {
  const counts = {
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawCounts),
  };
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnValue(counts),
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
  };
  (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
    fn({ manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) } }),
  );
  return { qb, counts };
}

const order = {
  id: '11111111-1111-4111-8111-111111111111',
  executionOrderNumber: 'OTE-20261119-001',
  status: ExecutionOrderStatus.ASSIGNED,
  result: null,
  workType: WfmWorkType.INSTALLATION,
  scheduleEventId: null,
  plannedWindowStartAt: null,
  plannedWindowEndAt: null,
  assignedTechnicianId: null,
  assignedCrewId: null,
  customerDisplayLabel: 'Cliente ejemplo',
  municipality: null,
  ticketId: null,
  taskId: null,
  visitRequestId: null,
  isAnnulled: false,
  createdAt: new Date('2026-11-19T10:00:00.000Z'),
  updatedAt: new Date('2026-11-19T10:00:00.000Z'),
};

const actor: JwtPayload = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti',
  type: 'tenant',
};

function buildService(port?: { getSnapshot: jest.Mock }): ExecutionOrdersService {
  const args: unknown[] = [{} as DataSource, ...Array<undefined>(10), port];
  return new (ExecutionOrdersService as unknown as new (...a: unknown[]) => ExecutionOrdersService)(
    ...args,
  );
}

describe('ExecutionOrdersService.list — colas y búsqueda por número (v1.1)', () => {
  const port = { getSnapshot: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
    port.getSnapshot.mockResolvedValue({ timezone: 'America/Bogota' });
  });

  it('CA-12: sin cola ni búsqueda no hay conteos, ni lectura de zona, ni predicados nuevos', async () => {
    const { qb } = buildQb([order]);
    const result = await buildService(port).list({}, actor);

    expect(Object.keys(result).sort()).toEqual(['data', 'meta']);
    expect(qb.clone).not.toHaveBeenCalled();
    expect(port.getSnapshot).not.toHaveBeenCalled();
    const sqls = qb.andWhere.mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => /ILIKE|queue/u.test(sql))).toBe(false);
  });

  it('con cola devuelve los seis conteos del clon y aplica el predicado DESPUÉS de clonar', async () => {
    const { qb, counts } = buildQb([order], {
      ALL: 9,
      ACTIVE: '7',
      TO_SCHEDULE: 3,
      UNASSIGNED: 2,
      TODAY: 1,
      MINE: 0,
    });
    const result = await buildService(port).list({ queue: 'ACTIVE' }, actor);

    expect(result.queueCounts).toEqual({
      ALL: 9,
      ACTIVE: 7,
      TO_SCHEDULE: 3,
      UNASSIGNED: 2,
      TODAY: 1,
      MINE: 0,
    });
    expect(port.getSnapshot).toHaveBeenCalledWith({ tenantId: 'tenant-001' });
    expect(counts.orderBy).toHaveBeenCalledWith();
    expect(counts.addSelect).toHaveBeenCalledTimes(EXECUTION_ORDER_QUEUES.length - 1);
    // El clon se toma con el alcance y anuladas ya aplicados y sin la cola.
    const cloneOrder = qb.clone.mock.invocationCallOrder[0]!;
    const annulledCall = qb.andWhere.mock.calls.findIndex((c) => /is_annulled/u.test(String(c[0])));
    const queueCall = qb.andWhere.mock.calls.findIndex((c) => /queueTerminal/u.test(String(c[0])));
    expect(qb.andWhere.mock.invocationCallOrder[annulledCall]!).toBeLessThan(cloneOrder);
    expect(qb.andWhere.mock.invocationCallOrder[queueCall]!).toBeGreaterThan(cloneOrder);
  });

  it('la cola ALL pide conteos pero no restringe el listado', async () => {
    const { qb } = buildQb([order], {});
    const result = await buildService(port).list({ queue: 'ALL' }, actor);

    expect(result.queueCounts).toEqual({
      ALL: 0,
      ACTIVE: 0,
      TO_SCHEDULE: 0,
      UNASSIGNED: 0,
      TODAY: 0,
      MINE: 0,
    });
    expect(qb.andWhere.mock.calls.some((c) => /queue/u.test(String(c[0])))).toBe(false);
  });

  it('falla cerrado (503) si no hay zona del tenant; nunca usa la del servidor', async () => {
    buildQb([order], {});
    await expect(buildService(undefined).list({ queue: 'TODAY' }, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each(['Mars/Olympus', 'UTC; DROP', ''])(
    'SEC-Q1: zona del tenant no IANA (%p) responde 503, no 500',
    async (tz) => {
      buildQb([order], {});
      port.getSnapshot.mockResolvedValue({ timezone: tz });
      await expect(buildService(port).list({ queue: 'TODAY' }, actor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('busca solo por número, con comodines escapados', async () => {
    const { qb } = buildQb([order]);
    await buildService(port).list({ number: 'ote-2026_1' }, actor);

    const call = qb.andWhere.mock.calls.find((c) => /ILIKE/u.test(String(c[0])))!;
    expect(call[0]).toBe("order.execution_order_number ILIKE :numberPattern ESCAPE '\\'");
    expect(call[1]).toEqual({ numberPattern: '%ote-2026\\_1%' });
    expect(qb.clone).not.toHaveBeenCalled();
  });
});

describe('ListExecutionOrdersQuerySchema v1.1', () => {
  it.each(EXECUTION_ORDER_QUEUES)('acepta la cola %s', (queue) => {
    expect(ListExecutionOrdersQuerySchema.parse({ queue }).queue).toBe(queue);
  });

  it.each(['active', 'OVERDUE', ''])('rechaza la cola %p', (queue) => {
    expect(ListExecutionOrdersQuerySchema.safeParse({ queue }).success).toBe(false);
  });

  it.each(['a%b', 'a b', "x' OR 1=1", 'x'.repeat(41), '   '])('rechaza la búsqueda %p', (n) => {
    expect(ListExecutionOrdersQuerySchema.safeParse({ number: n }).success).toBe(false);
  });

  it('recorta espacios de la búsqueda y la acepta', () => {
    expect(ListExecutionOrdersQuerySchema.parse({ number: ' OTE-2026 ' }).number).toBe('OTE-2026');
  });
});

describe('buildExecutionOrderQueuePredicate', () => {
  const context = {
    actorSub: 'actor-sub',
    timezone: 'America/Bogota',
    now: new Date('2026-11-20T04:30:00.000Z'),
  };

  it('ACTIVE excluye exactamente los estados terminales', () => {
    const predicate = buildExecutionOrderQueuePredicate('ACTIVE', context);
    expect(predicate.sql).toBe('(order.status NOT IN (:...queueTerminalStatuses))');
    expect(predicate.params.queueTerminalStatuses).toEqual([...EXECUTION_ORDER_TERMINAL_STATUSES]);
  });

  it('TO_SCHEDULE y UNASSIGNED son activas más su condición', () => {
    expect(buildExecutionOrderQueuePredicate('TO_SCHEDULE', context).sql).toContain(
      'order.planned_window_start_at IS NULL',
    );
    const unassigned = buildExecutionOrderQueuePredicate('UNASSIGNED', context).sql;
    expect(unassigned).toContain('order.assigned_technician_id IS NULL');
    expect(unassigned).toContain('order.assigned_crew_id IS NULL');
    expect(unassigned).toContain('NOT IN (:...queueTerminalStatuses)');
  });

  it('MINE usa el sub del JWT y solo activas', () => {
    const predicate = buildExecutionOrderQueuePredicate('MINE', context);
    expect(predicate.params.queueActorSub).toBe('actor-sub');
    expect(predicate.sql).toContain('NOT IN (:...queueTerminalStatuses)');
  });

  it('TODAY recibe la zona del tenant y el instante, sin estado', () => {
    const predicate = buildExecutionOrderQueuePredicate('TODAY', context);
    expect(predicate.params).toEqual({
      queueNow: '2026-11-20T04:30:00.000Z',
      queueTimezone: 'America/Bogota',
    });
    expect(predicate.sql).not.toContain('status');
  });

  it('escapeLikePattern escapa barra, porcentaje y guion bajo', () => {
    expect(escapeLikePattern('a\\b%c_d')).toBe('a\\\\b\\%c\\_d');
  });
});
