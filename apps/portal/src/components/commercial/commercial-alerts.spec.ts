import type { CommercialDashboardSummary } from '@/lib/api-client';
import {
  buildCommercialAlerts,
  resolveCatalogIncompleteTab,
  resolveOffersRiskTab,
  resolveRulesGapTab,
} from './commercial-alerts';

function buildSummary(
  overrides: Partial<CommercialDashboardSummary> = {},
): CommercialDashboardSummary {
  return {
    plansCount: 4,
    activePlansCount: 3,
    productsCount: 6,
    activeProductsCount: 5,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 3,
    activePromotionsCount: 2,
    compatibilityRulesCount: 4,
    activeCompatibilityRulesCount: 3,
    taxRulesCount: 5,
    activeTaxRulesCount: 4,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 0,
    catalogActiveCount: 10,
    catalogSellableActiveCount: 10,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 0,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 3,
    attentionItems: [],
    recentChanges: [],
    ...overrides,
  };
}

describe('buildCommercialAlerts', () => {
  it('no emite alertas en estado saludable', () => {
    expect(buildCommercialAlerts(buildSummary())).toEqual([]);
  });

  it('emite alerta de ofertas en riesgo con filtro expiring', () => {
    const alerts = buildCommercialAlerts(buildSummary({ offersAtRiskCount: 3 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      status: 'expiring',
    });
    expect(alerts[0]?.description).toContain('3');
  });

  it('singulariza el texto cuando hay una sola oferta en riesgo', () => {
    const alerts = buildCommercialAlerts(buildSummary({ offersAtRiskCount: 1 }));

    expect(alerts[0]?.description).toContain('oferta vence');
  });

  it('emite alerta de catálogo incompleto sin filtro de estado', () => {
    const alerts = buildCommercialAlerts(
      buildSummary({
        catalogIncompleteActiveCount: 2,
        attentionItems: [
          {
            id: 'prod-1',
            name: 'TV Box',
            entityType: 'product',
            reason: 'missing_current_price',
            destinoTab: 'products',
            validTo: null,
            usesRemaining: null,
          },
          {
            id: 'prod-2',
            name: 'Cámara',
            entityType: 'product',
            reason: 'missing_current_price',
            destinoTab: 'products',
            validTo: null,
            usesRemaining: null,
          },
        ],
      }),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      key: 'catalog-incomplete',
      variant: 'error',
      tab: 'products',
      focus: 'prod-1',
    });
    expect(alerts[0]?.status).toBeUndefined();
  });

  it('emite alerta de huecos en reglas', () => {
    const alerts = buildCommercialAlerts(buildSummary({ rulesGapCount: 4 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: 'rules-gap', variant: 'error' });
  });

  it('acota a tres alertas como máximo', () => {
    const alerts = buildCommercialAlerts(
      buildSummary({
        offersAtRiskCount: 1,
        catalogIncompleteActiveCount: 1,
        rulesGapCount: 1,
      }),
    );

    expect(alerts).toHaveLength(3);
  });
});

describe('resolveOffersRiskTab', () => {
  it('elige promociones cuando dominan los ítems de promoción', () => {
    const summary = buildSummary({
      offersAtRiskCount: 2,
      attentionItems: [
        {
          id: 'p1',
          name: 'Promo A',
          entityType: 'promotion',
          reason: 'expiring_soon',
          destinoTab: 'promotions',
          validTo: null,
          usesRemaining: null,
        },
        {
          id: 'p2',
          name: 'Promo B',
          entityType: 'promotion',
          reason: 'near_use_limit',
          destinoTab: 'promotions',
          validTo: null,
          usesRemaining: 1,
        },
      ],
    });

    expect(resolveOffersRiskTab(summary)).toBe('promotions');
  });

  it('cae a combos cuando no dominan las promociones', () => {
    expect(resolveOffersRiskTab(buildSummary())).toBe('bundles');
  });
});

describe('resolveRulesGapTab', () => {
  it('elige combos cuando pesan más los combos con ítems inactivos', () => {
    const summary = buildSummary({
      activeBundlesWithInactiveItemsCount: 3,
      taxRulesCoverageGapCount: 1,
    });

    expect(resolveRulesGapTab(summary)).toBe('bundles');
  });

  it('elige tributación en el resto de los casos', () => {
    expect(resolveRulesGapTab(buildSummary())).toBe('taxation');
  });
});

describe('resolveCatalogIncompleteTab', () => {
  it('elige products cuando dominan los incompletos de producto', () => {
    const summary = buildSummary({
      attentionItems: [
        {
          id: '1',
          name: 'TV Box',
          entityType: 'product',
          reason: 'missing_current_price',
          destinoTab: 'products',
          validTo: null,
          usesRemaining: null,
        },
        {
          id: '2',
          name: 'Cámara',
          entityType: 'product',
          reason: 'missing_current_price',
          destinoTab: 'products',
          validTo: null,
          usesRemaining: null,
        },
        {
          id: '3',
          name: 'Plan X',
          entityType: 'plan',
          reason: 'missing_current_price',
          destinoTab: 'plans',
          validTo: null,
          usesRemaining: null,
        },
      ],
    });

    expect(resolveCatalogIncompleteTab(summary)).toBe('products');
  });

  it('elige services cuando dominan los servicios incompletos', () => {
    const summary = buildSummary({
      attentionItems: [
        {
          id: '1',
          name: 'Instalación',
          entityType: 'service',
          reason: 'missing_current_price',
          destinoTab: 'services',
          validTo: null,
          usesRemaining: null,
        },
      ],
    });

    expect(resolveCatalogIncompleteTab(summary)).toBe('services');
  });

  it('en empate plans/products prefiere plans', () => {
    const summary = buildSummary({
      attentionItems: [
        {
          id: '1',
          name: 'Plan',
          entityType: 'plan',
          reason: 'missing_current_price',
          destinoTab: 'plans',
          validTo: null,
          usesRemaining: null,
        },
        {
          id: '2',
          name: 'Producto',
          entityType: 'product',
          reason: 'missing_current_price',
          destinoTab: 'products',
          validTo: null,
          usesRemaining: null,
        },
      ],
    });

    expect(resolveCatalogIncompleteTab(summary)).toBe('plans');
  });

  it('sin attention items de precio cae a plans', () => {
    expect(resolveCatalogIncompleteTab(buildSummary())).toBe('plans');
  });
});
