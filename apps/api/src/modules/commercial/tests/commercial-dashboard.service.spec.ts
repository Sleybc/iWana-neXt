import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CatalogItemType } from '@iwana/shared';
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
      if (has(sql, 'GROUP BY type')) {
        return [
          { type: CatalogItemType.PLAN, total: 2, active: 1 },
          { type: CatalogItemType.PRODUCT, total: 1, active: 1 },
          { type: CatalogItemType.SERVICE, total: 1, active: 1 },
        ];
      }
      if (
        has(sql, 'FROM catalog_bundles') &&
        has(sql, 'COUNT(*) FILTER (WHERE is_active = true)') &&
        !has(sql, 'catalog_promotions')
      ) {
        return [{ total: 2, active: 1 }];
      }
      if (
        has(sql, 'FROM catalog_promotions') &&
        has(sql, 'COUNT(*) FILTER') &&
        !has(sql, 'catalog_bundles')
      ) {
        return [{ total: 2, active: 1 }];
      }
      if (
        has(sql, 'FROM catalog_compatibility_rules') &&
        has(sql, 'COUNT(*) FILTER (WHERE is_active = true)')
      ) {
        return [{ total: 2, active: 1 }];
      }
      if (
        has(sql, 'FROM tax_rules') &&
        has(sql, 'COUNT(*) FILTER (WHERE is_active = true)') &&
        !has(sql, 'tax_rule_applications')
      ) {
        return [{ total: 2, active: 1 }];
      }
      if (has(sql, ') at_risk')) {
        return [{ count: 2 }];
      }
      if (
        has(sql, 'FROM catalog_bundles b') &&
        has(sql, 'FROM catalog_promotions p') &&
        has(sql, 'valid_to <= $3') &&
        !has(sql, 'UNION')
      ) {
        return [{ count: 1 }];
      }
      if (
        has(sql, 'FROM catalog_promotions p') &&
        has(sql, 'current_uses::numeric / p.max_uses::numeric') &&
        has(sql, 'SELECT COUNT(*)::int AS count') &&
        !has(sql, 'UNION')
      ) {
        return [{ count: 1 }];
      }
      if (
        has(sql, 'FROM catalog_bundles b') &&
        has(sql, 'b.valid_to IS NULL OR b.valid_to >= $2') &&
        has(sql, 'FROM catalog_promotions p')
      ) {
        return [{ count: 3 }];
      }
      if (has(sql, 'NOT EXISTS') && has(sql, 'catalog_price_history')) {
        return [{ count: 1 }];
      }
      if (
        has(sql, 'EXISTS') &&
        has(sql, 'catalog_price_history') &&
        has(sql, 'is_current = true')
      ) {
        return [{ count: 2 }];
      }
      if (has(sql, 'COUNT(DISTINCT b.id)') && has(sql, 'ci.is_active = false')) {
        return [{ count: 1 }];
      }
      if (has(sql, 'FROM tax_rules tr') && has(sql, 'tax_rule_applications')) {
        return [{ count: 1 }];
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
      if (has(sql, 'GROUP BY type')) {
        return [
          { type: CatalogItemType.PLAN, total: 5, active: 4 },
          { type: CatalogItemType.PRODUCT, total: 0, active: 0 },
          { type: CatalogItemType.SERVICE, total: 0, active: 0 },
        ];
      }
      if (has(sql, 'FROM tax_rules tr') && has(sql, 'tax_rule_applications')) {
        return [{ count: 0 }];
      }
      if (has(sql, 'NOT EXISTS') && has(sql, 'catalog_price_history')) {
        return [{ count: 0 }];
      }
      if (has(sql, 'EXISTS') && has(sql, 'catalog_price_history')) {
        return [{ count: 4 }];
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
      if (has(sql, 'GROUP BY type')) {
        return [{ type: CatalogItemType.PLAN, total: 1, active: 1 }];
      }
      if (has(sql, 'FROM tax_rules tr') && has(sql, 'tax_rule_applications')) {
        return [{ count: 1 }];
      }
      return [{ count: 0, total: 0, active: 0 }];
    };

    const summary = await service.getSummary();
    expect(summary.attentionItems).toHaveLength(5);
    expect(summary.recentChanges).toHaveLength(5);
  });
});
