import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';

describe('inventory-date', () => {
  it('convierte fecha local a ISO yyyy-MM-dd', () => {
    expect(toLocalDateValue(new Date(2026, 5, 25))).toBe('2026-06-25');
  });

  it('parsea yyyy-MM-dd sin desfase de zona horaria', () => {
    const date = toDateFromLocalDateValue('2026-06-25');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(25);
  });

  it('retorna vacío o undefined para valores inválidos', () => {
    expect(toLocalDateValue(undefined)).toBe('');
    expect(toDateFromLocalDateValue('')).toBeUndefined();
    expect(toDateFromLocalDateValue('25-06-2026')).toBeUndefined();
  });
});
