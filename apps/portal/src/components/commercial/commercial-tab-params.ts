export type CommercialTab =
  | 'plans'
  | 'products'
  | 'services'
  | 'offers'
  | 'compatibility'
  | 'taxation';

export type TaxationSubTab = 'tax-catalog' | 'tax-rules-app' | 'tax-simulator';

export type OffersSubTab = 'bundles' | 'promotions';

const COMMERCIAL_TABS: CommercialTab[] = [
  'plans',
  'products',
  'services',
  'offers',
  'compatibility',
  'taxation',
];

const TAXATION_SUB_TABS: TaxationSubTab[] = ['tax-catalog', 'tax-rules-app', 'tax-simulator'];

const OFFERS_SUB_TABS: OffersSubTab[] = ['bundles', 'promotions'];

export interface ResolvedCommercialRoute {
  tab: CommercialTab;
  taxationSubTab: TaxationSubTab;
  offersSubTab: OffersSubTab;
}

const DEFAULT_ROUTE: ResolvedCommercialRoute = {
  tab: 'plans',
  taxationSubTab: 'tax-catalog',
  offersSubTab: 'bundles',
};

function parseTaxationSubTab(value: string | undefined): TaxationSubTab {
  if (value && TAXATION_SUB_TABS.includes(value as TaxationSubTab)) {
    return value as TaxationSubTab;
  }

  return 'tax-catalog';
}

function parseOffersSubTab(value: string | undefined): OffersSubTab {
  if (value && OFFERS_SUB_TABS.includes(value as OffersSubTab)) {
    return value as OffersSubTab;
  }

  return 'bundles';
}

export function resolveCommercialRoute(value: string | null | undefined): ResolvedCommercialRoute {
  if (!value) {
    return DEFAULT_ROUTE;
  }

  const decoded = decodeURIComponent(value.trim());
  const [baseTab, subTab] = decoded.split('/');

  if (!baseTab || !COMMERCIAL_TABS.includes(baseTab as CommercialTab)) {
    return DEFAULT_ROUTE;
  }

  const tab = baseTab as CommercialTab;

  if (tab === 'taxation') {
    return {
      tab,
      taxationSubTab: parseTaxationSubTab(subTab),
      offersSubTab: 'bundles',
    };
  }

  if (tab === 'offers') {
    return {
      tab,
      taxationSubTab: 'tax-catalog',
      offersSubTab: parseOffersSubTab(subTab),
    };
  }

  return {
    tab,
    taxationSubTab: 'tax-catalog',
    offersSubTab: 'bundles',
  };
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
  return Boolean(baseTab && COMMERCIAL_TABS.includes(baseTab as CommercialTab));
}

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

  if (route.tab === 'offers') {
    if (route.offersSubTab === 'bundles') {
      return 'offers';
    }

    return `offers/${route.offersSubTab}`;
  }

  return route.tab;
}
