import { PurchaseOrderStatus, PurchaseRequestFulfillmentStatus } from '@iwana/shared';
import { resolvePurchaseRequestFulfillment } from './purchase-request-fulfillment';

describe('resolvePurchaseRequestFulfillment', () => {
  it('sin órdenes devuelve NOT_ORDERED', () => {
    expect(resolvePurchaseRequestFulfillment([])).toBe(
      PurchaseRequestFulfillmentStatus.NOT_ORDERED,
    );
  });

  it('solo órdenes DRAFT o PENDING_APPROVAL devuelve NOT_ORDERED', () => {
    expect(
      resolvePurchaseRequestFulfillment([
        PurchaseOrderStatus.DRAFT,
        PurchaseOrderStatus.PENDING_APPROVAL,
      ]),
    ).toBe(PurchaseRequestFulfillmentStatus.NOT_ORDERED);
  });

  it('ignora las órdenes canceladas', () => {
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.CANCELLED])).toBe(
      PurchaseRequestFulfillmentStatus.NOT_ORDERED,
    );
    expect(
      resolvePurchaseRequestFulfillment([
        PurchaseOrderStatus.CANCELLED,
        PurchaseOrderStatus.CLOSED,
      ]),
    ).toBe(PurchaseRequestFulfillmentStatus.RECEIVED);
  });

  it('una orden APPROVED devuelve PENDING_RECEIPT', () => {
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.APPROVED])).toBe(
      PurchaseRequestFulfillmentStatus.PENDING_RECEIPT,
    );
  });

  it('una orden PARTIALLY_RECEIVED devuelve PARTIALLY_RECEIVED', () => {
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.PARTIALLY_RECEIVED])).toBe(
      PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED,
    );
  });

  it('PARTIALLY_RECEIVED prevalece sobre APPROVED y sobre las recibidas', () => {
    expect(
      resolvePurchaseRequestFulfillment([
        PurchaseOrderStatus.CLOSED,
        PurchaseOrderStatus.APPROVED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
      ]),
    ).toBe(PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED);
  });

  it('APPROVED prevalece sobre FULLY_RECEIVED y CLOSED', () => {
    expect(
      resolvePurchaseRequestFulfillment([
        PurchaseOrderStatus.FULLY_RECEIVED,
        PurchaseOrderStatus.APPROVED,
      ]),
    ).toBe(PurchaseRequestFulfillmentStatus.PENDING_RECEIPT);
    expect(
      resolvePurchaseRequestFulfillment([PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.APPROVED]),
    ).toBe(PurchaseRequestFulfillmentStatus.PENDING_RECEIPT);
  });

  it('FULLY_RECEIVED o CLOSED sin órdenes pendientes devuelve RECEIVED', () => {
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.FULLY_RECEIVED])).toBe(
      PurchaseRequestFulfillmentStatus.RECEIVED,
    );
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.CLOSED])).toBe(
      PurchaseRequestFulfillmentStatus.RECEIVED,
    );
    expect(
      resolvePurchaseRequestFulfillment([
        PurchaseOrderStatus.FULLY_RECEIVED,
        PurchaseOrderStatus.CLOSED,
        PurchaseOrderStatus.DRAFT,
      ]),
    ).toBe(PurchaseRequestFulfillmentStatus.RECEIVED);
  });

  it('reproduce el caso PR-000001: orden CLOSED tras recibir la mercancía', () => {
    expect(resolvePurchaseRequestFulfillment([PurchaseOrderStatus.CLOSED])).toBe(
      PurchaseRequestFulfillmentStatus.RECEIVED,
    );
  });

  describe('alineación con el filtro kpiPreset=pendingReceipt', () => {
    // El preset filtra por EXISTS sobre APPROVED o PARTIALLY_RECEIVED: toda
    // combinación que lo satisface debe resolverse aquí como "aún por recibir",
    // nunca como RECEIVED (ese fue el defecto original del listado).
    const pendingReceiptOrderStatuses = [
      PurchaseOrderStatus.APPROVED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    ];
    const otherStatuses = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.PENDING_APPROVAL,
      PurchaseOrderStatus.FULLY_RECEIVED,
      PurchaseOrderStatus.CANCELLED,
      PurchaseOrderStatus.CLOSED,
    ];

    it.each(pendingReceiptOrderStatuses)(
      'una orden %s mantiene la solicitud fuera de RECEIVED',
      (pendingStatus) => {
        for (const companion of [...otherStatuses, ...pendingReceiptOrderStatuses]) {
          const resolved = resolvePurchaseRequestFulfillment([pendingStatus, companion]);
          expect(resolved).not.toBe(PurchaseRequestFulfillmentStatus.RECEIVED);
          expect(resolved).not.toBe(PurchaseRequestFulfillmentStatus.NOT_ORDERED);
        }
      },
    );

    it('sin órdenes APPROVED ni PARTIALLY_RECEIVED nunca queda en un estado del preset', () => {
      for (const status of otherStatuses) {
        const resolved = resolvePurchaseRequestFulfillment([status]);
        expect([
          PurchaseRequestFulfillmentStatus.NOT_ORDERED,
          PurchaseRequestFulfillmentStatus.RECEIVED,
        ]).toContain(resolved);
      }
    });
  });
});
