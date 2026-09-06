import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StockBalance } from '@iwana/db';
import { StockBalanceCondition } from '@iwana/shared';
import {
  StockBalanceService,
  buildReservationAvailabilityKey,
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

  describe('getAvailabilitiesWithManager (S2.1 · B2)', () => {
    function buildBatchManager(
      rows: Array<{
        itemId: string;
        lotId: string | null;
        condition: StockBalanceCondition;
        sumOnHand: string;
        sumReserved: string;
      }>,
    ) {
      const calls: Array<{ sql: string; params: Record<string, unknown> }> = [];
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation((sql: string, params: Record<string, unknown>) => {
          calls.push({ sql, params });
          return qb;
        }),
        andWhere: jest.fn().mockImplementation((sql: string, params: Record<string, unknown>) => {
          calls.push({ sql, params });
          return qb;
        }),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as EntityManager;
      return { manager, qb, calls };
    }

    it('resuelve UNA consulta agrupada para varias tuplas y ceros para las ausentes', async () => {
      const { manager, qb, calls } = buildBatchManager([
        {
          itemId: 'item-1',
          lotId: null,
          condition: StockBalanceCondition.NEW,
          sumOnHand: '10.00',
          sumReserved: '3.00',
        },
      ]);
      const service = new StockBalanceService({} as DataSource);

      const result = await service.getAvailabilitiesWithManager(manager, 'tenant-001', 'loc-001', [
        { itemId: 'item-1', lotId: null, condition: StockBalanceCondition.NEW },
        { itemId: 'item-2', lotId: 'lot-9', condition: StockBalanceCondition.REFURBISHED },
      ]);

      expect(qb.getRawMany).toHaveBeenCalledTimes(1);
      expect(
        calls.some(
          (call) =>
            call.sql.includes('balance.item_id IN') &&
            (call.params['availabilityItemIds'] as string[]).sort().join() ===
              ['item-1', 'item-2'].sort().join(),
        ),
      ).toBe(true);
      expect(
        result.get(
          buildReservationAvailabilityKey({
            itemId: 'item-1',
            lotId: null,
            condition: StockBalanceCondition.NEW,
          }),
        ),
      ).toEqual({ onHand: 10, reserved: 3, available: 7 });
      // Tupla sin filas: ceros, no undefined.
      expect(
        result.get(
          buildReservationAvailabilityKey({
            itemId: 'item-2',
            lotId: 'lot-9',
            condition: StockBalanceCondition.REFURBISHED,
          }),
        ),
      ).toEqual({ onHand: 0, reserved: 0, available: 0 });
    });

    it('sin claves no consulta y devuelve mapa vacío', async () => {
      const { manager, qb } = buildBatchManager([]);
      const service = new StockBalanceService({} as DataSource);

      const result = await service.getAvailabilitiesWithManager(
        manager,
        'tenant-001',
        'loc-001',
        [],
      );

      expect(qb.getRawMany).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('la clave distingue lote y condición', () => {
      const base = { itemId: 'i', lotId: null, condition: StockBalanceCondition.NEW };

      expect(buildReservationAvailabilityKey(base)).toBe(
        buildReservationAvailabilityKey({ ...base, lotId: null }),
      );
      expect(buildReservationAvailabilityKey(base)).not.toBe(
        buildReservationAvailabilityKey({ ...base, lotId: 'lot-1' }),
      );
      expect(buildReservationAvailabilityKey(base)).not.toBe(
        buildReservationAvailabilityKey({ ...base, condition: StockBalanceCondition.DAMAGED }),
      );
    });
  });
});
