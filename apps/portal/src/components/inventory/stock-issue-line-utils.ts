import { InventoryItemKind, InventoryTrackingMode, StockBalanceCondition } from '@iwana/shared';
import type { StockIssuePickableAvailability, StockIssuePickableLot } from '@iwana/shared';
import type { InventoryItemRecord, SerializedAssetRecord } from '@/lib/api-client';
import { formatInventoryQuantity } from './inventory-labels';
import type { StockIssueDraftLine } from './stock-issue-draft';

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

function parseDecimalAmount(value: string | null | undefined): number {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
      line.serializedAssetId.trim() ||
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
 * Con serial elegido el disponible es 1; con lote, el del lote; sin lote, el
 * de la condición en `availability[]`.
 */
export function getAvailableQtyForDraftLine(input: {
  availability: StockIssuePickableAvailability[] | null | undefined;
  lots: StockIssuePickableLot[] | null | undefined;
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetId: string;
}): number {
  if (input.serializedAssetId.trim()) {
    return 1;
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
