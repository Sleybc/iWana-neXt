import { DataSource } from 'typeorm';
import { ExecutionOrderStatusTransition, runInTenantSchema } from '@iwana/db';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrderInventoryService } from '../services/execution-order-inventory.service';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

// requireActual conserva el resto de exports reales de @iwana/db: la cadena de
// imports del servicio consume entidades y enums que un mock parcial deja
// undefined y rompe la carga del spec.
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
  ExecutionOrderStatusTransition: class ExecutionOrderStatusTransition {},
}));

type SaveCall = { entity: unknown; payload: Record<string, unknown> };

interface FakeManager {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder?: jest.Mock;
  seatPayloads: () => Array<Record<string, unknown>>;
}

/** Manager fake: findOne devuelve la OT viva; save registra (orden + asientos). */
function makeManager(order: Record<string, unknown>, withQueryBuilder = false): FakeManager {
  const calls: SaveCall[] = [];
  const manager: FakeManager = {
    findOne: jest.fn().mockResolvedValue(order),
    create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => ({ ...payload })),
    save: jest
      .fn()
      .mockImplementation(async (entity: unknown, payload: Record<string, unknown>) => {
        calls.push({ entity, payload });
        return { id: 'generated-id', ...payload };
      }),
    seatPayloads: () =>
      calls
        .filter((call) => call.entity === ExecutionOrderStatusTransition)
        .map((call) => call.payload),
  };

  if (withQueryBuilder) {
    const chain: Record<string, jest.Mock> = {};
    chain.where = jest.fn().mockReturnValue(chain);
    chain.andWhere = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.execute = jest.fn().mockResolvedValue({ affected: 1 });
    chain.getMany = jest.fn().mockResolvedValue([]);
    manager.createQueryBuilder = jest.fn().mockReturnValue(chain);
  }

  return manager;
}

function buildOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-001',
    scheduleEventId: '22222222-2222-4222-8222-222222222222',
    status: ExecutionOrderStatus.ASSIGNED,
    result: null,
    version: 1,
    startedAt: null,
    closedAt: null,
    closeNotes: null,
    taskId: null,
    ticketId: null,
    assignedTechnicianId: '33333333-3333-4333-8333-333333333333',
    assignedCrewId: null,
    templateRequirementsSnapshot: [],
    updatedByUserId: null,
    ...overrides,
  };
}

describe('ExecutionOrdersService — línea de tiempo (MOD11 T1 B1)', () => {
  const actor: JwtPayload = {
    sub: '44444444-4444-4444-8444-444444444444',
    email: 'tecnico@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  let service: ExecutionOrdersService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  const managers: FakeManager[] = [];

  const runWithManager = (manager: FakeManager) => {
    managers.push(manager);
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );
  };

  const allSeatPayloads = () => managers.flatMap((manager) => manager.seatPayloads());

  beforeEach(() => {
    const inventoryService = {
      getItemCategoryReceipt: jest.fn(),
    } as unknown as jest.Mocked<ExecutionOrderInventoryService>;
    service = new ExecutionOrdersService({} as DataSource, inventoryService);
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    managers.length = 0;
    jest.clearAllMocks();
  });

  it('CA-01: start deja un asiento con origen, destino, instante, actor y motivo', async () => {
    const order = buildOrder();
    const manager = makeManager(order);
    runWithManager(manager);

    await service.start('11111111-1111-4111-8111-111111111111', { note: 'Inicio en sitio' }, actor);

    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      tenantId: 'tenant-001',
      executionOrderId: '11111111-1111-4111-8111-111111111111',
      fromStatus: ExecutionOrderStatus.ASSIGNED,
      toStatus: ExecutionOrderStatus.IN_PROGRESS,
      changedBy: actor.sub,
      reason: 'Inicio en sitio',
    });
    expect(seats[0]?.changedAt).toBeInstanceOf(Date);
  });

  it('CA-05: start conserva startedAt idempotente y comparte el instante con el asiento', async () => {
    const preset = new Date('2026-09-14T10:00:00.000Z');
    const order = buildOrder({ startedAt: preset });
    const manager = makeManager(order);
    runWithManager(manager);

    await service.start('11111111-1111-4111-8111-111111111111', {}, actor);

    // startedAt intacto: la misma instancia, no un "ahora" nuevo.
    expect(order.startedAt).toBe(preset);
    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    expect(seats[0]?.changedAt).toBe(preset);
  });

  it('CA-02: varios ciclos de bloqueo en la misma OT quedan todos registrados', async () => {
    const order = buildOrder();
    const flow: Array<{ run: () => Promise<unknown>; manager: FakeManager }> = [
      {
        manager: makeManager(order),
        run: () => service.start('11111111-1111-4111-8111-111111111111', {}, actor),
      },
      {
        manager: makeManager(order),
        run: () =>
          service.block(
            '11111111-1111-4111-8111-111111111111',
            { reasonCode: 'ESPERA_MATERIAL' },
            actor,
          ),
      },
      {
        manager: makeManager(order),
        run: () =>
          service.unblock(
            '11111111-1111-4111-8111-111111111111',
            { resolutionCode: 'MATERIAL_RECIBIDO' },
            actor,
          ),
      },
      {
        manager: makeManager(order),
        run: () =>
          service.block('11111111-1111-4111-8111-111111111111', { reasonCode: 'LLUVIA' }, actor),
      },
      {
        manager: makeManager(order),
        run: () =>
          service.unblock(
            '11111111-1111-4111-8111-111111111111',
            { resolutionCode: 'CLIMA_MEJORA' },
            actor,
          ),
      },
    ];

    for (const step of flow) {
      runWithManager(step.manager);
      await step.run();
    }

    const seats = allSeatPayloads();
    expect(seats.map((seat) => [seat.fromStatus, seat.toStatus])).toEqual([
      [ExecutionOrderStatus.ASSIGNED, ExecutionOrderStatus.IN_PROGRESS],
      [ExecutionOrderStatus.IN_PROGRESS, ExecutionOrderStatus.BLOCKED],
      [ExecutionOrderStatus.BLOCKED, ExecutionOrderStatus.IN_PROGRESS],
      [ExecutionOrderStatus.IN_PROGRESS, ExecutionOrderStatus.BLOCKED],
      [ExecutionOrderStatus.BLOCKED, ExecutionOrderStatus.IN_PROGRESS],
    ]);
    // Los dos bloqueos conservan su motivo estructurado.
    expect(seats.filter((seat) => seat.toStatus === ExecutionOrderStatus.BLOCKED)).toHaveLength(2);
    expect(seats[1]?.reason).toBe('ESPERA_MATERIAL');
    expect(seats[3]?.reason).toBe('LLUVIA');
  });

  it('el asiento se persiste con el mismo manager de la transición (misma transacción)', async () => {
    const order = buildOrder({ status: ExecutionOrderStatus.IN_PROGRESS });
    const manager = makeManager(order);
    runWithManager(manager);

    await service.block(
      '11111111-1111-4111-8111-111111111111',
      { reasonCode: 'ESPERA_MATERIAL' },
      actor,
    );

    const orderSaves = (manager.save as jest.Mock).mock.calls.filter(
      ([entity]) => entity !== ExecutionOrderStatusTransition,
    );
    expect(orderSaves.length).toBeGreaterThanOrEqual(1);
    expect(manager.seatPayloads()).toHaveLength(1);
  });

  it('CA-01/CA-05: close deja asiento y conserva startedAt/closedAt', async () => {
    const startedAt = new Date('2026-09-14T10:00:00.000Z');
    const order = buildOrder({ status: ExecutionOrderStatus.IN_PROGRESS, startedAt });
    const manager = makeManager(order, true);
    runWithManager(manager);

    await service.close(
      '11111111-1111-4111-8111-111111111111',
      { result: ExecutionOrderResult.EXECUTED, summary: 'Trabajo completado en sitio' },
      actor,
    );

    expect(order.startedAt).toBe(startedAt);
    expect(order.closedAt).toBeInstanceOf(Date);
    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      fromStatus: ExecutionOrderStatus.IN_PROGRESS,
      toStatus: ExecutionOrderStatus.COMPLETED,
      changedBy: actor.sub,
      reason: 'Trabajo completado en sitio',
    });
    // El asiento comparte el MISMO instante que closedAt.
    expect(seats[0]?.changedAt).toBe(order.closedAt);
  });

  it('CA-01: cancel deja asiento con el motivo en la misma transacción del manager', async () => {
    const order = buildOrder({ status: ExecutionOrderStatus.ASSIGNED, version: 3 });
    const manager = makeManager(order);

    const result = await service.cancelFromSchedulingWithManager(
      manager as never,
      'tenant-001',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'Visita cancelada por el cliente',
      actor,
    );

    expect(result).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      status: ExecutionOrderStatus.CANCELLED,
    });
    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      fromStatus: ExecutionOrderStatus.ASSIGNED,
      toStatus: ExecutionOrderStatus.CANCELLED,
      changedBy: actor.sub,
      reason: 'Visita cancelada por el cliente',
    });
  });

  it('D2/R5: ningún asiento persiste duraciones calculadas', async () => {
    const order = buildOrder();
    const startManager = makeManager(order);
    runWithManager(startManager);
    await service.start('11111111-1111-4111-8111-111111111111', {}, actor);

    const blockManager = makeManager(order);
    runWithManager(blockManager);
    await service.block(
      '11111111-1111-4111-8111-111111111111',
      { reasonCode: 'ESPERA_MATERIAL' },
      actor,
    );

    const seats = allSeatPayloads();
    expect(seats.length).toBeGreaterThan(0);
    for (const seat of seats) {
      for (const key of Object.keys(seat)) {
        expect(key).not.toMatch(/duration|effective|worked|hours/i);
      }
    }
  });

  it('el motivo ausente queda null (no se inventa historial)', async () => {
    const order = buildOrder({ status: ExecutionOrderStatus.IN_PROGRESS });
    const manager = makeManager(order);
    runWithManager(manager);

    await service.block('11111111-1111-4111-8111-111111111111', { reasonCode: '' }, actor);

    // reasonCode vacío + sin nota: motivo ausente, no inventado.
    expect(manager.seatPayloads()[0]?.reason).toBeNull();
  });
});
