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
} as const;

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
