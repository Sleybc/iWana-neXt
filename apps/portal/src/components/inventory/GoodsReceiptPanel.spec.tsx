import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoodsReceiptStatus, PurchaseOrderStatus } from '@iwana/shared';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import { formatInventoryDate, formatInventoryDateTime } from './inventory-labels';

jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: ({
    label,
    onChange,
  }: {
    label?: string;
    onChange: (id: string | null, item: { id: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      aria-label={label ?? 'Ubicación destino'}
      onClick={() => onChange('loc-1', { id: 'loc-1', label: 'BOD-01 · Bodega principal' })}
    >
      Elegir bodega
    </button>
  ),
}));

function formatLocalDayMonthYear(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

const order = {
  id: 'po-1',
  tenantId: 'tenant-1',
  orderNumber: 'PO-000001',
  purchaseRequestId: 'pr-1',
  partyRefId: 'supplier-1',
  status: PurchaseOrderStatus.APPROVED,
  expectedDeliveryDate: null,
  approvedByUserId: 'user-1',
  cancellationReason: null,
  cancelledByUserId: null,
  closedByUserId: null,
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

  it('muestra nombre de proveedor y fecha requerida como fallback de entrega', () => {
    render(
      <GoodsReceiptPanel
        order={{ ...order, expectedDeliveryDate: null }}
        orders={[
          { ...order, expectedDeliveryDate: null },
          { ...order, id: 'po-2', orderNumber: 'PO-000002', partyRefId: 'supplier-2' },
        ]}
        orderLines={orderLines}
        items={items}
        locations={locations}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa', 'supplier-2': 'Proveedor Beta' }}
        fallbackExpectedDeliveryDate="2026-08-15"
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Orden de compra' })).toHaveTextContent(
      /Proveedor Alfa/,
    );
    expect(screen.queryByText(/Proveedor no identificado/i)).not.toBeInTheDocument();
    expect(screen.getByText(formatInventoryDate('2026-08-15'))).toBeInTheDocument();
  });

  it('usa la fecha enriquecida de orders[] aunque order.expectedDeliveryDate sea null', () => {
    render(
      <GoodsReceiptPanel
        order={{ ...order, expectedDeliveryDate: null }}
        orders={[{ ...order, expectedDeliveryDate: '2026-10-01' }]}
        orderLines={orderLines}
        items={items}
        locations={locations}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        fallbackExpectedDeliveryDate={null}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(formatInventoryDate('2026-10-01'))).toBeInTheDocument();
    expect(screen.queryByText('Sin fecha')).not.toBeInTheDocument();
  });

  it('usa el DatePicker iWana para la fecha de recepción', async () => {
    const user = userEvent.setup();
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

    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    const dateTrigger = screen.getByRole('button', { name: /Fecha de recepción/i });
    expect(dateTrigger).toHaveTextContent(formatLocalDayMonthYear(new Date()));

    await user.click(dateTrigger);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('muestra la fecha de recepción guardada tras registrar (no la entrega esperada)', () => {
    const receivedAt = '2026-07-17T05:00:00.000Z';
    render(
      <GoodsReceiptPanel
        order={{ ...order, status: PurchaseOrderStatus.FULLY_RECEIVED, expectedDeliveryDate: null }}
        orderLines={[{ ...orderLines[0]!, receivedQuantity: '5' }]}
        items={items}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={{
          receipt: {
            id: 'gr-1',
            tenantId: 'tenant-1',
            receiptNumber: 'GR-000001',
            purchaseOrderId: 'po-1',
            status: GoodsReceiptStatus.COMPLETED,
            receivedAt,
            receivedByUserId: 'user-1',
            notes: null,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          },
          movement: {
            id: 'mov-1',
            tenantId: 'tenant-1',
            movementNumber: 'MOV-000001',
            movementType: 'RECEIPT' as never,
            status: 'POSTED' as never,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          } as never,
          lines: [{ id: 'ml-1' } as never],
        }}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('Fecha de recepción')).toBeInTheDocument();
    expect(screen.getByText(formatInventoryDate(receivedAt))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Fecha de recepción: ${formatInventoryDateTime(receivedAt)}`)),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin fecha')).toBeInTheDocument();
  });

  it('permite seleccionar entre varias OCs (CA-22-03)', async () => {
    const user = userEvent.setup();
    const onSelectOrder = jest.fn();
    const secondOrder = {
      ...order,
      id: 'po-2',
      orderNumber: 'PO-000002',
      partyRefId: 'supplier-2',
    };

    render(
      <GoodsReceiptPanel
        order={order}
        orders={[order, secondOrder]}
        orderLines={orderLines}
        items={items}
        locations={locations}
        supplierLabels={{ 'supplier-1': 'Proveedor A', 'supplier-2': 'Proveedor B' }}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSelectOrder={onSelectOrder}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText('Orden de compra')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Orden de compra' }));
    await user.click(screen.getByRole('option', { name: /PO-000002 · Proveedor B/i }));
    expect(onSelectOrder).toHaveBeenCalledWith('po-2');
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

    await user.click(screen.getByRole('button', { name: 'Ubicación destino' }));
    // mock InventoryLocationPicker selecciona loc-1 al click
    await user.click(screen.getByRole('button', { name: 'Registrar recepción' }));

    const expectedReceivedAt = toDateFromLocalDateValue(
      toLocalDateValue(new Date()),
    )!.toISOString();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationLocationId: 'loc-1',
        receivedAt: expectedReceivedAt,
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
