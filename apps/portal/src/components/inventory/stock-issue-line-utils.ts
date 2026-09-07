import {
  InventoryItemKind,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
} from '@iwana/shared';
import type { StockIssuePickableAvailability, StockIssuePickableLot } from '@iwana/shared';
import type { InventoryItemRecord, SerializedAssetRecord } from '@/lib/api-client';
import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';
import type {
  SearchablePickerItem,
  SearchablePickerSearchResult,
} from '@/components/shared/SearchablePicker';
import { formatInventoryQuantity, getSerializedAssetStatusLabel } from './inventory-labels';
import { parseDecimalAmount } from './stock-issue-balance-utils';
import type { StockIssueDraftLine } from './stock-issue-draft';
import { resolveLineSerializedAssetIds } from './stock-issue-draft';

export function isSerializedInventoryItem(
  item: Pick<InventoryItemRecord, 'trackingMode' | 'itemKind'>,
): boolean {
  return (
    item.trackingMode === InventoryTrackingMode.SERIALIZED ||
    item.itemKind === InventoryItemKind.SERIALIZED
  );
}

/**
 * Serializado según la LÍNEA (S1, corrección de C3): `SERIALIZED` y `FIXED_ASSET`
 * exigen activo (D2/B3); nunca se deriva de `knownItems`.
 */
export function isSerializedTrackingMode(
  trackingMode: InventoryTrackingMode | null | undefined,
): boolean {
  return (
    trackingMode === InventoryTrackingMode.SERIALIZED ||
    trackingMode === InventoryTrackingMode.FIXED_ASSET
  );
}

export interface StockIssueLotOption {
  lotId: string;
  lotNumber: string;
  expiryDate: string | null;
  availableQty: number;
}

/**
 * Opciones de lote desde `lots[]` del contrato B1 (S1): `lotNumber` real y
 * vencimiento en vez de `lotId.slice(0, 8)`. Solo lotes con disponible > 0 en
 * la condición de la línea (D3).
 */
export function listLotOptionsFromPickableLots(
  lots: StockIssuePickableLot[] | null | undefined,
  condition: StockBalanceCondition,
): StockIssueLotOption[] {
  if (!lots || lots.length === 0) {
    return [];
  }

  return lots
    .filter((lot) => lot.condition === condition && parseDecimalAmount(lot.available) > 0)
    .map((lot) => ({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      expiryDate: lot.expiryDate,
      availableQty: parseDecimalAmount(lot.available),
    }))
    .sort((left, right) => left.lotNumber.localeCompare(right.lotNumber, 'es'));
}

/**
 * Devuelve el lote a preseleccionar cuando los `lots[]` de la línea ofrecen
 * **exactamente uno** con disponible en su condición; cadena vacía si hay varios
 * o ninguno.
 *
 * Existe para que el resumen y la línea cuenten lo mismo: la sugerencia dice
 * "Disponible en origen: 50" (total del ítem) y la línea valida por tupla exacta
 * (ítem, lote, condición), así que sin lote elegido mostraría 0. Con un único
 * lote la elección es determinista y la hacemos por el operador; con varios
 * lotes no se adivina, la decisión es suya.
 */
export function resolveSingleLotIdFromLots(
  lots: StockIssuePickableLot[] | null | undefined,
  condition: StockBalanceCondition,
): string {
  const options = listLotOptionsFromPickableLots(lots, condition);

  return options.length === 1 ? (options[0]?.lotId ?? '') : '';
}

/**
 * Aplica la preselección de lote único a las líneas indicadas (o a todas si no
 * se acota) usando los `lots[]` de cada línea. Nunca pisa un lote ya elegido ni
 * una línea serializada.
 */
export function applySingleLotPreselectionToDraftLines(
  lines: StockIssueDraftLine[],
  input?: {
    lineIds?: readonly string[];
  },
): StockIssueDraftLine[] {
  const scope = input?.lineIds ? new Set(input.lineIds) : null;
  let changed = false;

  const next = lines.map((line) => {
    if (scope && !scope.has(line.id)) {
      return line;
    }

    if (
      !line.itemId.trim() ||
      line.lotId.trim() ||
      resolveLineSerializedAssetIds(line).length > 0 ||
      isSerializedTrackingMode(line.trackingMode)
    ) {
      return line;
    }

    const lotId = resolveSingleLotIdFromLots(line.lots, line.condition);

    if (!lotId) {
      return line;
    }

    changed = true;
    return { ...line, lotId };
  });

  return changed ? next : lines;
}

/**
 * Disponible de la línea por tupla exacta (ítem, lote, condición) desde los
 * datos B1 de la propia línea (la bodega ya viene acotada en el contrato).
 * Con grupo de seriales el disponible es el conteo de la bodega
 * (`availableSerialCount`); con serial singular de transición, 1; con lote, el
 * del lote; sin lote, el de la condición en `availability[]`.
 */
export function getAvailableQtyForDraftLine(input: {
  availability: StockIssuePickableAvailability[] | null | undefined;
  lots: StockIssuePickableLot[] | null | undefined;
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetId: string;
  /** Grupo v2 (MOD12 S2); cuando trae seriales manda sobre el singular. */
  serializedAssetIds?: string[];
  /** Seriales disponibles del ítem en la bodega (contrato B1). */
  availableSerialCount?: number;
}): number {
  if (resolveLineSerializedAssetIds(input).length > 0) {
    const groupSize = resolveLineSerializedAssetIds(input).length;
    const serialCount = input.availableSerialCount ?? 1;
    return Math.max(serialCount, groupSize);
  }

  const lotId = input.lotId.trim();
  if (lotId) {
    const lot = (input.lots ?? []).find(
      (entry) => entry.lotId === lotId && entry.condition === input.condition,
    );
    return lot ? parseDecimalAmount(lot.available) : 0;
  }

  // Sin lote elegido y con lotes disponibles en la condición, el disponible es 0:
  // la línea valida por tupla exacta y el operador debe elegir el lote (con un
  // único lote la preselección ya lo hizo por él).
  const lotsInCondition = (input.lots ?? []).filter(
    (entry) => entry.condition === input.condition && parseDecimalAmount(entry.available) > 0,
  );
  if (lotsInCondition.length > 0) {
    return 0;
  }

  const entry = (input.availability ?? []).find((row) => row.condition === input.condition);
  return entry ? parseDecimalAmount(entry.available) : 0;
}

/**
 * Condiciones con disponible > 0 para el selector de la línea (D3). Sin dato
 * del servidor se devuelven las tres para no bloquear la captura manual.
 */
export function listAvailableConditionsForDraftLine(
  availability: StockIssuePickableAvailability[] | null | undefined,
): StockBalanceCondition[] {
  if (!availability || availability.length === 0) {
    return Object.values(StockBalanceCondition);
  }

  const withStock = availability.filter((row) => parseDecimalAmount(row.available) > 0);
  if (withStock.length === 0) {
    return Object.values(StockBalanceCondition);
  }

  return withStock.map((row) => row.condition);
}

/** Disponible formateado por condición para las etiquetas del selector de la línea. */
export function getAvailableQtyByCondition(
  availability: StockIssuePickableAvailability[] | null | undefined,
  condition: StockBalanceCondition,
): number {
  const entry = (availability ?? []).find((row) => row.condition === condition);
  return entry ? parseDecimalAmount(entry.available) : 0;
}

export function listSerializedAssetsForItemAtLocation(
  assets: SerializedAssetRecord[],
  itemId: string,
  locationId: string,
): SerializedAssetRecord[] {
  if (!itemId || !locationId) {
    return [];
  }

  return assets
    .filter((asset) => asset.inventoryItemId === itemId && asset.currentLocationId === locationId)
    .sort((left, right) =>
      (left.serialNumber ?? left.assetTag ?? left.id).localeCompare(
        right.serialNumber ?? right.assetTag ?? right.id,
        'es',
      ),
    );
}

export function formatSerializedAssetLabel(asset: SerializedAssetRecord): string {
  if (asset.serialNumber?.trim()) {
    return asset.serialNumber.trim();
  }
  if (asset.assetTag?.trim()) {
    return asset.assetTag.trim();
  }
  return asset.id.slice(0, 8).toUpperCase();
}

/** Etiqueta corta del serial elegido cuando aún no se resolvió su rótulo. */
export function fallbackSerializedAssetLabel(assetId: string): string {
  return assetId.slice(0, 8).toUpperCase();
}

/**
 * Variante tonal del `Badge` de `@iwana/ui` para la condición de saldo.
 * Fuente única para catálogo y tabla del borrador; el texto visible siempre
 * viene de `getStockBalanceConditionLabel` (nunca el enum crudo).
 */
export function stockConditionBadgeVariant(
  condition: StockBalanceCondition,
): 'success' | 'warning' | 'error' {
  switch (condition) {
    case StockBalanceCondition.NEW:
      return 'success';
    case StockBalanceCondition.REFURBISHED:
      return 'warning';
    case StockBalanceCondition.DAMAGED:
      return 'error';
    default:
      return 'success';
  }
}

/** Estados que un serial debe tener para salir (B2 S1: lista separada por comas). */
export const PICKABLE_SERIAL_STATUSES = [
  SerializedAssetStatus.AVAILABLE,
  SerializedAssetStatus.AVAILABLE_REFURBISHED,
].join(',');

export const SERIAL_PICKER_PAGE_SIZE = 50;

/**
 * Barrido servidor del alcance (S2.1 C2): página del contrato `listAssets`
 * (su tope) y cota del barrido por búsqueda. Un serial fuera de la primera
 * página se alcanza por su número exacto o por el barrido paginado — nunca
 * por el `limit: 50` fijo con filtro cliente que ocultaba el resto.
 */
const SERIAL_SCAN_PAGE_LIMIT = 100;
const SERIAL_SCAN_MAX_PAGES = 10;

function toPickableSerialOption(asset: SerializedAssetRecord): SearchablePickerItem {
  return {
    id: asset.id,
    label: formatSerializedAssetLabel(asset),
    sublabel: getSerializedAssetStatusLabel(asset.currentStatus),
  };
}

function matchesSerialQuery(asset: SerializedAssetRecord, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const haystack = `${asset.serialNumber ?? ''} ${asset.assetTag ?? ''} ${asset.id}`.toLowerCase();
  return haystack.includes(needle);
}

/**
 * Lookup de seriales elegibles acotado a ítem + bodega (S1/S2), compartido por
 * el picker singular (`InventoryAssetPicker`) y el multiselector del panel de
 * línea (MOD12 S2): mismos filtros `status`, mismo filtro cliente de
 * `excludeIds` y misma etiqueta canónica por serial.
 *
 * S2.1 C2: con alcance, la búsqueda exacta viaja al servidor (`serialNumber`,
 * igualdad normalizada) y el resto se resuelve con barrido paginado real por
 * `page`; el `total` devuelto es el de coincidencias filtrables (consulta +
 * exclusión), coherente con lo que el picker muestra.
 */
export async function searchPickableSerializedAssets(input: {
  itemId: string | null | undefined;
  locationId: string | null | undefined;
  excludeIds?: readonly string[] | undefined;
  query: string;
  signal: AbortSignal;
}): Promise<SearchablePickerSearchResult> {
  const scopedItemId = input.itemId?.trim() ?? '';
  const scopedLocationId = input.locationId?.trim() ?? '';

  if (!scopedItemId || !scopedLocationId) {
    const response = await inventoryApi.searchAssetsForPicker(
      { q: input.query },
      { signal: input.signal },
    );
    return mapPickerSearchResponse(response);
  }

  const excluded = new Set(input.excludeIds ?? []);
  const needle = input.query.trim().toLowerCase();

  // Un serial fuera de la primera página se alcanza por su número exacto con
  // una sola petición, sin depender del barrido.
  if (needle) {
    const exact = await inventoryApi.listAssets({
      itemId: scopedItemId,
      locationId: scopedLocationId,
      status: PICKABLE_SERIAL_STATUSES,
      serialNumber: input.query.trim(),
      limit: SERIAL_SCAN_PAGE_LIMIT,
    });
    if (input.signal.aborted) {
      return { items: [], total: 0 };
    }
    const exactMatches = exact.data.filter((asset) => !excluded.has(asset.id));
    if (exactMatches.length > 0) {
      return {
        items: exactMatches.map(toPickableSerialOption),
        total: exactMatches.length,
      };
    }
  }

  const matches: SearchablePickerItem[] = [];
  let totalMatches = 0;
  let universeTotal = Number.POSITIVE_INFINITY;
  let page = 1;
  while (page <= SERIAL_SCAN_MAX_PAGES && (page - 1) * SERIAL_SCAN_PAGE_LIMIT < universeTotal) {
    const response = await inventoryApi.listAssets({
      itemId: scopedItemId,
      locationId: scopedLocationId,
      status: PICKABLE_SERIAL_STATUSES,
      limit: SERIAL_SCAN_PAGE_LIMIT,
      page,
    });
    if (input.signal.aborted) {
      return { items: [], total: 0 };
    }
    universeTotal = response.meta.total;
    for (const asset of response.data) {
      if (excluded.has(asset.id) || !matchesSerialQuery(asset, needle)) {
        continue;
      }
      totalMatches += 1;
      if (matches.length < SERIAL_PICKER_PAGE_SIZE) {
        matches.push(toPickableSerialOption(asset));
      }
    }
    if (response.data.length < SERIAL_SCAN_PAGE_LIMIT) {
      break;
    }
    page += 1;
  }
  return { items: matches, total: totalMatches };
}

export function formatLotOptionLabel(option: {
  lotNumber: string;
  expiryDate: string | null;
  availableQty: number;
}): string {
  return `${option.lotNumber} · ${formatLotExpiryDate(option.expiryDate)} · ${formatInventoryQuantity(option.availableQty)}`;
}

/**
 * Vencimiento en español para etiquetas de lote: fecha ES (`es-CO`) o
 * "sin vencimiento" cuando es null. El número de lote es dato técnico y se
 * pinta en mono donde la superficie lo permite (Firma §3.6).
 */
export function formatLotExpiryDate(expiryDate: string | null | undefined): string {
  if (!expiryDate?.trim()) {
    return 'sin vencimiento';
  }

  // Las fechas de vencimiento viajan como día calendario: se formatean por partes
  // para no desplazar el día según la zona horaria del cliente.
  const trimmed = expiryDate.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (dateOnly) {
    return `vence ${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return 'sin vencimiento';
  }

  return `vence ${new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)}`;
}
