/**
 * Coherencia del maestro itemKind ↔ trackingMode (Fase S2 · CA-S2-01).
 *
 * Única fuente del copy del rechazo: lo importan el backend
 * (`refineInventoryItemMaster`, `apps/api/.../inventory/dto`) y el portal
 * (`apps/portal/.../inventory-labels.ts`, re-export). El texto nombra los
 * campos como los ve el operador — nunca los enums crudos (copy aprobado G1,
 * spec §A5.1).
 */
export const INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE =
  'Tipo de producto y Control de material no coinciden: un producto "Con serial" debe tener Control de material "Con serial" o "Activo fijo". Ajusta Control de material para guardar.';
