'use client';

import { StockIssueStatus, StockIssueType } from '@iwana/shared';
import type { StockIssueRecord, StockLocationRecord } from '@/lib/api-client';

export interface StockIssueFilters {
  type?: StockIssueType;
  status?: StockIssueStatus;
  search?: string;
}

export function hasActiveIssueFilters(filters: StockIssueFilters): boolean {
  return Boolean(filters.type || filters.status || filters.search?.trim());
}

export function filterStockIssues(
  issues: StockIssueRecord[],
  filters: StockIssueFilters,
  locationMap: Map<string, StockLocationRecord>,
): StockIssueRecord[] {
  const needle = filters.search?.trim().toLowerCase();

  return issues.filter((issue) => {
    if (filters.type && issue.type !== filters.type) {
      return false;
    }

    if (filters.status && issue.status !== filters.status) {
      return false;
    }

    if (!needle) {
      return true;
    }

    const source = issue.sourceLocationId
      ? (locationMap.get(issue.sourceLocationId)?.name ?? issue.sourceLocationId)
      : '';
    const destination = issue.destinationLocationId
      ? (locationMap.get(issue.destinationLocationId)?.name ?? issue.destinationLocationId)
      : (issue.destinationRefId ?? '');
    const ref = issue.commercialRefId ?? issue.originRefId ?? issue.costCenter ?? '';

    return (
      issue.id.toLowerCase().includes(needle) ||
      source.toLowerCase().includes(needle) ||
      destination.toLowerCase().includes(needle) ||
      ref.toLowerCase().includes(needle)
    );
  });
}
