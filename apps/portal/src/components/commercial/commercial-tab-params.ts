export type CommercialTab =
  | 'plans'
  | 'products'
  | 'services'
  | 'bundles'
  | 'promotions'
  | 'compatibility'
  | 'taxation';

export type TaxationSubTab = 'tax-catalog' | 'tax-rules-app' | 'tax-simulator';

/** @deprecated Subtab legacy; Combos/Promociones son tabs de primer nivel (H9). */
export type OffersSubTab = 'bundles' | 'promotions';

/** Filtro de listado de ofertas (query `status`); no colisiona con ACTIVE/INACTIVE del catálogo. */
export type CommercialOfferStatusFilter = 'expiring';

/** Ventana de “vencen pronto” alineada al resumen operativo (Q1). */
export const COMMERCIAL_EXPIRING_WINDOW_DAYS = 7;

/** Umbrales de “cerca del límite de usos” (mismo criterio que el dashboard API). */
export const COMMERCIAL_NEAR_USE_RATIO = 0.8;
export const COMMERCIAL_NEAR_USE_REMAINING = 2;

const COMMERCIAL_TABS: CommercialTab[] = [
  'plans',
  'products',
  'services',
  'bundles',
  'promotions',
  'compatibility',
  'taxation',
];

/** Alias legacy de deep-links `?tab=offers` y `?tab=offers/promotions`. */
const LEGACY_OFFERS_BASE = 'offers';

/** Alias legacy del tab retirado `?tab=summary` (Fase G). */
const LEGACY_SUMMARY_BASE = 'summary';

const TAXATION_SUB_TABS: TaxationSubTab[] = ['tax-catalog', 'tax-rules-app', 'tax-simulator'];

const OFFERS_SUB_TABS: OffersSubTab[] = ['bundles', 'promotions'];

export interface ResolvedCommercialRoute {
  tab: CommercialTab;
  taxationSubTab: TaxationSubTab;
  /** Solo `expiring`; otros valores de `status` (p. ej. catálogo) se ignoran. */
  status?: CommercialOfferStatusFilter | null;
}

const DEFAULT_ROUTE: ResolvedCommercialRoute = {
  tab: 'plans',
  taxationSubTab: 'tax-catalog',
  status: null,
};

function parseTaxationSubTab(value: string | undefined): TaxationSubTab {
  if (value && TAXATION_SUB_TABS.includes(value as TaxationSubTab)) {
    return value as TaxationSubTab;
  }

  return 'tax-catalog';
}

function parseOffersAliasSubTab(value: string | undefined): OffersSubTab {
  if (value && OFFERS_SUB_TABS.includes(value as OffersSubTab)) {
    return value as OffersSubTab;
  }

  return 'bundles';
}

/**
 * Resuelve `?tab=` a ruta canónica.
 * Mapa legacy → canónico:
 * - `offers` | `offers/bundles` → `bundles`
 * - `offers/promotions` → `promotions`
 */
export function resolveCommercialRoute(value: string | null | undefined): ResolvedCommercialRoute {
  if (!value) {
    return DEFAULT_ROUTE;
  }

  const decoded = decodeURIComponent(value.trim());
  const [baseTab, subTab] = decoded.split('/');

  if (!baseTab) {
    return DEFAULT_ROUTE;
  }

  if (baseTab === LEGACY_SUMMARY_BASE) {
    return DEFAULT_ROUTE;
  }

  if (baseTab === LEGACY_OFFERS_BASE) {
    return {
      tab: parseOffersAliasSubTab(subTab),
      taxationSubTab: 'tax-catalog',
      status: null,
    };
  }

  if (!COMMERCIAL_TABS.includes(baseTab as CommercialTab)) {
    return DEFAULT_ROUTE;
  }

  const tab = baseTab as CommercialTab;

  if (tab === 'taxation') {
    return {
      tab,
      taxationSubTab: parseTaxationSubTab(subTab),
      status: null,
    };
  }

  return {
    tab,
    taxationSubTab: 'tax-catalog',
    status: null,
  };
}

export function parseCommercialOfferStatus(
  value: string | null | undefined,
): CommercialOfferStatusFilter | null {
  if (value === 'expiring') {
    return 'expiring';
  }

  return null;
}

/**
 * Escribe/limpia solo `status=expiring`.
 * No borra `status=ACTIVE|INACTIVE` del catálogo.
 */
export function applyCommercialOfferStatusToSearchParams(
  params: URLSearchParams,
  status: CommercialOfferStatusFilter | null | undefined,
): void {
  if (status === 'expiring') {
    params.set('status', 'expiring');
    return;
  }

  if (params.get('status') === 'expiring') {
    params.delete('status');
  }
}

export function isCommercialValidToExpiringSoon(
  validTo: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!validTo) {
    return false;
  }

  const end = new Date(validTo);
  if (Number.isNaN(end.getTime()) || end < now) {
    return false;
  }

  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + COMMERCIAL_EXPIRING_WINDOW_DAYS);
  return end <= windowEnd;
}

export function isCommercialPromotionNearUseLimit(promotion: {
  maxUses: number | null;
  currentUses: number;
}): boolean {
  if (promotion.maxUses == null || promotion.currentUses >= promotion.maxUses) {
    return false;
  }

  const ratio = promotion.currentUses / promotion.maxUses;
  const remaining = promotion.maxUses - promotion.currentUses;
  return ratio >= COMMERCIAL_NEAR_USE_RATIO || remaining <= COMMERCIAL_NEAR_USE_REMAINING;
}

export function matchesCommercialExpiringOfferFilter(
  item: {
    validTo: string | null;
    maxUses?: number | null;
    currentUses?: number;
  },
  kind: 'bundle' | 'promotion',
  now: Date = new Date(),
): boolean {
  if (isCommercialValidToExpiringSoon(item.validTo, now)) {
    return true;
  }

  if (kind !== 'promotion') {
    return false;
  }

  return isCommercialPromotionNearUseLimit({
    maxUses: item.maxUses ?? null,
    currentUses: item.currentUses ?? 0,
  });
}

export function extractCommercialTabBase(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const decoded = decodeURIComponent(value.trim());
  const [baseTab] = decoded.split('/');
  return baseTab || null;
}

export function isCommercialTabParam(value: string | null | undefined): boolean {
  const baseTab = extractCommercialTabBase(value);
  if (!baseTab) {
    return false;
  }

  if (baseTab === LEGACY_OFFERS_BASE) {
    return true;
  }

  return COMMERCIAL_TABS.includes(baseTab as CommercialTab);
}

/** Query canónica: `bundles` / `promotions` (no reescribe a `offers`). */
export function buildCommercialTabQuery(route: ResolvedCommercialRoute): string | undefined {
  if (route.tab === 'plans') {
    return undefined;
  }

  if (route.tab === 'taxation') {
    if (route.taxationSubTab === 'tax-catalog') {
      return 'taxation';
    }

    return `taxation/${route.taxationSubTab}`;
  }

  return route.tab;
}

/**
 * True si el `tab` de la URL no coincide con la forma canónica de la ruta resuelta
 * (p. ej. `?tab=summary` → aterrizaje sin `tab`, `?tab=offers` → `bundles`).
 */
export function needsCommercialUrlCanonicalization(
  rawTabParam: string | null,
  route: ResolvedCommercialRoute,
): boolean {
  const canonicalTab = buildCommercialTabQuery(route) ?? null;
  return rawTabParam !== canonicalTab;
}

export interface CommercialNavigateOptions {
  status?: CommercialOfferStatusFilter | null;
}

export type CommercialNavigateHandler = (
  tab: CommercialTab,
  options?: CommercialNavigateOptions,
) => void;
