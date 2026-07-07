import { buildPurchaseSuggestions } from './purchase-suggestions';

describe('purchase-suggestions', () => {
  it('returns purchasable low-stock items with visible reasons', () => {
    const suggestions = buildPurchaseSuggestions({
      items: [
        {
          id: 'item-1',
          minimumStock: '2',
          reorderPoint: '5',
          targetStock: '20',
          purchasable: true,
        },
        {
          id: 'item-2',
          minimumStock: '1',
          reorderPoint: '3',
          targetStock: '10',
          purchasable: true,
        },
      ],
      balances: [
        { itemId: 'item-1', quantityOnHand: '1' },
        { itemId: 'item-2', quantityOnHand: '8' },
      ],
      limit: 8,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      itemId: 'item-1',
      reason: 'Bajo minimo',
      quantityOnHand: 1,
    });
  });

  it('does not suggest frequent purchases without a stock signal', () => {
    const suggestions = buildPurchaseSuggestions({
      items: [
        {
          id: 'item-1',
          minimumStock: '0',
          reorderPoint: '0',
          targetStock: '0',
          purchasable: true,
        },
      ],
      balances: [{ itemId: 'item-1', quantityOnHand: '20' }],
      purchaseItemFrequency: { 'item-1': 4 },
      limit: 8,
    });

    expect(suggestions).toHaveLength(0);
  });

  it('boosts frequent purchases when stock signal exists', () => {
    const suggestions = buildPurchaseSuggestions({
      items: [
        {
          id: 'item-1',
          minimumStock: '2',
          reorderPoint: '5',
          targetStock: '20',
          purchasable: true,
        },
      ],
      balances: [{ itemId: 'item-1', quantityOnHand: '3' }],
      purchaseItemFrequency: { 'item-1': 4 },
      limit: 8,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.priorityScore).toBeGreaterThan(85);
  });
});
