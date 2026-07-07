import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import type { PurchaseDraftLine } from './purchase-request-draft';
import { buildCatalogUnitCostMap, estimatePurchaseDraftTotal } from './purchase-draft-estimate';

describe('purchase-draft-estimate', () => {
  const lines: PurchaseDraftLine[] = [
    {
      id: 'line-1',
      sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      inventoryItemId: 'item-1',
      productLabel: 'ONT-001 - ONT WiFi 6',
      quantityRequested: '2',
      unitOfMeasure: 'caja',
      suggestedPartyRefId: '',
      suggestedPartyName: '',
      notes: '',
    },
    {
      id: 'line-2',
      sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      inventoryItemId: 'item-2',
      productLabel: 'CAB-010 - Cable drop',
      quantityRequested: '1',
      unitOfMeasure: 'metro',
      suggestedPartyRefId: '',
      suggestedPartyName: '',
      notes: '',
    },
  ];

  it('estimates total from standard cost and quantity', () => {
    const estimate = estimatePurchaseDraftTotal(lines, {
      'item-1': 120000,
      'item-2': 0,
    });

    expect(estimate.total).toBe(240000);
    expect(estimate.coveredLines).toBe(1);
    expect(estimate.uncoveredLines).toBe(1);
  });

  it('builds a unit cost map from catalog options', () => {
    const map = buildCatalogUnitCostMap([
      { id: 'item-1', standardCost: '120000' },
      { id: 'item-2', standardCost: '0' },
    ]);

    expect(map).toEqual({ 'item-1': 120000 });
  });
});
