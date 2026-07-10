import { StockBalanceCondition } from '@iwana/shared';

export interface StockIssueDraftCatalogSelection {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
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
  partial: Omit<StockIssueDraftLine, 'id' | 'condition' | 'lotId' | 'serializedAssetId'> &
    Partial<Pick<StockIssueDraftLine, 'condition' | 'lotId' | 'serializedAssetId'>>,
): StockIssueDraftLine {
  return {
    id: createDraftLineId(),
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    ...partial,
  };
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
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId
        ? {
            ...line,
            itemId,
            productLabel,
            unitOfMeasure,
            lotId: '',
            serializedAssetId: '',
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
): StockIssueDraftState {
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId ? { ...line, serializedAssetId, requestedQty: '1', lotId: '' } : line,
    ),
  };
}
