import { StockMovementOrigin } from '@iwana/shared';
import {
  EMPTY_STOCK_KARDEX_FILTERS,
  buildListMovementsParams,
  hasActiveStockKardexFilters,
} from './stock-kardex-filters';

describe('stock-kardex-filters', () => {
  it('detects inactive empty filters', () => {
    expect(hasActiveStockKardexFilters(EMPTY_STOCK_KARDEX_FILTERS)).toBe(false);
  });

  it('detects active filters and builds list params', () => {
    const filters = {
      ...EMPTY_STOCK_KARDEX_FILTERS,
      search: 'MOV',
      origin: StockMovementOrigin.ADJUSTMENT as const,
      itemId: 'item-001',
      locationId: 'loc-001',
      serializedAssetId: 'asset-001',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-18',
    };

    expect(hasActiveStockKardexFilters(filters)).toBe(true);
    expect(buildListMovementsParams(filters, { page: 2, limit: 10 })).toEqual({
      search: 'MOV',
      origin: StockMovementOrigin.ADJUSTMENT,
      itemId: 'item-001',
      locationId: 'loc-001',
      serializedAssetId: 'asset-001',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-18',
      page: 2,
      limit: 10,
    });
  });
});
