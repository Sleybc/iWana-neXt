import { StockBalanceCondition } from '@iwana/shared';
import type { StockBalanceRecord } from '@/lib/api-client';
import {
  buildIssueItemFrequencyFromIssueLines,
  buildStockIssueSuggestions,
} from './stock-issue-suggestions';

const items = [
  { id: 'item-1', sku: 'ONT-001', name: 'ONT WiFi 6', unitOfMeasure: 'unidad' },
  { id: 'item-2', sku: 'CAB-010', name: 'Cable drop', unitOfMeasure: 'metro' },
  { id: 'item-3', sku: 'PATCH-01', name: 'Patch cord', unitOfMeasure: 'unidad' },
];

const balances: StockBalanceRecord[] = [
  {
    id: 'bal-1',
    tenantId: 'tenant-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '3',
    quantityReserved: '0',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'bal-2',
    tenantId: 'tenant-1',
    itemId: 'item-2',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '12',
    quantityReserved: '0',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('stock-issue-suggestions', () => {
  it('returns only items with stock at the selected source location', () => {
    const suggestions = buildStockIssueSuggestions({
      items,
      balances,
      sourceLocationId: 'loc-1',
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((entry) => entry.itemId)).toEqual(['item-2', 'item-1']);
  });

  it('prioritizes issue frequency and filters by search', () => {
    const suggestions = buildStockIssueSuggestions({
      items,
      balances,
      sourceLocationId: 'loc-1',
      search: 'ont',
      issueItemFrequency: { 'item-1': 5, 'item-2': 1 },
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.itemId).toBe('item-1');
    expect(suggestions[0]?.helperLabel).toMatch(/Disponible en origen: 3/);
  });

  it('excluye ítems totalmente reservados y sugiere el disponible real', () => {
    const suggestions = buildStockIssueSuggestions({
      items,
      balances: [
        { ...balances[0]!, quantityOnHand: '10', quantityReserved: '4' },
        { ...balances[1]!, quantityOnHand: '12', quantityReserved: '12' },
      ],
      sourceLocationId: 'loc-1',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.itemId).toBe('item-1');
    expect(suggestions[0]?.availableQty).toBe(6);
    expect(suggestions[0]?.helperLabel).toMatch(/Disponible en origen: 6/);
  });

  it('builds frequency map from issue line history', () => {
    const frequency = buildIssueItemFrequencyFromIssueLines([
      { lines: [{ itemId: 'item-1' }, { itemId: 'item-2' }] },
      { lines: [{ itemId: 'item-1' }] },
    ]);

    expect(frequency).toEqual({ 'item-1': 2, 'item-2': 1 });
  });
});
