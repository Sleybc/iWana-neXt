import {
  applyCommercialOfferStatusToSearchParams,
  buildCommercialTabQuery,
  isCommercialTabParam,
  isCommercialValidToExpiringSoon,
  matchesCommercialExpiringOfferFilter,
  needsCommercialUrlCanonicalization,
  parseCommercialOfferStatus,
  resolveCommercialRoute,
} from './commercial-tab-params';

describe('commercial-tab-params', () => {
  it('aterriza en planes cuando no hay tab en la URL', () => {
    expect(resolveCommercialRoute(null)).toEqual({
      tab: 'plans',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
  });

  it('redirige el deep link legacy de resumen a planes', () => {
    expect(resolveCommercialRoute('summary').tab).toBe('plans');
  });

  it('deja de reconocer summary como tab del modulo', () => {
    expect(isCommercialTabParam('summary')).toBe(false);
  });

  it('omite el parametro tab cuando la ruta es la de aterrizaje', () => {
    expect(
      buildCommercialTabQuery({ tab: 'plans', taxationSubTab: 'tax-catalog', status: null }),
    ).toBeUndefined();
  });

  it('detecta URL no canonica para summary y offers', () => {
    expect(
      needsCommercialUrlCanonicalization('summary', {
        tab: 'plans',
        taxationSubTab: 'tax-catalog',
        status: null,
      }),
    ).toBe(true);
    expect(
      needsCommercialUrlCanonicalization('offers', {
        tab: 'bundles',
        taxationSubTab: 'tax-catalog',
        status: null,
      }),
    ).toBe(true);
    expect(
      needsCommercialUrlCanonicalization(null, {
        tab: 'plans',
        taxationSubTab: 'tax-catalog',
        status: null,
      }),
    ).toBe(false);
    expect(
      needsCommercialUrlCanonicalization('products', {
        tab: 'products',
        taxationSubTab: 'tax-catalog',
        status: null,
      }),
    ).toBe(false);
  });

  it('resuelve subtab tributaria desde query', () => {
    expect(resolveCommercialRoute('taxation/tax-simulator')).toEqual({
      tab: 'taxation',
      taxationSubTab: 'tax-simulator',
      status: null,
    });
  });

  it('resuelve aliases legacy offers → tabs canónicos de Ofertas', () => {
    expect(resolveCommercialRoute('offers')).toEqual({
      tab: 'bundles',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
    expect(resolveCommercialRoute('offers/bundles')).toEqual({
      tab: 'bundles',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
    expect(resolveCommercialRoute('offers/promotions')).toEqual({
      tab: 'promotions',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
  });

  it('resuelve tabs canónicos bundles y promotions', () => {
    expect(resolveCommercialRoute('bundles')).toEqual({
      tab: 'bundles',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
    expect(resolveCommercialRoute('promotions')).toEqual({
      tab: 'promotions',
      taxationSubTab: 'tax-catalog',
      status: null,
    });
  });

  it('valida tabs comerciales soportados e aliases offers', () => {
    expect(isCommercialTabParam('plans')).toBe(true);
    expect(isCommercialTabParam('products')).toBe(true);
    expect(isCommercialTabParam('bundles')).toBe(true);
    expect(isCommercialTabParam('promotions')).toBe(true);
    expect(isCommercialTabParam('offers')).toBe(true);
    expect(isCommercialTabParam('offers/promotions')).toBe(true);
    expect(isCommercialTabParam('unknown')).toBe(false);
  });

  it('construye query canónica sin reescribir a offers', () => {
    expect(
      buildCommercialTabQuery({
        tab: 'plans',
        taxationSubTab: 'tax-catalog',
      }),
    ).toBeUndefined();

    expect(
      buildCommercialTabQuery({
        tab: 'products',
        taxationSubTab: 'tax-catalog',
      }),
    ).toBe('products');

    expect(
      buildCommercialTabQuery({
        tab: 'bundles',
        taxationSubTab: 'tax-catalog',
      }),
    ).toBe('bundles');

    expect(
      buildCommercialTabQuery({
        tab: 'promotions',
        taxationSubTab: 'tax-catalog',
      }),
    ).toBe('promotions');

    expect(
      buildCommercialTabQuery({
        tab: 'taxation',
        taxationSubTab: 'tax-simulator',
      }),
    ).toBe('taxation/tax-simulator');
  });

  it('parsea status=expiring y ignora valores de catálogo', () => {
    expect(parseCommercialOfferStatus('expiring')).toBe('expiring');
    expect(parseCommercialOfferStatus('ACTIVE')).toBeNull();
    expect(parseCommercialOfferStatus(undefined)).toBeNull();
  });

  it('escribe status=expiring sin borrar ACTIVE del catálogo', () => {
    const withCatalog = new URLSearchParams('tab=products&status=ACTIVE');
    applyCommercialOfferStatusToSearchParams(withCatalog, null);
    expect(withCatalog.get('status')).toBe('ACTIVE');

    const params = new URLSearchParams('tab=bundles');
    applyCommercialOfferStatusToSearchParams(params, 'expiring');
    expect(params.get('status')).toBe('expiring');

    applyCommercialOfferStatusToSearchParams(params, null);
    expect(params.has('status')).toBe(false);
  });

  it('detecta vigencia en ventana de 7 días y usos cerca del límite', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    expect(isCommercialValidToExpiringSoon('2026-07-28T00:00:00.000Z', now)).toBe(true);
    expect(isCommercialValidToExpiringSoon('2026-08-20T00:00:00.000Z', now)).toBe(false);
    expect(isCommercialValidToExpiringSoon(null, now)).toBe(false);

    expect(
      matchesCommercialExpiringOfferFilter(
        { validTo: '2026-12-01T00:00:00.000Z', maxUses: 10, currentUses: 9 },
        'promotion',
        now,
      ),
    ).toBe(true);

    expect(
      matchesCommercialExpiringOfferFilter(
        { validTo: '2026-12-01T00:00:00.000Z', maxUses: 10, currentUses: 1 },
        'promotion',
        now,
      ),
    ).toBe(false);

    expect(
      matchesCommercialExpiringOfferFilter({ validTo: '2026-07-25T00:00:00.000Z' }, 'bundle', now),
    ).toBe(true);
  });
});
