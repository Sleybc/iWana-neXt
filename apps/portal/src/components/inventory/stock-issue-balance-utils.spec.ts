import { StockBalanceCondition } from '@iwana/shared';
import type { StockBalanceRecord } from '@/lib/api-client';
import {
  buildAvailableQuantityByItemAtLocation,
  getAvailableQtyFromBalance,
  getBalanceForItemAtLocation,
  isRequestedQtyExceedingAvailable,
} from './stock-issue-balance-utils';

function buildBalance(overrides: Partial<StockBalanceRecord>): StockBalanceRecord {
  return {
    id: 'bal-x',
    tenantId: 'tenant-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '0',
    quantityReserved: '0',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stock-issue-balance-utils', () => {
  const balances: StockBalanceRecord[] = [
    {
      id: 'bal-1',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '4',
      quantityReserved: '0',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'bal-2',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '1.5',
      quantityReserved: '0',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'bal-3',
      tenantId: 'tenant-1',
      itemId: 'item-2',
      locationId: 'loc-2',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '10',
      quantityReserved: '0',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ];

  it('sums available quantity for item and location', () => {
    expect(getBalanceForItemAtLocation(balances, 'item-1', 'loc-1')).toBe(5.5);
    expect(getBalanceForItemAtLocation(balances, 'item-2', 'loc-1')).toBe(0);
  });

  it('builds a quantity map for a source location', () => {
    const map = buildAvailableQuantityByItemAtLocation(balances, 'loc-1');
    expect(map.get('item-1')).toBe(5.5);
    expect(map.has('item-2')).toBe(false);
  });

  it('detects when requested quantity exceeds available stock', () => {
    expect(isRequestedQtyExceedingAvailable('6', 5.5)).toBe(true);
    expect(isRequestedQtyExceedingAvailable('5', 5.5)).toBe(false);
    expect(isRequestedQtyExceedingAvailable('abc', 5.5)).toBe(false);
  });

  describe('con material reservado (Fase 03B)', () => {
    const reservedBalances: StockBalanceRecord[] = [
      buildBalance({ id: 'res-1', quantityOnHand: '10', quantityReserved: '4' }),
      buildBalance({ id: 'res-2', quantityOnHand: '5', quantityReserved: '1.5' }),
      buildBalance({
        id: 'res-3',
        itemId: 'item-2',
        locationId: 'loc-2',
        quantityOnHand: '8',
        quantityReserved: '8',
      }),
    ];

    it('resta lo reservado al calcular el disponible de un saldo', () => {
      expect(getAvailableQtyFromBalance(reservedBalances[0]!)).toBe(6);
      expect(getAvailableQtyFromBalance(reservedBalances[2]!)).toBe(0);
    });

    it('suma disponible (existencia menos reservado) por ítem y bodega', () => {
      expect(getBalanceForItemAtLocation(reservedBalances, 'item-1', 'loc-1')).toBe(9.5);
      expect(getBalanceForItemAtLocation(reservedBalances, 'item-2', 'loc-2')).toBe(0);
    });

    it('construye el mapa de disponible descontando lo reservado', () => {
      const map = buildAvailableQuantityByItemAtLocation(reservedBalances, 'loc-1');
      expect(map.get('item-1')).toBe(9.5);
    });

    it('marca exceso cuando la cantidad supera el disponible aunque haya existencia', () => {
      const available = getBalanceForItemAtLocation(reservedBalances, 'item-1', 'loc-1');
      // Existencia total 15, pero solo 9.5 disponible: pedir 12 debe advertirse.
      expect(isRequestedQtyExceedingAvailable('12', available)).toBe(true);
    });
  });
});
