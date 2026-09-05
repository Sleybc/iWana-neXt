import { inventoryApi } from '@/lib/api-client';
import { normalizeBarcodeQuery, resolveBarcodeToCatalogItem } from './inventory-barcode-capture';

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

const searchMock = inventoryApi.searchItemsForPicker as jest.Mock;

describe('inventory-barcode-capture (MOD12 · F4 · CA-F4-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recorta blancos del lector antes de buscar', () => {
    expect(normalizeBarcodeQuery('  4006381333931\n')).toBe('4006381333931');
  });

  it('resuelve el código con el lookup E-4 existente (q ya cubre barcode en backend)', async () => {
    searchMock.mockResolvedValue({
      data: [{ id: 'item-1', label: 'ONT WiFi 6', sublabel: 'SKU ONT-001' }],
      total: 1,
    });

    const result = await resolveBarcodeToCatalogItem('4006381333931');

    expect(searchMock).toHaveBeenCalledWith({ q: '4006381333931' });
    expect(result).toEqual({
      status: 'found',
      hit: { itemId: 'item-1', label: 'ONT WiFi 6', sublabel: 'SKU ONT-001' },
    });
  });

  it('reporta no encontrado cuando el catálogo no usa ese código', async () => {
    searchMock.mockResolvedValue({ data: [], total: 0 });

    const result = await resolveBarcodeToCatalogItem('0000000000000');

    expect(result).toEqual({ status: 'not-found' });
  });

  it('no llama al backend con entrada vacía o solo blancos', async () => {
    const result = await resolveBarcodeToCatalogItem('   ');

    expect(result).toEqual({ status: 'empty' });
    expect(searchMock).not.toHaveBeenCalled();
  });
});
