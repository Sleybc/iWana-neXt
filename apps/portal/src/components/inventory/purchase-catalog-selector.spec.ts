import {
  InventoryItemCategory,
  InventoryItemKind,
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import {
  buildCatalogSelectOptions,
  filterCatalogOptions,
  resolveCatalogSupplierPrefill,
  resolveCatalogUnitOfMeasure,
} from './purchase-catalog-selector';

describe('purchase-catalog-selector', () => {
  const baseOption: InventoryCatalogOptionRecord = {
    id: 'item-1',
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
    supplierSku: 'SUP-ONT-001',
  };

  it('filters catalog options by sku and name', () => {
    const options = [
      baseOption,
      {
        ...baseOption,
        id: 'item-2',
        sku: 'CABLE-01',
        name: 'Cable drop',
      },
    ];

    expect(filterCatalogOptions(options, 'cable')).toHaveLength(1);
    expect(filterCatalogOptions(options, 'ONT WiFi')).toHaveLength(1);
  });

  it('builds rich select labels for catalog options', () => {
    const labels = buildCatalogSelectOptions([baseOption]);

    expect(labels[1]?.label).toContain('ONT-001');
    expect(labels[1]?.label).toContain('ONT WiFi 6');
    expect(labels[1]?.label).toContain('CPE');
  });

  it('prefers purchase unit of measure when present', () => {
    expect(resolveCatalogUnitOfMeasure(baseOption)).toBe('caja');
    expect(resolveCatalogUnitOfMeasure({ ...baseOption, purchaseUnitOfMeasure: null })).toBe(
      'unidad',
    );
  });

  it('prefills preferred supplier when configured', () => {
    expect(
      resolveCatalogSupplierPrefill({ ...baseOption, preferredSupplierName: 'Proveedor Alfa' }, {}),
    ).toEqual({
      suggestedPartyRefId: 'supplier-1',
      suggestedPartyName: 'Proveedor Alfa',
    });
  });
});
