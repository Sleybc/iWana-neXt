import { DataSource } from 'typeorm';
import { ExecutionOrder, ExecutionOrderActivity, runInTenantSchema } from '@iwana/db';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  UserRole,
} from '@iwana/shared';
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
}));

/**
 * MOD11 T0 (CA-03) — el UPDATE escribe lo que cada comando declara.
 *
 * Estos tests SÍ pueden usar mocks porque no validan comportamiento contra
 * base: inspeccionan el payload declarado en `.set()` del camino
 * `createQueryBuilder` (el que fallaba en producción). El falso verde que
 * ocultó el defecto era validar el objeto devuelto vía `manager.save()`; aquí
 * se captura lo que el UPDATE escribiría de verdad.
 *
 * Núcleo que todo comando escribe: estado, resultado, versión, instantes de
 * inicio/cierre, notas y actor. Solo `assign()` declara además la asignación.
 */

const BASE_PERSISTED_KEYS = new Set([
  'status',
  'result',
  'version',
  'startedAt',
  'closedAt',
  'closeNotes',
  'updatedByUserId',
]);

const OLD_TECH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_TECH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface CapturedQueryBuilder {
  chain: Record<string, jest.Mock>;
  sets: Array<Record<string, unknown>>;
  wheres: Array<{ text: string; params: Record<string, unknown> }>;
}

function buildChain(captured: {
  sets: Array<Record<string, unknown>>;
  wheres: Array<{ text: string; params: Record<string, unknown> }>;
  affected: number;
}): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn((payload: Record<string, unknown>) => {
      captured.sets.push(payload);
      return chain;
    }),
    execute: jest.fn().mockImplementation(async () => ({ affected: captured.affected })),
  };
  // `where` captura el predicado de concurrencia optimista (WHERE version).
  const originalWhere = chain['where'] as jest.Mock;
  originalWhere.mockImplementation((text: string, params: Record<string, unknown>) => {
    captured.wheres.push({ text, params });
    return chain;
  });
  return chain;
}

function buildOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'eo-001',
    tenantId: 'tenant-001',
    scheduleEventId: '44444444-4444-4444-8444-444444444444',
    status: ExecutionOrderStatus.IN_PROGRESS,
    result: null,
    version: 3,
    startedAt: null,
    closedAt: null,
    closeNotes: null,
    taskId: null,
    ticketId: null,
    assignedTechnicianId: OLD_TECH,
    assignedCrewId: null,
    templateRequirementsSnapshot: [],
    updatedByUserId: null,
    ...overrides,
  };
}

describe('ExecutionOrdersService T0 — persistencia explícita por comando (CA-03)', () => {
  const supervisor: JwtPayload = {
    sub: 'supervisor-t0',
    email: 'supervisor@example.test',
    role: UserRole.NOC,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-t0-sup',
    type: 'tenant',
  };
  const technician: JwtPayload = {
    sub: OLD_TECH,
    email: 'tecnico@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-t0-tech',
    type: 'tenant',
  };

  let service: ExecutionOrdersService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const runWithOrder = (
    order: Record<string, unknown>,
    extra: { affected?: number } = {},
  ): CapturedQueryBuilder => {
    const captured = {
      sets: [] as Array<Record<string, unknown>>,
      wheres: [] as Array<{ text: string; params: Record<string, unknown> }>,
      affected: extra.affected ?? 1,
    };
    const chain = buildChain(captured);
    const activity = {
      id: 'act-001',
      executionOrderId: 'eo-001',
      tenantId: 'tenant-001',
      activityType: 'INSTALLATION',
      description: 'Trabajo de prueba',
    };
    const manager = {
      findOne: jest.fn().mockImplementation(async (entity: unknown) => {
        if (entity === ExecutionOrderActivity) return { ...activity };
        if (entity === ExecutionOrder) return order;
        return null;
      }),
      save: jest
        .fn()
        .mockImplementation(async (_entity: unknown, payload: Record<string, unknown>) => ({
          ...payload,
        })),
      create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => ({ ...payload })),
      remove: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue(chain),
    };
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) =>
      fn({ manager } as never),
    );
    return { chain, sets: captured.sets, wheres: captured.wheres };
  };

  beforeEach(() => {
    const inventoryService = {
      getItemCategoryReceipt: jest.fn(),
    } as unknown as jest.Mocked<ExecutionOrderInventoryService>;
    service = new ExecutionOrdersService({} as DataSource, inventoryService);
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  it('assign() declara la asignación: el SET incluye técnico y cuadrilla', async () => {
    const order = buildOrder({ status: ExecutionOrderStatus.ASSIGNED, version: 2 });
    const { sets, wheres } = runWithOrder(order);

    await service.assign(
      'eo-001',
      { assigneeType: 'TECHNICIAN', assigneeId: NEW_TECH },
      supervisor,
    );

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      assignedTechnicianId: NEW_TECH,
      assignedCrewId: null,
      status: ExecutionOrderStatus.ASSIGNED,
      version: 3,
      updatedByUserId: supervisor.sub,
    });
    // Concurrencia optimista intacta: WHERE por versión con el valor previo.
    expect(wheres[0]?.text).toContain('version = :expectedVersion');
    expect(wheres[0]?.params).toMatchObject({ expectedVersion: 2 });
  });

  it.each([
    ['start', () => service.start('eo-001', {}, technician)],
    ['block', () => service.block('eo-001', { reasonCode: 'SIN_ACCESO' }, technician)],
    ['unblock', () => service.unblock('eo-001', { resolutionCode: 'ACCESO_OK' }, technician)],
    [
      'registerFieldWork',
      () =>
        service.registerFieldWork(
          'eo-001',
          { activityType: 'INSTALLATION', description: 'Avance de prueba' },
          technician,
        ),
    ],
    [
      'updateFieldWorkActivity',
      () =>
        service.updateFieldWorkActivity(
          'eo-001',
          'act-001',
          { description: 'Descripción corregida' },
          technician,
        ),
    ],
    [
      'deleteFieldWorkActivity',
      () => service.deleteFieldWorkActivity('eo-001', 'act-001', technician),
    ],
    [
      'registerItemUsage',
      () =>
        service.registerItemUsage(
          'eo-001',
          {
            itemId: 'item-t0-001',
            technicianCustodyId: OLD_TECH,
            quantity: 1,
            action: ExecutionOrderItemAction.INSTALL,
            finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
          },
          technician,
        ),
    ],
    [
      'close',
      () =>
        service.close(
          'eo-001',
          { result: ExecutionOrderResult.NOT_EXECUTED, summary: 'Cierre de prueba' },
          technician,
        ),
    ],
  ])('%s no persiste asignación aunque la OT la tenga en memoria (CA-03)', async (_name, run) => {
    // La OT lleva técnico en memoria: si el UPDATE lo escribiera sin
    // declararlo, aquí se vería la fuga (protección R1 del plan).
    const order = buildOrder({ assignedTechnicianId: OLD_TECH });
    const { sets } = runWithOrder(order);

    await run();

    expect(sets).toHaveLength(1);
    expect(sets[0]).not.toHaveProperty('assignedTechnicianId');
    expect(sets[0]).not.toHaveProperty('assignedCrewId');
    for (const key of Object.keys(sets[0]!)) {
      expect(BASE_PERSISTED_KEYS.has(key)).toBe(true);
    }
  });

  it('concurrencia intacta: UPDATE sin fila afectada → VERSION_CONFLICT en assign() y start()', async () => {
    const assignOrder = buildOrder({ status: ExecutionOrderStatus.ASSIGNED, version: 2 });
    runWithOrder(assignOrder, { affected: 0 });
    await expect(
      service.assign('eo-001', { assigneeType: 'TECHNICIAN', assigneeId: NEW_TECH }, supervisor),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VERSION_CONFLICT' }) });

    const startOrder = buildOrder({ status: ExecutionOrderStatus.ASSIGNED, version: 5 });
    runWithOrder(startOrder, { affected: 0 });
    await expect(service.start('eo-001', {}, technician)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VERSION_CONFLICT' }),
    });
  });
});
