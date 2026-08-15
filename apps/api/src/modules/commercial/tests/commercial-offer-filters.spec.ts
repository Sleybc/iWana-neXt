import {
  BUNDLE_EXPIRING_SQL,
  COMMERCIAL_EXPIRING_WINDOW_DAYS,
  COMMERCIAL_NEAR_USE_RATIO,
  COMMERCIAL_NEAR_USE_REMAINING,
  commercialExpiringParams,
  commercialExpiringWindowEnd,
  PROMOTION_EXPIRING_SQL,
} from '../utils/commercial-offer-filters';

describe('commercial-offer-filters', () => {
  it('fija ventana de 7 días, ratio 0.8 y remaining 2', () => {
    expect(COMMERCIAL_EXPIRING_WINDOW_DAYS).toBe(7);
    expect(COMMERCIAL_NEAR_USE_RATIO).toBe(0.8);
    expect(COMMERCIAL_NEAR_USE_REMAINING).toBe(2);
  });

  it('calcula el fin de ventana a 7 días desde now', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');
    const end = commercialExpiringWindowEnd(now);
    expect(end.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('expone params de oferta alineados a las constantes', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    expect(commercialExpiringParams(now)).toEqual({
      offerNow: now,
      offerWindowEnd: commercialExpiringWindowEnd(now),
      nearUseRatio: 0.8,
      nearUseRemaining: 2,
    });
  });

  it('incluye predicados SQL de vigencia y límite de usos', () => {
    expect(BUNDLE_EXPIRING_SQL).toContain('bundle.valid_to');
    expect(PROMOTION_EXPIRING_SQL).toContain('nearUseRatio');
    expect(PROMOTION_EXPIRING_SQL).toContain('nearUseRemaining');
  });
});
