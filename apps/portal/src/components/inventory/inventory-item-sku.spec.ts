import { InventoryItemKind } from '@iwana/shared';
import { appendCollisionSuffix, buildCompositeSkuBase, isValidCompositeSku } from '@iwana/shared';

describe('inventory-item-sku', () => {
  it('builds a segmented SKU with category, type, name, brand and model', () => {
    expect(
      buildCompositeSkuBase({
        categoryCodePrefix: 'CFO',
        itemKind: InventoryItemKind.SERIALIZED,
        name: 'ONT Huawei',
        brand: 'ZTE',
        model: 'F601',
      }),
    ).toBe('CFO-SER-ONTHW-ZTE-F601');
  });

  it('abbreviates long single-word names, brands and models', () => {
    expect(
      buildCompositeSkuBase({
        categoryCodePrefix: 'CFO',
        itemKind: InventoryItemKind.STOCK,
        name: 'Router',
        brand: 'TP-LINK',
        model: 'Archer C50',
      }),
    ).toBe('CFO-STK-RTR-TPL-AC50');
  });

  it('omits empty brand and model segments', () => {
    expect(
      buildCompositeSkuBase({
        categoryCodePrefix: 'CRD',
        itemKind: InventoryItemKind.CONSUMABLE,
        name: 'Cable coaxial',
        brand: '',
        model: null,
      }),
    ).toBe('CRD-CON-CBLCX');
  });

  it('keeps generated SKUs below 60 characters', () => {
    const sku = buildCompositeSkuBase({
      categoryCodePrefix: 'CFO',
      itemKind: InventoryItemKind.SERIALIZED,
      name: 'Producto con nombre extremadamente largo',
      brand: 'Marca demasiado extensa',
      model: 'Modelo demasiado extenso',
    });

    expect(sku.length).toBeLessThanOrEqual(60);
  });

  it('appends collision suffix within the SKU limit', () => {
    const sku = appendCollisionSuffix('CFO-SER-ONTHW-ZTE-F601', 1);

    expect(sku).toBe('CFO-SER-ONTHW-ZTE-F601-001');
    expect(sku.length).toBeLessThanOrEqual(60);
  });

  it('validates composite SKU format', () => {
    expect(isValidCompositeSku('CFO-SER-ONTHW-ZTE-F601')).toBe(true);
    expect(isValidCompositeSku('cfo-ser')).toBe(false);
    expect(isValidCompositeSku('CFO--SER')).toBe(false);
  });
});
