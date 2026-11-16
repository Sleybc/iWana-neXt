import type { ListMeta } from '../../dto/pagination.dto';
import type { AssetLifecycleEventType, SerializedAssetStatus } from '../../enums/inventory';

/**
 * Estado derivado de la vida útil de un activo serializado (MOD12, D-H6-5).
 * Es el mismo que calcula la ficha 360 (`GET /inventory/assets/:id` → `usefulLife.status`).
 */
export type UsefulLifeStatus = 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';

/**
 * Vida útil y garantía derivadas de un activo serializado. Misma forma que la
 * sección `usefulLife` de la ficha 360; la API de inventario la calcula con
 * `calculateUsefulLife` y la reutiliza en la lectura por suscriptor.
 */
export interface SerializedAssetUsefulLife {
  monthsTotal: number | null;
  monthsElapsed: number | null;
  monthsRemaining: number | null;
  /** Fecha `YYYY-MM-DD` de fin de garantía; null sin dato. */
  warrantyUntil: string | null;
  status: UsefulLifeStatus;
}

/** Tamaños de página de las secciones paginadas de la lectura por suscriptor. */
export const SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT = 20;
export const SUBSCRIBER_EQUIPMENT_MAX_LIMIT = 100;

/**
 * Un comodato del suscriptor (abierto o cerrado) con los datos del equipo.
 * `executionOrderRefId` y `contractRefId` son referencias opacas a MOD11 y CRM.
 */
export interface SubscriberEquipmentItem {
  loanId: string;
  assetId: string;
  itemName: string;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  /** Estado actual del activo serializado. */
  status: SerializedAssetStatus;
  /** ISO 8601. Inicio del comodato. */
  installedAt: string;
  /** ISO 8601. Cierre del comodato; null si sigue abierto. */
  removedAt: string | null;
  executionOrderRefId: string | null;
  contractRefId: string | null;
  usefulLife: SerializedAssetUsefulLife;
}

/**
 * Línea positiva de material no serializado en la ubicación `CUSTOMER_SITE`
 * del suscriptor (destino «instalado en cliente», D3 de la spec).
 */
export interface SubscriberMaterialItem {
  /** Movimiento de origen. No es único por fila: un movimiento con varios ítems da una fila por ítem. */
  movementId: string;
  movementNumber: string;
  /** ISO 8601. Fecha del movimiento. */
  occurredAt: string;
  itemName: string;
  /** Cantidad positiva como cadena decimal. */
  quantity: string;
  /** Código de unidad de medida del ítem (catálogo `INVENTORY_UNITS_OF_MEASURE`). */
  unitOfMeasure: string;
  executionOrderRefId: string | null;
}

/**
 * Evento del ciclo de vida de un equipo del suscriptor, recortado al periodo de
 * cada comodato (de `installedAt` a `removedAt`, incluido el evento de cierre).
 * No incluye `notes`: es texto libre y puede llevar datos personales.
 */
export interface SubscriberEquipmentHistoryItem {
  id: string;
  assetId: string;
  serialNumber: string | null;
  eventType: AssetLifecycleEventType;
  /** ISO 8601. */
  occurredAt: string;
}

/** Página de una sección; mismo patrón `{ items, meta }` que `ExecutorCustodyResponse`. */
export interface SubscriberEquipmentPage<TItem> {
  items: TItem[];
  meta: ListMeta;
}

/**
 * Contrato congelado A1 v1.0 de
 * `GET /api/v1/inventory/subscribers/:subscriberRefId/equipment`
 * (spec 2026-11-16-mod05-mod12-equipos-del-suscriptor §2.1).
 *
 * - `equipment`: todos los comodatos del suscriptor, sin paginar; primero los
 *   abiertos y después por `installedAt` descendente.
 * - `materials`: paginado por `materialsPage`/`materialsLimit`, del más reciente
 *   al más antiguo.
 * - `history`: paginado por `historyPage`/`historyLimit`, del más reciente al más
 *   antiguo; `historyAssetId` lo filtra a un equipo.
 *
 * Un suscriptor sin comodatos ni materiales (o de otro tenant) responde 200 con
 * colecciones vacías.
 */
export interface SubscriberEquipmentResponse {
  equipment: SubscriberEquipmentItem[];
  materials: SubscriberEquipmentPage<SubscriberMaterialItem>;
  history: SubscriberEquipmentPage<SubscriberEquipmentHistoryItem>;
}

/** Parámetros de consulta (todos opcionales) del mismo endpoint. */
export interface SubscriberEquipmentQuery {
  /** Página 1-based de `materials`. Default 1. */
  materialsPage?: number;
  /** Default 20, máximo 100. */
  materialsLimit?: number;
  /** Página 1-based de `history`. Default 1. */
  historyPage?: number;
  /** Default 20, máximo 100. */
  historyLimit?: number;
  /** UUID de un equipo del suscriptor para filtrar `history`. */
  historyAssetId?: string;
}
