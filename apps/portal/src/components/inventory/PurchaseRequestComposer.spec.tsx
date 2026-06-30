import { render, screen } from '@testing-library/react';
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

describe('PurchaseRequestComposer', () => {
  it('renders catalog search and product selector for inventory lines', () => {
    render(
      <PurchaseRequestComposer
        catalogOptions={catalogOptions}
        supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
        isSubmitting={false}
        error={null}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Buscar producto')).toBeInTheDocument();
    expect(screen.getByLabelText('Producto del catálogo')).toBeInTheDocument();
    expect(screen.getByLabelText('Unidad')).toBeInTheDocument();
    expect(screen.getByLabelText('Proveedor sugerido')).toBeInTheDocument();
  });
});
