import {
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';

export interface CatalogFilters {
  search?: string;
  categoryId?: string;
  itemKind?: InventoryItemKind;
  trackingMode?: InventoryTrackingMode;
  status?: InventoryItemStatus;
  purchasable?: boolean;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {};

export function hasActiveCatalogFilters(filters: CatalogFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
    filters.categoryId ||
    filters.itemKind ||
    filters.trackingMode ||
    filters.status ||
    filters.purchasable !== undefined,
  );
}
