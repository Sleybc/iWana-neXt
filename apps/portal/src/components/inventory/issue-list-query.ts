import type { ListStockIssuesParams } from '@/lib/api-client';
import type { StockIssueFilters } from './issue-filters';
import { hasActiveIssueFilters } from './issue-filters';

export const STOCK_ISSUES_FILTER_KEYS = ['search', 'type', 'status'] as const;
export const STOCK_ISSUES_NAMESPACE = 'stockIssues';

export function issueFiltersFromTableQuery(filters: Record<string, string>): StockIssueFilters {
  const next: StockIssueFilters = {};
  if (filters.search) next.search = filters.search;
  if (filters.type) {
    next.type = filters.type as NonNullable<StockIssueFilters['type']>;
  }
  if (filters.status) {
    next.status = filters.status as NonNullable<StockIssueFilters['status']>;
  }
  return next;
}

export function tableQueryFromIssueFilters(
  filters: StockIssueFilters,
): Record<string, string | null> {
  return {
    search: filters.search?.trim() ? filters.search.trim() : null,
    type: filters.type ?? null,
    status: filters.status ?? null,
  };
}

export function buildStockIssuesListParams(
  filters: StockIssueFilters,
  page: number,
  pageSize: number,
): ListStockIssuesParams {
  return {
    ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    page,
    limit: pageSize,
  };
}

export { hasActiveIssueFilters };
