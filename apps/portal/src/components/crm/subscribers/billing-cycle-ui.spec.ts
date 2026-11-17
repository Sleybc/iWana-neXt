import { formatBillingDate, formatBillingShortDate } from './billing-cycle-ui';

describe('formatBillingDate', () => {
  it('presenta una fecha civil YYYY-MM-DD', () => {
    expect(formatBillingDate('2026-11-05')).toBe('5 de noviembre de 2026');
  });

  it('presenta una marca de tiempo sin «NaN», en la fecha civil de Bogotá', () => {
    expect(formatBillingDate('2026-11-10T12:00:00.000Z')).toBe('10 de noviembre de 2026');
    // 02:00 UTC del 1 de diciembre aún es 30 de noviembre en Bogotá (UTC−5).
    expect(formatBillingDate('2026-12-01T02:00:00.000Z')).toBe('30 de noviembre de 2026');
  });

  it('devuelve el valor tal cual si no es una fecha', () => {
    expect(formatBillingDate('sin fecha')).toBe('sin fecha');
  });
});

describe('formatBillingShortDate', () => {
  it('da la fecha corta de tabla, también desde una marca de tiempo y sin «NaN»', () => {
    expect(formatBillingShortDate('2026-11-27')).toBe('27 nov 2026');
    expect(formatBillingShortDate('2026-12-01T02:00:00.000Z')).toBe('30 nov 2026');
    expect(formatBillingShortDate('sin fecha')).toBe('sin fecha');
  });
});
