import type { InventoryTrackingMode, StockBalanceCondition } from '../../enums/inventory';

/**
 * Disponibilidad de un ítem elegible para salida, desglosada por condición.
 *
 * Contrato congelado v1 de `GET /api/v1/inventory/issues/pickable-items`
 * (SPEC MOD12 Salidas picking Fase S1 §5.1). Cantidades como cadena decimal,
 * coherente con `StockBalanceRecord` y con `numeric(12,2)` de stock_balances.
 */
export interface StockIssuePickableAvailability {
  condition: StockBalanceCondition;
  quantityOnHand: string;
  quantityReserved: string;
  available: string;
}

/**
 * Lote con saldo disponible para un ítem elegible.
 */
export interface StockIssuePickableLot {
  lotId: string;
  lotNumber: string;
  expiryDate: string | null;
  condition: StockBalanceCondition;
  available: string;
}

/**
 * Ítem elegible para una salida desde una bodega de origen.
 *
 * `totalAvailable` es la suma del disponible de todas las condiciones.
 * `availableSerialCount` cuenta seriales en AVAILABLE / AVAILABLE_REFURBISHED
 * para esa bodega; no es decimal sino conteo.
 */
export interface StockIssuePickableItem {
  itemId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unitOfMeasure: string;
  trackingMode: InventoryTrackingMode;
  assetControlled: boolean;
  availability: StockIssuePickableAvailability[];
  totalAvailable: string;
  lots: StockIssuePickableLot[];
  availableSerialCount: number;
}

/**
 * Línea de salida en el payload de entrada de `POST /api/v1/inventory/issues`
 * y `PATCH /api/v1/inventory/issues/:id`.
 *
 * Contrato congelado v2 (SPEC MOD12 Salidas Fase S2 §5.1 · decisión D2): la
 * línea puede llevar un grupo de seriales (`serializedAssetIds`) con cantidad
 * igual al tamaño del grupo. `serializedAssetId` singular se mantiene como
 * campo de transición de S1 y el API lo normaliza a un arreglo de un elemento
 * en el borde del schema.
 */
export interface StockIssueLineInput {
  itemId: string;
  /**
   * Cantidad solicitada. El API acepta número o cadena decimal y la normaliza;
   * las lecturas del contrato la exponen como cadena decimal (`numeric(12,2)`).
   */
  requestedQty: string | number;
  lotId?: string | null;
  /**
   * @deprecated Campo de transición S1: se normaliza a `serializedAssetIds` de
   * un elemento. Su retiro está declarado como fase de limpieza posterior.
   */
  serializedAssetId?: string | null;
  /**
   * Grupo de seriales de la línea: uuids únicos, arreglo no vacío. Para ítems
   * con seguimiento serializado (`SERIALIZED`, `FIXED_ASSET`) su longitud debe
   * coincidir con `requestedQty`; las validaciones de pertenencia, bodega y
   * estado de cada serial aplican uno a uno.
   */
  serializedAssetIds?: string[];
  condition?: StockBalanceCondition;
}

/**
 * Serial de una línea en la lectura del detalle de una salida
 * (`GET /api/v1/inventory/issues/:id`): id del activo más su número de serie
 * legible (SPEC MOD12 S2 §5.5), para que el borrador de edición reconstruya
 * el grupo sin heurística de reagrupación.
 */
export interface StockIssueLineSerialRef {
  id: string;
  serialNumber: string;
}

/**
 * Línea de salida en la lectura del detalle de una salida
 * (`GET /api/v1/inventory/issues/:id`).
 *
 * Contrato de lectura v2.1 (SPEC MOD12 S2 §5.5, enmienda autorizada por
 * AI-EM-ARCH): v2 exponía el grupo como `serializedAssetIds: string[]` (B1);
 * v2.1 lo expone como `serializedAssets` (id + número de serie legible) para
 * que el borrador de edición reconstruya el grupo sin heurística de
 * reagrupación.
 *
 * Cantidades como cadena decimal, coherente con `numeric(12,2)` de
 * `stock_issue_lines` y con el contrato v1 de picking.
 */
export interface StockIssueLineRecord {
  id: string;
  tenantId: string;
  issueId: string;
  itemId: string;
  requestedQty: string;
  dispatchedQty: string | null;
  lotId: string | null;
  /**
   * Número de lote legible (enriquecido en lectura por el API con batch sobre
   * `stock_lots`; lote capturado al registrar la compra). Opcional durante el
   * despliegue: ausente = sin lote o lote huérfano; el cliente degrada.
   */
  lotNumber?: string | null;
  /**
   * Serial de transición S1: la persistencia lo alimenta con el primer serial
   * del grupo para no romper lecturas ni reportes existentes.
   */
  serializedAssetId: string | null;
  /**
   * Grupo de seriales de la línea (lectura v2.1, MOD12 S2 §5.5): id + número
   * de serie legible por elemento; vacío para ítems no serializados.
   */
  serializedAssets: StockIssueLineSerialRef[];
  condition: StockBalanceCondition;
  createdAt: string;
  updatedAt: string;
}
