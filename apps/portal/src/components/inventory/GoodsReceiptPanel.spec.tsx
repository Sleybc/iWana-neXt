import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoodsReceiptStatus, PurchaseOrderStatus } from '@iwana/shared';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';

const order = {
  id: 'po-1',
  tenantId: 'tenant-1',
  orderNumber: 'PO-000001',
  purchaseRequestId: 'pr-1',
  partyRefId: 'supplier-1',
  status: PurchaseOrderStatus.APPROVED,
  expectedDeliveryDate: null,
  approvedByUserId: 'user-1',
  notes: null,
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-25T12:00:00.000Z',
};

const orderLines = [
  {
    id: 'pol-1',
    tenantId: 'tenant-1',
    purchaseOrderId: 'po-1',
    itemId: 'item-1',
    purchaseRequestLineId: null,
    quantity: '5',
    unitCost: '120000',
    receivedQuantity: '0',
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
];

const items = [
  {
    id: 'item-1',
    tenantId: 'tenant-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    category: 'CPE',
    trackingMode: 'SERIALIZED',
    unitOfMeasure: 'unidad',
    baseCost: '120000',
    minimumStock: '2',
    usefulLifeMonths: 36,
    status: 'ACTIVE',
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
] as never;

const locations = [
  {
    id: 'loc-1',
    tenantId: 'tenant-1',
    code: 'BOD-01',
    name: 'Bodega principal',
    type: 'MAIN_WAREHOUSE',
    status: 'ACTIVE',
    responsibleRefId: null,
    maxCapacity: null,
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
] as never;

describe('GoodsReceiptPanel', () => {
  it('precarga líneas pendientes de la orden sin pedir ids manuales', () => {
    render(
      <GoodsReceiptPanel
        order={order}
        orderLines={orderLines}
        items={items}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('ONT-001 · ONT WiFi 6')).toBeInTheDocument();
    expect(screen.queryByLabelText('Id línea OC')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad a recibir')).toHaveValue(5);
  });

  it('envía recepción con líneas precargadas', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <GoodsReceiptPanel
        order={order}
        orderLines={orderLines}
        items={items}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Ubicación destino' }));
    await user.click(screen.getByRole('option', { name: /BOD-01 · Bodega principal/i }));
    await user.click(screen.getByRole('button', { name: 'Registrar recepción' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationLocationId: 'loc-1',
        status: GoodsReceiptStatus.COMPLETED,
        lines: [
          expect.objectContaining({
            purchaseOrderLineId: 'pol-1',
            itemId: 'item-1',
            quantityReceived: 5,
          }),
        ],
      }),
    );
  });
});
