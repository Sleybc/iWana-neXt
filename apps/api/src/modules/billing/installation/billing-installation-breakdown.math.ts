import type { ClosedInstallationConsumptionLine } from '../../tasks/ports/execution-order-consumption-read.port';
import type { InventoryItemValuation } from '../../inventory/ports/installation-consumption-valuation-read.port';

export type InstallationValueSource = 'PRECIO_COMERCIAL' | 'COSTO_PROMEDIO' | 'SIN_VALOR';

export interface InstallationBreakdownItem {
  position: number;
  inventoryItemId: string;
  description: string;
  unitOfMeasure: string;
  quantity: number;
  serialNumbers: string[];
  isLoan: boolean;
  commercialProductId: string | null;
  valueSource: InstallationValueSource;
  /** Texto con dos decimales; null con `SIN_VALOR`. */
  unitReferenceValue: string | null;
  referenceValue: string | null;
}

/**
 * Longitudes del contrato `BillingInstallationBreakdownItemSchema` (packages/shared): lo que se
 * congela debe poder serializarse después. Un serial más largo se recorta; uno vacío se omite.
 */
export const SERIAL_NUMBER_MAX_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 200;
export const UNIT_OF_MEASURE_MAX_LENGTH = 32;

/** Serial normalizado al contrato: sin espacios en los bordes y ≤ 160 caracteres; null si vacío. */
export function contractSerial(value: string | null | undefined): string | null {
  const serial = value?.trim().slice(0, SERIAL_NUMBER_MAX_LENGTH).trim();
  return serial ? serial : null;
}

const FALLBACK_DESCRIPTION = 'Artículo de inventario';
const FALLBACK_UNIT = 'UND';

/** Decimal no negativo en texto → centavos, redondeo mitad hacia arriba. Null si no es válido. */
export function toCents(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value.trim());
  if (!match) return null;
  const decimals = (match[2] ?? '').padEnd(3, '0');
  const cents = Number(match[1]) * 100 + Number(decimals.slice(0, 2));
  return Number(decimals[2]) >= 5 ? cents + 1 : cents;
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/**
 * Valor de referencia por unidad (R2): precio vigente del producto comercial vinculado; si no
 * hay, costo promedio de inventario; si tampoco, sin valor.
 */
export function resolveUnitValue(valuation: InventoryItemValuation | undefined): {
  source: InstallationValueSource;
  cents: number | null;
} {
  const price = toCents(valuation?.commercialProduct?.currentBasePrice);
  if (price !== null) return { source: 'PRECIO_COMERCIAL', cents: price };
  const cost = toCents(valuation?.averageCost);
  if (cost !== null && cost > 0) return { source: 'COSTO_PROMEDIO', cents: cost };
  return { source: 'SIN_VALOR', cents: null };
}

/**
 * Agrupa el consumo por artículo y comodato y congela su valor (R1, R2). Un equipo es comodato
 * si MOD12 lo registró en comodato por la OT o si su producto comercial es de comodato.
 */
export function buildInstallationBreakdownItems(
  lines: readonly ClosedInstallationConsumptionLine[],
  valuations: readonly InventoryItemValuation[],
  loanedSerials: ReadonlySet<string>,
): InstallationBreakdownItem[] {
  const valuationById = new Map(valuations.map((valuation) => [valuation.itemId, valuation]));
  const groups = new Map<
    string,
    { itemId: string; isLoan: boolean; quantity: number; serials: string[] }
  >();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    const valuation = valuationById.get(line.itemId);
    // El comodato se busca con el serial completo de MOD12; se congela recortado al contrato.
    const rawSerial = line.serialNumber?.trim() || null;
    const serial = contractSerial(rawSerial);
    const isLoan =
      (rawSerial !== null && loanedSerials.has(rawSerial)) ||
      valuation?.commercialProduct?.isLoan === true;
    const key = `${line.itemId}|${isLoan ? 'L' : 'M'}`;
    const group = groups.get(key) ?? { itemId: line.itemId, isLoan, quantity: 0, serials: [] };
    group.quantity += line.quantity;
    if (serial !== null && !group.serials.includes(serial)) group.serials.push(serial);
    groups.set(key, group);
  }

  return [...groups.values()].map((group, index) => {
    const valuation = valuationById.get(group.itemId);
    const unit = resolveUnitValue(valuation);
    return {
      position: index + 1,
      inventoryItemId: group.itemId,
      description: (valuation?.name?.trim() || FALLBACK_DESCRIPTION).slice(
        0,
        DESCRIPTION_MAX_LENGTH,
      ),
      unitOfMeasure: (valuation?.unitOfMeasure?.trim() || FALLBACK_UNIT).slice(
        0,
        UNIT_OF_MEASURE_MAX_LENGTH,
      ),
      quantity: group.quantity,
      serialNumbers: group.serials,
      isLoan: group.isLoan,
      commercialProductId: valuation?.commercialProduct?.id ?? null,
      valueSource: unit.source,
      unitReferenceValue: unit.cents === null ? null : formatCents(unit.cents),
      referenceValue: unit.cents === null ? null : formatCents(unit.cents * group.quantity),
    };
  });
}
