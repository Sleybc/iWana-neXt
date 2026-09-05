import { InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  createEmptyStockIssueDraft,
  removeDraftLine,
  updateDraftLineItem,
} from './stock-issue-draft';

describe('stock-issue-draft', () => {
  it('adds multiple selected items into the draft with quantity 1 defaults', () => {
    const draft = createEmptyStockIssueDraft();

    const result = addCatalogSelectionToDraft(draft, [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
      },
      {
        id: 'item-2',
        sku: 'CAB-010',
        name: 'Cable drop',
        unitOfMeasure: 'metro',
      },
    ]);

    expect(result.skippedItemIds).toEqual([]);
    expect(result.draft.lines).toHaveLength(2);
    expect(result.draft.lines[0]).toMatchObject({
      itemId: 'item-1',
      requestedQty: '1',
      unitOfMeasure: 'unidad',
      isManual: false,
    });
    expect(result.draft.lines[1]).toMatchObject({
      itemId: 'item-2',
      requestedQty: '1',
      unitOfMeasure: 'metro',
    });
  });

  it('skips duplicate items already present in the draft', () => {
    const initial = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
      },
    ]);

    const result = addCatalogSelectionToDraft(initial.draft, [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
      },
      {
        id: 'item-2',
        sku: 'CAB-010',
        name: 'Cable drop',
        unitOfMeasure: 'metro',
      },
    ]);

    expect(result.skippedItemIds).toEqual(['item-1']);
    expect(result.draft.lines).toHaveLength(2);
    expect(result.draft.lines[1]?.itemId).toBe('item-2');
  });

  it('removes a draft line without mutating the original draft', () => {
    const initial = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
      },
    ]);

    const next = removeDraftLine(initial.draft, initial.draft.lines[0]!.id);

    expect(initial.draft.lines).toHaveLength(1);
    expect(next.lines).toHaveLength(0);
  });

  it('applies bulk quantity to selected draft lines only', () => {
    const initial = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
      },
      {
        id: 'item-2',
        sku: 'CAB-010',
        name: 'Cable drop',
        unitOfMeasure: 'metro',
      },
    ]);

    const next = applyBulkQuantityToDraftLines(initial.draft, [initial.draft.lines[0]!.id], '5');

    expect(next.lines[0]?.requestedQty).toBe('5');
    expect(next.lines[1]?.requestedQty).toBe('1');
  });

  it('hidrata trackingMode, lotes y disponibilidad desde la selección (S1/C3)', () => {
    const lots = [
      {
        lotId: 'lot-a',
        lotNumber: 'LOTE-042',
        expiryDate: null,
        condition: StockBalanceCondition.NEW,
        available: '6',
      },
    ];
    const availability = [
      {
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '6',
        quantityReserved: '0',
        available: '6',
      },
      {
        condition: StockBalanceCondition.REFURBISHED,
        quantityOnHand: '2',
        quantityReserved: '0',
        available: '2',
      },
    ];

    const result = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'UNIT',
        trackingMode: InventoryTrackingMode.SERIALIZED,
        lots,
        availability,
        availableSerialCount: 2,
      },
    ]);

    expect(result.draft.lines[0]).toMatchObject({
      trackingMode: InventoryTrackingMode.SERIALIZED,
      lots,
      availability,
      availableSerialCount: 2,
      condition: StockBalanceCondition.NEW,
    });
  });

  it('la condición inicial es la primera con disponible (D3)', () => {
    const result = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      {
        id: 'item-1',
        sku: 'CAB-010',
        name: 'Cable drop',
        unitOfMeasure: 'METER',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        lots: [],
        availability: [
          {
            condition: StockBalanceCondition.NEW,
            quantityOnHand: '0',
            quantityReserved: '0',
            available: '0',
          },
          {
            condition: StockBalanceCondition.REFURBISHED,
            quantityOnHand: '3',
            quantityReserved: '0',
            available: '3',
          },
        ],
        availableSerialCount: 0,
      },
    ]);

    expect(result.draft.lines[0]?.condition).toBe(StockBalanceCondition.REFURBISHED);
  });

  it('updateDraftLineItem rehidrata la línea en la vía manual', () => {
    const initial = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      { id: 'item-1', sku: 'ONT-001', name: 'ONT WiFi 6', unitOfMeasure: 'unidad' },
    ]);
    const lineId = initial.draft.lines[0]!.id;

    const next = updateDraftLineItem(initial.draft, lineId, 'item-9', 'SER-9 · Router', 'UNIT', {
      trackingMode: InventoryTrackingMode.SERIALIZED,
      lots: [],
      availability: [],
      availableSerialCount: 0,
    });

    expect(next.lines[0]).toMatchObject({
      itemId: 'item-9',
      trackingMode: InventoryTrackingMode.SERIALIZED,
      lotId: '',
      serializedAssetId: '',
      requestedQty: '1',
    });
  });
});
