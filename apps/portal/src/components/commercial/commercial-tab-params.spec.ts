import {
  buildCommercialTabQuery,
  isCommercialTabParam,
  resolveCommercialRoute,
} from './commercial-tab-params';

describe('commercial-tab-params', () => {
  it('resuelve la ruta por defecto en tab Resumen', () => {
    expect(resolveCommercialRoute(undefined)).toEqual({
      tab: 'summary',
      taxationSubTab: 'tax-catalog',
      offersSubTab: 'bundles',
    });
  });

  it('resuelve subtab tributaria desde query', () => {
    expect(resolveCommercialRoute('taxation/tax-simulator')).toEqual({
      tab: 'taxation',
      taxationSubTab: 'tax-simulator',
      offersSubTab: 'bundles',
    });
  });

  it('resuelve subtab de ofertas desde query', () => {
    expect(resolveCommercialRoute('offers/promotions')).toEqual({
      tab: 'offers',
      taxationSubTab: 'tax-catalog',
      offersSubTab: 'promotions',
    });
  });

  it('valida tabs comerciales soportados', () => {
    expect(isCommercialTabParam('summary')).toBe(true);
    expect(isCommercialTabParam('products')).toBe(true);
    expect(isCommercialTabParam('unknown')).toBe(false);
  });

  it('construye query omitiendo el tab Resumen por defecto', () => {
    expect(
      buildCommercialTabQuery({
        tab: 'summary',
        taxationSubTab: 'tax-catalog',
        offersSubTab: 'bundles',
      }),
    ).toBeUndefined();

    expect(
      buildCommercialTabQuery({
        tab: 'plans',
        taxationSubTab: 'tax-catalog',
        offersSubTab: 'bundles',
      }),
    ).toBe('plans');

    expect(
      buildCommercialTabQuery({
        tab: 'taxation',
        taxationSubTab: 'tax-simulator',
        offersSubTab: 'bundles',
      }),
    ).toBe('taxation/tax-simulator');
  });
});
