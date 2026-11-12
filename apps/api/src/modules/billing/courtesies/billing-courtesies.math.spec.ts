import { fromCents, splitVatIncluded, toCents } from './billing-courtesies.service';
import { activeCourtesySum } from './billing-courtesy.sql';

describe('cortesías: aritmética monetaria', () => {
  it.each([
    ['3548.39', 354839],
    ['-3548.39', -354839],
    ['0', 0],
    ['12.5', 1250],
    [55000, 5500000],
  ])('toCents(%p) = %p', (value, cents) => {
    expect(toCents(value)).toBe(cents);
  });

  it('rechaza formatos no monetarios', () => {
    expect(() => toCents('1,5')).toThrow(RangeError);
    expect(() => toCents('abc')).toThrow(RangeError);
  });

  it.each([
    [354839, '3548.39'],
    [-354839, '-3548.39'],
    [5, '0.05'],
    [-5, '-0.05'],
    [0, '0.00'],
  ])('fromCents(%p) = %p', (cents, value) => {
    expect(fromCents(cents)).toBe(value);
  });

  it('separa un valor con IVA del 19 % y la base más el IVA suman el valor', () => {
    expect(splitVatIncluded(1190000, 19)).toEqual({ base: 1000000, tax: 190000 });
    const odd = splitVatIncluded(354839, 19);
    expect(odd.base + odd.tax).toBe(354839);
    expect(odd.tax).toBe(Math.round((354839 * 19) / 119));
  });

  it('exento o excluido no separa IVA', () => {
    expect(splitVatIncluded(354839, 0)).toEqual({ base: 354839, tax: 0 });
  });

  it('la suma SQL solo cuenta ajustes activos sobre emitidos y valida el alias', () => {
    const sql = activeCourtesySum('d');
    expect(sql).toContain("bc.status = 'ACTIVA'");
    expect(sql).toContain("bc.application = 'AJUSTE_SOBRE_EMITIDO'");
    expect(sql).toContain('bc.document_id = d.id');
    expect(() => activeCourtesySum('d; DROP TABLE x')).toThrow('Alias SQL no válido.');
  });
});
