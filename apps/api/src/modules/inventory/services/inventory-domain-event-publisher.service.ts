import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, In } from 'typeorm';
import {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequestLine,
  StockBalance,
  StockMovement,
  StockMovementLine,
} from '@iwana/db';
import {
  InventoryItemStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  StockMovementOrigin,
} from '@iwana/shared';
import {
  AssetSoldEvent,
  INVENTORY_EVENTS,
  StockLowEvent,
  StockLowLevel,
} from '../events/inventory.events';

export interface ItemStockThresholdSnapshot {
  itemId: string;
  sku: string;
  purchasable: boolean;
  status: InventoryItemStatus;
  available: number;
  pending: number;
  minimumStock: number;
  reorderPoint: number;
  belowMinimum: boolean;
  belowReorder: boolean;
}

export interface PublishAfterCommittedMovementInput {
  tenantId: string;
  actorUserId: string;
  beforeByItem: Map<string, ItemStockThresholdSnapshot>;
  afterByItem: Map<string, ItemStockThresholdSnapshot>;
  movement: StockMovement;
  lines: StockMovementLine[];
  /** Solo emitir si el movimiento se creó en esta operación (no replay idempotente). */
  created: boolean;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return 0;
  }

  return Number.parseFloat(value);
}

/**
 * Evalúa umbrales StockLow con la misma semántica que F2 (D-H4-03).
 * Criticidad `out` se trata como below-minimum cuando minimumStock > 0.
 */
export function evaluateStockLowLevels(input: {
  available: number;
  pending: number;
  minimumStock: number;
  reorderPoint: number;
}): { belowMinimum: boolean; belowReorder: boolean } {
  const belowMinimum = input.minimumStock > 0 && input.available < input.minimumStock;
  const belowReorder =
    input.reorderPoint > 0 && input.available + input.pending < input.reorderPoint;

  return { belowMinimum, belowReorder };
}

@Injectable()
export class InventoryDomainEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async captureItemSnapshots(
    manager: EntityManager,
    tenantId: string,
    itemIds: string[],
  ): Promise<Map<string, ItemStockThresholdSnapshot>> {
    const uniqueIds = [...new Set(itemIds.filter((id) => id.length > 0))];
    const result = new Map<string, ItemStockThresholdSnapshot>();

    if (uniqueIds.length === 0) {
      return result;
    }

    const [items, balances, poLines, requestLines] = await Promise.all([
      manager.find(InventoryItem, {
        where: { tenantId, id: In(uniqueIds) },
      }),
      manager.find(StockBalance, {
        where: { tenantId, itemId: In(uniqueIds) },
      }),
      manager
        .createQueryBuilder(PurchaseOrderLine, 'line')
        .innerJoin(
          PurchaseOrder,
          'po',
          'po.id = line.purchaseOrderId AND po.tenantId = line.tenantId',
        )
        .where('line.tenantId = :tenantId', { tenantId })
        .andWhere('line.itemId IN (:...itemIds)', { itemIds: uniqueIds })
        .andWhere('po.status IN (:...statuses)', {
          statuses: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
        })
        .andWhere('CAST(line.quantity AS numeric) - CAST(line.receivedQuantity AS numeric) > 0')
        .getMany(),
      manager.find(PurchaseRequestLine, {
        where: {
          tenantId,
          inventoryItemId: In(uniqueIds),
          lineStatus: In([
            PurchaseRequestLineStatus.OPEN,
            PurchaseRequestLineStatus.PENDING_QUOTE,
            PurchaseRequestLineStatus.AWARDED,
          ]),
        },
      }),
    ]);

    const availableByItem = new Map<string, number>();
    for (const balance of balances) {
      const available = toNumeric(balance.quantityOnHand) - toNumeric(balance.quantityReserved);
      availableByItem.set(balance.itemId, (availableByItem.get(balance.itemId) ?? 0) + available);
    }

    const pendingByItem = new Map<string, number>();
    for (const line of poLines) {
      const pending = toNumeric(line.quantity) - toNumeric(line.receivedQuantity);
      if (pending <= 0) {
        continue;
      }
      pendingByItem.set(line.itemId, (pendingByItem.get(line.itemId) ?? 0) + pending);
    }

    for (const line of requestLines) {
      if (!line.inventoryItemId) {
        continue;
      }
      pendingByItem.set(
        line.inventoryItemId,
        (pendingByItem.get(line.inventoryItemId) ?? 0) + toNumeric(line.quantityRequested),
      );
    }

    for (const item of items) {
      const available = availableByItem.get(item.id) ?? 0;
      const pending = pendingByItem.get(item.id) ?? 0;
      const minimumStock = toNumeric(item.minimumStock);
      const reorderPoint = toNumeric(item.reorderPoint);
      const levels = evaluateStockLowLevels({
        available,
        pending,
        minimumStock,
        reorderPoint,
      });

      result.set(item.id, {
        itemId: item.id,
        sku: item.sku,
        purchasable: item.purchasable,
        status: item.status,
        available,
        pending,
        minimumStock,
        reorderPoint,
        belowMinimum: levels.belowMinimum,
        belowReorder: levels.belowReorder,
      });
    }

    return result;
  }

  /**
   * Emite StockLow / AssetSold solo después del commit de la TX del ledger (D-H4-02).
   */
  publishAfterCommittedMovement(input: PublishAfterCommittedMovementInput): void {
    if (!input.created) {
      return;
    }

    this.emitStockLowCrossings({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      stockMovementId: input.movement.id,
      beforeByItem: input.beforeByItem,
      afterByItem: input.afterByItem,
    });

    if (input.movement.origin === StockMovementOrigin.SALE) {
      this.emitAssetSoldForMovement({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        movement: input.movement,
        lines: input.lines,
      });
    }
  }

  emitStockLowCrossings(input: {
    tenantId: string;
    actorUserId?: string;
    stockMovementId?: string;
    beforeByItem: Map<string, ItemStockThresholdSnapshot>;
    afterByItem: Map<string, ItemStockThresholdSnapshot>;
  }): void {
    for (const [itemId, after] of input.afterByItem) {
      if (!after.purchasable || after.status !== InventoryItemStatus.ACTIVE) {
        continue;
      }

      const before = input.beforeByItem.get(itemId);
      const levels: Array<{ level: StockLowLevel; crossed: boolean }> = [
        {
          level: 'below-minimum',
          crossed: !(before?.belowMinimum ?? false) && after.belowMinimum,
        },
        {
          level: 'below-reorder',
          crossed: !(before?.belowReorder ?? false) && after.belowReorder,
        },
      ];

      for (const { level, crossed } of levels) {
        if (!crossed) {
          continue;
        }

        const payload: StockLowEvent = {
          tenantId: input.tenantId,
          itemId,
          sku: after.sku,
          level,
          available: after.available,
          pending: after.pending,
          minimumStock: after.minimumStock,
          reorderPoint: after.reorderPoint,
          ...(input.stockMovementId ? { stockMovementId: input.stockMovementId } : {}),
          ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        };

        this.eventEmitter.emit(INVENTORY_EVENTS.STOCK_LOW, payload);
      }
    }
  }

  emitAssetSoldForMovement(input: {
    tenantId: string;
    actorUserId?: string;
    movement: StockMovement;
    lines: StockMovementLine[];
  }): void {
    for (const line of input.lines) {
      const quantity = Math.abs(toNumeric(line.quantity));
      if (quantity <= 0) {
        continue;
      }

      const payload: AssetSoldEvent = {
        tenantId: input.tenantId,
        stockMovementId: input.movement.id,
        quantity,
        ...(line.itemId ? { itemId: line.itemId } : {}),
        ...(line.serializedAssetId ? { serializedAssetId: line.serializedAssetId } : {}),
        ...(input.movement.originRefId ? { commercialReference: input.movement.originRefId } : {}),
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      };

      this.eventEmitter.emit(INVENTORY_EVENTS.ASSET_SOLD, payload);
    }
  }
}
