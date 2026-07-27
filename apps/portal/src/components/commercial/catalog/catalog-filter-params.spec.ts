import {
  applyPlanCatalogFilters,
  applyProductCatalogFilters,
  applyServiceCatalogFilters,
  DEFAULT_PLAN_CATALOG_FILTERS,
  DEFAULT_PRODUCT_CATALOG_FILTERS,
  DEFAULT_SERVICE_CATALOG_FILTERS,
  parsePlanCatalogFilters,
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

  describe('parsePlanCatalogFilters / applyPlanCatalogFilters', () => {
    it('usa defaults cuando no hay query', () => {
      expect(parsePlanCatalogFilters(new URLSearchParams())).toEqual(DEFAULT_PLAN_CATALOG_FILTERS);
    });

    it('hidrata q, status y missingPrice; descarta inválidos', () => {
      expect(
        parsePlanCatalogFilters(
          new URLSearchParams({
            q: '  gpon  ',
            status: 'ACTIVE',
            missingPrice: '1',
            tab: 'plans',
            focus: 'plan-uuid',
            offerStatus: 'AT_RISK',
          }),
        ),
      ).toEqual({
        q: 'gpon',
        status: 'ACTIVE',
        missingPrice: true,
      });

      expect(
        parsePlanCatalogFilters(
          new URLSearchParams({
            status: 'NOPE',
            missingPrice: '0',
          }),
        ),
      ).toEqual(DEFAULT_PLAN_CATALOG_FILTERS);

      expect(parsePlanCatalogFilters(new URLSearchParams({ missingPrice: 'true' }))).toEqual({
        ...DEFAULT_PLAN_CATALOG_FILTERS,
        missingPrice: true,
      });
    });

    it('omite defaults y preserva tab, focus y offerStatus', () => {
      const params = new URLSearchParams({
        tab: 'plans',
        focus: 'abc',
        offerStatus: 'AT_RISK',
        q: 'old',
        status: 'ACTIVE',
        missingPrice: '1',
      });
      applyPlanCatalogFilters(params, DEFAULT_PLAN_CATALOG_FILTERS);

      expect(params.get('tab')).toBe('plans');
      expect(params.get('focus')).toBe('abc');
      expect(params.get('offerStatus')).toBe('AT_RISK');
      expect(params.has('q')).toBe(false);
      expect(params.has('status')).toBe(false);
      expect(params.has('missingPrice')).toBe(false);
    });

    it('serializa solo filtros no default', () => {
      const params = new URLSearchParams({ tab: 'plans', focus: 'keep-me' });
      applyPlanCatalogFilters(params, {
        q: 'fibra',
        status: 'INACTIVE',
        missingPrice: true,
      });

      expect(params.toString()).toBe(
        'tab=plans&focus=keep-me&q=fibra&status=INACTIVE&missingPrice=1',
      );
    });
  });
});
