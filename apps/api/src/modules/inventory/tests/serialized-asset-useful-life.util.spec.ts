import { calculateUsefulLife } from '../services/serialized-asset-useful-life.util';

describe('calculateUsefulLife', () => {
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

  it('returns vigente when more than 3 months remain', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 36,
      purchaseDate: '2024-01-01',
      warrantyUntil: '2027-06-01',
      referenceDate,
    });

    expect(result.status).toBe('vigente');
    expect(result.monthsElapsed).toBe(30);
    expect(result.monthsRemaining).toBe(6);
  });

  it('returns por-vencer when 3 or fewer months remain but still positive', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 32,
      purchaseDate: '2024-01-01',
      warrantyUntil: null,
      referenceDate,
    });

    expect(result.status).toBe('por-vencer');
    expect(result.monthsRemaining).toBe(2);
  });

  it('returns vencida when monthsRemaining is zero or negative', () => {
    const result = calculateUsefulLife({
      usefulLifeMonths: 24,
      purchaseDate: '2024-01-01',
      warrantyUntil: null,
      referenceDate,
    });

    expect(result.status).toBe('vencida');
    expect(result.monthsRemaining).toBeLessThanOrEqual(0);
  });
});
