import { DataSource } from 'typeorm';
import {
  InventoryTrackingMode,
  StockBalanceCondition,
  StockCountStatus,
  StockMovementOrigin,
  UserRole,
} from '@iwana/shared';
import { CycleCountService } from '../services/cycle-count.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockBalance: class StockBalance {},
  StockCount: class StockCount {},
  StockCountLine: class StockCountLine {},
  StockLocation: class StockLocation {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

import {
  InventoryItem,
  StockBalance,
  StockCount,
  StockCountLine,
  StockLocation,
  runInTenantSchema,
} from '@iwana/db';

const actor: JwtPayload = {
  sub: 'admin-001',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti-1',
  type: 'tenant',
};

describe('CycleCountService', () => {
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  const stockLedgerService = {
    recordMovementWithManager: jest.fn(),
  };
  const domainEventPublisher = {
    captureItemSnapshots: jest.fn().mockResolvedValue(new Map()),
    publishAfterCommittedMovement: jest.fn(),
  };

  let service: CycleCountService;

  beforeEach(() => {
    jest.clearAllMocks();
    stockLedgerService.recordMovementWithManager.mockResolvedValue({
      movement: { id: 'mov-1', movementNumber: 'MOV-000001' },
      lines: [],
      created: true,
    });
    domainEventPublisher.captureItemSnapshots.mockResolvedValue(new Map());
    service = new CycleCountService(
      {} as DataSource,
      stockLedgerService as never,
      domainEventPublisher as never,
    );
  });

  function buildCreateManager(options?: {
    categoryFilter?: string;
    balances?: Array<{
      id: string;
      itemId: string;
      quantityOnHand: string;
      lotId?: string | null;
      condition?: StockBalanceCondition;
    }>;
  }) {
    const balances = options?.balances ?? [
      {
        id: 'bal-1',
        itemId: 'item-consumable',
        quantityOnHand: '10.00',
        lotId: null,
        condition: StockBalanceCondition.NEW,
      },
      {
        id: 'bal-2',
        itemId: 'item-serialized',
        quantityOnHand: '2.00',
        lotId: null,
        condition: StockBalanceCondition.NEW,
      },
      {
        id: 'bal-3',
        itemId: 'item-other-cat',
        quantityOnHand: '5.00',
        lotId: null,
        condition: StockBalanceCondition.NEW,
      },
    ];

    const items = [
      {
        id: 'item-consumable',
        sku: 'CAB-01',
        name: 'Cable',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        id: 'item-serialized',
        sku: 'ONT-01',
        name: 'ONT',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        id: 'item-other-cat',
        sku: 'CON-01',
        name: 'Conector',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        categoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    ];

    const savedLines: Array<Record<string, unknown>> = [];

    const manager: any = {
      transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) => work(manager)),
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === StockLocation) {
          return { id: 'loc-1', tenantId: 'tenant-001', name: 'Bodega' };
        }
        return null;
      }),
      find: jest.fn(async (entity: unknown, opts?: { where?: Record<string, unknown> }) => {
        if (entity === StockBalance) {
          return balances.map((row) => ({
            ...row,
            tenantId: 'tenant-001',
            locationId: 'loc-1',
            quantityReserved: '0.00',
          }));
        }
        if (entity === InventoryItem) {
          const where = opts?.where ?? {};
          return items.filter((item) => {
            if (where.trackingMode && item.trackingMode !== where.trackingMode) {
              return false;
            }
            if (where.categoryId && item.categoryId !== where.categoryId) {
              return false;
            }
            return true;
          });
        }
        if (entity === StockCountLine) {
          return savedLines;
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => payload),
      save: jest.fn(async (entity: unknown, payload: unknown) => {
        if (entity === StockCount) {
          return { id: 'count-001', ...(payload as object) };
        }
        if (entity === StockCountLine) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const withIds = rows.map((row, index) => ({
            id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index + 1}`,
            ...(row as object),
          }));
          savedLines.push(...withIds);
          return Array.isArray(payload) ? withIds : withIds[0];
        }
        return payload;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxValue: null }),
      })),
    };

    runInTenantSchemaMock.mockImplementation(async (_ds, _schema, work) =>
      work({ manager } as never),
    );

    return { manager, savedLines, items };
  }

  const locationId = '11111111-1111-4111-8111-111111111111';
  const categoryA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('congela solo consumibles con expectedQty = onHand', async () => {
    buildCreateManager();

    const result = await service.create({ locationId }, actor);

    expect(result.status).toBe(StockCountStatus.COUNTING);
    expect(result.countNumber).toBe('CNT-000001');
    expect(result.lines).toHaveLength(2);
    expect(result.lines.every((line) => line.itemId !== 'item-serialized')).toBe(true);
    expect(result.lines.find((line) => line.itemId === 'item-consumable')?.expectedQty).toBe(
      '10.00',
    );
  });

  it('filtra por categoría al crear', async () => {
    buildCreateManager();

    const result = await service.create({ locationId, categoryId: categoryA }, actor);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.itemId).toBe('item-consumable');
  });

  it('captura countedQty y calcula variance', async () => {
    const { manager } = buildCreateManager();
    const created = await service.create({ locationId, categoryId: categoryA }, actor);

    const line = {
      id: created.lines[0]!.id,
      tenantId: 'tenant-001',
      countId: created.id,
      itemId: 'item-consumable',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      expectedQty: '10.00',
      countedQty: null,
    };

    manager.findOne.mockImplementation(async (entity: unknown) => {
      if (entity === StockCount) {
        return { ...created, lines: undefined };
      }
      if (entity === StockCountLine) {
        return line;
      }
      return null;
    });
    manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === StockCountLine) {
        return [{ ...line, countedQty: '8.00' }];
      }
      if (entity === InventoryItem) {
        return [
          {
            id: 'item-consumable',
            sku: 'CAB-01',
            name: 'Cable',
            trackingMode: InventoryTrackingMode.CONSUMABLE,
          },
        ];
      }
      return [];
    });
    manager.save.mockImplementation(async (entity: unknown, payload: unknown) => {
      if (entity === StockCountLine) {
        Object.assign(line, payload as object);
        return line;
      }
      return payload;
    });

    const updated = await service.update(
      created.id,
      { lines: [{ id: line.id, countedQty: 8 }] },
      actor,
    );

    expect(updated.lines[0]?.countedQty).toBe('8.00');
    expect(updated.lines[0]?.variance).toBe('-2.00');
  });

  it('al cerrar aplica delta = contado − onHand vivo', async () => {
    const { manager } = buildCreateManager();
    const count = {
      id: 'count-001',
      tenantId: 'tenant-001',
      countNumber: 'CNT-000001',
      status: StockCountStatus.COUNTING,
      locationId: 'loc-1',
      categoryId: 'cat-a',
      notes: null,
      createdByUserId: actor.sub,
      closedByUserId: null,
      closedAt: null,
      stockMovementId: null,
    };
    const line = {
      id: 'line-1',
      tenantId: 'tenant-001',
      countId: 'count-001',
      itemId: 'item-consumable',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      expectedQty: '10.00',
      countedQty: '7.00',
    };

    manager.findOne.mockImplementation(async (entity: unknown) => {
      if (entity === StockCount) {
        return { ...count };
      }
      return null;
    });
    manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === StockCountLine) {
        return [line];
      }
      if (entity === StockBalance) {
        return [
          {
            itemId: 'item-consumable',
            locationId: 'loc-1',
            lotId: null,
            condition: StockBalanceCondition.NEW,
            quantityOnHand: '9.00',
          },
        ];
      }
      return [];
    });
    manager.save.mockImplementation(async (_entity: unknown, payload: unknown) => payload);

    const closed = await service.close('count-001', actor);

    expect(closed.status).toBe(StockCountStatus.CLOSED);
    expect(stockLedgerService.recordMovementWithManager).toHaveBeenCalledWith(
      manager,
      'tenant-001',
      expect.objectContaining({
        origin: StockMovementOrigin.ADJUSTMENT,
        originContext: 'inventory.cycle-count',
        originRefId: 'count-001',
        idempotencyKey: 'cycle-count:count-001',
        lines: [expect.objectContaining({ quantity: -2 })],
      }),
      actor,
    );
  });

  it('cierre sin variación no emite movimiento y es idempotente', async () => {
    const { manager } = buildCreateManager();
    const count = {
      id: 'count-001',
      status: StockCountStatus.COUNTING,
      locationId: 'loc-1',
      countNumber: 'CNT-000001',
      stockMovementId: null,
      closedByUserId: null,
      closedAt: null,
    };
    const line = {
      id: 'line-1',
      itemId: 'item-consumable',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      expectedQty: '10.00',
      countedQty: '10.00',
    };

    manager.findOne.mockImplementation(async (entity: unknown) => {
      if (entity === StockCount) {
        return { ...count };
      }
      return null;
    });
    manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === StockCountLine) {
        return [line];
      }
      if (entity === StockBalance) {
        return [
          {
            itemId: 'item-consumable',
            locationId: 'loc-1',
            lotId: null,
            condition: StockBalanceCondition.NEW,
            quantityOnHand: '10.00',
          },
        ];
      }
      return [];
    });
    manager.save.mockImplementation(async (_entity: unknown, payload: unknown) => {
      Object.assign(count, payload as object);
      return count;
    });

    const closed = await service.close('count-001', actor);
    expect(closed.stockMovementId).toBeNull();
    expect(stockLedgerService.recordMovementWithManager).not.toHaveBeenCalled();

    count.status = StockCountStatus.CLOSED;
    const again = await service.close('count-001', actor);
    expect(again.status).toBe(StockCountStatus.CLOSED);
    expect(stockLedgerService.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('líneas sin countedQty no ajustan', async () => {
    const { manager } = buildCreateManager();
    const count = {
      id: 'count-001',
      status: StockCountStatus.COUNTING,
      locationId: 'loc-1',
      countNumber: 'CNT-000001',
      stockMovementId: null,
    };

    manager.findOne.mockResolvedValue({ ...count });
    manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === StockCountLine) {
        return [
          {
            id: 'line-1',
            itemId: 'item-consumable',
            lotId: null,
            condition: StockBalanceCondition.NEW,
            expectedQty: '10.00',
            countedQty: null,
          },
        ];
      }
      return [];
    });
    manager.save.mockImplementation(async (_entity: unknown, payload: unknown) => payload);

    await service.close('count-001', actor);
    expect(stockLedgerService.recordMovementWithManager).not.toHaveBeenCalled();
  });

  it('rechaza cierre que dejaría existencia por debajo de lo reservado (CA-F3B-08)', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    const { manager } = buildCreateManager();
    const count = {
      id: 'count-001',
      tenantId: 'tenant-001',
      countNumber: 'CNT-000001',
      status: StockCountStatus.COUNTING,
      locationId: 'loc-1',
      categoryId: 'cat-a',
      notes: null,
      createdByUserId: actor.sub,
      closedByUserId: null,
      closedAt: null,
      stockMovementId: null,
    };
    const line = {
      id: 'line-1',
      tenantId: 'tenant-001',
      countId: 'count-001',
      itemId: 'item-consumable',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      expectedQty: '10.00',
      countedQty: '2.00',
    };

    manager.findOne.mockImplementation(async (entity: unknown) => {
      if (entity === StockCount) {
        return { ...count };
      }
      return null;
    });
    manager.find.mockImplementation(async (entity: unknown) => {
      if (entity === StockCountLine) {
        return [line];
      }
      if (entity === StockBalance) {
        return [
          {
            itemId: 'item-consumable',
            locationId: 'loc-1',
            lotId: null,
            condition: StockBalanceCondition.NEW,
            quantityOnHand: '10.00',
            quantityReserved: '6.00',
          },
        ];
      }
      return [];
    });
    manager.save.mockImplementation(async (_entity: unknown, payload: unknown) => payload);

    stockLedgerService.recordMovementWithManager.mockRejectedValue(
      new BadRequestException(
        'El movimiento dejaría la existencia (2.00) por debajo de lo comprometido (6.00).',
      ),
    );

    await expect(service.close('count-001', actor)).rejects.toThrow(/comprometido/);
    expect(manager.save).not.toHaveBeenCalledWith(
      StockCount,
      expect.objectContaining({ status: StockCountStatus.CLOSED }),
    );
  });
});
