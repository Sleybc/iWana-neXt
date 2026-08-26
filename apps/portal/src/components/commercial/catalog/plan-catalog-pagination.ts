/**
 * Override local del selector de planes (ADR-065 default sigue [10, 20, 50]).
 * Techo 100 = MAX_LIMIT del API. No mutar PORTAL_PAGE_SIZE_OPTIONS.
 */
export const PLAN_CATALOG_PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100] as const;

export const PLAN_CATALOG_PAGE_OUT_OF_RANGE_NOTICE =
  'Esa página ya no existe. Mostrando la última página disponible.';
