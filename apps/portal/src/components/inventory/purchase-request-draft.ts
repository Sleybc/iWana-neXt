import { PurchaseRequestLineSourceKind } from '@iwana/shared';

export interface PurchaseDraftCatalogSelection {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  purchaseUnitOfMeasure: string | null;
  preferredSupplierRefId: string | null;
  preferredSupplierName: string | null;
}

export interface PurchaseDraftLine {
  id: string;
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId: string;
  productLabel: string;
  quantityRequested: string;
  unitOfMeasure: string;
  suggestedPartyRefId: string;
  suggestedPartyName: string;
  notes: string;
}

export interface PurchaseDraftState {
  lines: PurchaseDraftLine[];
}

let draftLineSequence = 0;

function createDraftLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft-line-${crypto.randomUUID()}`;
  }

  draftLineSequence += 1;
  return `draft-line-${draftLineSequence}`;
}

export function createEmptyPurchaseDraft(): PurchaseDraftState {
  return { lines: [] };
}

export function addCatalogSelectionToDraft(
  draft: PurchaseDraftState,
  selections: PurchaseDraftCatalogSelection[],
  sourceKind: PurchaseRequestLineSourceKind,
): PurchaseDraftState {
  return {
    lines: [
      ...draft.lines,
      ...selections.map((selection) => ({
        id: createDraftLineId(),
        sourceKind,
        inventoryItemId: selection.id,
        productLabel: `${selection.sku} - ${selection.name}`,
        quantityRequested: '1',
        unitOfMeasure: selection.purchaseUnitOfMeasure?.trim() || selection.unitOfMeasure,
        suggestedPartyRefId: selection.preferredSupplierRefId ?? '',
        suggestedPartyName: selection.preferredSupplierName ?? '',
        notes: '',
      })),
    ],
  };
}

export function removeDraftLine(draft: PurchaseDraftState, lineId: string): PurchaseDraftState {
  return {
    lines: draft.lines.filter((line) => line.id !== lineId),
  };
}

export function removeDraftLines(draft: PurchaseDraftState, lineIds: string[]): PurchaseDraftState {
  const ids = new Set(lineIds);
  return {
    lines: draft.lines.filter((line) => !ids.has(line.id)),
  };
}

export function applyBulkQuantityToDraftLines(
  draft: PurchaseDraftState,
  lineIds: string[],
  quantityRequested: string,
): PurchaseDraftState {
  const ids = new Set(lineIds);
  return {
    lines: draft.lines.map((line) => (ids.has(line.id) ? { ...line, quantityRequested } : line)),
  };
}

export function applyBulkSupplierToDraftLines(
  draft: PurchaseDraftState,
  lineIds: string[],
  suggestedPartyRefId: string,
  suggestedPartyName: string,
): PurchaseDraftState {
  const ids = new Set(lineIds);
  return {
    lines: draft.lines.map((line) =>
      ids.has(line.id) ? { ...line, suggestedPartyRefId, suggestedPartyName } : line,
    ),
  };
}
