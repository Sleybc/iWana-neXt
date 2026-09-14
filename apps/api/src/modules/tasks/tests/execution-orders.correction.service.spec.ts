import { DataSource } from 'typeorm';
import { ExecutionOrderStatusTransition, runInTenantSchema } from '@iwana/db';
import { ExecutionOrderStatus, UserRole } from '@iwana/shared';
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
  seatPayloads: () => Array<Record<string, unknown>>;
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ORIGINAL_SEAT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORDER_ID = '33333333-3333-4333-8333-333333333333';

function buildOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    tenantId: 'tenant-001',
    scheduleEventId: '44444444-4444-4444-8444-444444444444',
    status: ExecutionOrderStatus.IN_PROGRESS,
    result: null,
    version: 2,
    startedAt: new Date('2026-09-14T10:00:00.000Z'),
    closedAt: null,
    closeNotes: null,
    taskId: null,
    ticketId: null,
    assignedTechnicianId: '55555555-5555-4555-8555-555555555555',
    assignedCrewId: null,
    templateRequirementsSnapshot: [],
    updatedByUserId: null,
    ...overrides,
  };
}

function buildOriginalSeat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORIGINAL_SEAT_ID,
    tenantId: 'tenant-001',
    executionOrderId: ORDER_ID,
    fromStatus: ExecutionOrderStatus.ASSIGNED,
    toStatus: ExecutionOrderStatus.IN_PROGRESS,
    changedAt: new Date('2026-09-14T10:00:00.000Z'),
    changedBy: '55555555-5555-4555-8555-555555555555',
    reason: 'Inicio en sitio',
    correctionOfId: null,
    createdAt: new Date('2026-09-14T10:00:01.000Z'),
    ...overrides,
  };
}

/**
 * Manager fake: `findOne` resuelve la OT y el asiento corregible por entidad;
 * `save` registra sin mutar los originales (la corrección es aditiva).
 */
function makeManager(
  order: Record<string, unknown> | null,
  seats: Array<Record<string, unknown>>,
): FakeManager {
  const calls: SaveCall[] = [];
  const manager: FakeManager = {
    findOne: jest
      .fn()
      .mockImplementation(async (entity: unknown, opts?: { where?: Record<string, unknown> }) => {
        if (entity !== ExecutionOrderStatusTransition) return order;
        // Honorario del alcance: el servicio filtra por id + OT + tenant; el
        // fake solo devuelve el asiento cuando el where coincide (sin fuga).
        const where = opts?.where ?? {};
        return (
          seats.find(
            (seat) =>
              seat.id === where.id &&
              seat.executionOrderId === where.executionOrderId &&
              seat.tenantId === where.tenantId,
          ) ?? null
        );
      }),
    create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => ({ ...payload })),
    save: jest
      .fn()
      .mockImplementation(async (entity: unknown, payload: Record<string, unknown>) => {
        calls.push({ entity, payload });
        return { id: '66666666-6666-4666-8666-666666666666', ...payload };
      }),
    seatPayloads: () =>
      calls
        .filter((call) => call.entity === ExecutionOrderStatusTransition)
        .map((call) => call.payload),
  };
  return manager;
}

describe('ExecutionOrdersService — corrección aditiva (MOD11 T1 B2, CA-04)', () => {
  const actor: JwtPayload = {
    sub: '77777777-7777-4777-8777-777777777777',
    email: 'supervisor@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-002',
    type: 'tenant',
  };

  let service: ExecutionOrdersService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const runWithManager = (manager: FakeManager) => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );
  };

  beforeEach(() => {
    const inventoryService = {
      getItemCategoryReceipt: jest.fn(),
    } as unknown as jest.Mocked<ExecutionOrderInventoryService>;
    service = new ExecutionOrdersService({} as DataSource, inventoryService);
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  it('CA-04: la corrección crea un asiento NUEVO con correctionOfId al corregido + actor + motivo', async () => {
    const order = buildOrder();
    const original = buildOriginalSeat();
    const manager = makeManager(order, [original]);
    runWithManager(manager);

    const saved = await service.correctStatusTransition(
      ORDER_ID,
      ORIGINAL_SEAT_ID,
      { reason: 'Inicio pulsado por error, se corrige el motivo' },
      actor,
    );

    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      tenantId: 'tenant-001',
      executionOrderId: ORDER_ID,
      fromStatus: ExecutionOrderStatus.IN_PROGRESS,
      toStatus: ExecutionOrderStatus.IN_PROGRESS,
      changedBy: actor.sub,
      reason: 'Inicio pulsado por error, se corrige el motivo',
      correctionOfId: ORIGINAL_SEAT_ID,
    });
    expect(seats[0]?.changedAt).toBeInstanceOf(Date);
    expect(saved.correctionOfId).toBe(ORIGINAL_SEAT_ID);
  });

  it('CA-04: el original permanece visible (sin editar ni borrar)', async () => {
    const order = buildOrder();
    const original = buildOriginalSeat();
    const manager = makeManager(order, [original]);
    runWithManager(manager);

    await service.correctStatusTransition(
      ORDER_ID,
      ORIGINAL_SEAT_ID,
      { reason: 'Se corrige el motivo del inicio' },
      actor,
    );

    // El original no se muta: ningún update/delete sobre el asiento previo.
    expect(original.correctionOfId).toBeNull();
    expect(original.reason).toBe('Inicio en sitio');
    const saves = (manager.save as jest.Mock).mock.calls;
    expect(saves).toHaveLength(1);
    expect(saves[0]?.[0]).toBe(ExecutionOrderStatusTransition);
  });

  it('CA-05: la corrección no muta la OT (estado, versión, startedAt/closedAt)', async () => {
    const startedAt = new Date('2026-09-14T10:00:00.000Z');
    const order = buildOrder({ startedAt, version: 2 });
    const manager = makeManager(order, [buildOriginalSeat()]);
    runWithManager(manager);

    await service.correctStatusTransition(
      ORDER_ID,
      ORIGINAL_SEAT_ID,
      { reason: 'Corrección sin efecto en la OT' },
      actor,
    );

    expect(order.status).toBe(ExecutionOrderStatus.IN_PROGRESS);
    expect(order.version).toBe(2);
    expect(order.startedAt).toBe(startedAt);
    expect(order.closedAt).toBeNull();
    const orderSaves = (manager.save as jest.Mock).mock.calls.filter(
      ([entity]) => entity !== ExecutionOrderStatusTransition,
    );
    expect(orderSaves).toHaveLength(0);
  });

  it('la referencia vive en correctionOfId, no en reason (dictamen B3 §2)', async () => {
    const manager = makeManager(buildOrder(), [buildOriginalSeat()]);
    runWithManager(manager);

    await service.correctStatusTransition(
      ORDER_ID,
      ORIGINAL_SEAT_ID,
      { reason: 'Motivo operativo de la enmienda' },
      actor,
    );

    const seat = manager.seatPayloads()[0];
    expect(seat?.correctionOfId).toBe(ORIGINAL_SEAT_ID);
    expect(seat?.reason).toBe('Motivo operativo de la enmienda');
    expect(seat?.reason).not.toContain(ORIGINAL_SEAT_ID);
  });

  it('edge: motivo ausente o vacío se rechaza sin persistir', async () => {
    const manager = makeManager(buildOrder(), [buildOriginalSeat()]);
    // Sin runWithManager: la validación falla antes de abrir el schema de
    // tenant, así que ningún mock de transacción debe encolarse ni consumirse.

    await expect(
      service.correctStatusTransition(ORDER_ID, ORIGINAL_SEAT_ID, { reason: '   ' }, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect(manager.seatPayloads()).toHaveLength(0);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('edge: identificador de asiento inválido se rechaza sin leer persistencia', async () => {
    const manager = makeManager(buildOrder(), [buildOriginalSeat()]);
    // Sin runWithManager: misma razón que el caso anterior.

    await expect(
      service.correctStatusTransition(ORDER_ID, 'no-es-uuid', { reason: 'Motivo' }, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.seatPayloads()).toHaveLength(0);
  });

  it('error: asiento inexistente se rechaza sin persistir', async () => {
    const manager = makeManager(buildOrder(), []);
    runWithManager(manager);

    await expect(
      service.correctStatusTransition(ORDER_ID, ORIGINAL_SEAT_ID, { reason: 'Motivo' }, actor),
    ).rejects.toMatchObject({ status: 404 });
    expect(manager.seatPayloads()).toHaveLength(0);
  });

  it('error: asiento de otra OT no se corrige (sin fuga cross-OT)', async () => {
    const order = buildOrder();
    // El asiento existe pero pertenece a otra OT: el where por
    // executionOrderId no lo trae y la corrección se rechaza.
    const foreignSeat = buildOriginalSeat({ executionOrderId: OTHER_ORDER_ID });
    const manager = makeManager(order, [foreignSeat]);
    runWithManager(manager);

    await expect(
      service.correctStatusTransition(
        ORDER_ID,
        foreignSeat.id as string,
        { reason: 'Motivo' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(manager.seatPayloads()).toHaveLength(0);
  });

  it('D2/R5: el asiento de corrección no persiste duraciones calculadas', async () => {
    const manager = makeManager(buildOrder(), [buildOriginalSeat()]);
    runWithManager(manager);

    await service.correctStatusTransition(
      ORDER_ID,
      ORIGINAL_SEAT_ID,
      { reason: 'Motivo de la enmienda' },
      actor,
    );

    const seats = manager.seatPayloads();
    expect(seats).toHaveLength(1);
    for (const seat of seats) {
      for (const key of Object.keys(seat)) {
        expect(key).not.toMatch(/duration|effective|worked|hours/i);
      }
    }
  });
});
