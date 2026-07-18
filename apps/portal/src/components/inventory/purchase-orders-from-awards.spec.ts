import { PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import {
  buildOrdersFromAwards,
  canGenerateOrdersFromAwards,
  hasMissingUnitCosts,
  previewsToCreateOrderDto,
} from './purchase-orders-from-awards';

function buildDetail(
  overrides?: Partial<PurchaseRequestDetailRecord>,
): PurchaseRequestDetailRecord {
  return {
    request: {
      id: 'pr-001',
      tenantId: 'tenant-001',
      requestNumber: 'PR-1',
      title: 'Solicitud demo',
      status: PurchaseRequestStatus.APPROVED,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: 'NORMAL' as never,
      requestedByUserId: 'user-1',
      requestingArea: null,
      justification: null,
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: 'user-1',
      neededByDate: null,
      notes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    lines: [
      {
        id: 'line-a',
        tenantId: 'tenant-001',
        purchaseRequestId: 'pr-001',
        sourceKind: 'INVENTORY_ITEM' as never,
        inventoryItemId: 'item-a',
        freeTextDescription: null,
        quantityRequested: '2.00',
        unitOfMeasure: 'unidad',
        suggestedPartyRefId: null,
        lineStatus: 'AWARDED' as never,
        notes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'line-b',
        tenantId: 'tenant-001',
        purchaseRequestId: 'pr-001',
        sourceKind: 'INVENTORY_ITEM' as never,
        inventoryItemId: 'item-b',
        freeTextDescription: null,
        quantityRequested: '1.00',
        unitOfMeasure: 'unidad',
        suggestedPartyRefId: null,
        lineStatus: 'AWARDED' as never,
        notes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    quotes: [
      {
        id: 'quote-a',
        tenantId: 'tenant-001',
        purchaseRequestId: 'pr-001',
        partyRefId: 'party-a',
        quoteNumber: 'Q-A',
        amount: '16000.00',
        shippingCost: '0.00',
        currency: 'COP',
        validUntil: null,
        notes: null,
        lines: [
          {
            id: 'ql-a',
            tenantId: 'tenant-001',
            supplierQuoteId: 'quote-a',
            purchaseRequestLineId: 'line-a',
            quantity: '2.00',
            unitCost: '8000.00',
            lineAmount: '16000.00',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'quote-b',
        tenantId: 'tenant-001',
        purchaseRequestId: 'pr-001',
        partyRefId: 'party-b',
        quoteNumber: 'Q-B',
        amount: '1050000.00',
        shippingCost: '0.00',
        currency: 'COP',
        validUntil: null,
        notes: null,
        lines: [
          {
            id: 'ql-b',
            tenantId: 'tenant-001',
            supplierQuoteId: 'quote-b',
            purchaseRequestLineId: 'line-b',
            quantity: '1.00',
            unitCost: '1050000.00',
            lineAmount: '1050000.00',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    awards: [
      {
        id: 'award-a',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-a',
        supplierQuoteId: 'quote-a',
        awardedPartyRefId: 'party-a',
        awardedQuantity: '2.00',
        awardNotes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'award-b',
        tenantId: 'tenant-001',
        purchaseRequestLineId: 'line-b',
        supplierQuoteId: 'quote-b',
        awardedPartyRefId: 'party-b',
        awardedQuantity: '1.00',
        awardNotes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    orders: [],
    estimatedAmount: 1066000,
    approvalPolicy: {
      canApprove: true,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'BUYER_MANAGER',
    },
    rfq: null,
    ...overrides,
  };
}

describe('purchase-orders-from-awards', () => {
  it('agrupa awards en dos órdenes con unitCost desde quote lines (CA-20-01/02/03)', () => {
    const previews = buildOrdersFromAwards(buildDetail(), {
      supplierLabels: { 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' },
    });

    expect(previews).toHaveLength(2);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        partyRefId: 'party-a',
        partyLabel: 'Proveedor A',
        subtotal: 16000,
      }),
    );
    expect(previews[0]?.lines[0]).toEqual(
      expect.objectContaining({
        purchaseRequestLineId: 'line-a',
        itemId: 'item-a',
        quantity: 2,
        unitCost: 8000,
        unitCostSource: 'quote',
      }),
    );
    expect(previews[1]?.lines[0]).toEqual(
      expect.objectContaining({
        purchaseRequestLineId: 'line-b',
        unitCost: 1050000,
      }),
    );

    const dto = previewsToCreateOrderDto('pr-001', previews);
    expect(dto.orders).toHaveLength(2);
    expect(dto.partyRefId).toBeUndefined();
    expect(dto.orders?.[0]?.lines[0]?.purchaseRequestLineId).toBe('line-a');
    expect(dto.orders?.[1]?.partyRefId).toBe('party-b');
  });

  it('sin awards no ofrece batch (CA-20-04)', () => {
    const detail = buildDetail({ awards: [] });
    expect(canGenerateOrdersFromAwards(detail)).toBe(false);
    expect(buildOrdersFromAwards(detail)).toEqual([]);
  });

  it('marca costos faltantes cuando no hay quote line', () => {
    const detail = buildDetail({
      awards: [
        {
          id: 'award-a',
          tenantId: 'tenant-001',
          purchaseRequestLineId: 'line-a',
          supplierQuoteId: null,
          awardedPartyRefId: 'party-a',
          awardedQuantity: '2.00',
          awardNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const previews = buildOrdersFromAwards(detail);
    expect(hasMissingUnitCosts(previews)).toBe(true);
  });
});
