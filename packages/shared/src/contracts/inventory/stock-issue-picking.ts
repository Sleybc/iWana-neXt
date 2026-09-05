import type {
  InventoryTrackingMode,
  StockBalanceCondition,
} from '../../enums/inventory';

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
