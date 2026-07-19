import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StockBalance } from '@iwana/db';
import { StockBalanceCondition } from '@iwana/shared';
import {
  StockBalanceService,
  buildStockBalanceLockKey,
  computeAvailable,
  formatInsufficientAvailableMessage,
} from '../services/stock-balance.service';

describe('StockBalanceService', () => {
  describe('computeAvailable', () => {
    it('resta reservado de existencia', () => {
      expect(computeAvailable(12, 8)).toBe(4);
    });
  });

  describe('applyDeltaWithManager', () => {
    function buildManager(existing: StockBalance | null) {
      const callOrder: string[] = [];
      const save = jest.fn(async (_entity: unknown, payload: StockBalance) => payload);
      const create = jest.fn((_entity: unknown, payload: StockBalance) => payload);
      const getOne = jest.fn().mockResolvedValue(existing);
      const andWhere = jest.fn().mockReturnThis();
      const where = jest.fn().mockReturnThis();
      const query = jest.fn(async () => {
        callOrder.push('query');
        return [];
      });
      const createQueryBuilder = jest.fn(() => {
        callOrder.push('createQueryBuilder');
        return { where, andWhere, getOne };
      });

      const manager = {
        createQueryBuilder,
        save,
        create,
        query,
        find: jest.fn(),
      } as unknown as EntityManager;

      return { manager, save, create, getOne, query, callOrder };
    }

    it('serializa por tupla con advisory lock antes de leer el balance', async () => {
      const existing = {
        quantityOnHand: '10.00',
        quantityReserved: '0.00',
      } as StockBalance;
      const { manager, query, callOrder } = buildManager(existing);
      const service = new StockBalanceService({} as DataSource);

      await service.applyDeltaWithManager(manager, {
        tenantId: 'tenant-001',
        itemId: 'item-001',
        locationId: 'loc-001',
        lotId: null,
        condition: StockBalanceCondition.NEW,
        delta: 0,
        reservedDelta: 4,
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
        'stock-balance:tenant-001:item-001:loc-001:null:NEW',
      ]);
      expect(callOrder[0]).toBe('query');
      expect(callOrder).toContain('createQueryBuilder');
    });

    it('usa la misma clave de lock para lote ausente, null y undefined', () => {
      const base = { tenantId: 't1', itemId: 'i1', locationId: 'l1' };

      expect(buildStockBalanceLockKey(base)).toBe('stock-balance:t1:i1:l1:null:NEW');
      expect(buildStockBalanceLockKey({ ...base, lotId: null })).toBe(
        buildStockBalanceLockKey(base),
      );
      expect(buildStockBalanceLockKey({ ...base, lotId: 'lot-1' })).toBe(
        'stock-balance:t1:i1:l1:lot-1:NEW',
      );
      expect(
        buildStockBalanceLockKey({ ...base, condition: StockBalanceCondition.DAMAGED }),
      ).not.toBe(buildStockBalanceLockKey(base));
    });

    it('reserva feliz: aumenta reserved sin tocar onHand', async () => {
      const existing = {
        quantityOnHand: '10.00',
        quantityReserved: '0.00',
      } as StockBalance;
      const { manager, save } = buildManager(existing);
      const service = new StockBalanceService({} as DataSource);

      const result = await service.applyDeltaWithManager(manager, {
        tenantId: 'tenant-001',
        itemId: 'item-001',
        locationId: 'loc-001',
        delta: 0,
        reservedDelta: 4,
      });

      expect(result.quantityOnHand).toBe('10.00');
      expect(result.quantityReserved).toBe('4.00');
      expect(save).toHaveBeenCalled();
    });

    it('rechaza reservar por encima del disponible', async () => {
      const existing = {
        quantityOnHand: '10.00',
        quantityReserved: '8.00',
      } as StockBalance;
      const { manager } = buildManager(existing);
      const service = new StockBalanceService({} as DataSource);

      await expect(
        service.applyDeltaWithManager(manager, {
          tenantId: 'tenant-001',
          itemId: 'item-001',
          locationId: 'loc-001',
          delta: 0,
          reservedDelta: 3,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.applyDeltaWithManager(manager, {
          tenantId: 'tenant-001',
          itemId: 'item-001',
          locationId: 'loc-001',
          delta: 0,
          reservedDelta: 3,
        }),
      ).rejects.toThrow(/existencia/);
    });

    it('rechaza liberar reserva por debajo de cero', async () => {
      const existing = {
        quantityOnHand: '10.00',
        quantityReserved: '2.00',
      } as StockBalance;
      const { manager } = buildManager(existing);
      const service = new StockBalanceService({} as DataSource);

      await expect(
        service.applyDeltaWithManager(manager, {
          tenantId: 'tenant-001',
          itemId: 'item-001',
          locationId: 'loc-001',
          delta: 0,
          reservedDelta: -3,
        }),
      ).rejects.toThrow(/liberar más reserva/);
    });

    it('rechaza dejar existencia por debajo de lo reservado', async () => {
      const existing = {
        quantityOnHand: '10.00',
        quantityReserved: '6.00',
      } as StockBalance;
      const { manager } = buildManager(existing);
      const service = new StockBalanceService({} as DataSource);

      await expect(
        service.applyDeltaWithManager(manager, {
          tenantId: 'tenant-001',
          itemId: 'item-001',
          locationId: 'loc-001',
          delta: -5,
          reservedDelta: 0,
        }),
      ).rejects.toThrow(/por debajo de lo comprometido/);
    });
  });

  describe('getAvailabilityWithManager', () => {
    it('calcula disponible restando reservado', async () => {
      const manager = {
        find: jest.fn().mockResolvedValue([
          {
            lotId: null,
            quantityOnHand: '12.00',
            quantityReserved: '8.00',
          },
        ]),
      } as unknown as EntityManager;
      const service = new StockBalanceService({} as DataSource);

      const availability = await service.getAvailabilityWithManager(manager, 'tenant-001', {
        itemId: 'item-001',
        locationId: 'loc-001',
        condition: StockBalanceCondition.NEW,
      });

      expect(availability).toEqual({
        onHand: 12,
        reserved: 8,
        available: 4,
      });
      expect(formatInsufficientAvailableMessage(12, 8)).toContain('comprometidos');
    });
  });
});
