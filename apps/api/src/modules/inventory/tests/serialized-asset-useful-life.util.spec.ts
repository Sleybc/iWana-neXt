import {
  USEFUL_LIFE_ALERT_THRESHOLD_MONTHS,
  calculateUsefulLife,
  usefulLifeExpiryDate,
} from '../services/serialized-asset-useful-life.util';

describe('calculateUsefulLife (día-exacta D-H6-5)', () => {
  const referenceDate = new Date('2026-07-21T12:00:00.000Z');

  it('returns sin-dato when usefulLifeMonths is missing', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: null,
      purchaseDate: '2024-01-01',
      warrantyUntil: null,
      referenceDate,
    });

    expect(result.status).toBe('sin-dato');
    expect(result.monthsElapsed).toBeNull();
    expect(result.monthsRemaining).toBeNull();
  });

  it('returns sin-dato when purchaseDate is missing', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 36,
      purchaseDate: null,
      warrantyUntil: '2027-01-01',
      referenceDate,
    });

    expect(result.status).toBe('sin-dato');
  });

  it('returns vigente when expiry is after referenceDate + 3 months', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 36,
      purchaseDate: '2024-01-01',
      warrantyUntil: '2027-06-01',
      referenceDate,
    });

    expect(result.status).toBe('vigente');
    expect(usefulLifeExpiryDate('2024-01-01', 36).toISOString().slice(0, 10)).toBe('2027-01-01');
    expect(result.monthsElapsed).toBe(30);
    expect(result.monthsRemaining).toBe(5);
  });

  it('returns por-vencer when expiry is within the 3-month threshold window', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 32,
      purchaseDate: '2024-01-01',
      warrantyUntil: null,
      referenceDate,
    });

    expect(result.status).toBe('por-vencer');
    expect(usefulLifeExpiryDate('2024-01-01', 32).toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(result.monthsRemaining).toBe(1);
  });

  it('returns vencida when expiry is on or before referenceDate', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 24,
      purchaseDate: '2024-01-01',
      warrantyUntil: null,
      referenceDate,
    });

    expect(result.status).toBe('vencida');
    expect(result.monthsRemaining).toBeLessThanOrEqual(0);
  });

  it('NO-GO: 2026-04-30 · 6m · ref 2026-07-21 → vigente (no por-vencer)', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 6,
      purchaseDate: '2026-04-30',
      warrantyUntil: null,
      referenceDate,
    });

    expect(usefulLifeExpiryDate('2026-04-30', 6).toISOString().slice(0, 10)).toBe('2026-10-30');
    expect(result.status).toBe('vigente');
  });

  it('NO-GO: 2025-01-15 · 12m · ref 2026-01-01 → por-vencer (aún no vencida)', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 12,
      purchaseDate: '2025-01-15',
      warrantyUntil: null,
      referenceDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(usefulLifeExpiryDate('2025-01-15', 12).toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(result.status).toBe('por-vencer');
  });

  it.each([
    ['01', '2026-01-01', '2026-07-01'],
    ['28', '2026-01-28', '2026-07-28'],
    ['29', '2024-01-29', '2024-07-29'],
    ['30', '2026-01-30', '2026-07-30'],
    ['31', '2026-01-31', '2026-07-31'],
  ])('expiry para día de compra %s alinea clamp PG (+6m)', (_day, purchaseDate, expectedExpiry) => {
    expect(usefulLifeExpiryDate(purchaseDate, 6).toISOString().slice(0, 10)).toBe(expectedExpiry);
  });

  it.each([
    // Día 31 → mes destino más corto: setUTCDate(0) clampa al último día del mes.
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-05-31', 1, '2026-06-30'],
    ['2026-08-31', 1, '2026-09-30'],
    ['2026-10-31', 1, '2026-11-30'],
  ])(
    'addMonthsUtc clamp: purchase %s + %sm → expiry %s (setUTCDate(0))',
    (purchaseDate, months, expectedExpiry) => {
      expect(usefulLifeExpiryDate(purchaseDate, months).toISOString().slice(0, 10)).toBe(
        expectedExpiry,
      );
    },
  );

  it('umbral +3m clampa referenceDate día 31 → mes corto (por-vencer vs vigente)', () => {
    // ref 2026-01-31 + 3m = 2026-04-30 (abril no tiene 31 → setUTCDate(0))
    const referenceDate = new Date('2026-01-31T12:00:00.000Z');

    const porVencer = calculateUsefulLife({
      usefulLifeMonths: 3,
      purchaseDate: '2026-01-31',
      warrantyUntil: null,
      referenceDate,
    });
    // expiry = 2026-04-30; thresholdEnd = 2026-04-30 → por-vencer (expiry <= threshold)
    expect(usefulLifeExpiryDate('2026-01-31', 3).toISOString().slice(0, 10)).toBe('2026-04-30');
    expect(porVencer.status).toBe('por-vencer');

    const vigente = calculateUsefulLife({
      usefulLifeMonths: 4,
      purchaseDate: '2026-01-31',
      warrantyUntil: null,
      referenceDate,
    });
    // expiry = 2026-05-31 > thresholdEnd 2026-04-30 → vigente
    expect(usefulLifeExpiryDate('2026-01-31', 4).toISOString().slice(0, 10)).toBe('2026-05-31');
    expect(vigente.status).toBe('vigente');
  });

  it('umbral por-vencer permanece en 3 meses', () => {
    expect(USEFUL_LIFE_ALERT_THRESHOLD_MONTHS).toBe(3);
  });

  it('sin referenceDate usa Date.now (UTC date-only) y no lanza', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 120,
      purchaseDate: '2020-01-01',
      warrantyUntil: null,
    });

    expect(result.status).not.toBe('sin-dato');
    expect(result.monthsElapsed).toBeGreaterThanOrEqual(0);
  });

  it('parseUtcDateOnly tolera ISO incompleto (mes/día por defecto)', () => {
    expect(usefulLifeExpiryDate('2026', 1).toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(usefulLifeExpiryDate('2026-03', 1).toISOString().slice(0, 10)).toBe('2026-04-01');
  });
});
