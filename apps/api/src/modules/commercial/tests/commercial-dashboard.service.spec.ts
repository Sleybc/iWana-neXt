import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CatalogItemType, CustomerSegment } from '@iwana/shared';
import { CommercialDashboardService } from '../services/commercial-dashboard.service';

const tenantId = 'tenant-uuid-test';
const schemaName = 'tenant_test';

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown>;

let queryImpl: QueryFn = async () => [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: {
      getOrThrow: jest.fn(() => ({ tenantId, schemaName })),
    },
    runInTenantSchema: jest.fn(
      async (
        _dataSource: unknown,
        _schema: string,
        callback: (qr: { manager: { query: QueryFn } }) => Promise<unknown>,
      ) => callback({ manager: { query: (sql, params) => queryImpl(sql, params) } }),
    ),
  };
});

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function has(sql: string, fragment: string): boolean {
  return norm(sql).includes(norm(fragment));
}

function isRecentChangesSql(sql: string): boolean {
  return has(sql, 'promotion_started') && has(sql, 'promotion_expired');
}

function isAttentionSql(sql: string): boolean {
  return has(sql, 'UNION ALL') && has(sql, 'missing_current_price');
}

describe('CommercialDashboardService', () => {
  let service: CommercialDashboardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CommercialDashboardService, { provide: getDataSourceToken(), useValue: {} }],
    }).compile();

    service = moduleRef.get(CommercialDashboardService);
  });

  it('agrega conteos legacy, KPIs H8 y recentChanges Q4 vía SQL (sin PII)', async () => {
    queryImpl = async (sql: string) => {
      if (isRecentChangesSql(sql)) {
        return [
          {
            entity_id: 'promo-1',
            entity_name: 'Promo verano',
            entity_kind: 'promotion',
            action: 'promotion_started',
            occurred_at: new Date('2026-07-22T10:00:00.000Z'),
          },
          {
            entity_id: 'promo-1',
            entity_name: 'Promo verano',
            entity_kind: 'promotion',
            action: 'created',
            occurred_at: new Date('2026-07-20T08:00:00.000Z'),
          },
          {
            entity_id: 'plan-1',
            entity_name: 'Plan 100',
            entity_kind: CatalogItemType.PLAN,
            action: 'updated',
            occurred_at: new Date('2026-07-21T12:00:00.000Z'),
          },
          {
            entity_id: 'bundle-1',
            entity_name: 'Combo hogar',
            entity_kind: 'bundle',
            action: 'deactivated',
            occurred_at: new Date('2026-07-23T09:00:00.000Z'),
          },
          {
            entity_id: 'bundle-1',
            entity_name: 'Combo hogar',
            entity_kind: 'bundle',
            action: 'updated',
            occurred_at: new Date('2026-07-23T09:00:00.000Z'),
          },
        ];
      }
      if (isAttentionSql(sql) || (has(sql, 'UNION ALL') && has(sql, 'tax_rules_coverage_gap'))) {
        return [
          {
            id: 'item-missing-price',
            name: 'Plan sin precio',
            entity_kind: CatalogItemType.PLAN,
            reason: 'missing_current_price',
            valid_to: null,
            uses_remaining: null,
          },
          {
            id: 'bundle-bad',
            name: 'Combo roto',
            entity_kind: 'bundle',
            reason: 'bundle_inactive_items',
            valid_to: null,
            uses_remaining: null,
          },
          {
            id: 'promo-near',
            name: 'Promo casi agotada',
            entity_kind: 'promotion',
            reason: 'near_use_limit',
            valid_to: new Date('2026-08-01T00:00:00.000Z'),
            uses_remaining: 2,
          },
        ];
      }
      if (has(sql, 'GROUP BY ci.type') || has(sql, 'GROUP BY type')) {
        return [
          {
            type: CatalogItemType.PLAN,
            total: 2,
            active: 1,
            sellable: 1,
            missing_residential_price: 1,
          },
          {
            type: CatalogItemType.PRODUCT,
            total: 1,
            active: 1,
            sellable: 1,
            missing_residential_price: 0,
          },
          {
            type: CatalogItemType.SERVICE,
            total: 1,
            active: 1,
            sellable: 0,
            missing_residential_price: 0,
          },
        ];
      }
      if (has(sql, 'bundles_total')) {
        return [
          {
            bundles_total: 2,
            bundles_active: 1,
            promotions_total: 2,
            promotions_active: 1,
            compatibility_total: 2,
            compatibility_active: 1,
            tax_total: 2,
            tax_active: 1,
            offers_expiring_soon: 1,
            offers_near_use_limit: 1,
            offers_at_risk: 2,
            active_offers: 3,
            inactive_bundle_items: 1,
            tax_coverage: 1,
          },
        ];
      }
      return [{ count: 0, total: 0, active: 0 }];
    };

    const summary = await service.getSummary();

    // Legacy intactos
    expect(summary).toMatchObject({
      plansCount: 2,
      activePlansCount: 1,
      productsCount: 1,
      activeProductsCount: 1,
      servicesCount: 1,
      activeServicesCount: 1,
      bundlesCount: 2,
      activeBundlesCount: 1,
      promotionsCount: 2,
      activePromotionsCount: 1,
      compatibilityRulesCount: 2,
      activeCompatibilityRulesCount: 1,
      taxRulesCount: 2,
      activeTaxRulesCount: 1,
    });

    // H8
    expect(summary.offersExpiringSoonCount).toBe(1);
    expect(summary.offersNearUseLimitCount).toBe(1);
    expect(summary.offersAtRiskCount).toBe(2);
    expect(summary.catalogActiveCount).toBe(3);
    expect(summary.catalogSellableActiveCount).toBe(2);
    expect(summary.catalogIncompleteActiveCount).toBe(1);
    expect(summary.missingCurrentPriceCount).toBe(1);
    expect(summary.activeBundlesWithInactiveItemsCount).toBe(1);
    expect(summary.taxRulesCoverageGapCount).toBe(0);
    expect(summary.rulesGapCount).toBe(1);
    expect(summary.activeOffersCount).toBe(3);

    expect(summary.attentionItems).toHaveLength(3);
    expect(summary.attentionItems[0]?.reason).toBe('bundle_inactive_items');
    expect(summary.attentionItems.map((i) => i.reason)).not.toContain('missing_tax_classification');
    expect(summary).not.toHaveProperty('missingTaxClassificationCount');

    // Q4: dedupe por entidad (más específico) + orden occurredAt DESC + sin PII
    expect(summary.recentChanges).toHaveLength(3);
    expect(summary.recentChanges.map((c) => c.action)).toEqual([
      'deactivated',
      'promotion_started',
      'updated',
    ]);
    expect(summary.recentChanges[0]).toMatchObject({
      entityName: 'Combo hogar',
      entityType: 'bundle',
      destinoTab: 'bundles',
      action: 'deactivated',
    });
    expect(summary.recentChanges[1]).toMatchObject({
      entityName: 'Promo verano',
      action: 'promotion_started',
      destinoTab: 'promotions',
    });
    for (const change of summary.recentChanges) {
      expect(change).not.toHaveProperty('userId');
      expect(change).not.toHaveProperty('email');
      expect(change).not.toHaveProperty('changedBy');
      expect(change).not.toHaveProperty('createdBy');
      expect(change).not.toHaveProperty('actionLabel');
    }
  });

  it('calcula taxRulesCoverageGapCount = activePlansCount cuando no hay cobertura tributaria', async () => {
    queryImpl = async (sql: string) => {
      if (isRecentChangesSql(sql)) {
        return [];
      }
      if (has(sql, 'UNION ALL')) {
        return [
          {
            id: 'plan-1',
            name: 'Plan A',
            entity_kind: CatalogItemType.PLAN,
            reason: 'tax_rules_coverage_gap',
            valid_to: null,
            uses_remaining: null,
          },
        ];
      }
      if (has(sql, 'GROUP BY ci.type') || has(sql, 'GROUP BY type')) {
        return [
          {
            type: CatalogItemType.PLAN,
            total: 5,
            active: 4,
            sellable: 4,
            missing_residential_price: 0,
          },
        ];
      }
      if (has(sql, 'bundles_total')) {
        return [
          {
            bundles_total: 0,
            bundles_active: 0,
            promotions_total: 0,
            promotions_active: 0,
            compatibility_total: 0,
            compatibility_active: 0,
            tax_total: 0,
            tax_active: 0,
            offers_expiring_soon: 0,
            offers_near_use_limit: 0,
            offers_at_risk: 0,
            active_offers: 0,
            inactive_bundle_items: 0,
            tax_coverage: 0,
          },
        ];
      }
      return [{ count: 0, total: 0, active: 0 }];
    };

    const summary = await service.getSummary();

    expect(summary.activePlansCount).toBe(4);
    expect(summary.taxRulesCoverageGapCount).toBe(4);
    expect(summary.rulesGapCount).toBe(4);
    expect(summary.attentionItems[0]?.reason).toBe('tax_rules_coverage_gap');
    expect(summary.attentionItems[0]?.destinoTab).toBe('taxation');
    expect(summary.recentChanges).toEqual([]);
  });

  it('limita attentionItems y recentChanges a 5', async () => {
    queryImpl = async (sql: string) => {
      if (isRecentChangesSql(sql)) {
        return Array.from({ length: 8 }, (_, i) => ({
          entity_id: `ent-${i}`,
          entity_name: `Entidad ${i}`,
          entity_kind: CatalogItemType.PLAN,
          action: 'created' as const,
          occurred_at: new Date(`2026-07-${String(23 - i).padStart(2, '0')}T00:00:00.000Z`),
        }));
      }
      if (has(sql, 'UNION ALL')) {
        return Array.from({ length: 8 }, (_, i) => ({
          id: `id-${i}`,
          name: `Item ${String(i).padStart(2, '0')}`,
          entity_kind: CatalogItemType.PLAN,
          reason: 'missing_current_price' as const,
          valid_to: null,
          uses_remaining: null,
        }));
      }
      if (has(sql, 'GROUP BY ci.type') || has(sql, 'GROUP BY type')) {
        return [
          {
            type: CatalogItemType.PLAN,
            total: 1,
            active: 1,
            sellable: 1,
            missing_residential_price: 0,
          },
        ];
      }
      if (has(sql, 'bundles_total')) {
        return [
          {
            bundles_total: 0,
            bundles_active: 0,
            promotions_total: 0,
            promotions_active: 0,
            compatibility_total: 0,
            compatibility_active: 0,
            tax_total: 0,
            tax_active: 0,
            offers_expiring_soon: 0,
            offers_near_use_limit: 0,
            offers_at_risk: 0,
            active_offers: 0,
            inactive_bundle_items: 0,
            tax_coverage: 1,
          },
        ];
      }
      return [{ count: 0, total: 0, active: 0 }];
    };

    const summary = await service.getSummary();
    expect(summary.attentionItems).toHaveLength(5);
    expect(summary.recentChanges).toHaveLength(5);
  });

  it('ejecuta 4 statements y el KPI sin precio filtra solo RESIDENTIAL', async () => {
    const captured: Array<{ sql: string; params?: unknown[] | undefined }> = [];
    queryImpl = async (sql: string, params?: unknown[]) => {
      captured.push({ sql, params });
      if (isRecentChangesSql(sql)) {
        return [];
      }
      if (isAttentionSql(sql) || (has(sql, 'UNION ALL') && has(sql, 'tax_rules_coverage_gap'))) {
        return [];
      }
      if (has(sql, 'GROUP BY ci.type') || has(sql, 'GROUP BY type')) {
        return [
          {
            type: CatalogItemType.PLAN,
            total: 1,
            active: 1,
            sellable: 0,
            missing_residential_price: 1,
          },
        ];
      }
      if (has(sql, 'bundles_total')) {
        return [
          {
            bundles_total: 0,
            bundles_active: 0,
            promotions_total: 0,
            promotions_active: 0,
            compatibility_total: 0,
            compatibility_active: 0,
            tax_total: 0,
            tax_active: 0,
            offers_expiring_soon: 0,
            offers_near_use_limit: 0,
            offers_at_risk: 0,
            active_offers: 0,
            inactive_bundle_items: 0,
            tax_coverage: 1,
          },
        ];
      }
      return [{ count: 0, total: 0, active: 0 }];
    };

    const summary = await service.getSummary();

    expect(captured).toHaveLength(4);
    expect(captured.length).toBeLessThan(15);
    expect(summary.missingCurrentPriceCount).toBe(1);

    const catalogQuery = captured.find((row) => has(row.sql, 'missing_residential_price'));
    expect(catalogQuery).toBeDefined();
    expect(has(catalogQuery!.sql, 'ph.customer_segment = $2')).toBe(true);
    expect(catalogQuery!.params?.[1]).toBe(CustomerSegment.RESIDENTIAL);

    const attentionQuery = captured.find((row) => isAttentionSql(row.sql));
    expect(attentionQuery).toBeDefined();
    expect(attentionQuery!.params).toContain(CustomerSegment.RESIDENTIAL);
  });
});
