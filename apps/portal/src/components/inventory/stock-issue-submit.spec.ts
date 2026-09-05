import {
  InventoryItemKind,
  InventoryTrackingMode,
  StockBalanceCondition,
  StockIssueType,
} from '@iwana/shared';
import type { InventoryItemRecord } from '@/lib/api-client';
import {
  buildCreateStockIssuePayload,
  buildUpdateStockIssuePayload,
  validateStockIssueDraftLines,
} from './stock-issue-submit';

const itemsById = new Map<string, InventoryItemRecord>([
  [
    'item-1',
    {
      id: 'item-1',
      trackingMode: InventoryTrackingMode.CONSUMABLE,
      itemKind: InventoryItemKind.CONSUMABLE,
    } as InventoryItemRecord,
  ],
  [
    'item-2',
    {
      id: 'item-2',
      trackingMode: InventoryTrackingMode.CONSUMABLE,
      itemKind: InventoryItemKind.CONSUMABLE,
    } as InventoryItemRecord,
  ],
  [
    'item-serial',
    {
      id: 'item-serial',
      trackingMode: InventoryTrackingMode.SERIALIZED,
      itemKind: InventoryItemKind.SERIALIZED,
    } as InventoryItemRecord,
  ],
]);

const baseLine = {
  productLabel: 'Ítem',
  isManual: false,
  condition: StockBalanceCondition.NEW,
  lotId: '',
  serializedAssetId: '',
};

describe('stock-issue-submit', () => {
  it('maps multiple lines into the create payload', () => {
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById,
      lines: [
        {
          ...baseLine,
          itemId: 'item-1',
          productLabel: 'ONT-001 · ONT WiFi 6',
          requestedQty: '2',
        },
        {
          ...baseLine,
          itemId: 'item-2',
          productLabel: 'CAB-010 · Cable drop',
          requestedQty: '3',
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.payload?.lines).toEqual([
      { itemId: 'item-1', requestedQty: 2, condition: StockBalanceCondition.NEW },
      { itemId: 'item-2', requestedQty: 3, condition: StockBalanceCondition.NEW },
    ]);
  });

  it('rejects duplicate items in the draft', () => {
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById,
      lines: [
        {
          ...baseLine,
          itemId: 'item-1',
          requestedQty: '1',
        },
        {
          ...baseLine,
          itemId: 'item-1',
          requestedQty: '2',
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/duplicadas/i);
  });

  it('requires serialized asset for serialized items', () => {
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById,
      lines: [
        {
          ...baseLine,
          itemId: 'item-serial',
          requestedQty: '1',
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/serial/i);
  });

  it('builds update payload with lot and condition', () => {
    const result = buildUpdateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById,
      lines: [
        {
          ...baseLine,
          itemId: 'item-1',
          requestedQty: '1',
          condition: StockBalanceCondition.REFURBISHED,
          lotId: 'lot-abc',
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.payload?.lines).toEqual([
      {
        itemId: 'item-1',
        requestedQty: 1,
        condition: StockBalanceCondition.REFURBISHED,
        lotId: 'lot-abc',
      },
    ]);
  });

  it('bloquea la línea serializada desde el trackingMode de la línea (S1/C3)', () => {
    // Sin itemsById: el flag sale de la línea, como ocurre con ítems agregados
    // desde Catálogo tras eliminar knownItems.
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById: new Map(),
      lines: [
        {
          ...baseLine,
          itemId: 'item-serial',
          productLabel: 'SER-9 · Router',
          requestedQty: '1',
          trackingMode: InventoryTrackingMode.SERIALIZED,
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/serial/i);
  });

  it('exige serial también para FIXED_ASSET (D2/B3)', () => {
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.TECHNICIAN_CUSTODY,
      sourceLocationId: 'loc-1',
      destinationLocationId: 'loc-2',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById: new Map(),
      lines: [
        {
          ...baseLine,
          itemId: 'item-fixed',
          requestedQty: '1',
          trackingMode: InventoryTrackingMode.FIXED_ASSET,
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/serial/i);
  });

  it('validateStockIssueDraftLines devuelve un error por línea con control a enfocar', () => {
    const errors = validateStockIssueDraftLines(
      [
        {
          lineId: 'line-ok',
          itemId: 'item-1',
          productLabel: 'CAB-010 · Cable',
          requestedQty: '2',
          isManual: false,
          condition: StockBalanceCondition.NEW,
          lotId: '',
          serializedAssetId: '',
          trackingMode: InventoryTrackingMode.CONSUMABLE,
        },
        {
          lineId: 'line-serial',
          itemId: 'item-serial',
          productLabel: 'SER-9 · Router',
          requestedQty: '1',
          isManual: false,
          condition: StockBalanceCondition.NEW,
          lotId: '',
          serializedAssetId: '',
          trackingMode: InventoryTrackingMode.SERIALIZED,
        },
        {
          lineId: 'line-qty',
          itemId: 'item-serial',
          productLabel: 'SER-9 · Router',
          requestedQty: '3',
          isManual: false,
          condition: StockBalanceCondition.NEW,
          lotId: '',
          serializedAssetId: 'asset-1',
          trackingMode: InventoryTrackingMode.SERIALIZED,
        },
      ],
      new Map(),
    );

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({
      lineIndex: 1,
      controlId: 'issue-draft-serial-line-serial',
    });
    expect(errors[0]?.message).toMatch(/serial/i);
    expect(errors[1]).toMatchObject({
      lineIndex: 2,
      controlId: 'issue-draft-qty-line-qty',
    });
    expect(errors[1]?.message).toMatch(/cantidad 1/);
  });

  it('requires commercial or origin reference for sale dispatch', () => {
    const result = buildCreateStockIssuePayload({
      type: StockIssueType.SALE_DISPATCH,
      sourceLocationId: 'loc-1',
      destinationLocationId: '',
      commercialRefId: '',
      originRefId: '',
      costCenter: '',
      reason: '',
      itemsById,
      lines: [
        {
          ...baseLine,
          itemId: 'item-1',
          requestedQty: '1',
        },
      ],
    });

    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/referencia comercial/i);
  });
});
