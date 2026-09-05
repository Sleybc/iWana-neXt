import {
  INVENTORY_UNIT_DIMENSIONS,
  INVENTORY_UNIT_OF_MEASURE_CODES,
  INVENTORY_UNITS_OF_MEASURE,
  getInventoryUnitOfMeasureDimension,
  getInventoryUnitOfMeasureLabel,
  isInventoryUnitOfMeasureCode,
  type InventoryUnitDimension,
} from './inventory-unit-of-measure';

/** Conjunto cerrado normativo (ADR-085 D1): code + etiqueta en español + dimensión. */
const EXPECTED_CATALOG: ReadonlyArray<{
  code: string;
  label: string;
  dimension: InventoryUnitDimension;
}> = [
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
];

describe('catálogo canónico de unidades de medida (ADR-085 D1)', () => {
  it('contiene exactamente el conjunto cerrado normativo con su dimensión', () => {
    expect(INVENTORY_UNITS_OF_MEASURE).toEqual(EXPECTED_CATALOG);
  });

  it('no tiene códigos ni etiquetas duplicadas', () => {
    const codes = INVENTORY_UNITS_OF_MEASURE.map((unit) => unit.code);
    const labels = INVENTORY_UNITS_OF_MEASURE.map((unit) => unit.label);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('todos los códigos caben en unit_of_measure varchar(32) con holgura', () => {
    for (const unit of INVENTORY_UNITS_OF_MEASURE) {
      expect(unit.code.length).toBeLessThanOrEqual(32);
    }
    const longest = Math.max(...INVENTORY_UNITS_OF_MEASURE.map((unit) => unit.code.length));
    expect(longest).toBeLessThanOrEqual(9);
  });

  it('todas las dimensiones pertenecen al conjunto cerrado de dimensiones', () => {
    const dimensions: ReadonlySet<string> = new Set(INVENTORY_UNIT_DIMENSIONS);
    expect([...dimensions].sort()).toEqual(['COUNT', 'LENGTH', 'MASS', 'TIME', 'VOLUME']);
    for (const unit of INVENTORY_UNITS_OF_MEASURE) {
      expect(dimensions.has(unit.dimension)).toBe(true);
    }
  });

  it('expone los destinos de la migración 122 con su dimensión (UNIT, METER, BOX)', () => {
    expect(getInventoryUnitOfMeasureDimension('UNIT')).toBe('COUNT');
    expect(getInventoryUnitOfMeasureDimension('METER')).toBe('LENGTH');
    expect(getInventoryUnitOfMeasureDimension('BOX')).toBe('COUNT');
  });

  it('deriva los códigos de la única fuente, sin lista paralela', () => {
    expect([...INVENTORY_UNIT_OF_MEASURE_CODES].sort()).toEqual(
      INVENTORY_UNITS_OF_MEASURE.map((unit) => unit.code).sort(),
    );
  });

  it.each(EXPECTED_CATALOG.map((unit) => [unit.code] as const))(
    'acepta el código canónico %s',
    (code) => {
      expect(isInventoryUnitOfMeasureCode(code)).toBe(true);
    },
  );

  it.each([
    ['unidad'],
    ['UND'],
    ['und'],
    ['UNIDAD'],
    ['metro'],
    ['m'],
    ['M'],
    ['METRO'],
    ['caja'],
    ['CAJA'],
    [''],
    ['   '],
    ['unit'],
    ['litro'],
  ])('rechaza el valor legacy o ajeno al catálogo %s', (value) => {
    expect(isInventoryUnitOfMeasureCode(value)).toBe(false);
  });

  it('rechaza no-strings sin lanzar', () => {
    expect(isInventoryUnitOfMeasureCode(null)).toBe(false);
    expect(isInventoryUnitOfMeasureCode(undefined)).toBe(false);
    expect(isInventoryUnitOfMeasureCode(123)).toBe(false);
    expect(isInventoryUnitOfMeasureCode({})).toBe(false);
  });

  it('resuelve etiquetas en español y devuelve el código ante valor desconocido', () => {
    expect(getInventoryUnitOfMeasureLabel('UNIT')).toBe('Unidad');
    expect(getInventoryUnitOfMeasureLabel('KILOMETER')).toBe('Kilómetro');
    expect(getInventoryUnitOfMeasureLabel('HOUR')).toBe('Hora');
    expect(getInventoryUnitOfMeasureLabel('unidad')).toBe('unidad');
  });
});
