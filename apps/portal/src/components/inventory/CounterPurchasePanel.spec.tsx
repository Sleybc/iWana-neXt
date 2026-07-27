import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind } from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  StockLocationRecord,
  StockMovementResultRecord,
} from '@/lib/api-client';
import { CounterPurchasePanel } from './CounterPurchasePanel';

jest.mock('./SupplierPicker', () => ({
  SupplierPicker: ({
    label = 'Proveedor',
    onChange,
  }: {
    label?: string;
    onChange: (partyRefId: string | null, displayName: string | null) => void;
  }) => (
    <button type="button" onClick={() => onChange('party-1', 'Macrotics SAS')}>
      Seleccionar {label}
    </button>
  ),
}));

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
      aria-label={label ?? 'Bodega destino'}
      onClick={() => onChange('loc-1', { id: 'loc-1', label: 'BOD-01 · Bodega central' })}
    >
      Elegir bodega
    </button>
  ),
}));

const catalogOptions: InventoryCatalogOptionRecord[] = [
  {
    id: 'item-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.STOCK,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: 'caja',
    standardCost: '120000',
    preferredSupplierRefId: null,
    preferredSupplierName: null,
    supplierSku: null,
  },
];

const locations: StockLocationRecord[] = [
  {
    id: 'loc-1',
    tenantId: 'tenant-1',
    code: 'BOD-01',
    name: 'Bodega central',
    type: 'WAREHOUSE' as StockLocationRecord['type'],
    status: 'ACTIVE' as StockLocationRecord['status'],
    responsibleRefId: null,
    maxCapacity: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const items: InventoryItemRecord[] = [];

describe('CounterPurchasePanel', () => {
  it('usa shell create-mode y secciones de datos, líneas y notas', () => {
    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText('Ingreso directo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compra de mostrador' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datos del ingreso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Líneas de ingreso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notas' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar producto/i })).toBeInTheDocument();
    expect(screen.getByText('Sin líneas')).toBeInTheDocument();
  });

  it('muestra validación visible al registrar incompleto', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    expect(await screen.findByText(/Selecciona un proveedor/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('agrega producto desde búsqueda y permite registrar', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Seleccionar Proveedor/i }));
    await user.type(screen.getByLabelText(/Factura o soporte/i), 'FAC-001');

    await user.click(screen.getByRole('button', { name: /Bodega destino/i }));

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001/i }));

    expect(screen.getByText('ONT WiFi 6')).toBeInTheDocument();
    expect(screen.getByText('ONT-001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          partyRefId: 'party-1',
          invoiceNumber: 'FAC-001',
          destinationLocationId: 'loc-1',
          lines: [
            expect.objectContaining({
              itemId: 'item-1',
              quantityReceived: 1,
              unitCost: 120000,
            }),
          ],
        }),
      );
    });
  });

  it('ofrece registrar otro ingreso tras el éxito', async () => {
    const user = userEvent.setup();
    const onDismissSuccess = jest.fn();
    const lastResult = {
      movement: { movementNumber: 'MOV-9' },
      lines: [{ id: 'line-1' }],
    } as unknown as StockMovementResultRecord;

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={lastResult}
        onSubmit={jest.fn()}
        onDismissSuccess={onDismissSuccess}
      />,
    );

    expect(screen.getByText(/Se creó el movimiento MOV-9/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar otro ingreso/i }));
    expect(onDismissSuccess).toHaveBeenCalled();
  });
});
