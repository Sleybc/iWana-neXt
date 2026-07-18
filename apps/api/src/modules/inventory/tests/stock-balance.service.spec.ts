import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StockBalance } from '@iwana/db';
import { StockBalanceCondition } from '@iwana/shared';
import {
  StockBalanceService,
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
      const save = jest.fn(async (_entity: unknown, payload: StockBalance) => payload);
      const create = jest.fn((_entity: unknown, payload: StockBalance) => payload);
      const getOne = jest.fn().mockResolvedValue(existing);
      const andWhere = jest.fn().mockReturnThis();
      const where = jest.fn().mockReturnThis();
      const createQueryBuilder = jest.fn().mockReturnValue({
        where,
        andWhere,
        getOne,
      });

      const manager = {
        createQueryBuilder,
        save,
        create,
        find: jest.fn(),
      } as unknown as EntityManager;

      return { manager, save, create, getOne };
    }

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
