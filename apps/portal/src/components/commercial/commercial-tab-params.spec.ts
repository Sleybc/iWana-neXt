import {
  buildCommercialTabQuery,
  isCommercialTabParam,
  resolveCommercialRoute,
} from './commercial-tab-params';

describe('commercial-tab-params', () => {
  it('resuelve la ruta por defecto', () => {
    expect(resolveCommercialRoute(undefined)).toEqual({
      tab: 'plans',
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
    expect(isCommercialTabParam('products')).toBe(true);
    expect(isCommercialTabParam('unknown')).toBe(false);
  });

  it('construye query omitiendo el tab por defecto', () => {
    expect(
      buildCommercialTabQuery({
        tab: 'plans',
        taxationSubTab: 'tax-catalog',
        offersSubTab: 'bundles',
      }),
    ).toBeUndefined();
    expect(
      buildCommercialTabQuery({
        tab: 'taxation',
        taxationSubTab: 'tax-simulator',
        offersSubTab: 'bundles',
      }),
    ).toBe('taxation/tax-simulator');
  });
});
