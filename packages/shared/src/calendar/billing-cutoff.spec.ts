import { computeCutoffDate, computeNextCutoffDate } from './billing-cutoff';

describe('cálculo de fechas de corte según ADR-102 D5', () => {
  it.each([
    [1, 15, 2027, 2, '2027-02-15'],
    [1, 15, 2027, 1, '2027-01-15'],
    [1, 15, 2027, 3, '2027-03-15'],
    [1, 15, 2027, 4, '2027-04-15'],
    [1, 15, 2027, 5, '2027-05-15'],
    [1, 15, 2027, 6, '2027-06-15'],
    [1, 15, 2027, 7, '2027-07-15'],
    [1, 15, 2027, 8, '2027-08-15'],
    [1, 15, 2027, 9, '2027-09-15'],
    [1, 15, 2027, 10, '2027-10-15'],
    [1, 15, 2027, 11, '2027-11-15'],
    [1, 15, 2027, 12, '2027-12-15'],
    [15, 30, 2027, 1, '2027-01-30'],
    [15, 30, 2027, 4, '2027-04-30'],
    [15, 30, 2027, 2, '2027-02-28'],
    [15, 30, 2028, 2, '2028-02-29'],
    [15, 30, 2026, 12, '2026-12-30'],
  ])('calcula %s→%s en %s-%s como %s', (cycleDay, cutoffDay, year, month, expected) => {
    expect(computeCutoffDate({ cycleDay, cutoffDay, year, month })).toBe(expected);
  });

  it.each([
    [1, 15, '2026-11-15', '2026-11-15'],
    [1, 15, '2026-11-16', '2026-12-15'],
    [15, 30, '2026-12-31', '2027-01-30'],
    [15, 30, '2027-02-28', '2027-02-28'],
  ])('calcula próximo corte para %s→%s con hoy %s', (cycleDay, cutoffDay, today, expected) => {
    expect(computeNextCutoffDate({ cycleDay, cutoffDay, today })).toBe(expected);
  });

  it('rechaza el siguiente corte cuando excedería el rango de años admitido', () => {
    expect(() =>
      computeNextCutoffDate({ cycleDay: 15, cutoffDay: 30, today: '9999-12-31' }),
    ).toThrow(RangeError);
  });
});
