import {
  UOM_BASE_COST_SCALE,
  UOM_BASE_QUANTITY_SCALE,
  areInventoryUnitsDimensionallyCompatible,
  buildDimensionalMismatchMessage,
  buildMissingPurchaseFactorMessage,
  convertPurchaseQuantityToBase,
  convertPurchaseUnitCostToBase,
  formatUomEquivalence,
  getInventoryUnitOfMeasureLabelForQuantity,
  getInventoryUnitOfMeasurePluralLabel,
  roundToScale,
} from './inventory-unit-conversion';

describe('conversión compra → base (ADR-085 D2/D3 · F5b)', () => {
  describe('compatibilidad dimensional (D2)', () => {
    it.each([
      ['UNIT', 'BOX'],
      ['BOX', 'UNIT'],
      ['ROLL', 'PACK'],
      ['METER', 'KILOMETER'],
      ['KILOGRAM', 'GRAM'],
    ])('acepta %s ↔ %s (misma dimensión)', (base, purchase) => {
      expect(areInventoryUnitsDimensionallyCompatible(base, purchase)).toBe(true);
    });

    it.each([
      ['METER', 'LITER'],
      ['UNIT', 'METER'],
      ['KILOGRAM', 'LITER'],
      ['HOUR', 'UNIT'],
      ['BOX', 'GRAM'],
    ])('rechaza %s ↔ %s (distinta dimensión)', (base, purchase) => {
      expect(areInventoryUnitsDimensionallyCompatible(base, purchase)).toBe(false);
    });

    it('no autoriza a ciegas ante códigos ajenos al catálogo', () => {
      expect(areInventoryUnitsDimensionallyCompatible('unidad', 'BOX')).toBe(false);
      expect(areInventoryUnitsDimensionallyCompatible('UNIT', 'caja')).toBe(false);
      expect(areInventoryUnitsDimensionallyCompatible('UND', 'UND')).toBe(false);
    });
  });

  describe('mensajes en español', () => {
    it('el rechazo dimensional explica dimensiones y la excepción de empaque', () => {
      const message = buildDimensionalMismatchMessage('METER', 'LITER');
      expect(message).toMatch(/dimensiones distintas/);
      expect(message).toMatch(/Metro/);
      expect(message).toMatch(/Litro/);
      expect(message).toMatch(/LENGTH/);
      expect(message).toMatch(/VOLUME/);
      expect(message).toMatch(/caja → unidad/);
    });

    it('el factor ausente exige corregir el catálogo antes de recibir', () => {
      const message = buildMissingPurchaseFactorMessage('UNIT', 'BOX');
      expect(message).toMatch(/factor de conversión válido/);
      expect(message).toMatch(/Caja/);
      expect(message).toMatch(/Unidad/);
      expect(message).toMatch(/corrija el catálogo/);
    });
  });

  describe('redondeo half-up (roundToScale · épsilon escalado por magnitud)', () => {
    it.each([
      [2.135, 2.14],
      [4.015, 4.02],
      [8.835, 8.84],
    ])('empate exacto por magnitud: %j → %j (no redondea hacia abajo)', (value, expected) => {
      // Regresión I-1: con Number.EPSILON absoluto, 1M de valores escaneados
      // mostraban ~4.573 empates redondeando hacia abajo a partir de magnitud ≥ ~2.
      expect(roundToScale(value, 2)).toBe(expected);
    });

    it('el empate siempre es hacia arriba, también cuando el binario es exacto', () => {
      // 2.125 y 4.125 son exactos en binario: half-up estándar exige subir.
      expect(roundToScale(2.125, 2)).toBe(2.13);
      expect(roundToScale(4.125, 2)).toBe(4.13);
    });

    it('el caso binario bajo documentado en el header (2,675) sube', () => {
      expect(roundToScale(2.675, 2)).toBe(2.68);
    });

    it('los valores no-empate no cambian con el épsilon escalado', () => {
      expect(roundToScale(2.345, 2)).toBe(2.35);
      expect(roundToScale(2.674, 2)).toBe(2.67);
      expect(roundToScale(2.676, 2)).toBe(2.68);
      expect(roundToScale(0.125, 2)).toBe(0.13);
      expect(roundToScale(200.004, 2)).toBe(200);
    });
  });

  describe('conversión de cantidades (D3)', () => {
    it('CA-F5B-01: 2 cajas × 100 → 200 unidades', () => {
      expect(convertPurchaseQuantityToBase(2, 100)).toBe(200);
    });

    it('convierte factores decimales (3 × 2,5 → 7,5)', () => {
      expect(convertPurchaseQuantityToBase(3, 2.5)).toBe(7.5);
    });

    it('redondea el producto a 2 decimales (3 × 1,3333 → 4)', () => {
      expect(convertPurchaseQuantityToBase(3, 1.3333)).toBe(4);
    });

    it('regresión I-1: el empate del producto sube (4,05 × 2,5 = 10,125 → 10,13)', () => {
      expect(convertPurchaseQuantityToBase(4.05, 2.5)).toBe(10.13);
    });

    it('acota el error por línea a media centésima (1 × 0,3333 → 0,33)', () => {
      expect(convertPurchaseQuantityToBase(1, 0.3333)).toBe(0.33);
    });

    it('es determinista en recepciones sucesivas: N idénticas dan N veces lo mismo', () => {
      const received = [2, 2, 2, 2, 2].map((qty) => convertPurchaseQuantityToBase(qty, 100));
      expect(received).toEqual([200, 200, 200, 200, 200]);
      expect(received.reduce((sum, value) => sum + value, 0)).toBe(1000);
    });
  });

  describe('normalización del costo (invariante de valor total)', () => {
    it('50000 por caja / 100 → 500 por unidad', () => {
      expect(convertPurchaseUnitCostToBase(50000, 100)).toBe(500);
    });

    it('preserva el valor total salvo centavos de redondeo', () => {
      const purchaseQty = 2;
      const factor = 100;
      const purchaseCost = 50000;
      const baseQty = convertPurchaseQuantityToBase(purchaseQty, factor);
      const baseCost = convertPurchaseUnitCostToBase(purchaseCost, factor);
      expect(baseQty * baseCost).toBe(purchaseQty * purchaseCost);
    });

    it('documenta la escala monetaria (2) y de cantidad (2)', () => {
      expect(UOM_BASE_QUANTITY_SCALE).toBe(2);
      expect(UOM_BASE_COST_SCALE).toBe(2);
      expect(roundToScale(2.345, 2)).toBe(2.35);
    });
  });

  describe('equivalencia legible (CA-F5B-10)', () => {
    it('«2 cajas = 200 unidades»', () => {
      expect(formatUomEquivalence(2, 'BOX', 200, 'UNIT')).toBe('2 cajas = 200 unidades');
    });

    it('regresión M-3: concordancia singular con cantidad 1 («1 caja = 100 unidades»)', () => {
      expect(formatUomEquivalence(1, 'BOX', 100, 'UNIT')).toBe('1 caja = 100 unidades');
      expect(formatUomEquivalence(1, 'ROLL', 1, 'METER')).toBe('1 rollo = 1 metro');
    });

    it('usa plurales del catálogo y compacta decimales', () => {
      expect(formatUomEquivalence(3, 'ROLL', 7.5, 'METER')).toBe('3 rollos = 7,5 metros');
      expect(getInventoryUnitOfMeasurePluralLabel('KILOMETER')).toBe('kilómetros');
      expect(getInventoryUnitOfMeasurePluralLabel('HOUR')).toBe('horas');
    });

    it('el selector por cantidad singulariza solo con cantidad 1 y códigos del catálogo', () => {
      expect(getInventoryUnitOfMeasureLabelForQuantity(1, 'LITER')).toBe('litro');
      expect(getInventoryUnitOfMeasureLabelForQuantity(1.0, 'KILOGRAM')).toBe('kilogramo');
      expect(getInventoryUnitOfMeasureLabelForQuantity(2, 'LITER')).toBe('litros');
      expect(getInventoryUnitOfMeasureLabelForQuantity(1, 'caja')).toBe('caja');
    });

    it('ante código ajeno muestra el código (sin inventar etiqueta)', () => {
      expect(getInventoryUnitOfMeasurePluralLabel('caja')).toBe('caja');
    });
  });
});
