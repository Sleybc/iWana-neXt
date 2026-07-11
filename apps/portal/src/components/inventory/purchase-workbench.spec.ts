import { PurchaseOrderStatus, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { getPurchaseNextAction } from './purchase-workbench';

function buildDetail(
  overrides: Partial<PurchaseRequestDetailRecord['request']> = {},
  orders: PurchaseRequestDetailRecord['orders'] = [],
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
    lines: [],
    quotes: [],
    awards: [],
    orders,
    estimatedAmount: 0,
    approvalPolicy: {
      canApprove: false,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'MANAGER',
    },
    rfq: null,
  };
}

describe('purchase-workbench', () => {
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
        [
          {
            id: 'po-1',
            tenantId: 'tenant-1',
            orderNumber: 'PO-0001',
            purchaseRequestId: 'req-1',
            partyRefId: 'supplier-1',
            status: PurchaseOrderStatus.APPROVED,
            expectedDeliveryDate: null,
            approvedByUserId: null,
            notes: null,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      ),
    );

    expect(action?.suggestedTab).toBe('receipts');
  });

  it('sugiere generar OC cuando la solicitud está aprobada', () => {
    const action = getPurchaseNextAction(
      buildDetail({
        status: PurchaseRequestStatus.APPROVED,
      }),
    );

    expect(action?.suggestedTab).toBe('orders');
  });
});
