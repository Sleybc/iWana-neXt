import {
  InventoryTrackingMode,
  StockBalanceCondition,
  type StockIssuePickableAvailability,
  type StockIssuePickableLot,
  type StockIssueType,
} from '@iwana/shared';
import { parseDecimalAmount } from './stock-issue-balance-utils';

export interface StockIssueDraftCatalogSelection {
  id: string;
  sku: string;
  name: string;
  /** Modelo cuando la fuente lo conoce (maestro); B1 aún no lo expone. */
  model?: string | null;
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
  sku: string;
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
   * Grupo de seriales de la línea (MOD12 S2, contrato v2): para ítems
   * serializados su longitud ES la cantidad; vacío mientras la línea de vía
   * rápida espera configuración.
   */
  serializedAssetIds: string[];
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

/**
 * Normaliza el grupo de seriales de una línea: el arreglo v2 cuando existe y,
 * en transición, el singular S1 como arreglo de un elemento (contrato
 * `StockIssueLineInput`/`StockIssueLineRecord` de `@iwana/shared`).
 */
export function resolveLineSerializedAssetIds(line: {
  serializedAssetIds?: string[] | null;
  serializedAssetId?: string | null;
}): string[] {
  if (line.serializedAssetIds && line.serializedAssetIds.length > 0) {
    return line.serializedAssetIds;
  }
  const singular = line.serializedAssetId?.trim() ?? '';
  return singular ? [singular] : [];
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
    sku: '',
    condition: StockBalanceCondition.NEW,
    lotId: '',
    serializedAssetId: '',
    serializedAssetLabel: '',
    serializedAssetIds: [],
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    lots: [],
    availability: [],
    availableSerialCount: 0,
    ...partial,
  };
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

/**
 * Etiqueta de producto para las líneas del borrador: nombre + modelo, sin
 * código. El modelo solo se muestra cuando la fuente lo conoce (maestro vía
 * `getItem` o caché de edición); B1 aún no lo expone y esas líneas muestran
 * solo el nombre.
 */
export function buildDraftProductLabel(name: string, model?: string | null): string {
  const baseName = name.trim();
  const baseModel = model?.trim() ? model.trim() : '';
  return baseModel ? `${baseName} · ${baseModel}` : baseName;
}

/**
 * Clave de identidad de una línea del borrador (fuente única DRY S2.1: la usan
 * el dedup del borrador y el validador estructurado del envío). Con seriales,
 * el grupo manda; sin ellos, la tupla (ítem, lote).
 */
export function getStockIssueLineIdentityKey(line: {
  itemId: string;
  lotId: string;
  serializedAssetId?: string | null;
  serializedAssetIds?: string[] | null;
}): string {
  const serializedIds = resolveLineSerializedAssetIds(line);
  if (serializedIds.length > 0) {
    return `serial:${[...serializedIds].sort().join(',')}`;
  }

  return `item:${line.itemId.trim()}:${line.lotId.trim()}`;
}

export function addCatalogSelectionToDraft(
  draft: StockIssueDraftState,
  selections: StockIssueDraftCatalogSelection[],
): AddCatalogToDraftResult {
  const existingKeys = new Set(
    draft.lines
      .filter((line) => line.itemId.length > 0)
      .map((line) => getStockIssueLineIdentityKey(line)),
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
        sku: selection.sku,
        productLabel: buildDraftProductLabel(selection.name, selection.model),
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
      ids.has(line.id) && resolveLineSerializedAssetIds(line).length === 0
        ? { ...line, requestedQty }
        : line,
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

/** Configuración confirmada desde el panel lateral de línea (MOD12 S2). */
export interface StockIssueDraftLineConfiguration {
  condition: StockBalanceCondition;
  lotId: string;
  /** Grupo de seriales elegido; para serializados su longitud es la cantidad. */
  serializedAssetIds: string[];
  /** Etiquetas conocidas de los seriales (panel y búsqueda del picker). */
  serializedAssetLabels: Record<string, string>;
  requestedQty: string;
}

/**
 * Aplica la configuración del panel a una línea del borrador: condición, lote y
 * grupo de seriales. El singular de transición se alimenta con el primer serial
 * del grupo para no romper lecturas existentes (contrato v2 §5.1).
 */
export function updateDraftLineConfiguration(
  draft: StockIssueDraftState,
  lineId: string,
  configuration: StockIssueDraftLineConfiguration,
): StockIssueDraftState {
  const ids = [...new Set(configuration.serializedAssetIds.map((id) => id.trim()))].filter(Boolean);
  const firstId = ids[0] ?? '';
  return {
    lines: draft.lines.map((line) =>
      line.id === lineId
        ? {
            ...line,
            condition: configuration.condition,
            lotId: configuration.lotId,
            serializedAssetIds: ids,
            serializedAssetId: firstId,
            serializedAssetLabel: firstId
              ? (configuration.serializedAssetLabels[firstId] ?? '')
              : '',
            requestedQty: configuration.requestedQty,
          }
        : line,
    ),
  };
}

/**
 * Invalida el contexto de bodega de las líneas (S2.1 C3): al cambiar el origen,
 * los `lots`, la `availability` y el conteo de seriales dejan de pertenecer a
 * la bodega vigente y el disponible contextual nunca se calcula con ellos. La
 * condición y la cantidad pedida se conservan; los seriales elegidos (activos
 * de la bodega anterior) se retiran para que el panel los vuelva a pedir.
 */
export function invalidateDraftStockContext(draft: StockIssueDraftState): StockIssueDraftState {
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (
      line.lots.length === 0 &&
      line.availability.length === 0 &&
      line.availableSerialCount === 0 &&
      !line.lotId &&
      resolveLineSerializedAssetIds(line).length === 0
    ) {
      return line;
    }
    changed = true;
    return {
      ...line,
      lots: [],
      availability: [],
      availableSerialCount: 0,
      lotId: '',
      serializedAssetId: '',
      serializedAssetLabel: '',
      serializedAssetIds: [],
    };
  });
  return changed ? { lines } : draft;
}

export interface PickableStockContext {
  lots: StockIssuePickableLot[];
  availability: StockIssuePickableAvailability[];
  availableSerialCount: number;
}

/**
 * Rehidrata las líneas sin contexto desde el caché de elegibles de la bodega
 * vigente (S2.1 C3): solo toca líneas con `lots` y `availability` vacíos, así
 * que la captura que el operador ya reconfiguró nunca se pisa. Devuelve los
 * ids rehidratados para aplicarles la preselección de lote único.
 */
export function rehydrateBareDraftLines(
  draft: StockIssueDraftState,
  contextByItemId: Map<string, PickableStockContext>,
): { draft: StockIssueDraftState; rehydratedLineIds: string[] } {
  const rehydratedLineIds: string[] = [];
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (!line.itemId.trim() || line.lots.length > 0 || line.availability.length > 0) {
      return line;
    }
    const context = contextByItemId.get(line.itemId);
    if (!context) {
      return line;
    }
    changed = true;
    rehydratedLineIds.push(line.id);
    return {
      ...line,
      lots: context.lots,
      availability: context.availability,
      availableSerialCount: context.availableSerialCount,
    };
  });
  return changed ? { draft: { lines }, rehydratedLineIds } : { draft, rehydratedLineIds };
}

export interface ComposerSnapshotLine {
  itemId: string;
  requestedQty: string;
  condition: string;
  lotId: string;
  serializedAssetId: string;
  serializedAssetIds: string[];
}

export interface ComposerSnapshot {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: ComposerSnapshotLine[];
}

export function buildComposerSnapshot(input: {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: StockIssueDraftLine[];
}): ComposerSnapshot {
  return {
    type: input.type,
    sourceLocationId: input.sourceLocationId,
    destinationLocationId: input.destinationLocationId,
    commercialRefId: input.commercialRefId,
    originRefId: input.originRefId,
    costCenter: input.costCenter,
    reason: input.reason,
    lines: input.lines.map((line) => ({
      itemId: line.itemId,
      requestedQty: line.requestedQty,
      condition: line.condition,
      lotId: line.lotId,
      serializedAssetId: line.serializedAssetId,
      serializedAssetIds: [...line.serializedAssetIds].sort(),
    })),
  };
}

function areSnapshotLinesEqual(left: ComposerSnapshotLine, right: ComposerSnapshotLine): boolean {
  return (
    left.itemId === right.itemId &&
    left.requestedQty === right.requestedQty &&
    left.condition === right.condition &&
    left.lotId === right.lotId &&
    left.serializedAssetId === right.serializedAssetId &&
    left.serializedAssetIds.length === right.serializedAssetIds.length &&
    left.serializedAssetIds.every((id, index) => id === right.serializedAssetIds[index])
  );
}

/**
 * Compara instantáneas del composer campo por campo (S2.1 C4): sustituye el
 * `JSON.stringify` del cálculo de cambios sin guardar, sin cambiar su
 * semántica (el orden de las líneas sigue siendo significativo).
 */
export function areComposerSnapshotsEqual(
  left: ComposerSnapshot | null,
  right: ComposerSnapshot | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.type === right.type &&
    left.sourceLocationId === right.sourceLocationId &&
    left.destinationLocationId === right.destinationLocationId &&
    left.commercialRefId === right.commercialRefId &&
    left.originRefId === right.originRefId &&
    left.costCenter === right.costCenter &&
    left.reason === right.reason &&
    left.lines.length === right.lines.length &&
    left.lines.every((line, index) => {
      const other = right.lines[index];
      return other ? areSnapshotLinesEqual(line, other) : false;
    })
  );
}
