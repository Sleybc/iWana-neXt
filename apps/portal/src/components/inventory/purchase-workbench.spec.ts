import {
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { getPurchaseNextAction, PURCHASE_WORKBENCH_TAB_LABELS } from './purchase-workbench';

function buildDetail(
  overrides: Partial<PurchaseRequestDetailRecord['request']> = {},
  extras: Partial<
    Pick<PurchaseRequestDetailRecord, 'lines' | 'awards' | 'orders' | 'approvalPolicy'>
  > = {},
): PurchaseRequestDetailRecord {
  return {
    request: {
      id: 'req-1',
      tenantId: 'tenant-1',
      requestNumber: 'SC-001',
      title: 'Reposición',
      status: PurchaseRequestStatus.PENDING_QUOTES,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: 'NORMAL' as PurchaseRequestDetailRecord['request']['priority'],
      requestedByUserId: 'user-1',
      requestingArea: 'Operaciones',
      justification: null,
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: null,
      neededByDate: null,
      notes: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      ...overrides,
    },
    lines: extras.lines ?? [],
    quotes: [],
    awards: extras.awards ?? [],
    orders: extras.orders ?? [],
    estimatedAmount: 0,
    approvalPolicy: extras.approvalPolicy ?? {
      canApprove: false,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'MANAGER',
    },
    rfq: null,
  };
}

describe('purchase-workbench', () => {
  it('incluye la pestaña de adjudicación entre aprobación y órdenes', () => {
    expect(PURCHASE_WORKBENCH_TAB_LABELS.awards).toBe('Adjudicación');
    const tabs = Object.keys(PURCHASE_WORKBENCH_TAB_LABELS);
    expect(tabs.indexOf('awards')).toBe(tabs.indexOf('approval') + 1);
    expect(tabs.indexOf('orders')).toBe(tabs.indexOf('awards') + 1);
  });

  it('sugiere cotización cuando la solicitud está pendiente de cotizaciones', () => {
    const action = getPurchaseNextAction(buildDetail());
    expect(action).toEqual({
      message: 'Registrar al menos una cotización para continuar el flujo.',
      suggestedTab: 'quotes',
    });
  });

  it('sugiere recepción cuando hay OC pendiente', () => {
    const action = getPurchaseNextAction(
      buildDetail(
        {
          status: PurchaseRequestStatus.CONVERTED_TO_PO,
        },
        {
          orders: [
            {
              id: 'po-1',
              tenantId: 'tenant-1',
              orderNumber: 'PO-0001',
              purchaseRequestId: 'req-1',
              partyRefId: 'supplier-1',
              status: PurchaseOrderStatus.APPROVED,
              expectedDeliveryDate: null,
              approvedByUserId: null,
              cancellationReason: null,
              cancelledByUserId: null,
              closedByUserId: null,
              notes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      ),
    );

    expect(action?.suggestedTab).toBe('receipts');
  });

  it('afirma estados terminales sin sugerir el siguiente paso', () => {
    expect(getPurchaseNextAction(buildDetail({ status: PurchaseRequestStatus.REJECTED }))).toEqual({
      message: 'Esta solicitud fue rechazada. No hay más pasos en el flujo.',
      suggestedTab: 'summary',
      terminal: true,
    });
    expect(getPurchaseNextAction(buildDetail({ status: PurchaseRequestStatus.CANCELLED }))).toEqual(
      {
        message: 'Esta solicitud fue cancelada. No hay más pasos en el flujo.',
        suggestedTab: 'summary',
        terminal: true,
      },
    );
  });

  it('afirma cierre cuando la OC ya está recibida', () => {
    const action = getPurchaseNextAction(
      buildDetail(
        {
          status: PurchaseRequestStatus.CONVERTED_TO_PO,
        },
        {
          orders: [
            {
              id: 'po-1',
              tenantId: 'tenant-1',
              orderNumber: 'PO-0001',
              purchaseRequestId: 'req-1',
              partyRefId: 'supplier-1',
              status: PurchaseOrderStatus.FULLY_RECEIVED,
              expectedDeliveryDate: null,
              approvedByUserId: null,
              cancellationReason: null,
              cancelledByUserId: null,
              closedByUserId: null,
              notes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      ),
    );

    expect(action).toEqual({
      message: 'La mercancía ya fue recibida. El flujo de esta solicitud está cerrado.',
      suggestedTab: 'receipts',
      terminal: true,
    });
  });

  it('sugiere adjudicación cuando hay líneas awardables pendientes', () => {
    const action = getPurchaseNextAction(
      buildDetail(
        {
          status: PurchaseRequestStatus.APPROVED,
        },
        {
          lines: [
            {
              id: 'line-1',
              tenantId: 'tenant-1',
              purchaseRequestId: 'req-1',
              sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
              inventoryItemId: 'item-1',
              freeTextDescription: null,
              quantityRequested: '10',
              unitOfMeasure: 'unidad',
              suggestedPartyRefId: null,
              lineStatus: PurchaseRequestLineStatus.OPEN,
              notes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      ),
    );

    expect(action).toEqual({
      message: 'Adjudica las líneas aprobadas antes de generar la orden.',
      suggestedTab: 'awards',
    });
  });

  it('sugiere generar OC cuando la solicitud está aprobada sin awardables pendientes', () => {
    const action = getPurchaseNextAction(
      buildDetail({
        status: PurchaseRequestStatus.APPROVED,
      }),
    );

    expect(action?.suggestedTab).toBe('orders');
  });

  it('sugiere generar OC cuando las líneas awardables ya están adjudicadas', () => {
    const action = getPurchaseNextAction(
      buildDetail(
        {
          status: PurchaseRequestStatus.APPROVED,
        },
        {
          lines: [
            {
              id: 'line-1',
              tenantId: 'tenant-1',
              purchaseRequestId: 'req-1',
              sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
              inventoryItemId: 'item-1',
              freeTextDescription: null,
              quantityRequested: '10',
              unitOfMeasure: 'unidad',
              suggestedPartyRefId: null,
              lineStatus: PurchaseRequestLineStatus.AWARDED,
              notes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
          awards: [
            {
              id: 'award-1',
              tenantId: 'tenant-1',
              purchaseRequestLineId: 'line-1',
              supplierQuoteId: null,
              awardedPartyRefId: 'supplier-1',
              awardedQuantity: '10',
              awardNotes: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        },
      ),
    );

    expect(action?.suggestedTab).toBe('orders');
  });
});
