import { PurchaseOrderStatus, PurchaseRequestFulfillmentStatus } from '@iwana/shared';

/**
 * Eje de abastecimiento derivado de una solicitud de compra.
 *
 * `PurchaseRequestStatus` describe el ciclo administrativo y se detiene en
 * `CONVERTED_TO_PO`: una vez emitida la orden, la solicitud queda con ese
 * estado para siempre, aunque la mercancía ya haya entrado a inventario. Este
 * resolutor responde el eje complementario —«¿la mercancía ya llegó?»— a
 * partir de las órdenes de compra asociadas, sin persistir nada ni ampliar el
 * enum `purchase_request_status`.
 *
 * Reglas (ÚNICA fuente de verdad del eje; deben mantenerse alineadas con el
 * filtro `kpiPreset=pendingReceipt` de `PurchasingQueryService.listRequests` y
 * con `getPurchaseNextAction` del workbench del portal):
 * 1. Las órdenes `CANCELLED` se ignoran: no cuentan como abastecimiento.
 * 2. Alguna orden viva `PARTIALLY_RECEIVED` → `PARTIALLY_RECEIVED` (gana sobre
 *    el resto: hay mercancía dentro y mercancía pendiente a la vez).
 * 3. Si no, alguna orden `APPROVED` → `PENDING_RECEIPT` (mercancía en tránsito).
 * 4. Si no, alguna orden `FULLY_RECEIVED` o `CLOSED` → `RECEIVED`.
 * 5. Cualquier otro caso —sin órdenes vivas, o solo `DRAFT`/`PENDING_APPROVAL`—
 *    → `NOT_ORDERED`: todavía no hay compromiso de abastecimiento.
 *
 * Las reglas 2 y 3 cubren exactamente el mismo conjunto que el `EXISTS` del
 * preset «Por recibir» (`APPROVED` o `PARTIALLY_RECEIVED`): una solicitud que
 * aparece en ese preset nunca puede resolverse aquí como `RECEIVED`.
 */
export function resolvePurchaseRequestFulfillment(
  orderStatuses: readonly PurchaseOrderStatus[],
): PurchaseRequestFulfillmentStatus {
  let hasApproved = false;
  let hasReceived = false;

  for (const status of orderStatuses) {
    if (status === PurchaseOrderStatus.CANCELLED) {
      continue;
    }

    if (status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      return PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED;
    }

    if (status === PurchaseOrderStatus.APPROVED) {
      hasApproved = true;
      continue;
    }

    if (status === PurchaseOrderStatus.FULLY_RECEIVED || status === PurchaseOrderStatus.CLOSED) {
      hasReceived = true;
    }
  }

  if (hasApproved) {
    return PurchaseRequestFulfillmentStatus.PENDING_RECEIPT;
  }

  if (hasReceived) {
    return PurchaseRequestFulfillmentStatus.RECEIVED;
  }

  return PurchaseRequestFulfillmentStatus.NOT_ORDERED;
}
