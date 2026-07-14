import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind } from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PurchaseRequestComposer } from './PurchaseRequestComposer';

const catalogOptions: InventoryCatalogOptionRecord[] = [
  {
    id: 'item-active',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: 'caja',
    standardCost: '120000',
    preferredSupplierRefId: 'supplier-1',
    preferredSupplierName: 'Proveedor Alfa',
    supplierSku: 'SUP-ONT',
  },
];

const submitResult = jest.fn().mockResolvedValue({ ok: true });

describe('PurchaseRequestComposer', () => {
  beforeEach(() => {
    submitResult.mockReset();
    submitResult.mockResolvedValue({ ok: true });
  });

  it('renders the product search input and the manual line action', () => {
    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    expect(screen.getByRole('combobox', { name: /Buscar producto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar l[ií]nea manual/i })).toBeInTheDocument();
  });

  it('adds a searched catalog product straight into the draft lines table', async () => {
    const user = userEvent.setup();

    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    const searchInput = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(searchInput, 'ONT');
    await user.click(await screen.findByRole('option', { name: /ONT-001 - ONT WiFi 6/i }));

    expect(screen.getByText(/L[ií]neas seleccionadas/i)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('1').length).toBeGreaterThan(0);
    expect(searchInput).toHaveValue('');
  });

  it('keeps a manual line path available inside the new draft flow', async () => {
    const user = userEvent.setup();

    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Agregar l[ií]nea manual/i }));

    expect(screen.getByLabelText(/Descripción manual/i)).toBeInTheDocument();
  });

  it('shows the first step marker in mobile create mode', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        layout="embedded"
        presentation="create-mode"
        onSubmit={submitResult}
      />,
    );

    expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();
  });
});
