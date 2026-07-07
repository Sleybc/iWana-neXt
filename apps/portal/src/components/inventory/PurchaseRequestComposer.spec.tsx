import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind, StockBalanceCondition } from '@iwana/shared';
import type {
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
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

const balances: StockBalanceRecord[] = [
  {
    id: 'bal-1',
    tenantId: 'tenant-1',
    itemId: 'item-active',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '1',
    quantityReserved: '0',
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
];

const items: InventoryItemRecord[] = [
  {
    id: 'item-active',
    tenantId: 'tenant-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    description: null,
    brand: null,
    model: null,
    itemKind: InventoryItemKind.SERIALIZED,
    category: InventoryItemCategory.CPE,
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    trackingMode: 'SERIALIZED' as InventoryItemRecord['trackingMode'],
    unitOfMeasure: 'unidad',
    baseCost: '120000',
    minimumStock: '2',
    purchasable: true,
    inventoryControlled: true,
    assetControlled: true,
    preferredSupplierRefId: 'supplier-1',
    supplierSku: null,
    purchaseUnitOfMeasure: 'caja',
    purchaseToBaseUomFactor: null,
    standardCost: '120000',
    lastPurchaseCost: null,
    reorderPoint: '5',
    targetStock: '20',
    minimumOrderQty: null,
    orderMultiple: null,
    leadTimeDays: null,
    usefulLifeMonths: null,
    commercialReferenceId: null,
    status: 'ACTIVE' as InventoryItemRecord['status'],
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
];

const submitResult = jest.fn().mockResolvedValue({ ok: true });

describe('PurchaseRequestComposer', () => {
  beforeEach(() => {
    submitResult.mockReset();
    submitResult.mockResolvedValue({ ok: true });
  });

  it('renders purchase source tabs and a shared add-to-draft action', () => {
    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        items={items}
        balances={balances}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    expect(screen.getByRole('tab', { name: /Sugeridos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Catalogo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar al borrador/i })).toBeDisabled();
  });

  it('moves selected catalog products into the draft lines table', async () => {
    const user = userEvent.setup();

    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        items={items}
        balances={balances}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Catalogo/i }));
    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT-001 - ONT WiFi 6/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(screen.getByText(/L[ií]neas seleccionadas/i)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('1').length).toBeGreaterThan(0);
  });

  it('keeps a manual line path available inside the new draft flow', async () => {
    const user = userEvent.setup();

    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        items={items}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={submitResult}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Agregar l[ií]nea manual/i }));

    expect(screen.getByLabelText(/Descripcion manual/i)).toBeInTheDocument();
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
        items={items}
        balances={balances}
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
