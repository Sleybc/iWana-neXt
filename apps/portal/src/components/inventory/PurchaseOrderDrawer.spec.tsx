import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';

jest.mock('./SupplierPicker', () => ({
  SupplierPicker: () => <div>SupplierPicker</div>,
}));

function buildDetail(): PurchaseRequestDetailRecord {
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
      neededByDate: '2026-09-20',
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
      approvalLevel: 'BUYER',
    },
    rfq: null,
  };
}

describe('PurchaseOrderDrawer', () => {
  it('muestra preview batch y envía orders[] (CA-20-01/06)', async () => {
    const user = userEvent.setup();
    const onCreateOrder = jest.fn().mockResolvedValue(undefined);
    const onOrderCreated = jest.fn();
    const detail = buildDetail();

    render(
      <PurchaseOrderDrawer
        open
        request={detail.request}
        detail={detail}
        items={[
          {
            id: 'item-a',
            sku: 'SKU-A',
            name: 'Cable',
          } as never,
          {
            id: 'item-b',
            sku: 'SKU-B',
            name: 'Switch',
          } as never,
        ]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
        latestOrder={null}
        createError={null}
        isSubmittingOrder={false}
        onClose={jest.fn()}
        onCreateOrder={onCreateOrder}
        onOrderCreated={onOrderCreated}
      />,
    );

    expect(screen.getByText(/Órdenes de compra desde adjudicación/i)).toBeInTheDocument();
    expect(screen.getByText('Proveedor A')).toBeInTheDocument();
    expect(screen.getByText('Proveedor B')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Generar 2 órdenes/i }));

    expect(onCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseRequestId: 'pr-001',
        orders: expect.arrayContaining([
          expect.objectContaining({
            partyRefId: 'party-a',
            expectedDeliveryDate: '2026-09-20',
            lines: [
              expect.objectContaining({
                purchaseRequestLineId: 'line-a',
                unitCost: 8000,
              }),
            ],
          }),
          expect.objectContaining({
            partyRefId: 'party-b',
            expectedDeliveryDate: '2026-09-20',
          }),
        ]),
      }),
    );
    expect(onOrderCreated).not.toHaveBeenCalled();
    expect(await screen.findByText(/2 órdenes de compra generadas/i)).toBeInTheDocument();
  });

  it('precarga entrega esperada desde la fecha requerida de la solicitud', () => {
    const detail = buildDetail();
    detail.request.neededByDate = '2026-09-20T00:00:00.000Z';

    render(
      <PurchaseOrderDrawer
        open
        request={detail.request}
        detail={detail}
        items={[{ id: 'item-a', sku: 'SKU-A', name: 'Cable' } as never]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
        latestOrder={null}
        createError={null}
        isSubmittingOrder={false}
        onClose={jest.fn()}
        onCreateOrder={jest.fn()}
        onOrderCreated={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Entrega esperada/i })).toHaveTextContent(
      '20/09/2026',
    );
  });

  it('no navega si el create falla (CA-22-01)', async () => {
    const user = userEvent.setup();
    const onCreateOrder = jest.fn().mockRejectedValue(new Error('falló'));
    const onOrderCreated = jest.fn();
    const detail = buildDetail();

    render(
      <PurchaseOrderDrawer
        open
        request={detail.request}
        detail={detail}
        items={[{ id: 'item-a', sku: 'SKU-A', name: 'Cable' } as never]}
        supplierLabels={{ 'party-a': 'Proveedor A', 'party-b': 'Proveedor B' }}
        latestOrder={null}
        createError="No fue posible crear las órdenes"
        isSubmittingOrder={false}
        onClose={jest.fn()}
        onCreateOrder={onCreateOrder}
        onOrderCreated={onOrderCreated}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Generar 2 órdenes/i }));
    expect(onOrderCreated).not.toHaveBeenCalled();
    expect(screen.getByText('No fue posible crear las órdenes de compra')).toBeInTheDocument();
  });
});
