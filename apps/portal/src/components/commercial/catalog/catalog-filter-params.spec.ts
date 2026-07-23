import {
  applyProductCatalogFilters,
  applyServiceCatalogFilters,
  DEFAULT_PRODUCT_CATALOG_FILTERS,
  DEFAULT_SERVICE_CATALOG_FILTERS,
  parseProductCatalogFilters,
  parseServiceCatalogFilters,
} from './catalog-filter-params';

describe('catalog-filter-params', () => {
  describe('parseProductCatalogFilters', () => {
    it('usa defaults cuando no hay query', () => {
      expect(parseProductCatalogFilters(new URLSearchParams())).toEqual(
        DEFAULT_PRODUCT_CATALOG_FILTERS,
      );
    });

    it('hidrata valores válidos y descarta inválidos', () => {
      const params = new URLSearchParams({
        q: '  router  ',
        category: 'NETWORKING',
        status: 'ACTIVE',
        model: 'LOAN',
        sort: 'RECENTLY_UPDATED',
        tab: 'products',
      });

      expect(parseProductCatalogFilters(params)).toEqual({
        q: 'router',
        category: 'NETWORKING',
        status: 'ACTIVE',
        model: 'LOAN',
        sort: 'RECENTLY_UPDATED',
      });

      expect(
        parseProductCatalogFilters(
          new URLSearchParams({
            category: 'NOPE',
            status: 'X',
            model: 'Y',
            sort: 'Z',
          }),
        ),
      ).toEqual(DEFAULT_PRODUCT_CATALOG_FILTERS);
    });
  });

  describe('applyProductCatalogFilters', () => {
    it('omite defaults y preserva tab', () => {
      const params = new URLSearchParams({ tab: 'products', q: 'old' });
      applyProductCatalogFilters(params, DEFAULT_PRODUCT_CATALOG_FILTERS);

      expect(params.get('tab')).toBe('products');
      expect(params.has('q')).toBe(false);
      expect(params.has('category')).toBe(false);
      expect(params.has('sort')).toBe(false);
    });

    it('serializa solo filtros no default', () => {
      const params = new URLSearchParams({ tab: 'products' });
      applyProductCatalogFilters(params, {
        q: 'box',
        category: 'CPE',
        status: 'INACTIVE',
        model: 'SALE',
        sort: 'CATEGORY_NAME',
      });

      expect(params.toString()).toBe(
        'tab=products&q=box&category=CPE&status=INACTIVE&model=SALE&sort=CATEGORY_NAME',
      );
    });
  });

  describe('parseServiceCatalogFilters / applyServiceCatalogFilters', () => {
    it('parsea charge y status', () => {
      expect(
        parseServiceCatalogFilters(
          new URLSearchParams({ q: 'ip', status: 'ACTIVE', charge: 'RECURRING', tab: 'services' }),
        ),
      ).toEqual({ q: 'ip', status: 'ACTIVE', charge: 'RECURRING' });
    });

    it('limpia keys de servicio sin tocar tab', () => {
      const params = new URLSearchParams({
        tab: 'services',
        q: 'x',
        status: 'ACTIVE',
        charge: 'ONE_TIME',
      });
      applyServiceCatalogFilters(params, DEFAULT_SERVICE_CATALOG_FILTERS);

      expect(params.get('tab')).toBe('services');
      expect(params.has('q')).toBe(false);
      expect(params.has('status')).toBe(false);
      expect(params.has('charge')).toBe(false);
    });
  });
});
