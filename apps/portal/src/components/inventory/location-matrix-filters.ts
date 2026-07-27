import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import type { StockLocationRecord } from '@/lib/api-client';

export type LocationMatrixCustodyFilter = 'all' | 'mobile';
export type LocationMatrixStockFilter = 'all' | 'withStock';
export type LocationMatrixStatusFilter = 'all' | StockLocationStatus | 'inactive_group';

export interface LocationMatrixFilters {
  search: string;
  typeFilter: 'all' | StockLocationType;
  statusFilter: LocationMatrixStatusFilter;
  custodyFilter: LocationMatrixCustodyFilter;
  stockFilter: LocationMatrixStockFilter;
}

export const EMPTY_LOCATION_MATRIX_FILTERS: LocationMatrixFilters = {
  search: '',
  typeFilter: 'all',
  statusFilter: 'all',
  custodyFilter: 'all',
  stockFilter: 'all',
};

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

const INACTIVE_GROUP_STATUSES = new Set<StockLocationStatus>([
  StockLocationStatus.INACTIVE,
  StockLocationStatus.ARCHIVED,
]);

export function hasActiveLocationMatrixFilters(filters: LocationMatrixFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.typeFilter !== 'all' ||
    filters.statusFilter !== 'all' ||
    filters.custodyFilter === 'mobile' ||
    filters.stockFilter === 'withStock'
  );
}

export function matchesLocationMatrixFilters(
  location: StockLocationRecord,
  filters: LocationMatrixFilters,
  totalOnHand: number,
): boolean {
  if (filters.custodyFilter === 'mobile' && !MOBILE_LOCATION_TYPES.has(location.type)) {
    return false;
  }

  if (filters.typeFilter !== 'all' && location.type !== filters.typeFilter) {
    return false;
  }

  if (filters.statusFilter === 'inactive_group') {
    if (!INACTIVE_GROUP_STATUSES.has(location.status)) {
      return false;
    }
  } else if (filters.statusFilter !== 'all' && location.status !== filters.statusFilter) {
    return false;
  }

  if (filters.stockFilter === 'withStock' && totalOnHand <= 0) {
    return false;
  }

  const normalizedSearch = filters.search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return (
    location.name.toLowerCase().includes(normalizedSearch) ||
    location.code.toLowerCase().includes(normalizedSearch) ||
    (location.responsibleRefId ?? '').toLowerCase().includes(normalizedSearch)
  );
}

export function resolveLocationStatusSelectValue(
  statusFilter: LocationMatrixStatusFilter,
): 'all' | StockLocationStatus {
  if (statusFilter === 'inactive_group') {
    return 'all';
  }

  return statusFilter;
}

/** Query params Ola 6 para `GET /inventory/locations` (sin inventar agregación). */
export function locationMatrixFiltersToListParams(filters: LocationMatrixFilters): {
  search?: string;
  type?: StockLocationType;
  status?: StockLocationStatus;
  custody?: 'mobile';
  statusGroup?: 'inactive_group';
  withStock?: boolean;
} {
  return {
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.typeFilter !== 'all' ? { type: filters.typeFilter } : {}),
    ...(filters.statusFilter !== 'all' && filters.statusFilter !== 'inactive_group'
      ? { status: filters.statusFilter }
      : {}),
    ...(filters.statusFilter === 'inactive_group'
      ? { statusGroup: 'inactive_group' as const }
      : {}),
    ...(filters.custodyFilter === 'mobile' ? { custody: 'mobile' as const } : {}),
    ...(filters.stockFilter === 'withStock' ? { withStock: true } : {}),
  };
}
