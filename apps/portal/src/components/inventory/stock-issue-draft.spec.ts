import { InventoryTrackingMode, StockBalanceCondition, StockIssueType } from '@iwana/shared';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  areComposerSnapshotsEqual,
  buildComposerSnapshot,
  buildDraftProductLabel,
  createEmptyStockIssueDraft,
  getStockIssueLineIdentityKey,
  invalidateDraftStockContext,
  rehydrateBareDraftLines,
  removeDraftLine,
  updateDraftLineItem,
  type StockIssueDraftLine,
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

  it('updateDraftLineItem descarta el grupo de seriales del ítem anterior', () => {
    // El singular sí se limpiaba, pero el grupo sobrevivía al cambio de ítem y
    // la cantidad quedaba forzada a 1: la salida viajaba con seriales de otro
    // artículo y el API la rechazaba con un 400 que la UI no sabía explicar.
    const initial = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
      { id: 'item-1', sku: 'ONT-001', name: 'ONT WiFi 6', unitOfMeasure: 'unidad' },
    ]);
    const lineId = initial.draft.lines[0]!.id;
    const withSerials: { lines: StockIssueDraftLine[] } = {
      lines: initial.draft.lines.map((line) => ({
        ...line,
        requestedQty: '2',
        serializedAssetId: 'asset-1',
        serializedAssetLabel: 'SN-001',
        serializedAssetIds: ['asset-1', 'asset-2'],
        trackingMode: InventoryTrackingMode.SERIALIZED,
      })),
    };

    const next = updateDraftLineItem(withSerials, lineId, 'item-9', 'Cable drop', 'METER');

    expect(next.lines[0]?.serializedAssetIds).toEqual([]);
    expect(next.lines[0]?.serializedAssetId).toBe('');
    expect(next.lines[0]?.requestedQty).toBe('1');
  });

  describe('buildDraftProductLabel', () => {
    it('muestra nombre y modelo sin el código', () => {
      expect(buildDraftProductLabel('Router Onu Gpon', 'XC220')).toBe('Router Onu Gpon · XC220');
    });

    it('muestra solo el nombre cuando no hay modelo', () => {
      expect(buildDraftProductLabel('Router Onu Gpon')).toBe('Router Onu Gpon');
      expect(buildDraftProductLabel('Router Onu Gpon', null)).toBe('Router Onu Gpon');
      expect(buildDraftProductLabel('Router Onu Gpon', '  ')).toBe('Router Onu Gpon');
    });

    it('usa el modelo de la selección al agregar al borrador', () => {
      const result = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
        {
          id: 'item-9',
          sku: 'SER-9',
          name: 'Router Onu Gpon',
          model: 'XC220',
          unitOfMeasure: 'unidad',
        },
      ]);

      expect(result.draft.lines[0]).toMatchObject({
        productLabel: 'Router Onu Gpon · XC220',
      });
    });

    it('usa solo el nombre cuando la selección no trae modelo (B1)', () => {
      const result = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
        {
          id: 'item-1',
          sku: 'ONT-001',
          name: 'ONT WiFi 6',
          unitOfMeasure: 'unidad',
        },
      ]);

      expect(result.draft.lines[0]).toMatchObject({ productLabel: 'ONT WiFi 6' });
    });
  });

  describe('getStockIssueLineIdentityKey (clave única DRY S2.1)', () => {
    it('con seriales el grupo manda sobre el lote', () => {
      expect(
        getStockIssueLineIdentityKey({
          itemId: 'item-1',
          lotId: 'lote-a',
          serializedAssetId: 'asset-2',
          serializedAssetIds: ['asset-2', 'asset-1'],
        }),
      ).toBe('serial:asset-1,asset-2');
    });

    it('sin seriales usa la tupla ítem y lote', () => {
      expect(
        getStockIssueLineIdentityKey({
          itemId: 'item-1',
          lotId: '',
          serializedAssetId: '',
          serializedAssetIds: [],
        }),
      ).toBe('item:item-1:');
    });
  });

  describe('areComposerSnapshotsEqual (sin JSON.stringify, S2.1 C4)', () => {
    function buildSnapshot() {
      return buildComposerSnapshot({
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        commercialRefId: '',
        originRefId: '',
        costCenter: '',
        reason: '',
        lines: [
          {
            id: 'line-1',
            itemId: 'item-1',
            sku: 'ONT-001',
            productLabel: 'ONT WiFi 6',
            requestedQty: '2',
            unitOfMeasure: 'UNIT',
            isManual: false,
            condition: StockBalanceCondition.NEW,
            lotId: 'lote-a',
            serializedAssetId: '',
            serializedAssetLabel: '',
            serializedAssetIds: [],
            trackingMode: InventoryTrackingMode.CONSUMABLE,
            lots: [],
            availability: [],
            availableSerialCount: 0,
          } as StockIssueDraftLine,
        ],
      });
    }

    it('iguala instantáneas idénticas aunque el orden del grupo varíe', () => {
      const left = buildSnapshot();
      const right = buildSnapshot();
      expect(areComposerSnapshotsEqual(left, right)).toBe(true);
      expect(areComposerSnapshotsEqual(left, null)).toBe(false);
      expect(areComposerSnapshotsEqual(null, null)).toBe(true);
    });

    it('detecta cambios de cabecera y de línea', () => {
      const left = buildSnapshot();
      const changedSource = { ...left, sourceLocationId: 'loc-9' };
      expect(areComposerSnapshotsEqual(left, changedSource)).toBe(false);

      const changedLine = {
        ...left,
        lines: [{ ...left.lines[0]!, requestedQty: '3' }],
      };
      expect(areComposerSnapshotsEqual(left, changedLine)).toBe(false);
    });
  });

  describe('invalidateDraftStockContext + rehydrateBareDraftLines (S2.1 C3)', () => {
    function buildLine(overrides: Partial<StockIssueDraftLine> = {}): StockIssueDraftLine {
      return {
        id: 'line-1',
        itemId: 'item-1',
        sku: 'ONT-001',
        productLabel: 'ONT WiFi 6',
        requestedQty: '2',
        unitOfMeasure: 'UNIT',
        isManual: false,
        condition: StockBalanceCondition.NEW,
        lotId: 'lote-a',
        serializedAssetId: '',
        serializedAssetLabel: '',
        serializedAssetIds: [],
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        lots: [
          {
            lotId: 'lote-a',
            lotNumber: 'LOTE-A',
            expiryDate: null,
            condition: StockBalanceCondition.NEW,
            available: '8',
          },
        ],
        availability: [
          {
            condition: StockBalanceCondition.NEW,
            quantityOnHand: '8',
            quantityReserved: '0',
            available: '8',
          },
        ],
        availableSerialCount: 0,
        ...overrides,
      };
    }

    it('al cambiar la bodega el contexto anterior se invalida pero la condición queda', () => {
      const next = invalidateDraftStockContext({ lines: [buildLine()] });

      expect(next.lines[0]).toMatchObject({
        condition: StockBalanceCondition.NEW,
        requestedQty: '2',
        lotId: '',
        lots: [],
        availability: [],
        availableSerialCount: 0,
      });
    });

    it('retira también los seriales de la bodega anterior', () => {
      const next = invalidateDraftStockContext({
        lines: [
          buildLine({
            trackingMode: InventoryTrackingMode.SERIALIZED,
            serializedAssetId: 'asset-1',
            serializedAssetIds: ['asset-1'],
            availableSerialCount: 2,
          }),
        ],
      });

      expect(next.lines[0]).toMatchObject({
        serializedAssetId: '',
        serializedAssetIds: [],
        availableSerialCount: 0,
      });
    });

    it('rehidrata solo las líneas vacías desde el caché de la bodega vigente', () => {
      const bare = invalidateDraftStockContext({
        lines: [buildLine({ id: 'line-1' }), buildLine({ id: 'line-2', itemId: 'item-9' })],
      });
      const { draft: next, rehydratedLineIds } = rehydrateBareDraftLines(
        bare,
        new Map([
          [
            'item-1',
            {
              lots: [
                {
                  lotId: 'lote-n',
                  lotNumber: 'LOTE-N',
                  expiryDate: null,
                  condition: StockBalanceCondition.NEW,
                  available: '5',
                },
              ],
              availability: [
                {
                  condition: StockBalanceCondition.NEW,
                  quantityOnHand: '5',
                  quantityReserved: '0',
                  available: '5',
                },
              ],
              availableSerialCount: 0,
            },
          ],
        ]),
      );

      expect(rehydratedLineIds).toEqual(['line-1']);
      expect(next.lines[0]?.lots).toHaveLength(1);
      expect(next.lines[1]?.lots).toHaveLength(0);
    });
  });
});
