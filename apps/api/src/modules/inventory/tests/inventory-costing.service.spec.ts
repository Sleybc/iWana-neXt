import { NotFoundException } from '@nestjs/common';
import { InventoryItem, StockBalance } from '@iwana/db';
import {
  InventoryCostingService,
  buildInventoryItemCostingLockKey,
  computeMovingAverage,
  resolveSealedUnitCost,
  resolveValuationUnitCost,
} from '../services/inventory-costing.service';

jest.mock('@iwana/db', () => ({
  InventoryItem: class InventoryItem {},
  StockBalance: class StockBalance {},
}));

describe('InventoryCostingService', () => {
  describe('computeMovingAverage (D-F4-4 / CA-F4-01)', () => {
    it('calcula el promedio móvil ponderado', () => {
      // onHand=10 @ avg=100; recibe 10 @ 200 → avg' = 150
      expect(computeMovingAverage(100, 10, 200, 10)).toBe(150);
    });

    it('conserva el promedio cuando onHand + qtyIn = 0', () => {
      expect(computeMovingAverage(42, 0, 10, 0)).toBe(42);
    });

    it('parte desde existencia cero con el costo de recepción', () => {
      expect(computeMovingAverage(0, 0, 120, 5)).toBe(120);
    });
  });

  describe('resolveValuationUnitCost (D-F4-8)', () => {
    it('prioriza averageCost sobre el resto de la cadena', () => {
      expect(
        resolveValuationUnitCost({
          averageCost: '15.00',
          lastPurchaseCost: '10.00',
          standardCost: '8.00',
          baseCost: '5.00',
        }),
      ).toBe(15);
    });

    it('cae al siguiente cuando averageCost es 0', () => {
      expect(
        resolveValuationUnitCost({
          averageCost: '0.00',
          lastPurchaseCost: '10.00',
          standardCost: '8.00',
          baseCost: '5.00',
        }),
      ).toBe(10);
    });

    it('retorna 0 cuando toda la cadena es cero o nula', () => {
      expect(
        resolveValuationUnitCost({
          averageCost: '0',
          lastPurchaseCost: null,
          standardCost: '0',
          baseCost: '0',
        }),
      ).toBe(0);
    });
  });

  describe('resolveSealedUnitCost', () => {
    it('sella con promedio cuando es > 0', () => {
      expect(
        resolveSealedUnitCost({
          averageCost: '12.50',
          lastPurchaseCost: null,
          standardCost: '0',
          baseCost: '0',
        }),
      ).toBe(12.5);
    });

    it('retorna null cuando no hay costo (Sin costo)', () => {
      expect(
        resolveSealedUnitCost({
          averageCost: '0',
          lastPurchaseCost: null,
          standardCost: '0',
          baseCost: '0',
        }),
      ).toBeNull();
    });
  });

  describe('applyReceiptCostingWithManager', () => {
    it('actualiza lastPurchaseCost y averageCost con la fórmula (CA-F4-01)', async () => {
      const item = {
        id: 'item-001',
        tenantId: 'tenant-001',
        averageCost: '100.00',
        lastPurchaseCost: '100.00',
      };

      const manager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(item),
        find: jest.fn().mockImplementation(async (entity) => {
          if (entity === StockBalance) {
            return [{ quantityOnHand: '10.00' }];
          }
          return [];
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      };

      const service = new InventoryCostingService();
      await service.applyReceiptCostingWithManager(manager as never, 'tenant-001', [
        { itemId: 'item-001', unitCost: 200, quantity: 10 },
      ]);

      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
        buildInventoryItemCostingLockKey('tenant-001', 'item-001'),
      ]);
      expect(manager.findOne).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({
          where: { id: 'item-001', tenantId: 'tenant-001' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({
          averageCost: '150.00',
          lastPurchaseCost: '200.00',
        }),
      );
    });

    it('serializa recepciones concurrentes del mismo ítem vía lock (CA-F4-02)', async () => {
      const item = {
        id: 'item-001',
        tenantId: 'tenant-001',
        averageCost: '100.00',
        lastPurchaseCost: '100.00',
      };

      let onHand = 10;
      const lockOrder: string[] = [];
      let activeLocks = 0;
      let maxConcurrent = 0;

      const createManager = () => ({
        query: jest.fn().mockImplementation(async (sql: string, params: string[]) => {
          if (sql.includes('pg_advisory_xact_lock')) {
            lockOrder.push(params[0]!);
            activeLocks += 1;
            maxConcurrent = Math.max(maxConcurrent, activeLocks);
            // Simula contención: el segundo espera a que el primero termine el save.
            await new Promise((resolve) => setTimeout(resolve, 20));
            activeLocks -= 1;
          }
          return [];
        }),
        findOne: jest
          .fn()
          .mockImplementation(async () => ({ ...item, averageCost: item.averageCost })),
        find: jest.fn().mockImplementation(async (entity) => {
          if (entity === StockBalance) {
            return [{ quantityOnHand: onHand.toFixed(2) }];
          }
          return [];
        }),
        save: jest.fn().mockImplementation(async (_entity, payload: typeof item) => {
          item.averageCost = payload.averageCost;
          item.lastPurchaseCost = payload.lastPurchaseCost;
          onHand += 5;
          return payload;
        }),
      });

      const service = new InventoryCostingService();
      const managerA = createManager();
      const managerB = createManager();

      // Secuencial (como en TX reales con advisory lock): A luego B
      await service.applyReceiptCostingWithManager(managerA as never, 'tenant-001', [
        { itemId: 'item-001', unitCost: 200, quantity: 5 },
      ]);
      await service.applyReceiptCostingWithManager(managerB as never, 'tenant-001', [
        { itemId: 'item-001', unitCost: 300, quantity: 5 },
      ]);

      // (100×10 + 200×5)/15 ≈ 133.33; luego (133.33×15 + 300×5)/20 = 175
      expect(Number.parseFloat(item.averageCost)).toBeCloseTo(175, 1);
      expect(item.lastPurchaseCost).toBe('300.00');
      expect(lockOrder).toEqual([
        buildInventoryItemCostingLockKey('tenant-001', 'item-001'),
        buildInventoryItemCostingLockKey('tenant-001', 'item-001'),
      ]);
    });

    it('no muta averageCost cuando no hay líneas de ingreso', async () => {
      const manager = {
        query: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
      };
      const service = new InventoryCostingService();
      await service.applyReceiptCostingWithManager(manager as never, 'tenant-001', []);
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el ítem no existe', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn(),
        save: jest.fn(),
      };
      const service = new InventoryCostingService();
      await expect(
        service.applyReceiptCostingWithManager(manager as never, 'tenant-001', [
          { itemId: 'missing', unitCost: 10, quantity: 1 },
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sellado sin mutar avg (CA-F4-03 / CA-F4-04)', () => {
    it('resuelve unitCost sellado sin guardar el ítem', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'item-001',
          averageCost: '25.00',
          lastPurchaseCost: '20.00',
          standardCost: '0',
          baseCost: '0',
        }),
        save: jest.fn(),
      };
      const service = new InventoryCostingService();
      const sealed = await service.resolveSealedUnitCostWithManager(
        manager as never,
        'tenant-001',
        'item-001',
      );

      expect(sealed).toBe(25);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
