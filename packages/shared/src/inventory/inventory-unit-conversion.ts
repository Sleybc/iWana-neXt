/**
 * Conversión compra → base (ADR-085 D2/D3 · F5b).
 *
 * Punto único de definición de la matemática de conversión y de los mensajes
 * dimensionales en español. Lo consumen el backend (único punto de aplicación
 * por flujo de entrada, Regla 3) y el portal (guía visual, nunca decisión).
 *
 * Precisión y redondeo (restricción §4.7 del prompt F5b, Regla 2):
 * - El factor es `numeric(12,4)`; las cantidades del ledger son
 *   `numeric(12,2)`. Los costos usan `numeric(14,2)`, salvo la conversión
 *   explícita ROLL → METER, que usa `numeric(14,5)` para conservar el valor.
 * - Cada recepción redondea SU PROPIO producto a 2 decimales (half-up):
 *   `base = redondeo2(cantidadCompra × factor)`.
 * - El error por línea queda acotado a 0,005 (media centésima). Las
 *   recepciones sucesivas son independientes entre sí —ninguna encadena el
 *   saldo redondeado anterior— así que no hay deriva por encadenamiento:
 *   N recepciones idénticas producen N veces el mismo valor base.
 * - El costo unitario se normaliza a unidad base preservando el valor total
 *   de la línea: `costoBase = redondeo(costoCompra / factor, escala)`, de modo
 *   que `cantidadBase × costoBase ≈ cantidadCompra × costoCompra`. ROLL →
 *   METER conserva cinco decimales; con 1.000 m por rollo, redondear a
 *   centavos altera el valor de inventario. Sin esta normalización, el costo
 *   promedio móvil (ADR-059) se corrompería en la misma proporción que el saldo.
 */

import {
  getInventoryUnitOfMeasureDimension,
  getInventoryUnitOfMeasureLabel,
  isInventoryUnitOfMeasureCode,
} from './inventory-unit-of-measure';

/** Escala del ledger para cantidades (`numeric(12,2)`). */
export const UOM_BASE_QUANTITY_SCALE = 2;

/** Escala monetaria usual para costos unitarios (`numeric(14,2)`). */
export const UOM_BASE_COST_SCALE = 2;

/**
 * Un rollo de longitud declarada puede convertirse a metros. La división del
 * costo de compra por el factor necesita conservar cinco decimales para que un
 * rollo de 1.000 m no cambie su valor al expresarlo como costo por metro.
 */
export const UOM_ROLL_TO_METER_COST_SCALE = 5;

export function getInventoryBaseUnitCostScale(baseCode: string, purchaseCode: string): number {
  return baseCode === 'METER' && purchaseCode === 'ROLL'
    ? UOM_ROLL_TO_METER_COST_SCALE
    : UOM_BASE_COST_SCALE;
}

/**
 * Redondeo half-up a `scale` decimales (empate siempre hacia arriba).
 *
 * Se suma un épsilon antes de redondear para compensar la representación
 * binaria (p. ej. 2,675 × 100 = 267,49999… en flotante). El épsilon se
 * escala por la magnitud del valor ya multiplicado: `Number.EPSILON`
 * absoluto es menor que el ULP a partir de magnitudes ≥ ~2 y los empates
 * exactos (2,135; 4,015; 8,835 a escala 2) redondearían hacia abajo,
 * con sesgo sistemático a la baja. Con el épsilon relativo
 * (`|scaled| × EPSILON × 4`, con piso 1 para magnitudes < 1) el empuje es
 * ~10⁻¹³ a escalas de ledger, muy por debajo de media centésima, así que
 * solo desempata el caso de borde sin alterar valores no-empate.
 */
export function roundToScale(value: number, scale: number): number {
  const factor = 10 ** scale;
  const scaled = value * factor;
  return (
    Math.round(
      scaled + Math.sign(scaled || 1) * Math.max(1, Math.abs(scaled)) * Number.EPSILON * 4,
    ) / factor
  );
}

/** Cantidad en unidad base, redondeada a la escala del ledger. */
export function convertPurchaseQuantityToBase(purchaseQuantity: number, factor: number): number {
  return roundToScale(purchaseQuantity * factor, UOM_BASE_QUANTITY_SCALE);
}

/**
 * Costo unitario en unidad base, redondeado a escala monetaria.
 * Preserva el valor total de la línea (cantidad × costo).
 */
export function convertPurchaseUnitCostToBase(
  purchaseUnitCost: number,
  factor: number,
  scale = UOM_BASE_COST_SCALE,
): number {
  return roundToScale(purchaseUnitCost / factor, scale);
}

/**
 * Compatibilidad dimensional (ADR-085 D2).
 *
 * Solo se pronuncia cuando ambos códigos pertenecen al catálogo; ante un
 * código desconocido devuelve `false` para no autorizar a ciegas (la
 * pertenencia al catálogo la exige la validación del maestro).
 * `COUNT ↔ COUNT` (caja → unidad) es relación de empaque dentro de la misma
 * dimensión. También se admite `ROLL → METER`: solo es válida con un factor
 * explícito por artículo que declare la longitud fija de ese rollo.
 */
export function areInventoryUnitsDimensionallyCompatible(
  baseCode: string,
  purchaseCode: string,
): boolean {
  if (!isInventoryUnitOfMeasureCode(baseCode) || !isInventoryUnitOfMeasureCode(purchaseCode)) {
    return false;
  }

  if (baseCode === 'METER' && purchaseCode === 'ROLL') return true;

  return (
    getInventoryUnitOfMeasureDimension(baseCode) ===
    getInventoryUnitOfMeasureDimension(purchaseCode)
  );
}

/** Mensaje explicativo en español para el rechazo dimensional (CA-F5B-04). */
export function buildDimensionalMismatchMessage(baseCode: string, purchaseCode: string): string {
  const baseLabel = getInventoryUnitOfMeasureLabel(baseCode);
  const purchaseLabel = getInventoryUnitOfMeasureLabel(purchaseCode);
  const baseDimension = getInventoryUnitOfMeasureDimension(baseCode) ?? 'desconocida';
  const purchaseDimension = getInventoryUnitOfMeasureDimension(purchaseCode) ?? 'desconocida';

  return (
    `La unidad de compra (${purchaseLabel}) y la unidad base (${baseLabel}) pertenecen a ` +
    `dimensiones distintas (${purchaseDimension} frente a ${baseDimension}): la conversión solo ` +
    `es válida dentro de la misma dimensión, salvo Rollo → Metro cuando el artículo declara ` +
    `un factor de conversión fijo. Dentro de Conteo sí se admite empaque (por ejemplo, caja → unidad).`
  );
}

/** Mensaje en español cuando hay unidad de compra distinta sin factor válido (§4.5). */
export function buildMissingPurchaseFactorMessage(baseCode: string, purchaseCode: string): string {
  const baseLabel = getInventoryUnitOfMeasureLabel(baseCode);
  const purchaseLabel = getInventoryUnitOfMeasureLabel(purchaseCode);

  return (
    `El producto declara unidad de compra (${purchaseLabel}) distinta de la unidad base ` +
    `(${baseLabel}) pero no tiene un factor de conversión válido. Sin factor no es posible ` +
    `convertir la cantidad a unidad base: corrija el catálogo antes de recibir.`
  );
}

const INVENTORY_UNIT_PLURAL_LABELS: Record<string, string> = {
  UNIT: 'unidades',
  BOX: 'cajas',
  ROLL: 'rollos',
  PACK: 'paquetes',
  METER: 'metros',
  KILOMETER: 'kilómetros',
  KILOGRAM: 'kilogramos',
  GRAM: 'gramos',
  LITER: 'litros',
  HOUR: 'horas',
};

const INVENTORY_UNIT_SINGULAR_LABELS: Record<string, string> = {
  UNIT: 'unidad',
  BOX: 'caja',
  ROLL: 'rollo',
  PACK: 'paquete',
  METER: 'metro',
  KILOMETER: 'kilómetro',
  KILOGRAM: 'kilogramo',
  GRAM: 'gramo',
  LITER: 'litro',
  HOUR: 'hora',
};

/** Etiqueta plural en minúscula para equivalencias («2 cajas»); ante código ajeno, el código. */
export function getInventoryUnitOfMeasurePluralLabel(code: string): string {
  return INVENTORY_UNIT_PLURAL_LABELS[code] ?? code;
}

/**
 * Etiqueta con concordancia de número según la cantidad que la acompaña
 * («1 caja» frente a «2 cajas»); ante código ajeno, el código.
 */
export function getInventoryUnitOfMeasureLabelForQuantity(quantity: number, code: string): string {
  if (quantity === 1) {
    return INVENTORY_UNIT_SINGULAR_LABELS[code] ?? getInventoryUnitOfMeasurePluralLabel(code);
  }
  return getInventoryUnitOfMeasurePluralLabel(code);
}

function formatCompactQuantity(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: UOM_BASE_QUANTITY_SCALE,
  }).format(value);
}

/**
 * Equivalencia legible para mostrar ANTES de confirmar (CA-F5B-10), con
 * concordancia singular/plural.
 * `formatUomEquivalence(2, 'BOX', 200, 'UNIT')` → `«2 cajas = 200 unidades»`;
 * `formatUomEquivalence(1, 'BOX', 100, 'UNIT')` → `«1 caja = 100 unidades»`.
 */
export function formatUomEquivalence(
  purchaseQuantity: number,
  purchaseCode: string,
  baseQuantity: number,
  baseCode: string,
): string {
  return (
    `${formatCompactQuantity(purchaseQuantity)} ${getInventoryUnitOfMeasureLabelForQuantity(purchaseQuantity, purchaseCode)} = ` +
    `${formatCompactQuantity(baseQuantity)} ${getInventoryUnitOfMeasureLabelForQuantity(baseQuantity, baseCode)}`
  );
}
