import {
  InventoryItemKind,
  InventoryTrackingMode,
  StockBalanceCondition,
  type StockIssuePickableAvailability,
  type StockIssuePickableLot,
} from '@iwana/shared';
import {
  applySingleLotPreselectionToDraftLines,
  formatLotExpiryDate,
  formatLotOptionLabel,
  formatSerializedAssetLabel,
  getAvailableQtyByCondition,
  getAvailableQtyForDraftLine,
  isSerializedInventoryItem,
  isSerializedTrackingMode,
  listAvailableConditionsForDraftLine,
  listLotOptionsFromPickableLots,
  listSerializedAssetsForItemAtLocation,
  resolveSingleLotIdFromLots,
} from './stock-issue-line-utils';
import type { StockIssueDraftLine } from './stock-issue-draft';

function buildLot(overrides: Partial<StockIssuePickableLot> = {}): StockIssuePickableLot {
  return {
    lotId: 'lot-a',
    lotNumber: 'LOTE-042',
    expiryDate: null,
    condition: StockBalanceCondition.NEW,
    available: '10',
    ...overrides,
  };
}

function buildAvailability(
  overrides: Partial<StockIssuePickableAvailability> = {},
): StockIssuePickableAvailability {
  return {
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '10',
    quantityReserved: '0',
    available: '10',
    ...overrides,
  };
}

function buildDraftLine(overrides: Partial<StockIssueDraftLine> = {}): StockIssueDraftLine {
  return {
    id: 'line-1',
    itemId: 'item-1',
    sku: 'ONT-001',
    productLabel: 'ONT-001 · ONT WiFi 6',
    requestedQty: '1',
    unitOfMeasure: 'UNIT',
    isManual: false,
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    serializedAssetLabel: '',
    serializedAssetIds: [],
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    lots: [],
    availability: [],
    availableSerialCount: 0,
    ...overrides,
  };
}

describe('stock-issue-line-utils', () => {
  it('detects serialized inventory items', () => {
    expect(
      isSerializedInventoryItem({
        trackingMode: InventoryTrackingMode.SERIALIZED,
        itemKind: InventoryItemKind.CONSUMABLE,
      }),
    ).toBe(true);
  });

  it('deriva el flag serializado de la línea: SERIALIZED y FIXED_ASSET exigen serial', () => {
    expect(isSerializedTrackingMode(InventoryTrackingMode.SERIALIZED)).toBe(true);
    expect(isSerializedTrackingMode(InventoryTrackingMode.FIXED_ASSET)).toBe(true);
    expect(isSerializedTrackingMode(InventoryTrackingMode.CONSUMABLE)).toBe(false);
    expect(isSerializedTrackingMode(undefined)).toBe(false);
  });

  it('lista lotes con número real y solo con disponible en la condición', () => {
    const options = listLotOptionsFromPickableLots(
      [
        buildLot({ lotId: 'lot-a', lotNumber: 'LOTE-042', available: '6' }),
        buildLot({
          lotId: 'lot-b',
          lotNumber: 'LOTE-007',
          available: '0',
        }),
        buildLot({
          lotId: 'lot-c',
          lotNumber: 'LOTE-009',
          condition: StockBalanceCondition.REFURBISHED,
          available: '4',
        }),
      ],
      StockBalanceCondition.NEW,
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ lotId: 'lot-a', lotNumber: 'LOTE-042' });
    expect(formatLotOptionLabel(options[0]!)).toMatch(/LOTE-042/);
    expect(formatLotOptionLabel(options[0]!)).toMatch(/sin vencimiento/);
  });

  it('muestra el vencimiento del lote en español', () => {
    expect(formatLotExpiryDate(null)).toBe('sin vencimiento');
    expect(formatLotExpiryDate('2026-02-12')).toBe('vence 12/02/2026');
    expect(
      formatLotOptionLabel({ lotNumber: 'LOTE-042', expiryDate: '2026-02-12', availableQty: 5 }),
    ).toBe('LOTE-042 · vence 12/02/2026 · 5');
  });

  it('calcula el disponible de la línea por tupla (lote, condición) desde la línea', () => {
    const availability = [
      buildAvailability({ available: '8' }),
      buildAvailability({
        condition: StockBalanceCondition.REFURBISHED,
        quantityOnHand: '4',
        quantityReserved: '1',
        available: '3',
      }),
    ];
    const lots = [buildLot({ available: '5' })];

    // Sin lotes en la condición, el disponible es el de la condición.
    expect(
      getAvailableQtyForDraftLine({
        availability,
        lots: [],
        condition: StockBalanceCondition.NEW,
        lotId: '',
        serializedAssetId: '',
      }),
    ).toBe(8);
    expect(
      getAvailableQtyForDraftLine({
        availability,
        lots: [],
        condition: StockBalanceCondition.REFURBISHED,
        lotId: '',
        serializedAssetId: '',
      }),
    ).toBe(3);
    // Con lote elegido, el del lote.
    expect(
      getAvailableQtyForDraftLine({
        availability,
        lots,
        condition: StockBalanceCondition.NEW,
        lotId: 'lot-a',
        serializedAssetId: '',
      }),
    ).toBe(5);
    // Con lotes sin elegir, 0: el operador debe elegir el lote.
    expect(
      getAvailableQtyForDraftLine({
        availability,
        lots,
        condition: StockBalanceCondition.NEW,
        lotId: '',
        serializedAssetId: '',
      }),
    ).toBe(0);
    expect(
      getAvailableQtyForDraftLine({
        availability,
        lots,
        condition: StockBalanceCondition.NEW,
        lotId: '',
        serializedAssetId: 'asset-1',
      }),
    ).toBe(1);
  });

  it('limita las condiciones a las que tienen disponible (D3)', () => {
    expect(
      listAvailableConditionsForDraftLine([
        buildAvailability({ available: '0' }),
        buildAvailability({
          condition: StockBalanceCondition.REFURBISHED,
          quantityOnHand: '2',
          quantityReserved: '0',
          available: '2',
        }),
      ]),
    ).toEqual([StockBalanceCondition.REFURBISHED]);
    // Sin dato del servidor no se bloquea la captura manual.
    expect(listAvailableConditionsForDraftLine([])).toEqual(Object.values(StockBalanceCondition));
    expect(
      getAvailableQtyByCondition(
        [buildAvailability({ available: '8' })],
        StockBalanceCondition.NEW,
      ),
    ).toBe(8);
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

  describe('preselección de lote único', () => {
    const singleLot = [buildLot({ available: '50' })];
    const twoLots = [
      buildLot({ lotId: 'lot-a', lotNumber: 'LOTE-001', available: '50' }),
      buildLot({ lotId: 'lot-b', lotNumber: 'LOTE-002', available: '4' }),
    ];

    it('resuelve el lote cuando la línea ofrece exactamente uno', () => {
      expect(resolveSingleLotIdFromLots(singleLot, StockBalanceCondition.NEW)).toBe('lot-a');
    });

    it('no adivina cuando hay varios lotes ni cuando no hay ninguno', () => {
      expect(resolveSingleLotIdFromLots(twoLots, StockBalanceCondition.NEW)).toBe('');
      expect(resolveSingleLotIdFromLots([], StockBalanceCondition.NEW)).toBe('');
    });

    it('preselecciona el lote único en las líneas indicadas', () => {
      const lines = applySingleLotPreselectionToDraftLines(
        [buildDraftLine({ lots: singleLot }), buildDraftLine({ id: 'line-2', lots: singleLot })],
        { lineIds: ['line-1'] },
      );

      expect(lines[0]?.lotId).toBe('lot-a');
      expect(lines[1]?.lotId).toBe('');
    });

    it('no pisa un lote ya elegido, una línea serializada ni una línea sin producto', () => {
      const original = [
        buildDraftLine({ id: 'line-1', lotId: 'lote-z', lots: singleLot }),
        buildDraftLine({
          id: 'line-2',
          serializedAssetId: 'asset-1',
          trackingMode: InventoryTrackingMode.SERIALIZED,
          lots: singleLot,
        }),
        buildDraftLine({ id: 'line-3', itemId: '', isManual: true }),
      ];

      const lines = applySingleLotPreselectionToDraftLines(original);

      expect(lines).toBe(original);
    });
  });
});
