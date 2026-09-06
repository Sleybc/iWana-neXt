import { InventoryTrackingMode, SerializedAssetStatus, StockIssueStatus } from '@iwana/shared';

/**
 * Constantes canónicas de seriales en salidas (MOD12 S2.1 · B3).
 *
 * Fuente única para los tres predicados que antes vivían duplicados entre
 * `stock-issue.service.ts` (reserva/integridad/espejo) y
 * `stock-issue-picking.service.ts` (conteo de despachables). La migración 126
 * repite los terminales como literales SQL en el predicado del índice único
 * parcial; la paridad enum TS ↔ predicado SQL queda comprometida en
 * `tests/stock-issue-serial.constants.spec.ts`.
 */

/** Modos de seguimiento que exigen activo serializado concreto en la salida (D2). */
export const SERIALIZED_TRACKING_MODES: ReadonlySet<InventoryTrackingMode> = new Set([
  InventoryTrackingMode.SERIALIZED,
  InventoryTrackingMode.FIXED_ASSET,
]);

/**
 * Estados del activo que permiten su salida. Idéntico al antiguo
 * `PICKABLE_SERIAL_STATUSES` del picking (D3: NEW y REFURBISHED despachables):
 * un solo nombre para el mismo conjunto en ambos servicios.
 */
export const SERIAL_DISPATCHABLE_STATUSES: SerializedAssetStatus[] = [
  SerializedAssetStatus.AVAILABLE,
  SerializedAssetStatus.AVAILABLE_REFURBISHED,
];

/**
 * Estados terminales: una salida en ellos ya no compromete seriales. Orden
 * canónico `[CANCELLED, DISPATCHED, RECEIVED]` (lo afirman los specs de
 * integridad al inspeccionar los parámetros del pre-chequeo).
 */
export const SERIAL_COMMIT_TERMINAL_STATUSES: StockIssueStatus[] = [
  StockIssueStatus.CANCELLED,
  StockIssueStatus.DISPATCHED,
  StockIssueStatus.RECEIVED,
];
