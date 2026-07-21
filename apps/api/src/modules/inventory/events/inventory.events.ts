/**
 * Constantes de eventos de dominio del modulo Inventario / SCM (MOD12).
 */
export const INVENTORY_EVENTS = {
  ITEM_CREATED: 'inventory.item-created',
  ITEM_UPDATED: 'inventory.item-updated',
  CATALOG_OPTION_REQUESTED: 'inventory.catalog-option-requested',
  CATEGORY_CREATED: 'inventory.category-created',
  CATEGORY_UPDATED: 'inventory.category-updated',
  CATEGORY_STATUS_CHANGED: 'inventory.category-status-changed',
  ITEM_CATEGORY_CHANGED: 'inventory.item-category-changed',
  /** Stock bajo al cruzar umbral (RF-INV-22 / H4). */
  STOCK_LOW: 'inventory.stock-low',
  /** Venta registrada post-commit (RF-INV-14 / H4). */
  ASSET_SOLD: 'inventory.asset-sold',
} as const;

export type StockLowLevel = 'below-minimum' | 'below-reorder';

export interface StockLowEvent {
  tenantId: string;
  itemId: string;
  sku?: string;
  level: StockLowLevel;
  available: number;
  pending: number;
  minimumStock: number;
  reorderPoint: number;
  stockMovementId?: string;
  actorUserId?: string;
}

export interface AssetSoldEvent {
  tenantId: string;
  itemId?: string;
  serializedAssetId?: string;
  stockMovementId: string;
  quantity: number;
  commercialReference?: string;
  actorUserId?: string;
}

export interface InventoryItemCreatedEvent {
  tenantId: string;
  inventoryItemId: string;
  actorUserId: string;
  sku: string;
  operation: 'create';
}

export interface InventoryItemUpdatedEvent {
  tenantId: string;
  inventoryItemId: string;
  actorUserId: string;
  sku: string;
  operation: 'update';
}

export interface InventoryCatalogOptionRequestedEvent {
  tenantId: string;
  actorUserId: string;
  search?: string;
  resultCount: number;
  operation: 'catalog-options';
}

export interface InventoryCategoryCreatedEvent {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
  operation: 'create';
}

export interface InventoryCategoryUpdatedEvent {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
  operation: 'update';
}

export interface InventoryCategoryStatusChangedEvent {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
  operation: 'status-change';
}

export interface InventoryItemCategoryChangedEvent {
  tenantId: string;
  inventoryItemId: string;
  categoryId: string;
  actorUserId: string;
  operation: 'item-category-changed';
}
