import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderInventoryService } from '../services/execution-order-inventory.service';
import {
  ExecutionOrdersService,
  type CreateExecutionOrderFromSchedulingInput,
} from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

/**
 * MOD11 E1 — guarda de unicidad por eje de origen en la OT (CA-02).
 *
 * Réplica a nivel de servicio lo que `createVisitRequest` hace: advisory lock
 * sobre la tupla de origen, `origin_ref` normalizado con trim, `origin_ref`
 * nulo fuera de deduplicación y violación 23505 capturada por nombre de
 * constraint. La prueba concurrente real (CA-03) vive en
 * `execution-orders.origin-identity.postgres.integration.spec.ts`: un test
 * secuencial pasaría aunque el advisory lock no existiera.
 */
describe('ExecutionOrdersService — identidad por origen (E1)', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  const buildInput = (
    overrides: Partial<CreateExecutionOrderFromSchedulingInput> = {},
  ): CreateExecutionOrderFromSchedulingInput => ({
    scheduleEventId: '22222222-2222-4222-8222-222222222222',
    assignedTechnicianId: '33333333-3333-4333-8333-333333333333',
    originContext: 'ASSURANCE',
    originRefId: 'TCK-1',
    customerDisplayLabel: 'Cliente de prueba',
    workType: WfmWorkType.SUPPORT,
    workSummary: 'Soporte por ticket',
    plannedWindowStartAt: '2026-06-24T14:00:00.000Z',
    plannedWindowEndAt: '2026-06-24T16:00:00.000Z',
    ...overrides,
  });

  // Manager con QueryBuilder encadenable; `originDuplicate` resuelve el primer
  // `getOne` (guarda de origen) y los siguientes resuelven null (consecutivo).
  const buildManager = (options: {
    originDuplicate?: unknown;
    saveError?: unknown;
    eventLog?: Array<string>;
  }) => {
    const { originDuplicate = null, saveError, eventLog } = options;
    let qbCalls = 0;
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        eventLog?.push(`lock:${JSON.stringify(params?.[0] ?? null)}:${sql.slice(0, 40)}`);
        return [];
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        qbCalls += 1;
        const isOriginCheck = qbCalls === 1;
        eventLog?.push(isOriginCheck ? 'check:origin' : 'check:number');
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockImplementation(function (
            this: unknown,
            _sql: string,
            params?: unknown,
          ) {
            eventLog?.push(`where:${JSON.stringify(params ?? null)}`);
            return this;
          }),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(isOriginCheck ? originDuplicate : null),
        };
      }),
      create: jest.fn((_entity: unknown, payload: unknown) => payload),
      save: jest.fn().mockImplementation(async (_entity: unknown, payload: unknown) => {
        if (saveError) throw saveError;
        return { id: 'eo-nueva', version: 1, ...(payload as Record<string, unknown>) };
      }),
    };
    return manager;
  };

  const buildService = () =>
    new ExecutionOrdersService({} as DataSource, {} as unknown as ExecutionOrderInventoryService);

  const conflictBody = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      return (error as ConflictException).getResponse() as Record<string, unknown>;
    }
    throw new Error('Se esperaba ConflictException y la promesa se resolvió.');
  };

  it('CA-02: duplicada activa por mismo origen (distinto evento) se rechaza con 409 y referencia', async () => {
    const manager = buildManager({
      originDuplicate: {
        id: 'eo-activa',
        executionOrderNumber: 'OTE-20240101-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
      },
    });
    const service = buildService();

    const body = await conflictBody(
      service.createFromSchedulingWithManager(
        manager as never,
        'tenant-001',
        buildInput({ scheduleEventId: '99999999-9999-4999-8999-999999999999' }),
        actor,
      ),
    );

    expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
    expect(body['originRef']).toBe('TCK-1');
    expect(body['activeExecutionOrderId']).toBe('eo-activa');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('CA-02: el nacimiento por agenda sigue idempotente por scheduleEventId', async () => {
    const existing = { id: 'eo-agenda', executionOrderNumber: 'OTE-20240101-002' };
    const manager = buildManager({});
    manager.findOne.mockResolvedValue(existing);
    const service = buildService();

    const result = (await service.createFromSchedulingWithManager(
      manager as never,
      'tenant-001',
      buildInput(),
      actor,
    )) as unknown as Record<string, unknown>;

    expect(result['id']).toBe('eo-agenda');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('CA-02: origin_ref nulo no toma lock de origen y crea sin deduplicar', async () => {
    const manager = buildManager({});
    const service = buildService();

    await service.createFromSchedulingWithManager(
      manager as never,
      'tenant-001',
      buildInput({ originRefId: null }),
      actor,
    );

    const originLocks = manager.query.mock.calls.filter((call) =>
      String(call[1]?.[0] ?? '').startsWith('execution-order-origin:'),
    );
    expect(originLocks).toHaveLength(0);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('CA-02: origin_ref vacío tras trim se trata como nulo (no amplía la excepción, la respeta)', async () => {
    const manager = buildManager({});
    const service = buildService();

    const result = (await service.createFromSchedulingWithManager(
      manager as never,
      'tenant-001',
      buildInput({ originRefId: '   ' }),
      actor,
    )) as unknown as Record<string, unknown>;

    expect(result['originRefId']).toBeNull();
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('CA-02: origin_ref se normaliza con trim antes de comparar y de persistir', async () => {
    const manager = buildManager({});
    const service = buildService();

    const result = (await service.createFromSchedulingWithManager(
      manager as never,
      'tenant-001',
      buildInput({ originRefId: '  TCK-9  ' }),
      actor,
    )) as unknown as Record<string, unknown>;

    expect(result['originRefId']).toBe('TCK-9');
    const originWhere = manager.createQueryBuilder.mock.results[0]?.value.andWhere.mock.calls.find(
      (call: unknown[]) => String(call[0]).includes('TRIM(eo.origin_ref_id)'),
    );
    expect(originWhere?.[1]).toMatchObject({ originRef: 'TCK-9' });
  });

  it('CA-02: la violación 23505 por nombre de constraint se traduce a 409, no a conflicto de número', async () => {
    const saveError = {
      code: '23505',
      constraint: 'uq_execution_orders_active_origin_unique',
      driverError: {
        code: '23505',
        constraint: 'uq_execution_orders_active_origin_unique',
      },
    };
    const manager = buildManager({ saveError });
    const service = buildService();

    const body = await conflictBody(
      service.createFromSchedulingWithManager(manager as never, 'tenant-001', buildInput(), actor),
    );

    expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
  });

  it('CA-02: el 23505 de origen que escape al wrapper no entra al reintento de consecutivo', async () => {
    const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<
      typeof runInTenantSchema
    >;
    mockRunInTenantSchema.mockRejectedValue({
      code: '23505',
      driverError: {
        code: '23505',
        constraint: 'uq_execution_orders_active_origin_unique',
      },
    });
    const service = buildService();

    const body = await conflictBody(service.createFromScheduling(buildInput(), actor));

    expect(body['error']).toBe('DUPLICATE_ACTIVE_WORK');
    expect(body['code']).not.toBe('EXECUTION_ORDER_NUMBER_CONFLICT');
  });

  it('CA-03 (intención): bajo Promise.all cada creación toma el lock de origen antes de su chequeo', async () => {
    const eventLog: Array<string> = [];
    const managerFor = () => buildManager({ eventLog });
    const service = buildService();
    const managerA = managerFor();
    const managerB = managerFor();

    await Promise.all([
      service.createFromSchedulingWithManager(
        managerA as never,
        'tenant-001',
        buildInput({ scheduleEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
        actor,
      ),
      service.createFromSchedulingWithManager(
        managerB as never,
        'tenant-001',
        buildInput({ scheduleEventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        actor,
      ),
    ]);

    // Cada llamada adquiere el lock sobre la MISMA tupla (mismo origen) y su
    // chequeo ocurre después de su lock. La serialización real entre
    // transacciones solo la prueba Postgres (spec de integración CA-03).
    const originLockKey = 'execution-order-origin:tenant-001|ASSURANCE|TCK-1|SUPPORT';
    const locks = eventLog.filter((entry) => entry.includes(originLockKey));
    expect(locks).toHaveLength(2);
    const firstCheck = eventLog.indexOf('check:origin');
    const firstLock = eventLog.findIndex((entry) => entry.includes(originLockKey));
    expect(firstLock).toBeLessThan(firstCheck);
    expect(managerA.save).toHaveBeenCalledTimes(1);
    expect(managerB.save).toHaveBeenCalledTimes(1);
  });
});
