/**
 * Cobertura del módulo de aritmética decimal exacta de Compras
 * (`decimal-cents.ts`, refactor de Fase 30): la misma selección debe producir
 * el mismo total en matriz, acordeón y barra de resumen, y ninguna operación
 * puede pasar importes por `parseFloat`.
 */

import { decimalStringToCents, formatCentsAsDecimal2, parseDecimalCents } from './decimal-cents';

describe('parseDecimalCents', () => {
  it('convierte cadenas decimales de 2 posiciones de forma exacta', () => {
    expect(parseDecimalCents('428.51')).toBe(42851);
    expect(parseDecimalCents('0.05')).toBe(5);
    expect(parseDecimalCents('0.00')).toBe(0);
    expect(parseDecimalCents('100')).toBe(10000);
    expect(parseDecimalCents('100.')).toBe(10000);
  });

  it('devuelve null ante cadenas que no son decimales simples', () => {
    expect(parseDecimalCents('')).toBeNull();
    expect(parseDecimalCents('   ')).toBeNull();
    expect(parseDecimalCents('.')).toBeNull();
    expect(parseDecimalCents('abc')).toBeNull();
    expect(parseDecimalCents('1,5')).toBeNull();
  });

  it('respeta el signo sin silenciarlo', () => {
    expect(parseDecimalCents('-1.50')).toBe(-150);
    expect(parseDecimalCents('+2.00')).toBe(200);
  });

  it('redondea la cola de más de 2 decimales half-up sin flotantes', () => {
    expect(parseDecimalCents('0.125')).toBe(13);
    expect(parseDecimalCents('0.124')).toBe(12);
    expect(parseDecimalCents('1.005')).toBe(101);
  });
});

describe('decimalStringToCents', () => {
  it('es la variante tolerante: lo no decimal cuenta como 0', () => {
    expect(decimalStringToCents('12.34')).toBe(1234);
    expect(decimalStringToCents('')).toBe(0);
    expect(decimalStringToCents('no-numero')).toBe(0);
  });
});

describe('formatCentsAsDecimal2', () => {
  it('formatea céntimos a cadena decimal exacta de 2 posiciones', () => {
    expect(formatCentsAsDecimal2(42851)).toBe('428.51');
    expect(formatCentsAsDecimal2(5)).toBe('0.05');
    expect(formatCentsAsDecimal2(0)).toBe('0.00');
  });

  it('respeta el signo negativo fielmente', () => {
    expect(formatCentsAsDecimal2(-150)).toBe('-1.50');
  });

  it('round-trip exacto con decimalStringToCents', () => {
    const values = ['0.10', '0.20', '1234.56', '999999.99'];
    for (const value of values) {
      expect(formatCentsAsDecimal2(decimalStringToCents(value))).toBe(value);
    }
  });
});
