import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind } from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseTaxPresetRecord,
  StockLocationRecord,
  StockMovementResultRecord,
} from '@/lib/api-client';
import { formatInventoryMoney } from './inventory-labels';
import { QUOTE_TAX_RATE_ERROR } from './quote-tax-calc';
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

async function fillValidCounterPurchaseForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Seleccionar Proveedor/i }));
  await user.type(screen.getByLabelText(/Factura o soporte/i), 'FAC-001');
  await user.click(screen.getByRole('button', { name: /Bodega destino/i }));

  const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
  await user.type(searchInput, 'ONT');
  await user.click(await screen.findByRole('option', { name: /ONT-001/i }));
}

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

  it('volver sin tocar nada no pide confirmación', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const onBack = jest.fn();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
        onBack={onBack}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Volver al listado/i }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
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

  it('muestra la sección de tributos de la compra con IVA aplicado por defecto', async () => {
    const user = userEvent.setup();
    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByText('Tributos de esta compra (según factura)')).toBeInTheDocument();
    // Colapsada por defecto para optimizar espacio (Fase 29).
    expect(screen.queryByRole('checkbox', { name: 'IVA' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(
      screen.getByText(
        'Informativo: sirve para estimar el pago según la factura. No es un cálculo tributario ni un documento DIAN.',
      ),
    ).toBeInTheDocument();
    const ivaCheckbox = screen.getByRole('checkbox', { name: 'IVA' });
    expect(ivaCheckbox).toBeChecked();
    expect(screen.getByLabelText(/Tasa de IVA/i)).toHaveValue(19);
  });

  it('incluye los tributos aplicados en el payload del registro', async () => {
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

    await fillValidCounterPurchaseForm(user);
    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          taxes: [{ code: 'IVA_19', applies: true, rate: 19 }],
        }),
      );
    });
  });

  it('no envía taxes cuando ninguna fila aplica', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));

    await fillValidCounterPurchaseForm(user);
    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('taxes');
  });

  it('usa la tasa del preset para el IVA por defecto cuando llegan presets', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const taxPresets: PurchaseTaxPresetRecord[] = [
      {
        code: 'IVA_19',
        name: 'IVA',
        category: 'VAT',
        baseRate: 10,
        treatment: 'STANDARD',
        context: 'PURCHASE',
      },
    ];

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={onSubmit}
        taxPresets={taxPresets}
      />,
    );

    expect(screen.getByText('Tributos de esta compra (según factura)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByLabelText(/Tasa de IVA/i)).toHaveValue(10);

    await fillValidCounterPurchaseForm(user);
    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          taxes: [{ code: 'IVA_19', applies: true, rate: 10 }],
        }),
      );
    });
  });

  it('muestra el total estimado con tributos sobre el subtotal neto', async () => {
    const user = userEvent.setup();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    await fillValidCounterPurchaseForm(user);

    expect(screen.getByText('Subtotal (neto)')).toBeInTheDocument();
    expect(screen.getAllByText('Total estimado con tributos').length).toBeGreaterThan(0);
    // Línea 120000 × 1 con IVA 19% → neto estimado 142800.
    const expected = formatInventoryMoney(142800).replace(/\u00a0/g, ' ');
    const matches = screen.getAllByText((content) => content.replace(/\u00a0/g, ' ') === expected);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('bloquea el registro cuando la tasa es inválida', async () => {
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

    await fillValidCounterPurchaseForm(user);

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    const rateInput = screen.getByLabelText(/Tasa de IVA/i);
    await user.clear(rateInput);
    await user.type(rateInput, '200');

    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    const errors = await screen.findAllByText(QUOTE_TAX_RATE_ERROR);
    expect(errors.length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('etiqueta el costo unitario como sin impuestos', async () => {
    const user = userEvent.setup();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001/i }));

    expect(screen.getByText('Costo unitario (sin impuestos)')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Costo unitario (sin impuestos) de ONT WiFi 6'),
    ).toBeInTheDocument();
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

  it('muestra el resumen y la acción en el aside lateral (Fase 27)', () => {
    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    const aside = screen.getByRole('complementary', { name: 'Resumen del ingreso' });
    expect(aside).toBeInTheDocument();
    expect(
      within(aside).getByRole('button', { name: /Registrar ingreso directo/i }),
    ).toBeInTheDocument();
    expect(within(aside).getByText('Tributos de esta compra (según factura)')).toBeInTheDocument();
    expect(within(aside).getByText('Total estimado con tributos')).toBeInTheDocument();
  });

  it('colapsa las notas por defecto y conserva el contenido (Fase 27)', async () => {
    const user = userEvent.setup();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Notas')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agregar notas \(opcional\)/i }));
    const notesField = screen.getByLabelText('Notas');
    await user.type(notesField, 'Entrega parcial');

    await user.click(screen.getByRole('button', { name: /Ocultar notas/i }));
    expect(screen.queryByLabelText('Notas')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agregar notas \(opcional\)/i }));
    expect(screen.getByLabelText('Notas')).toHaveValue('Entrega parcial');
  });

  it('enfoca la cantidad al agregar un producto (Fase 27)', async () => {
    const user = userEvent.setup();

    render(
      <CounterPurchasePanel
        items={items}
        catalogOptions={catalogOptions}
        locations={locations}
        isSubmitting={false}
        error={null}
        lastResult={null}
        onSubmit={jest.fn()}
      />,
    );

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Cantidad de ONT WiFi 6')).toHaveFocus();
    });
  });

  it('enfoca la factura al validar sin ella (Fase 27)', async () => {
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

    await user.click(screen.getByRole('button', { name: /Seleccionar Proveedor/i }));
    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    expect(await screen.findByText(/Indica la factura o soporte/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText(/Factura o soporte/i)).toHaveFocus();
    });
  });

  it('no pide lote: la columna no existe y el payload no lo envía (el sistema lo genera)', async () => {
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

    await fillValidCounterPurchaseForm(user);

    expect(screen.queryByRole('columnheader', { name: /Lote/i })).not.toBeInTheDocument();
    expect(screen.getByText(/El lote se genera solo desde la factura/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Registrar ingreso directo/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0].lines[0]).not.toHaveProperty('lotNumber');
  });
});
