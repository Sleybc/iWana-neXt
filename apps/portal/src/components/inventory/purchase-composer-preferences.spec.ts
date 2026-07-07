import { buildPurchaseItemFrequency } from './purchase-composer-preferences';

describe('purchase-composer-preferences', () => {
  it('counts inventory item frequency across request details', () => {
    const frequency = buildPurchaseItemFrequency([
      {
        lines: [
          { inventoryItemId: 'item-1' },
          { inventoryItemId: 'item-1' },
          { inventoryItemId: 'item-2' },
          { inventoryItemId: null },
        ],
      },
      {
        lines: [{ inventoryItemId: 'item-2' }],
      },
    ] as Parameters<typeof buildPurchaseItemFrequency>[0]);

    expect(frequency).toEqual({
      'item-1': 2,
      'item-2': 2,
    });
  });
});
