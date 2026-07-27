import type { ListPurchaseRequestsParams, PurchaseRequestKpiPreset } from '@/lib/api-client';
import type { PurchaseRequestFilters } from './purchase-filters';
import { hasActivePurchaseFilters } from './purchase-filters';

export const PURCHASE_REQUESTS_FILTER_KEYS = [
  'search',
  'status',
  'requestType',
  'priority',
  'kpiPreset',
] as const;

export const PURCHASE_REQUESTS_NAMESPACE = 'purchaseRequests';

export function filtersFromTableQuery(filters: Record<string, string>): PurchaseRequestFilters {
  const next: PurchaseRequestFilters = {};
  if (filters.search) next.search = filters.search;
  if (filters.status) {
    next.status = filters.status as NonNullable<PurchaseRequestFilters['status']>;
  }
  if (filters.requestType) {
    next.requestType = filters.requestType as NonNullable<PurchaseRequestFilters['requestType']>;
  }
  if (filters.priority) {
    next.priority = filters.priority as NonNullable<PurchaseRequestFilters['priority']>;
  }
  if (filters.kpiPreset) {
    next.kpiPreset = filters.kpiPreset as PurchaseRequestKpiPreset;
  }
  return next;
}

export function tableQueryFromFilters(
  filters: PurchaseRequestFilters,
): Record<string, string | null> {
  return {
    search: filters.search?.trim() ? filters.search.trim() : null,
    status: filters.status ?? null,
    requestType: filters.requestType ?? null,
    priority: filters.priority ?? null,
    kpiPreset: filters.kpiPreset ?? null,
  };
}

export function buildPurchaseRequestsListParams(
  filters: PurchaseRequestFilters,
  page: number,
  pageSize: number,
): ListPurchaseRequestsParams {
  return {
    ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.requestType ? { requestType: filters.requestType } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.kpiPreset ? { kpiPreset: filters.kpiPreset } : {}),
    page,
    limit: pageSize,
  };
}

export { hasActivePurchaseFilters };
