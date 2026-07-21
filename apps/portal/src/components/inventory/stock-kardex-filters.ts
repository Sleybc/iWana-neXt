import type { StockMovementOrigin } from '@iwana/shared';
import type { ListStockMovementsParams } from '@/lib/api-client';

export interface StockKardexFilters {
  search: string;
  origin: 'all' | StockMovementOrigin;
  itemId: string;
  locationId: string;
  serializedAssetId: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_STOCK_KARDEX_FILTERS: StockKardexFilters = {
  search: '',
  origin: 'all',
  itemId: '',
  locationId: '',
  serializedAssetId: '',
  dateFrom: '',
  dateTo: '',
};

export function hasActiveStockKardexFilters(filters: StockKardexFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.origin !== 'all' ||
    filters.itemId.trim().length > 0 ||
    filters.locationId.trim().length > 0 ||
    filters.serializedAssetId.trim().length > 0 ||
    filters.dateFrom.trim().length > 0 ||
    filters.dateTo.trim().length > 0
  );
}

export function buildListMovementsParams(
  filters: StockKardexFilters,
  pagination: { page: number; limit: number },
): ListStockMovementsParams {
  const params: ListStockMovementsParams = {
    page: pagination.page,
    limit: pagination.limit,
  };

  const search = filters.search.trim();
  if (search) {
    params.search = search;
  }

  if (filters.origin !== 'all') {
    params.origin = filters.origin;
  }

  const itemId = filters.itemId.trim();
  if (itemId) {
    params.itemId = itemId;
  }

  const locationId = filters.locationId.trim();
  if (locationId) {
    params.locationId = locationId;
  }

  const serializedAssetId = filters.serializedAssetId.trim();
  if (serializedAssetId) {
    params.serializedAssetId = serializedAssetId;
  }

  const dateFrom = filters.dateFrom.trim();
  if (dateFrom) {
    params.dateFrom = dateFrom;
  }

  const dateTo = filters.dateTo.trim();
  if (dateTo) {
    params.dateTo = dateTo;
  }

  return params;
}
