import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InventoryItem, StockBalance } from '@iwana/db';
import { acquireTransactionAdvisoryLock } from './inventory-postgres.util';

export interface ReceiptCostingLine {
  itemId: string;
  unitCost: number;
  quantity: number;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMoney(value: number): string {
  return value.toFixed(2);
}

/**
 * Clave de lock por ítem para serializar recepciones concurrentes (CA-F4-02).
 */
export function buildInventoryItemCostingLockKey(tenantId: string, itemId: string): string {
  return `inventory-item-costing:${tenantId}:${itemId}`;
}

/**
 * Fórmula D-F4-4: promedio móvil sobre existencia global del ítem.
 * Si onHand + qtyIn = 0, conserva el promedio previo.
 */
export function computeMovingAverage(
  averageCost: number,
  onHand: number,
  unitCost: number,
  qtyIn: number,
): number {
  const denominator = onHand + qtyIn;
  if (denominator === 0) {
    return averageCost;
  }

  return (averageCost * onHand + unitCost * qtyIn) / denominator;
}

/**
 * Cadena de valoración operativa (D-F4-8 / ADR-059):
 * `averageCost || lastPurchaseCost || standardCost || baseCost`
 * (0 es falsy → cae al siguiente; si toda la cadena es 0 → 0 / «Sin costo»).
 */
export function resolveValuationUnitCost(item: {
  averageCost?: string | number | null;
  lastPurchaseCost?: string | number | null;
  standardCost?: string | number | null;
  baseCost?: string | number | null;
}): number {
  const chain = [
    toNumeric(item.averageCost),
    toNumeric(item.lastPurchaseCost),
    toNumeric(item.standardCost),
    toNumeric(item.baseCost),
  ];

  for (const value of chain) {
    if (value > 0) {
      return value;
    }
  }

  return 0;
}

/**
 * Costo sellado para líneas de salida/ajuste/transferencia.
 * Si la cadena resuelve a 0 → null (UI «Sin costo»).
 */
export function resolveSealedUnitCost(item: {
  averageCost?: string | number | null;
  lastPurchaseCost?: string | number | null;
  standardCost?: string | number | null;
  baseCost?: string | number | null;
}): number | null {
  const value = resolveValuationUnitCost(item);
  return value > 0 ? value : null;
}

@Injectable()
export class InventoryCostingService {
  async sumOnHandWithManager(
    manager: EntityManager,
    tenantId: string,
    itemId: string,
  ): Promise<number> {
    const balances = await manager.find(StockBalance, {
      where: { tenantId, itemId },
    });

    return balances.reduce((sum, balance) => sum + toNumeric(balance.quantityOnHand), 0);
  }

  /**
   * Actualiza lastPurchaseCost + averageCost por recepción (OC / mostrador)
   * en la misma TX del ledger, con lock por ítem.
   * No recalcula promedio en salidas ni ajustes.
   */
  async applyReceiptCostingWithManager(
    manager: EntityManager,
    tenantId: string,
    lines: ReceiptCostingLine[],
  ): Promise<void> {
    const byItem = new Map<string, ReceiptCostingLine[]>();

    for (const line of lines) {
      if (line.quantity <= 0) {
        continue;
      }

      const bucket = byItem.get(line.itemId) ?? [];
      bucket.push(line);
      byItem.set(line.itemId, bucket);
    }

    for (const [itemId, itemLines] of byItem) {
      await acquireTransactionAdvisoryLock(
        manager,
        buildInventoryItemCostingLockKey(tenantId, itemId),
      );

      const item = await manager.findOne(InventoryItem, {
        where: { id: itemId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('El ítem de inventario no existe.');
      }

      let onHand = await this.sumOnHandWithManager(manager, tenantId, itemId);
      let averageCost = toNumeric(item.averageCost);
      let lastPurchaseCost =
        itemLines[itemLines.length - 1]?.unitCost ?? toNumeric(item.lastPurchaseCost);

      for (const line of itemLines) {
        averageCost = computeMovingAverage(averageCost, onHand, line.unitCost, line.quantity);
        onHand += line.quantity;
        lastPurchaseCost = line.unitCost;
      }

      item.averageCost = toMoney(averageCost);
      item.lastPurchaseCost = toMoney(lastPurchaseCost);
      await manager.save(InventoryItem, item);
    }
  }

  async resolveSealedUnitCostWithManager(
    manager: EntityManager,
    tenantId: string,
    itemId: string,
    cache?: Map<string, number | null>,
  ): Promise<number | null> {
    if (cache?.has(itemId)) {
      return cache.get(itemId) ?? null;
    }

    const item = await manager.findOne(InventoryItem, {
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new NotFoundException('El ítem de inventario no existe.');
    }

    const sealed = resolveSealedUnitCost(item);
    cache?.set(itemId, sealed);
    return sealed;
  }
}
