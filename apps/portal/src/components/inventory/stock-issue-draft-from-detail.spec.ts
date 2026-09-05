import {
  InventoryTrackingMode,
  StockBalanceCondition,
  StockIssueType,
  type StockIssuePickableItem,
} from '@iwana/shared';
import { buildDraftFromIssueDetail } from './stock-issue-draft-from-detail';

function buildPickable(itemId: string): StockIssuePickableItem {
  return {
    itemId,
    sku: 'SER-9',
    name: 'Router Onu Gpon',
    categoryId: 'cat-1',
    categoryName: 'Equipos de cliente',
    unitOfMeasure: 'UNIT',
    trackingMode: InventoryTrackingMode.SERIALIZED,
    assetControlled: true,
    availability: [
      {
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '1',
        quantityReserved: '0',
        available: '1',
      },
    ],
    totalAvailable: '1',
    lots: [],
    availableSerialCount: 1,
  };
}

function buildIssue(itemId: string) {
  return {
    id: 'issue-9',
    type: StockIssueType.TECHNICIAN_CUSTODY,
    sourceLocationId: 'loc-1',
    destinationLocationId: 'loc-2',
    commercialRefId: null,
    originRefId: null,
    costCenter: null,
    reason: null,
    lines: [
      {
        id: 'line-9',
        itemId,
        requestedQty: '1.00',
        lotId: null,
        serializedAssetId: null,
        condition: StockBalanceCondition.NEW,
      },
    ],
  } as never;
}

describe('buildDraftFromIssueDetail', () => {
  it('hidrata trackingMode, unidad, lotes y disponibilidad desde el caché B1 (C3)', () => {
    const { draft } = buildDraftFromIssueDetail(
      buildIssue('item-serial'),
      new Map(),
      new Map([['item-serial', buildPickable('item-serial')]]),
    );

    expect(draft.lines[0]).toMatchObject({
      productLabel: 'SER-9 · Router Onu Gpon',
      unitOfMeasure: 'UNIT',
      trackingMode: InventoryTrackingMode.SERIALIZED,
      availableSerialCount: 1,
    });
    expect(draft.lines[0]?.availability).toHaveLength(1);
  });

  it('degrada al registro legacy cuando el ítem no está en el caché', () => {
    const { draft } = buildDraftFromIssueDetail(
      buildIssue('item-1'),
      new Map([
        [
          'item-1',
          {
            id: 'item-1',
            sku: 'ONT-001',
            name: 'ONT WiFi 6',
            unitOfMeasure: 'BOX',
            trackingMode: InventoryTrackingMode.SERIALIZED,
          } as never,
        ],
      ]),
      new Map(),
    );

    expect(draft.lines[0]).toMatchObject({
      productLabel: 'ONT-001 · ONT WiFi 6',
      trackingMode: InventoryTrackingMode.SERIALIZED,
      lots: [],
    });
  });
});
