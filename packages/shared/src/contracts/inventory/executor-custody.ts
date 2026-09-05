import type { ListMeta } from '../../dto/pagination.dto';
import type {
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
} from '../../enums/inventory';

/**
 * Registro de activo serializado tal como lo serializa la API de inventario
 * (MOD12). Fuente única del contrato entre apps (`@iwana/shared`); las fechas
 * viajan como cadenas ISO 8601 y los numéricos como cadena decimal.
 *
 * Nota de migración: el portal hoy repite este shape en `apps/portal/src/lib/
 * api-client.ts`; al adoptar este contrato debe importarlo de `@iwana/shared`
 * y eliminar su copia local (no mantener duplicados).
 */
export interface SerializedAssetRecord {
  id: string;
  tenantId: string;
  inventoryItemId: string;
  serialNumber: string | null;
  normalizedSerialNumber: string | null;
  macAddress: string | null;
  normalizedMacAddress: string | null;
  assetTag: string | null;
  currentStatus: SerializedAssetStatus;
  currentLocationId: string | null;
  currentResponsibleType: InventoryResponsibleType;
  currentResponsibleRefId: string | null;
  subscriberRefId: string | null;
  contractRefId: string | null;
  purchaseOrderRef: string | null;
  purchaseDate: string | null;
  usefulLifeMonths: number | null;
  warrantyUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Registro de saldo de stock tal como lo serializa la API de inventario
 * (MOD12). Fuente única del contrato entre apps (`@iwana/shared`); las
 * cantidades viajan como cadena decimal.
 */
export interface StockBalanceRecord {
  id: string;
  tenantId: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  condition: StockBalanceCondition;
  quantityOnHand: string;
  quantityReserved: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Custodia activa del ejecutor: equipos serializados y materiales con stock.
 *
 * Contrato congelado v1 de `GET /api/v1/inventory/custody`
 * (PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0 §1). Sin parámetros,
 * el tipo produce EXACTAMENTE la forma congelada (`items: SerializedAssetRecord[]`,
 * `items: StockBalanceRecord[]`). Los parámetros existen solo como
 * compatibilidad hacia el portal (B2), que instancia con sus aliases locales
 * estructuralmente idénticos; no cambian la respuesta HTTP ni la forma canónica.
 *
 * Sin custodia activa el endpoint responde 200 con `location: null` y ambas
 * colecciones vacías; es un estado normal, no un error.
 */
export interface ExecutorCustodyResponse<
  TAsset = SerializedAssetRecord,
  TBalance = StockBalanceRecord,
> {
  /** Ubicación móvil activa del responsable; null si no tiene custodia activa. */
  location: {
    id: string;
    name: string;
    type: 'MOBILE_TECHNICIAN' | 'MOBILE_CREW';
    responsibleType: 'TECHNICIAN' | 'CREW';
    responsibleRefId: string;
  } | null;
  /** Equipos serializados en la custodia (por página). */
  assets: { items: TAsset[]; meta: ListMeta };
  /** Materiales con stock en la custodia (por página). */
  balances: { items: TBalance[]; meta: ListMeta };
}
