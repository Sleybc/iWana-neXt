import { InventoryItemKind, InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import {
  formatLotOptionLabel,
  formatSerializedAssetLabel,
  isSerializedInventoryItem,
  listLotOptionsForItemAtLocation,
  listSerializedAssetsForItemAtLocation,
} from './stock-issue-line-utils';

describe('stock-issue-line-utils', () => {
  it('detects serialized inventory items', () => {
    expect(
      isSerializedInventoryItem({
        trackingMode: InventoryTrackingMode.SERIALIZED,
        itemKind: InventoryItemKind.CONSUMABLE,
      }),
    ).toBe(true);
  });

  it('groups lot options by location and condition', () => {
    const options = listLotOptionsForItemAtLocation(
      [
        {
          id: 'bal-1',
          tenantId: 'tenant-1',
          itemId: 'item-1',
          locationId: 'loc-1',
          lotId: 'lot-a',
          condition: StockBalanceCondition.NEW,
          quantityOnHand: '2',
          quantityReserved: '0',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'bal-2',
          tenantId: 'tenant-1',
          itemId: 'item-1',
          locationId: 'loc-1',
          lotId: 'lot-b',
          condition: StockBalanceCondition.NEW,
          quantityOnHand: '1',
          quantityReserved: '0',
          createdAt: '',
          updatedAt: '',
        },
      ],
      'item-1',
      'loc-1',
      StockBalanceCondition.NEW,
    );

    expect(options).toHaveLength(2);
    expect(formatLotOptionLabel(options[0]!.lotId, options[0]!.availableQty)).toMatch(/Lote/);
  });

  it('filters serialized assets by item and location', () => {
    const assets = listSerializedAssetsForItemAtLocation(
      [
        {
          id: 'asset-1',
          tenantId: 'tenant-1',
          inventoryItemId: 'item-1',
          serialNumber: 'SN-001',
          assetTag: null,
          currentLocationId: 'loc-1',
        } as any,
        {
          id: 'asset-2',
          tenantId: 'tenant-1',
          inventoryItemId: 'item-1',
          serialNumber: 'SN-002',
          assetTag: null,
          currentLocationId: 'loc-2',
        } as any,
      ],
      'item-1',
      'loc-1',
    );

    expect(assets).toHaveLength(1);
    expect(formatSerializedAssetLabel(assets[0]!)).toBe('SN-001');
  });
});
