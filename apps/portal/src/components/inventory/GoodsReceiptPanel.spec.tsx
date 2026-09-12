import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoodsReceiptStatus, PurchaseOrderStatus } from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import {
  formatInventoryDate,
  formatInventoryDateOnly,
  formatInventoryDateTime,
} from './inventory-labels';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      searchItemsForPicker: jest.fn(),
    },
  };
});

const searchItemsForPickerMock = inventoryApi.searchItemsForPicker as jest.Mock;

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

const consumableItems = [
  {
    id: 'item-1',
    tenantId: 'tenant-1',
    sku: 'FIB-100',
    name: 'Fibra drop',
    trackingMode: 'CONSUMABLE',
    unitOfMeasure: 'unidad',
    baseCost: '9000',
    minimumStock: '10',
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
  beforeEach(() => {
    jest.clearAllMocks();
    searchItemsForPickerMock.mockResolvedValue({ data: [], total: 0 });
  });
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
    // Alcance al bloque «Entrega esperada»: la fecha también puede aparecer en el
    // DatePicker de recepción cuando hoy coincide con el fallback (zona horaria).
    const entregaEsperada = screen.getByText('Entrega esperada').closest('dl');
    expect(entregaEsperada).not.toBeNull();
    expect(
      within(entregaEsperada as HTMLElement).getByText(formatInventoryDateOnly('2026-08-15')),
    ).toBeInTheDocument();
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

    expect(screen.getByText(formatInventoryDateOnly('2026-10-01'))).toBeInTheDocument();
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
        items={consumableItems}
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
            lotNumber: null,
          }),
        ],
      }),
    );
  });

  it('producto consumible: no pide seriales y el lote es opcional con generación automática', () => {
    render(
      <GoodsReceiptPanel
        order={order}
        orderLines={orderLines}
        items={consumableItems}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByLabelText('Seriales')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Lote')).toBeInTheDocument();
    expect(
      screen.getByText('Opcional: si se deja vacío se genera uno automático.'),
    ).toBeInTheDocument();
  });

  it('producto serializado: pide un serial por unidad y bloquea el registro hasta completarlos', async () => {
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

    const submit = screen.getByRole('button', { name: 'Registrar recepción' });
    expect(screen.getByLabelText('Seriales')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(screen.getByText('Se esperaban 5 seriales; hay 0.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Seriales'), 'SN-1, SN-2, SN-3, SN-4, SN-5');
    expect(screen.queryByText('Se esperaban 5 seriales; hay 0.')).not.toBeInTheDocument();
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            quantityReceived: 5,
            serialNumbers: ['SN-1', 'SN-2', 'SN-3', 'SN-4', 'SN-5'],
          }),
        ],
      }),
    );
  });

  it('F5b: muestra la equivalencia compra → base antes de confirmar (CA-F5B-10)', () => {
    const convertibleItems = [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'UNIT',
        purchaseUnitOfMeasure: 'BOX',
        purchaseToBaseUomFactor: '100',
      },
    ] as never;

    render(
      <GoodsReceiptPanel
        order={order}
        orderLines={orderLines}
        items={convertibleItems}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByText('Equivalencia: 5 cajas = 500 unidades en unidad base.'),
    ).toBeInTheDocument();
  });

  it('F5b: sin unidad de compra no muestra equivalencia (CA-F5B-06)', () => {
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

    expect(screen.queryByText(/Equivalencia:/)).not.toBeInTheDocument();
  });
  it('F5b: maestro legacy dimensionalmente inválido no muestra equivalencia (regresión M-4)', () => {
    // Litro → metro con factor: el backend lo rechazará al enviar; el panel
    // no debe anticipar una equivalencia dimensionalmente imposible.
    const dimensionallyInvalidItems = [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'METER',
        purchaseUnitOfMeasure: 'LITER',
        purchaseToBaseUomFactor: '1',
      },
    ] as never;

    render(
      <GoodsReceiptPanel
        order={order}
        orderLines={orderLines}
        items={dimensionallyInvalidItems}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastReceipt={null}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByText(/Equivalencia:/)).not.toBeInTheDocument();
  });
});

describe('GoodsReceiptPanel · F4 captura por código de barras (CA-F4-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchItemsForPickerMock.mockResolvedValue({ data: [], total: 0 });
  });

  function renderPanel() {
    return render(
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
  }

  it('introducir el código ubica la línea sin búsqueda manual', async () => {
    searchItemsForPickerMock.mockResolvedValue({
      data: [{ id: 'item-1', label: 'ONT WiFi 6', sublabel: 'SKU ONT-001' }],
      total: 1,
    });
    renderPanel();

    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '4006381333931' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ubicar línea' }));

    expect(searchItemsForPickerMock).toHaveBeenCalledWith({ q: '4006381333931' });
    expect(await screen.findByText('Ubicado: SKU ONT-001 · ONT WiFi 6.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Cantidad a recibir')).toHaveFocus();
    });
  });

  it('avisa cuando el código es de un producto sin línea en la orden', async () => {
    searchItemsForPickerMock.mockResolvedValue({
      data: [{ id: 'item-9', label: 'Cable drop', sublabel: 'SKU CAB-009' }],
      total: 1,
    });
    renderPanel();

    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '8412345678905' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ubicar línea' }));

    expect(
      await screen.findByText(
        'Ese código es de SKU CAB-009 · Cable drop, que no tiene línea en esta orden.',
      ),
    ).toBeInTheDocument();
  });

  it('avisa cuando ningún producto del catálogo usa ese código', async () => {
    searchItemsForPickerMock.mockResolvedValue({ data: [], total: 0 });
    renderPanel();

    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '0000000000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ubicar línea' }));

    expect(
      await screen.findByText('Ningún producto del catálogo usa ese código.'),
    ).toBeInTheDocument();
  });
});
