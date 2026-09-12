import {
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseOrderRecord, PurchaseRequestDetailRecord } from '@/lib/api-client';
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
    expect(previews[0]?.lines[0]?.unitCostSource).toBe('missing');
  });

  it('nunca emite una orden con costo cero: el faltante lanza error explícito (CA-308)', () => {
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

    expect(() => previewsToCreateOrderDto('pr-001', previews)).toThrow(/costo unitario/);
  });

  it('el costo capturado por el operador (escotilla §7) desbloquea la emisión', () => {
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
    const previews = buildOrdersFromAwards(detail, {
      unitCostOverrides: { 'party-a:line-a': 7500 },
    });

    expect(hasMissingUnitCosts(previews)).toBe(false);
    expect(previews[0]?.lines[0]?.unitCostSource).toBe('override');
    const dto = previewsToCreateOrderDto('pr-001', previews);
    expect(dto.orders?.[0]?.lines[0]?.unitCost).toBe(7500);
  });

  it('adenda §12.5: el snapshot del award de escotilla pre-rellena el costo sin captura del operador', () => {
    const detail = buildDetail({
      awards: [
        {
          id: 'award-a',
          tenantId: 'tenant-001',
          purchaseRequestLineId: 'line-a',
          supplierQuoteId: null,
          awardedPartyRefId: 'party-a',
          awardedQuantity: '2.00',
          unitCost: '7500.00',
          currency: null,
          awardNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const previews = buildOrdersFromAwards(detail);

    expect(hasMissingUnitCosts(previews)).toBe(false);
    expect(previews[0]?.lines[0]?.unitCostSource).toBe('award');
    expect(previews[0]?.lines[0]?.unitCost).toBe(7500);
    const dto = previewsToCreateOrderDto('pr-001', previews);
    expect(dto.orders?.[0]?.lines[0]?.unitCost).toBe(7500);
  });

  it('adenda §12.5: el snapshot del award precede a la línea de cotización', () => {
    const detail = buildDetail({
      awards: [
        {
          id: 'award-a',
          tenantId: 'tenant-001',
          purchaseRequestLineId: 'line-a',
          supplierQuoteId: 'quote-a',
          awardedPartyRefId: 'party-a',
          awardedQuantity: '2.00',
          unitCost: '8100.00',
          currency: 'COP',
          awardNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const previews = buildOrdersFromAwards(detail);

    expect(previews[0]?.lines[0]?.unitCostSource).toBe('award');
    expect(previews[0]?.lines[0]?.unitCost).toBe(8100);
  });

  it('la guarda de moneda rechaza líneas del mismo proveedor en monedas distintas', () => {
    const detail = buildDetail({
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
          id: 'quote-c',
          tenantId: 'tenant-001',
          purchaseRequestId: 'pr-001',
          partyRefId: 'party-a',
          quoteNumber: 'Q-C',
          amount: '10.00',
          shippingCost: '0.00',
          currency: 'USD',
          validUntil: null,
          notes: null,
          lines: [
            {
              id: 'ql-c',
              tenantId: 'tenant-001',
              supplierQuoteId: 'quote-c',
              purchaseRequestLineId: 'line-b',
              quantity: '1.00',
              unitCost: '10.00',
              lineAmount: '10.00',
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
          supplierQuoteId: 'quote-c',
          awardedPartyRefId: 'party-a',
          awardedQuantity: '1.00',
          awardNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const previews = buildOrdersFromAwards(detail);

    expect(previews).toHaveLength(1);
    expect(() => previewsToCreateOrderDto('pr-001', previews)).toThrow(/monedas distintas/);
  });

  it('segunda tanda: excluye líneas ordenadas con orden viva y emite solo lo pendiente (DEF-AWD-002)', () => {
    const liveOrder: PurchaseOrderRecord = {
      id: 'po-1',
      tenantId: 'tenant-001',
      orderNumber: 'OC-0001',
      purchaseRequestId: 'pr-001',
      partyRefId: 'party-a',
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      notes: null,
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    const detail = buildDetail({
      lines: [
        {
          ...buildDetail().lines[0]!,
          id: 'line-a',
          lineStatus: PurchaseRequestLineStatus.ORDERED,
        },
        { ...buildDetail().lines[1]!, id: 'line-b', lineStatus: PurchaseRequestLineStatus.AWARDED },
      ],
      orders: [liveOrder],
    });

    const previews = buildOrdersFromAwards(detail, {
      supplierLabels: { 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' },
    });

    // La primera tanda (Proveedor A) sigue intacta en el servidor pero no se
    // re-oferta: solo lo pendiente (Proveedor B) llega al payload batch.
    expect(previews).toHaveLength(1);
    expect(previews[0]).toEqual(
      expect.objectContaining({ partyRefId: 'party-b', partyLabel: 'Proveedor B' }),
    );
    expect(previews[0]?.lines).toHaveLength(1);
    expect(previews[0]?.lines[0]).toEqual(
      expect.objectContaining({ purchaseRequestLineId: 'line-b', unitCost: 1050000 }),
    );
    expect(canGenerateOrdersFromAwards(detail)).toBe(true);

    const dto = previewsToCreateOrderDto('pr-001', previews);
    expect(dto.orders).toHaveLength(1);
    expect(dto.orders?.[0]?.partyRefId).toBe('party-b');
    expect(dto.orders?.[0]?.lines[0]?.purchaseRequestLineId).toBe('line-b');
  });

  it('primera tanda intacta: sin órdenes vivas el preview batch ofrece todo lo adjudicado', () => {
    const previews = buildOrdersFromAwards(buildDetail());

    expect(previews).toHaveLength(2);
    expect(
      previews.flatMap((preview) => preview.lines.map((line) => line.purchaseRequestLineId)).sort(),
    ).toEqual(['line-a', 'line-b']);
  });

  it('orden cancelada no consume adjudicación: la línea se vuelve a ofertar', () => {
    const cancelledOrder: PurchaseOrderRecord = {
      id: 'po-1',
      tenantId: 'tenant-001',
      orderNumber: 'OC-0001',
      purchaseRequestId: 'pr-001',
      partyRefId: 'party-a',
      status: PurchaseOrderStatus.CANCELLED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      cancellationReason: 'Anulada por el operador',
      cancelledByUserId: 'user-1',
      closedByUserId: null,
      notes: null,
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    const detail = buildDetail({
      lines: [
        {
          ...buildDetail().lines[0]!,
          id: 'line-a',
          lineStatus: PurchaseRequestLineStatus.ORDERED,
        },
        { ...buildDetail().lines[1]!, id: 'line-b', lineStatus: PurchaseRequestLineStatus.AWARDED },
      ],
      orders: [cancelledOrder],
    });

    const previews = buildOrdersFromAwards(detail);

    expect(previews).toHaveLength(2);
  });

  it('todo ordenado con órdenes vivas: sin preview batch ni emisión', () => {
    const base = buildDetail();
    const orders: PurchaseOrderRecord[] = ['party-a', 'party-b'].map((partyRefId, index) => ({
      id: `po-${index + 1}`,
      tenantId: 'tenant-001',
      orderNumber: `OC-000${index + 1}`,
      purchaseRequestId: 'pr-001',
      partyRefId,
      status: PurchaseOrderStatus.APPROVED,
      expectedDeliveryDate: null,
      approvedByUserId: 'user-1',
      cancellationReason: null,
      cancelledByUserId: null,
      closedByUserId: null,
      notes: null,
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }));
    const detail = buildDetail({
      lines: base.lines.map((line) => ({ ...line, lineStatus: PurchaseRequestLineStatus.ORDERED })),
      orders,
    });

    expect(buildOrdersFromAwards(detail)).toEqual([]);
    expect(canGenerateOrdersFromAwards(detail)).toBe(false);
  });
});
