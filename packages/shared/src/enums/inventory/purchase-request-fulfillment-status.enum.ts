/**
 * Estado de abastecimiento derivado de una solicitud de compra.
 *
 * No se persiste: se calcula en servidor a partir de las órdenes de compra
 * asociadas (`purchase_orders`). `PurchaseRequestStatus` describe el ciclo
 * administrativo de la solicitud y se detiene en `CONVERTED_TO_PO`; este eje
 * complementario responde «¿la mercancía ya entró a inventario?».
 */
export enum PurchaseRequestFulfillmentStatus {
  /** Sin órdenes vivas: la solicitud aún no llegó a abastecimiento. */
  NOT_ORDERED = 'NOT_ORDERED',
  /** Hay al menos una orden APPROVED sin recepción registrada. */
  PENDING_RECEIPT = 'PENDING_RECEIPT',
  /** Alguna orden viva está PARTIALLY_RECEIVED. */
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  /** Todas las órdenes vivas quedaron FULLY_RECEIVED o CLOSED. */
  RECEIVED = 'RECEIVED',
}
