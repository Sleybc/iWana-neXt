import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryItemStatus, StockMovementOrigin } from '@iwana/shared';
import {
  evaluateStockLowLevels,
  InventoryDomainEventPublisher,
  ItemStockThresholdSnapshot,
} from '../services/inventory-domain-event-publisher.service';
import { INVENTORY_EVENTS } from '../events/inventory.events';

function snapshot(
  overrides: Partial<ItemStockThresholdSnapshot> & Pick<ItemStockThresholdSnapshot, 'itemId'>,
): ItemStockThresholdSnapshot {
  const available = overrides.available ?? 10;
  const pending = overrides.pending ?? 0;
  const minimumStock = overrides.minimumStock ?? 5;
  const reorderPoint = overrides.reorderPoint ?? 15;
  const levels = evaluateStockLowLevels({ available, pending, minimumStock, reorderPoint });

  return {
    itemId: overrides.itemId,
    sku: overrides.sku ?? 'SKU-001',
    purchasable: overrides.purchasable ?? true,
    status: overrides.status ?? InventoryItemStatus.ACTIVE,
    available,
    pending,
    minimumStock,
    reorderPoint,
    belowMinimum: overrides.belowMinimum ?? levels.belowMinimum,
    belowReorder: overrides.belowReorder ?? levels.belowReorder,
  };
}

describe('evaluateStockLowLevels', () => {
  it('marca below-minimum cuando available < minimumStock', () => {
    expect(
      evaluateStockLowLevels({ available: 2, pending: 0, minimumStock: 5, reorderPoint: 10 }),
    ).toEqual({ belowMinimum: true, belowReorder: true });
  });

  it('marca solo below-reorder cuando hay pending suficiente para el mínimo', () => {
    expect(
      evaluateStockLowLevels({ available: 6, pending: 0, minimumStock: 5, reorderPoint: 10 }),
    ).toEqual({ belowMinimum: false, belowReorder: true });
  });

  it('no marca umbrales cuando minimumStock y reorderPoint son 0', () => {
    expect(
      evaluateStockLowLevels({ available: 0, pending: 0, minimumStock: 0, reorderPoint: 0 }),
    ).toEqual({ belowMinimum: false, belowReorder: false });
  });
});

describe('InventoryDomainEventPublisher', () => {
  const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
  let publisher: InventoryDomainEventPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new InventoryDomainEventPublisher(eventEmitter);
  });

  it('emite below-minimum al cruzar minimumStock hacia abajo', () => {
    const before = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 5, minimumStock: 5 })],
    ]);
    const after = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 4, minimumStock: 5 })],
    ]);

    publisher.emitStockLowCrossings({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      stockMovementId: 'mov-1',
      beforeByItem: before,
      afterByItem: after,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.STOCK_LOW,
      expect.objectContaining({
        itemId: 'item-1',
        level: 'below-minimum',
        available: 4,
        minimumStock: 5,
      }),
    );
  });

  it('emite below-reorder al cruzar reorderPoint hacia abajo', () => {
    const before = new Map([
      [
        'item-1',
        snapshot({
          itemId: 'item-1',
          available: 10,
          pending: 0,
          minimumStock: 2,
          reorderPoint: 10,
        }),
      ],
    ]);
    const after = new Map([
      [
        'item-1',
        snapshot({
          itemId: 'item-1',
          available: 9,
          pending: 0,
          minimumStock: 2,
          reorderPoint: 10,
        }),
      ],
    ]);

    publisher.emitStockLowCrossings({
      tenantId: 'tenant-1',
      beforeByItem: before,
      afterByItem: after,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.STOCK_LOW,
      expect.objectContaining({ level: 'below-reorder', available: 9, reorderPoint: 10 }),
    );
  });

  it('no re-emite si el ítem ya estaba bajo el umbral', () => {
    const before = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 2, minimumStock: 5, reorderPoint: 10 })],
    ]);
    const after = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 1, minimumStock: 5, reorderPoint: 10 })],
    ]);

    publisher.emitStockLowCrossings({
      tenantId: 'tenant-1',
      beforeByItem: before,
      afterByItem: after,
    });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('emite ASSET_SOLD por cada línea de un movimiento SALE', () => {
    publisher.emitAssetSoldForMovement({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      movement: {
        id: 'mov-sale',
        origin: StockMovementOrigin.SALE,
        originRefId: 'commercial-1',
      } as never,
      lines: [
        {
          itemId: 'item-1',
          serializedAssetId: 'asset-1',
          quantity: '-1.00',
        } as never,
      ],
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.ASSET_SOLD,
      expect.objectContaining({
        tenantId: 'tenant-1',
        itemId: 'item-1',
        serializedAssetId: 'asset-1',
        stockMovementId: 'mov-sale',
        quantity: 1,
        commercialReference: 'commercial-1',
      }),
    );
  });

  it('no emite nada en publishAfterCommittedMovement si created=false', () => {
    publisher.publishAfterCommittedMovement({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      beforeByItem: new Map(),
      afterByItem: new Map([
        ['item-1', snapshot({ itemId: 'item-1', available: 0, minimumStock: 5 })],
      ]),
      movement: { id: 'mov-1', origin: StockMovementOrigin.SALE } as never,
      lines: [{ itemId: 'item-1', quantity: '-1.00' } as never],
      created: false,
    });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('en SALE creado emite StockLow cruzado y AssetSold', () => {
    const before = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 5, minimumStock: 5, reorderPoint: 0 })],
    ]);
    const after = new Map([
      ['item-1', snapshot({ itemId: 'item-1', available: 4, minimumStock: 5, reorderPoint: 0 })],
    ]);

    publisher.publishAfterCommittedMovement({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      beforeByItem: before,
      afterByItem: after,
      movement: {
        id: 'mov-sale',
        origin: StockMovementOrigin.SALE,
        originRefId: 'ref-1',
      } as never,
      lines: [{ itemId: 'item-1', quantity: '-1.00', serializedAssetId: null } as never],
      created: true,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.STOCK_LOW,
      expect.objectContaining({ level: 'below-minimum' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      INVENTORY_EVENTS.ASSET_SOLD,
      expect.objectContaining({ stockMovementId: 'mov-sale', quantity: 1 }),
    );
  });

  it.each([
    ['emitIssueCreated', INVENTORY_EVENTS.ISSUE_CREATED, 'create'],
    ['emitIssueUpdated', INVENTORY_EVENTS.ISSUE_UPDATED, 'update'],
    ['emitIssueCancelled', INVENTORY_EVENTS.ISSUE_CANCELLED, 'cancel'],
  ] as const)('%s emite el ciclo de vida con autoría (S2.1 · B2)', (method, event, operation) => {
    publisher[method]({ tenantId: 'tenant-1', issueId: 'issue-1', actorUserId: 'user-1' });

    expect(eventEmitter.emit).toHaveBeenCalledWith(event, {
      tenantId: 'tenant-1',
      issueId: 'issue-1',
      actorUserId: 'user-1',
      operation,
    });
  });
});
