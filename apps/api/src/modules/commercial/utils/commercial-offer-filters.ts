/**
 * Criterios de «por vencer» / cerca de límite de usos.
 * Alineados a dashboard comercial y FE (`COMMERCIAL_EXPIRING_WINDOW_DAYS`, etc.).
 */
export const COMMERCIAL_EXPIRING_WINDOW_DAYS = 7;
export const COMMERCIAL_NEAR_USE_RATIO = 0.8;
export const COMMERCIAL_NEAR_USE_REMAINING = 2;

export function commercialExpiringWindowEnd(now: Date = new Date()): Date {
  return new Date(now.getTime() + COMMERCIAL_EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Predicado SQL TypeORM para bundles activos por vencer (valid_to en ventana). */
export const BUNDLE_EXPIRING_SQL = `
  bundle.valid_to IS NOT NULL
  AND bundle.valid_to >= :offerNow
  AND bundle.valid_to <= :offerWindowEnd
`;

/**
 * Predicado SQL TypeORM para promociones «por vencer»:
 * vigencia en ventana O cerca del límite de usos (misma semántica FE).
 */
export const PROMOTION_EXPIRING_SQL = `
  (
    (
      promo.valid_to >= :offerNow
      AND promo.valid_to <= :offerWindowEnd
      AND (promo.max_uses IS NULL OR promo.current_uses < promo.max_uses)
    )
    OR
    (
      promo.valid_from <= :offerNow
      AND promo.valid_to >= :offerNow
      AND promo.max_uses IS NOT NULL
      AND promo.current_uses < promo.max_uses
      AND (
        (promo.current_uses::numeric / promo.max_uses::numeric) >= :nearUseRatio
        OR (promo.max_uses - promo.current_uses) <= :nearUseRemaining
      )
    )
  )
`;

export function commercialExpiringParams(now: Date = new Date()): {
  offerNow: Date;
  offerWindowEnd: Date;
  nearUseRatio: number;
  nearUseRemaining: number;
} {
  return {
    offerNow: now,
    offerWindowEnd: commercialExpiringWindowEnd(now),
    nearUseRatio: COMMERCIAL_NEAR_USE_RATIO,
    nearUseRemaining: COMMERCIAL_NEAR_USE_REMAINING,
  };
}
