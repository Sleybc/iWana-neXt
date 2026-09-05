import {
  InventoryTrackingMode,
  StockBalanceCondition,
  type StockIssuePickableAvailability,
  type StockIssuePickableLot,
} from '@iwana/shared';

export interface StockIssueDraftCatalogSelection {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  /** Hidratación S1 desde `StockIssuePickableItem`: corrige C3 (el flag serial sale de la línea). */
  trackingMode?: InventoryTrackingMode;
  lots?: StockIssuePickableLot[];
  availability?: StockIssuePickableAvailability[];
  availableSerialCount?: number;
}

export interface StockIssueDraftLine {
  id: string;
  itemId: string;
  productLabel: string;
  requestedQty: string;
  unitOfMeasure: string;
  isManual: boolean;
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetId: string;
  /** Etiqueta del serial elegido para el picker (se resuelve al elegir; en edición se hidrata). */
  serializedAssetLabel: string;
  /**
   * Modo de seguimiento del ítem (S1). `serialized` se deriva de aquí con
   * `isSerializedTrackingMode`, nunca de `knownItems` (corrección directa de C3).
   */
  trackingMode: InventoryTrackingMode;
  /** Lotes con saldo en la bodega de origen para este ítem (contrato B1). */
  lots: StockIssuePickableLot[];
  /** Disponible por condición en la bodega de origen (contrato B1, D3: sin filtro a NEW). */
  availability: StockIssuePickableAvailability[];
  /** Seriales disponibles en la bodega (contrato B1); 0 + serializado = aviso explícito. */
  availableSerialCount: number;
}

export interface StockIssueDraftState {
  lines: StockIssueDraftLine[];
}

export interface AddCatalogToDraftResult {
  draft: StockIssueDraftState;
  skippedItemIds: string[];
}

let draftLineSequence = 0;

function createDraftLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `issue-draft-line-${crypto.randomUUID()}`;
  }

  draftLineSequence += 1;
  return `issue-draft-line-${draftLineSequence}`;
}

function createBaseDraftLine(
  partial: Pick<
    StockIssueDraftLine,
    'itemId' | 'productLabel' | 'requestedQty' | 'unitOfMeasure' | 'isManual'
  > &
    Partial<Omit<StockIssueDraftLine, 'id'>>,
): StockIssueDraftLine {
  return {
    id: createDraftLineId(),
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    serializedAssetLabel: '',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    lots: [],
    availability: [],
    availableSerialCount: 0,
    ...partial,
  };
}

function parseDecimalAmount(value: string | null | undefined): number {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Condición inicial de una línea recién agregada: la primera con disponible > 0
 * según el contrato B1 (D3: REFURBISHED/DAMAGED también despachan). Sin dato del
 * servidor se conserva NEW para no adivinar.
 */
function resolveInitialConditionForSelection(
  selection: Pick<StockIssueDraftCatalogSelection, 'availability'>,
): StockBalanceCondition {
  const firstAvailable = selection.availability?.find(
    (entry) => parseDecimalAmount(entry.available) > 0,
  );
  return firstAvailable?.condition ?? StockBalanceCondition.NEW;
}

export interface StockIssueDraftItemHydration {
  itemId: string;
  productLabel: string;
  unitOfMeasure: string;
  trackingMode: InventoryTrackingMode;
  lots: StockIssuePickableLot[];
  availability: StockIssuePickableAvailability[];
  availableSerialCount: number;
}

export function createEmptyStockIssueDraft(): StockIssueDraftState {
  return { lines: [] };
}

export function createManualStockIssueDraftLine(): StockIssueDraftLine {
  return createBaseDraftLine({
    itemId: '',
    productLabel: '',
    requestedQty: '1',
    unitOfMeasure: '',
    isManual: true,
  });
}

function getLineIdentityKey(
  line: Pick<StockIssueDraftLine, 'itemId' | 'lotId' | 'serializedAssetId'>,
) {
  if (line.serializedAssetId.trim()) {
    return `serial:${line.serializedAssetId.trim()}`;
  }

  return `item:${line.itemId.trim()}:${line.lotId.trim()}`;
}

export function addCatalogSelectionToDraft(
  draft: StockIssueDraftState,
  selections: StockIssueDraftCatalogSelection[],
): AddCatalogToDraftResult {
  const existingKeys = new Set(
    draft.lines.filter((line) => line.itemId.length > 0).map((line) => getLineIdentityKey(line)),
  );

  const skippedItemIds: string[] = [];
  const newLines: StockIssueDraftLine[] = [];

  for (const selection of selections) {
    const provisionalKey = `item:${selection.id}:`;
    if (existingKeys.has(provisionalKey)) {
      skippedItemIds.push(selection.id);
      continue;
    }

    existingKeys.add(provisionalKey);
    newLines.push(
      createBaseDraftLine({
        itemId: selection.id,
        productLabel: `${selection.sku} · ${selection.name}`,
        requestedQty: '1',
        unitOfMeasure: selection.unitOfMeasure,
        isManual: false,
        // La condición nace en la primera con disponible > 0 cuando hay dato del
        // servidor; sin dato se conserva el default NEW (línea manual sin hidratar).
        condition: resolveInitialConditionForSelection(selection),
        ...(selection.trackingMode ? { trackingMode: selection.trackingMode } : {}),
        ...(selection.lots ? { lots: selection.lots } : {}),
        ...(selection.availability ? { availability: selection.availability } : {}),
        ...(selection.availableSerialCount != null
          ? { availableSerialCount: selection.availableSerialCount }
          : {}),
      }),
    );
  }

  return {
    draft: {
      lines: [...draft.lines, ...newLines],
    },
    skippedItemIds,
  };
}

export function removeDraftLine(draft: StockIssueDraftState, lineId: string): StockIssueDraftState {
  return {
    lines: draft.lines.filter((line) => line.id !== lineId),
  };
}

export function removeDraftLines(
  draft: StockIssueDraftState,
  lineIds: string[],
): StockIssueDraftState {
  const ids = new Set(lineIds);
  return {
    lines: draft.lines.filter((line) => !ids.has(line.id)),
  };
}

export function applyBulkQuantityToDraftLines(
  draft: StockIssueDraftState,
  lineIds: string[],
  requestedQty: string,
): StockIssueDraftState {
  const ids = new Set(lineIds);
  return {
    lines: draft.lines.map((line) =>
      ids.has(line.id) && !line.serializedAssetId.trim() ? { ...line, requestedQty } : line,
    ),
  };
}

export function updateDraftLineItem(
  draft: StockIssueDraftState,
  lineId: string,
  itemId: string,
  productLabel: string,
  unitOfMeasure: string,
  hydration?: Omit<StockIssueDraftItemHydration, 'itemId' | 'productLabel' | 'unitOfMeasure'>,
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId
        ? {
            ...line,
            itemId,
            productLabel,
            unitOfMeasure,
            trackingMode: hydration?.trackingMode ?? InventoryTrackingMode.CONSUMABLE,
            lots: hydration?.lots ?? [],
            availability: hydration?.availability ?? [],
            availableSerialCount: hydration?.availableSerialCount ?? 0,
            // Al cambiar de ítem la condición anterior puede no tener disponible;
            // se reubica en la primera con saldo cuando hay dato del servidor.
            condition:
              hydration?.availability && hydration.availability.length > 0
                ? (hydration.availability.find((entry) => parseDecimalAmount(entry.available) > 0)
                    ?.condition ?? StockBalanceCondition.NEW)
                : line.condition,
            lotId: '',
            serializedAssetId: '',
            serializedAssetLabel: '',
            requestedQty: '1',
          }
        : line,
    ),
  };
}

export function updateDraftLineQuantity(
  draft: StockIssueDraftState,
  lineId: string,
  requestedQty: string,
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) => (line.id === lineId ? { ...line, requestedQty } : line)),
  };
}

export function updateDraftLineCondition(
  draft: StockIssueDraftState,
  lineId: string,
  condition: StockBalanceCondition,
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId ? { ...line, condition, lotId: '' } : line,
    ),
  };
}

export function updateDraftLineLot(
  draft: StockIssueDraftState,
  lineId: string,
  lotId: string,
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) => (line.id === lineId ? { ...line, lotId } : line)),
  };
}

export function updateDraftLineSerializedAsset(
  draft: StockIssueDraftState,
  lineId: string,
  serializedAssetId: string,
  serializedAssetLabel = '',
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId
        ? { ...line, serializedAssetId, serializedAssetLabel, requestedQty: '1', lotId: '' }
        : line,
    ),
  };
}
