/**
 * Catálogo canónico de unidades de medida (ADR-085 D1 · F5a).
 *
 * Conjunto cerrado del sistema: `code` estable para persistencia y comparación,
 * etiqueta en español para superficies visibles y dimensión física declarada.
 * La validación dimensional (D2) llega en F5b; en esta fase solo se exige
 * pertenencia al catálogo.
 *
 * Es catálogo del sistema, no tabla por tenant: el ADR descartó esa alternativa
 * porque haría que cada tenant reinventara 'unidad' con su propia grafía,
 * reintroduciendo el problema que esta fase cierra. Añadir una unidad requiere
 * release de este archivo, nunca configuración por tenant.
 *
 * Coordinación con la migración 122: sus destinos UNIT, METER y BOX son los
 * códigos definidos aquí; la migración no importa este archivo (debe seguir
 * siendo autocontenida) así que cualquier cambio de código exige revisar la
 * migración en el mismo acto.
 */
export const INVENTORY_UNIT_DIMENSIONS = ['COUNT', 'LENGTH', 'MASS', 'VOLUME', 'TIME'] as const;

export type InventoryUnitDimension = (typeof INVENTORY_UNIT_DIMENSIONS)[number];

export const INVENTORY_UNITS_OF_MEASURE = [
  { code: 'UNIT', label: 'Unidad', dimension: 'COUNT' },
  { code: 'BOX', label: 'Caja', dimension: 'COUNT' },
  { code: 'ROLL', label: 'Rollo', dimension: 'COUNT' },
  { code: 'PACK', label: 'Paquete', dimension: 'COUNT' },
  { code: 'METER', label: 'Metro', dimension: 'LENGTH' },
  { code: 'KILOMETER', label: 'Kilómetro', dimension: 'LENGTH' },
  { code: 'KILOGRAM', label: 'Kilogramo', dimension: 'MASS' },
  { code: 'GRAM', label: 'Gramo', dimension: 'MASS' },
  { code: 'LITER', label: 'Litro', dimension: 'VOLUME' },
  { code: 'HOUR', label: 'Hora', dimension: 'TIME' },
] as const;

export type InventoryUnitOfMeasureCode = (typeof INVENTORY_UNITS_OF_MEASURE)[number]['code'];

/** Códigos derivados de la única fuente (`INVENTORY_UNITS_OF_MEASURE`). */
export const INVENTORY_UNIT_OF_MEASURE_CODES: readonly string[] = INVENTORY_UNITS_OF_MEASURE.map(
  (unit) => unit.code,
);

const INVENTORY_UNIT_CODE_SET: ReadonlySet<string> = new Set(
  INVENTORY_UNITS_OF_MEASURE.map((unit) => unit.code),
);

/** Pertenencia al catálogo. Comparación exacta: sin minúsculas, sin recortes, sin similitud. */
export function isInventoryUnitOfMeasureCode(value: unknown): value is InventoryUnitOfMeasureCode {
  return typeof value === 'string' && INVENTORY_UNIT_CODE_SET.has(value);
}

/** Etiqueta en español para superficies visibles; ante código desconocido devuelve el código. */
export function getInventoryUnitOfMeasureLabel(code: string): string {
  return INVENTORY_UNITS_OF_MEASURE.find((unit) => unit.code === code)?.label ?? code;
}

/** Dimensión declarada de un código canónico; undefined si el código no pertenece al catálogo. */
export function getInventoryUnitOfMeasureDimension(
  code: string,
): InventoryUnitDimension | undefined {
  return INVENTORY_UNITS_OF_MEASURE.find((unit) => unit.code === code)?.dimension;
}
