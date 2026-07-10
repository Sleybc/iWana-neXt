import { StockBalanceCondition } from '@iwana/shared';
import type { StockBalanceRecord } from '@/lib/api-client';
import {
  buildAvailableQuantityByItemAtLocation,
  getBalanceForItemAtLocation,
  isRequestedQtyExceedingAvailable,
} from './stock-issue-balance-utils';

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
});
