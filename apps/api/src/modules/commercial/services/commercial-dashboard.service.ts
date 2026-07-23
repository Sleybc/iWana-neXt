import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CatalogItemType,
  type CommercialAttentionDestinoTab,
  type CommercialAttentionEntityType,
  type CommercialAttentionItem,
  type CommercialAttentionReason,
  type CommercialDashboardSummary,
  type CommercialRecentChange,
  type CommercialRecentChangeAction,
  type CommercialRecentChangeDestinoTab,
  type CommercialRecentChangeEntityType,
} from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';

/** Ventana fija de producto (UX H8 / Q4): 7 días calendario. */
const EXPIRING_WINDOW_DAYS = 7;
/** Umbral G2b: cerca del límite si ratio ≥ 0.8. */
const NEAR_USE_RATIO = 0.8;
/** Umbral G2b: cerca del límite si quedan ≤ 2 usos. */
const NEAR_USE_REMAINING = 2;
const ATTENTION_LIMIT = 5;
const RECENT_CHANGES_LIMIT = 5;

const REASON_PRIORITY: Record<CommercialAttentionReason, number> = {
  tax_rules_coverage_gap: 1,
  bundle_inactive_items: 2,
  missing_current_price: 3,
  near_use_limit: 4,
  expiring_soon: 5,
};

/** Menor = más específico al deduplicar por entidad (Q4). */
const RECENT_ACTION_PRIORITY: Record<CommercialRecentChangeAction, number> = {
  deactivated: 1,
  promotion_expired: 2,
  promotion_started: 3,
  created: 4,
  updated: 5,
};

type CountRow = { count: string | number };
type CatalogTypeCountRow = {
  type: string;
  total: string | number;
  active: string | number;
};
type AttentionRow = {
  id: string;
  name: string;
  entity_kind: string;
  reason: CommercialAttentionReason;
  valid_to: Date | string | null;
  uses_remaining: string | number | null;
};
type RecentChangeRow = {
  entity_id: string;
  entity_name: string;
  entity_kind: string;
  action: CommercialRecentChangeAction;
  occurred_at: Date | string;
};

function toInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapEntityType(kind: string): CommercialAttentionEntityType {
  switch (kind) {
    case CatalogItemType.PLAN:
    case 'plan':
      return 'plan';
    case CatalogItemType.PRODUCT:
    case 'product':
      return 'product';
    case CatalogItemType.SERVICE:
    case 'service':
      return 'service';
    case 'bundle':
      return 'bundle';
    case 'promotion':
      return 'promotion';
    default:
      return 'plan';
  }
}

function mapDestinoTab(
  entityType: CommercialAttentionEntityType,
  reason: CommercialAttentionReason,
): CommercialAttentionDestinoTab {
  if (reason === 'tax_rules_coverage_gap') return 'taxation';
  switch (entityType) {
    case 'plan':
      return 'plans';
    case 'product':
      return 'products';
    case 'service':
      return 'services';
    case 'bundle':
      return 'bundles';
    case 'promotion':
      return 'promotions';
  }
}

function mapRecentEntityType(kind: string): CommercialRecentChangeEntityType {
  switch (kind) {
    case CatalogItemType.PLAN:
    case 'plan':
      return 'plan';
    case CatalogItemType.PRODUCT:
    case 'product':
      return 'product';
    case CatalogItemType.SERVICE:
    case 'service':
      return 'service';
    case 'bundle':
      return 'bundle';
    case 'promotion':
      return 'promotion';
    case 'compatibility_rule':
      return 'compatibility_rule';
    case 'tax_rule':
      return 'tax_rule';
    default:
      return 'plan';
  }
}

function mapRecentDestinoTab(
  entityType: CommercialRecentChangeEntityType,
): CommercialRecentChangeDestinoTab {
  switch (entityType) {
    case 'plan':
      return 'plans';
    case 'product':
      return 'products';
    case 'service':
      return 'services';
    case 'bundle':
      return 'bundles';
    case 'promotion':
      return 'promotions';
    case 'compatibility_rule':
      return 'compatibility';
    case 'tax_rule':
      return 'taxation';
  }
}

function isRecentAction(value: string): value is CommercialRecentChangeAction {
  return value in RECENT_ACTION_PRIORITY;
}

@Injectable()
export class CommercialDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary(): Promise<CommercialDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentWindowStart = new Date(now.getTime() - EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const em = qr.manager;

      const [
        catalogCounts,
        bundleCounts,
        promotionCounts,
        compatibilityCounts,
        taxRuleCounts,
        offersExpiringSoonCount,
        offersNearUseLimitCount,
        offersAtRiskCount,
        catalogSellableActiveCount,
        missingCurrentPriceCount,
        activeBundlesWithInactiveItemsCount,
        hasTaxCoverage,
        activeOffersCount,
        attentionCandidates,
        recentChangeRows,
      ] = await Promise.all([
        this.countCatalogByType(em, tenantId),
        this.countBundles(em, tenantId),
        this.countPromotions(em, tenantId, now),
        this.countCompatibilityRules(em, tenantId),
        this.countTaxRules(em, tenantId),
        this.countOffersExpiringSoon(em, tenantId, now, windowEnd),
        this.countOffersNearUseLimit(em, tenantId, now),
        this.countOffersAtRisk(em, tenantId, now, windowEnd),
        this.countCatalogSellableActive(em, tenantId),
        this.countMissingCurrentPrice(em, tenantId),
        this.countActiveBundlesWithInactiveItems(em, tenantId),
        this.hasActiveTaxRuleCoverage(em, tenantId, now),
        this.countActiveOffers(em, tenantId, now),
        this.fetchAttentionCandidates(em, tenantId, now, windowEnd),
        this.fetchRecentChangeCandidates(em, tenantId, recentWindowStart, now),
      ]);

      const plansCount = catalogCounts.plans.total;
      const activePlansCount = catalogCounts.plans.active;
      const productsCount = catalogCounts.products.total;
      const activeProductsCount = catalogCounts.products.active;
      const servicesCount = catalogCounts.services.total;
      const activeServicesCount = catalogCounts.services.active;

      const catalogActiveCount = activePlansCount + activeProductsCount + activeServicesCount;
      const catalogIncompleteActiveCount = missingCurrentPriceCount;
      const catalogSellable = catalogSellableActiveCount;

      const taxRulesCoverageGapCount =
        activePlansCount > 0 && !hasTaxCoverage ? activePlansCount : 0;
      const rulesGapCount = activeBundlesWithInactiveItemsCount + taxRulesCoverageGapCount;

      const attentionItems = this.prioritizeAttentionItems(
        attentionCandidates,
        taxRulesCoverageGapCount > 0,
      );
      const recentChanges = this.prioritizeRecentChanges(recentChangeRows);

      return {
        plansCount,
        activePlansCount,
        productsCount,
        activeProductsCount,
        servicesCount,
        activeServicesCount,
        bundlesCount: bundleCounts.total,
        activeBundlesCount: bundleCounts.active,
        promotionsCount: promotionCounts.total,
        activePromotionsCount: promotionCounts.active,
        compatibilityRulesCount: compatibilityCounts.total,
        activeCompatibilityRulesCount: compatibilityCounts.active,
        taxRulesCount: taxRuleCounts.total,
        activeTaxRulesCount: taxRuleCounts.active,

        offersExpiringSoonCount,
        offersNearUseLimitCount,
        offersAtRiskCount,

        catalogActiveCount,
        catalogSellableActiveCount: catalogSellable,
        catalogIncompleteActiveCount,
        missingCurrentPriceCount,

        activeBundlesWithInactiveItemsCount,
        taxRulesCoverageGapCount,
        rulesGapCount,

        activeOffersCount,
        attentionItems,
        recentChanges,
      };
    });
  }

  private async countCatalogByType(
    em: EntityManager,
    tenantId: string,
  ): Promise<{
    plans: { total: number; active: number };
    products: { total: number; active: number };
    services: { total: number; active: number };
  }> {
    const rows = await em.query(
      `
      SELECT type,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active = true)::int AS active
      FROM catalog_items
      WHERE tenant_id = $1
        AND deleted_at IS NULL
      GROUP BY type
      `,
      [tenantId],
    );

    const empty = { total: 0, active: 0 };
    const result = { plans: { ...empty }, products: { ...empty }, services: { ...empty } };

    for (const row of rows as CatalogTypeCountRow[]) {
      const bucket = {
        total: toInt(row.total),
        active: toInt(row.active),
      };
      if (row.type === CatalogItemType.PLAN) result.plans = bucket;
      else if (row.type === CatalogItemType.PRODUCT) result.products = bucket;
      else if (row.type === CatalogItemType.SERVICE) result.services = bucket;
    }

    return result;
  }

  private async countBundles(
    em: EntityManager,
    tenantId: string,
  ): Promise<{ total: number; active: number }> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active = true)::int AS active
      FROM catalog_bundles
      WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const row = (rows as CountRow & { total?: string | number; active?: string | number }[])[0];
    return { total: toInt(row?.total), active: toInt(row?.active) };
  }

  private async countPromotions(
    em: EntityManager,
    tenantId: string,
    now: Date,
  ): Promise<{ total: number; active: number }> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (
               WHERE is_active = true
                 AND valid_from <= $2
                 AND valid_to >= $2
                 AND (max_uses IS NULL OR current_uses < max_uses)
             )::int AS active
      FROM catalog_promotions
      WHERE tenant_id = $1
      `,
      [tenantId, now],
    );
    const row = (rows as { total: string | number; active: string | number }[])[0];
    return { total: toInt(row?.total), active: toInt(row?.active) };
  }

  private async countCompatibilityRules(
    em: EntityManager,
    tenantId: string,
  ): Promise<{ total: number; active: number }> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active = true)::int AS active
      FROM catalog_compatibility_rules
      WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const row = (rows as { total: string | number; active: string | number }[])[0];
    return { total: toInt(row?.total), active: toInt(row?.active) };
  }

  private async countTaxRules(
    em: EntityManager,
    tenantId: string,
  ): Promise<{ total: number; active: number }> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active = true)::int AS active
      FROM tax_rules
      WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const row = (rows as { total: string | number; active: string | number }[])[0];
    return { total: toInt(row?.total), active: toInt(row?.active) };
  }

  private async countOffersExpiringSoon(
    em: EntityManager,
    tenantId: string,
    now: Date,
    windowEnd: Date,
  ): Promise<number> {
    const rows = await em.query(
      `
      SELECT (
        (
          SELECT COUNT(*)::int
          FROM catalog_bundles b
          WHERE b.tenant_id = $1
            AND b.is_active = true
            AND b.valid_to IS NOT NULL
            AND b.valid_to >= $2
            AND b.valid_to <= $3
        )
        +
        (
          SELECT COUNT(*)::int
          FROM catalog_promotions p
          WHERE p.tenant_id = $1
            AND p.is_active = true
            AND p.valid_to >= $2
            AND p.valid_to <= $3
            AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
        )
      ) AS count
      `,
      [tenantId, now, windowEnd],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async countOffersNearUseLimit(
    em: EntityManager,
    tenantId: string,
    now: Date,
  ): Promise<number> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS count
      FROM catalog_promotions p
      WHERE p.tenant_id = $1
        AND p.is_active = true
        AND p.valid_from <= $2
        AND p.valid_to >= $2
        AND p.max_uses IS NOT NULL
        AND p.current_uses < p.max_uses
        AND (
          (p.current_uses::numeric / p.max_uses::numeric) >= $3
          OR (p.max_uses - p.current_uses) <= $4
        )
      `,
      [tenantId, now, NEAR_USE_RATIO, NEAR_USE_REMAINING],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async countOffersAtRisk(
    em: EntityManager,
    tenantId: string,
    now: Date,
    windowEnd: Date,
  ): Promise<number> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT b.id::text AS oid
        FROM catalog_bundles b
        WHERE b.tenant_id = $1
          AND b.is_active = true
          AND b.valid_to IS NOT NULL
          AND b.valid_to >= $2
          AND b.valid_to <= $3
        UNION
        SELECT p.id::text AS oid
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.is_active = true
          AND p.valid_to >= $2
          AND p.valid_to <= $3
          AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
        UNION
        SELECT p.id::text AS oid
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.is_active = true
          AND p.valid_from <= $2
          AND p.valid_to >= $2
          AND p.max_uses IS NOT NULL
          AND p.current_uses < p.max_uses
          AND (
            (p.current_uses::numeric / p.max_uses::numeric) >= $4
            OR (p.max_uses - p.current_uses) <= $5
          )
      ) at_risk
      `,
      [tenantId, now, windowEnd, NEAR_USE_RATIO, NEAR_USE_REMAINING],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async countCatalogSellableActive(em: EntityManager, tenantId: string): Promise<number> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS count
      FROM catalog_items ci
      WHERE ci.tenant_id = $1
        AND ci.is_active = true
        AND ci.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM catalog_price_history ph
          WHERE ph.item_id = ci.id
            AND ph.is_current = true
        )
      `,
      [tenantId],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async countMissingCurrentPrice(em: EntityManager, tenantId: string): Promise<number> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS count
      FROM catalog_items ci
      WHERE ci.tenant_id = $1
        AND ci.is_active = true
        AND ci.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM catalog_price_history ph
          WHERE ph.item_id = ci.id
            AND ph.is_current = true
        )
      `,
      [tenantId],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async countActiveBundlesWithInactiveItems(
    em: EntityManager,
    tenantId: string,
  ): Promise<number> {
    const rows = await em.query(
      `
      SELECT COUNT(DISTINCT b.id)::int AS count
      FROM catalog_bundles b
      INNER JOIN catalog_bundle_items bi ON bi.bundle_id = b.id
      INNER JOIN catalog_items ci ON ci.id = bi.item_id
      WHERE b.tenant_id = $1
        AND b.is_active = true
        AND ci.is_active = false
      `,
      [tenantId],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  /**
   * Cobertura tributaria tenant-level (G2b):
   * ≥1 tax_rule activa en vigencia con ≥1 tax_rule_application activa.
   */
  private async hasActiveTaxRuleCoverage(
    em: EntityManager,
    tenantId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await em.query(
      `
      SELECT COUNT(*)::int AS count
      FROM tax_rules tr
      WHERE tr.tenant_id = $1
        AND tr.is_active = true
        AND tr.valid_from <= $2
        AND (tr.valid_to IS NULL OR tr.valid_to >= $2)
        AND EXISTS (
          SELECT 1
          FROM tax_rule_applications tra
          WHERE tra.tax_rule_id = tr.id
            AND tra.is_active = true
        )
      `,
      [tenantId, now],
    );
    return toInt((rows as CountRow[])[0]?.count) > 0;
  }

  private async countActiveOffers(em: EntityManager, tenantId: string, now: Date): Promise<number> {
    const rows = await em.query(
      `
      SELECT (
        (
          SELECT COUNT(*)::int
          FROM catalog_bundles b
          WHERE b.tenant_id = $1
            AND b.is_active = true
            AND b.valid_from <= $2
            AND (b.valid_to IS NULL OR b.valid_to >= $2)
        )
        +
        (
          SELECT COUNT(*)::int
          FROM catalog_promotions p
          WHERE p.tenant_id = $1
            AND p.is_active = true
            AND p.valid_from <= $2
            AND p.valid_to >= $2
            AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
        )
      ) AS count
      `,
      [tenantId, now],
    );
    return toInt((rows as CountRow[])[0]?.count);
  }

  private async fetchAttentionCandidates(
    em: EntityManager,
    tenantId: string,
    now: Date,
    windowEnd: Date,
  ): Promise<AttentionRow[]> {
    const rows = await em.query(
      `
      (
        SELECT ci.id::text AS id,
               ci.name AS name,
               ci.type::text AS entity_kind,
               'missing_current_price'::text AS reason,
               NULL::timestamptz AS valid_to,
               NULL::int AS uses_remaining
        FROM catalog_items ci
        WHERE ci.tenant_id = $1
          AND ci.is_active = true
          AND ci.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM catalog_price_history ph
            WHERE ph.item_id = ci.id AND ph.is_current = true
          )
        ORDER BY ci.name ASC
        LIMIT $6
      )
      UNION ALL
      (
        SELECT b.id::text,
               b.name,
               'bundle'::text,
               'bundle_inactive_items'::text,
               b.valid_to,
               NULL::int
        FROM catalog_bundles b
        WHERE b.tenant_id = $1
          AND b.is_active = true
          AND EXISTS (
            SELECT 1
            FROM catalog_bundle_items bi
            INNER JOIN catalog_items ci ON ci.id = bi.item_id
            WHERE bi.bundle_id = b.id
              AND ci.is_active = false
          )
        ORDER BY b.name ASC
        LIMIT $6
      )
      UNION ALL
      (
        SELECT p.id::text,
               p.name,
               'promotion'::text,
               'near_use_limit'::text,
               p.valid_to,
               (p.max_uses - p.current_uses)::int
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.is_active = true
          AND p.valid_from <= $2
          AND p.valid_to >= $2
          AND p.max_uses IS NOT NULL
          AND p.current_uses < p.max_uses
          AND (
            (p.current_uses::numeric / p.max_uses::numeric) >= $4
            OR (p.max_uses - p.current_uses) <= $5
          )
        ORDER BY p.name ASC
        LIMIT $6
      )
      UNION ALL
      (
        SELECT b.id::text,
               b.name,
               'bundle'::text,
               'expiring_soon'::text,
               b.valid_to,
               NULL::int
        FROM catalog_bundles b
        WHERE b.tenant_id = $1
          AND b.is_active = true
          AND b.valid_to IS NOT NULL
          AND b.valid_to >= $2
          AND b.valid_to <= $3
        ORDER BY b.valid_to ASC
        LIMIT $6
      )
      UNION ALL
      (
        SELECT p.id::text,
               p.name,
               'promotion'::text,
               'expiring_soon'::text,
               p.valid_to,
               CASE
                 WHEN p.max_uses IS NULL THEN NULL
                 ELSE (p.max_uses - p.current_uses)::int
               END
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.is_active = true
          AND p.valid_to >= $2
          AND p.valid_to <= $3
          AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
        ORDER BY p.valid_to ASC
        LIMIT $6
      )
      UNION ALL
      (
        SELECT ci.id::text,
               ci.name,
               ci.type::text,
               'tax_rules_coverage_gap'::text,
               NULL::timestamptz,
               NULL::int
        FROM catalog_items ci
        WHERE ci.tenant_id = $1
          AND ci.type = 'PLAN'
          AND ci.is_active = true
          AND ci.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM tax_rules tr
            WHERE tr.tenant_id = $1
              AND tr.is_active = true
              AND tr.valid_from <= $2
              AND (tr.valid_to IS NULL OR tr.valid_to >= $2)
              AND EXISTS (
                SELECT 1
                FROM tax_rule_applications tra
                WHERE tra.tax_rule_id = tr.id
                  AND tra.is_active = true
              )
          )
        ORDER BY ci.name ASC
        LIMIT $6
      )
      `,
      [tenantId, now, windowEnd, NEAR_USE_RATIO, NEAR_USE_REMAINING, ATTENTION_LIMIT],
    );

    return rows as AttentionRow[];
  }

  private prioritizeAttentionItems(
    candidates: AttentionRow[],
    includeTaxGap: boolean,
  ): CommercialAttentionItem[] {
    const filtered = candidates.filter((row) => {
      if (!row?.id || !row.reason || !(row.reason in REASON_PRIORITY)) return false;
      if (row.reason === 'tax_rules_coverage_gap') return includeTaxGap;
      return true;
    });

    const seen = new Set<string>();
    const mapped: CommercialAttentionItem[] = [];

    const sorted = [...filtered].sort((a, b) => {
      const pr = REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason];
      if (pr !== 0) return pr;
      return a.name.localeCompare(b.name, 'es');
    });

    for (const row of sorted) {
      const key = `${row.reason}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entityType = mapEntityType(row.entity_kind);
      mapped.push({
        id: row.id,
        entityType,
        name: row.name,
        reason: row.reason,
        destinoTab: mapDestinoTab(entityType, row.reason),
        validTo: toIso(row.valid_to),
        usesRemaining:
          row.uses_remaining === null || row.uses_remaining === undefined
            ? null
            : toInt(row.uses_remaining),
      });

      if (mapped.length >= ATTENTION_LIMIT) break;
    }

    return mapped;
  }

  /**
   * Q4: proyección liviana de cambios recientes (ventana 7 días).
   * Sin created_by / userId / email. Una fila candidata por señal; dedupe en TS.
   */
  private async fetchRecentChangeCandidates(
    em: EntityManager,
    tenantId: string,
    windowStart: Date,
    now: Date,
  ): Promise<RecentChangeRow[]> {
    const rows = await em.query(
      `
      (
        SELECT ci.id::text AS entity_id,
               ci.name AS entity_name,
               ci.type::text AS entity_kind,
               CASE
                 WHEN ci.updated_at >= $2 AND ci.updated_at <= $3 AND ci.is_active = false
                   THEN 'deactivated'
                 WHEN ci.created_at >= $2 AND ci.created_at <= $3
                      AND ci.updated_at <= ci.created_at + interval '1 second'
                   THEN 'created'
                 WHEN ci.updated_at >= $2 AND ci.updated_at <= $3
                      AND ci.updated_at > ci.created_at + interval '1 second'
                   THEN 'updated'
                 WHEN ci.created_at >= $2 AND ci.created_at <= $3
                   THEN 'created'
               END AS action,
               CASE
                 WHEN ci.updated_at >= $2 AND ci.updated_at <= $3 AND ci.is_active = false
                   THEN ci.updated_at
                 WHEN ci.created_at >= $2 AND ci.created_at <= $3
                      AND ci.updated_at <= ci.created_at + interval '1 second'
                   THEN ci.created_at
                 WHEN ci.updated_at >= $2 AND ci.updated_at <= $3
                      AND ci.updated_at > ci.created_at + interval '1 second'
                   THEN ci.updated_at
                 ELSE ci.created_at
               END AS occurred_at
        FROM catalog_items ci
        WHERE ci.tenant_id = $1
          AND ci.deleted_at IS NULL
          AND (
            (ci.created_at >= $2 AND ci.created_at <= $3)
            OR (ci.updated_at >= $2 AND ci.updated_at <= $3)
          )
      )
      UNION ALL
      (
        SELECT b.id::text,
               b.name,
               'bundle'::text,
               CASE
                 WHEN b.updated_at >= $2 AND b.updated_at <= $3 AND b.is_active = false
                   THEN 'deactivated'
                 WHEN b.created_at >= $2 AND b.created_at <= $3
                      AND b.updated_at <= b.created_at + interval '1 second'
                   THEN 'created'
                 WHEN b.updated_at >= $2 AND b.updated_at <= $3
                      AND b.updated_at > b.created_at + interval '1 second'
                   THEN 'updated'
                 WHEN b.created_at >= $2 AND b.created_at <= $3
                   THEN 'created'
               END,
               CASE
                 WHEN b.updated_at >= $2 AND b.updated_at <= $3 AND b.is_active = false
                   THEN b.updated_at
                 WHEN b.created_at >= $2 AND b.created_at <= $3
                      AND b.updated_at <= b.created_at + interval '1 second'
                   THEN b.created_at
                 WHEN b.updated_at >= $2 AND b.updated_at <= $3
                      AND b.updated_at > b.created_at + interval '1 second'
                   THEN b.updated_at
                 ELSE b.created_at
               END
        FROM catalog_bundles b
        WHERE b.tenant_id = $1
          AND (
            (b.created_at >= $2 AND b.created_at <= $3)
            OR (b.updated_at >= $2 AND b.updated_at <= $3)
          )
      )
      UNION ALL
      (
        SELECT p.id::text,
               p.name,
               'promotion'::text,
               CASE
                 WHEN p.updated_at >= $2 AND p.updated_at <= $3 AND p.is_active = false
                   THEN 'deactivated'
                 WHEN p.created_at >= $2 AND p.created_at <= $3
                      AND p.updated_at <= p.created_at + interval '1 second'
                   THEN 'created'
                 WHEN p.updated_at >= $2 AND p.updated_at <= $3
                      AND p.updated_at > p.created_at + interval '1 second'
                   THEN 'updated'
                 WHEN p.created_at >= $2 AND p.created_at <= $3
                   THEN 'created'
               END,
               CASE
                 WHEN p.updated_at >= $2 AND p.updated_at <= $3 AND p.is_active = false
                   THEN p.updated_at
                 WHEN p.created_at >= $2 AND p.created_at <= $3
                      AND p.updated_at <= p.created_at + interval '1 second'
                   THEN p.created_at
                 WHEN p.updated_at >= $2 AND p.updated_at <= $3
                      AND p.updated_at > p.created_at + interval '1 second'
                   THEN p.updated_at
                 ELSE p.created_at
               END
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND (
            (p.created_at >= $2 AND p.created_at <= $3)
            OR (p.updated_at >= $2 AND p.updated_at <= $3)
          )
      )
      UNION ALL
      (
        SELECT p.id::text,
               p.name,
               'promotion'::text,
               'promotion_started'::text,
               p.valid_from
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.valid_from >= $2
          AND p.valid_from <= $3
      )
      UNION ALL
      (
        SELECT p.id::text,
               p.name,
               'promotion'::text,
               'promotion_expired'::text,
               p.valid_to
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND p.valid_to >= $2
          AND p.valid_to <= $3
          AND p.valid_to < $3
      )
      UNION ALL
      (
        SELECT r.id::text,
               COALESCE(
                 NULLIF(BTRIM(r.description), ''),
                 src.name || ' → ' || tgt.name
               ),
               'compatibility_rule'::text,
               CASE
                 WHEN r.updated_at >= $2 AND r.updated_at <= $3 AND r.is_active = false
                   THEN 'deactivated'
                 WHEN r.created_at >= $2 AND r.created_at <= $3
                      AND r.updated_at <= r.created_at + interval '1 second'
                   THEN 'created'
                 WHEN r.updated_at >= $2 AND r.updated_at <= $3
                      AND r.updated_at > r.created_at + interval '1 second'
                   THEN 'updated'
                 WHEN r.created_at >= $2 AND r.created_at <= $3
                   THEN 'created'
               END,
               CASE
                 WHEN r.updated_at >= $2 AND r.updated_at <= $3 AND r.is_active = false
                   THEN r.updated_at
                 WHEN r.created_at >= $2 AND r.created_at <= $3
                      AND r.updated_at <= r.created_at + interval '1 second'
                   THEN r.created_at
                 WHEN r.updated_at >= $2 AND r.updated_at <= $3
                      AND r.updated_at > r.created_at + interval '1 second'
                   THEN r.updated_at
                 ELSE r.created_at
               END
        FROM catalog_compatibility_rules r
        INNER JOIN catalog_items src ON src.id = r.source_item_id
        INNER JOIN catalog_items tgt ON tgt.id = r.target_item_id
        WHERE r.tenant_id = $1
          AND (
            (r.created_at >= $2 AND r.created_at <= $3)
            OR (r.updated_at >= $2 AND r.updated_at <= $3)
          )
      )
      UNION ALL
      (
        SELECT tr.id::text,
               (tr.tax_type || ' ' || tr.rate_percentage::text || '%'),
               'tax_rule'::text,
               CASE
                 WHEN tr.updated_at >= $2 AND tr.updated_at <= $3 AND tr.is_active = false
                   THEN 'deactivated'
                 WHEN tr.created_at >= $2 AND tr.created_at <= $3
                      AND tr.updated_at <= tr.created_at + interval '1 second'
                   THEN 'created'
                 WHEN tr.updated_at >= $2 AND tr.updated_at <= $3
                      AND tr.updated_at > tr.created_at + interval '1 second'
                   THEN 'updated'
                 WHEN tr.created_at >= $2 AND tr.created_at <= $3
                   THEN 'created'
               END,
               CASE
                 WHEN tr.updated_at >= $2 AND tr.updated_at <= $3 AND tr.is_active = false
                   THEN tr.updated_at
                 WHEN tr.created_at >= $2 AND tr.created_at <= $3
                      AND tr.updated_at <= tr.created_at + interval '1 second'
                   THEN tr.created_at
                 WHEN tr.updated_at >= $2 AND tr.updated_at <= $3
                      AND tr.updated_at > tr.created_at + interval '1 second'
                   THEN tr.updated_at
                 ELSE tr.created_at
               END
        FROM tax_rules tr
        WHERE tr.tenant_id = $1
          AND (
            (tr.created_at >= $2 AND tr.created_at <= $3)
            OR (tr.updated_at >= $2 AND tr.updated_at <= $3)
          )
      )
      `,
      [tenantId, windowStart, now],
    );

    return (rows as RecentChangeRow[]).filter(
      (row) => row?.entity_id && row.action && isRecentAction(row.action) && row.occurred_at,
    );
  }

  private prioritizeRecentChanges(candidates: RecentChangeRow[]): CommercialRecentChange[] {
    const bestByEntity = new Map<string, RecentChangeRow>();

    for (const row of candidates) {
      if (!isRecentAction(row.action)) continue;
      const entityType = mapRecentEntityType(row.entity_kind);
      const key = `${entityType}:${row.entity_id}`;
      const existing = bestByEntity.get(key);
      if (!existing) {
        bestByEntity.set(key, row);
        continue;
      }
      const existingAction = existing.action;
      if (!isRecentAction(existingAction)) {
        bestByEntity.set(key, row);
        continue;
      }
      const specificity =
        RECENT_ACTION_PRIORITY[row.action] - RECENT_ACTION_PRIORITY[existingAction];
      if (specificity < 0) {
        bestByEntity.set(key, row);
        continue;
      }
      if (specificity > 0) continue;

      const rowTs = new Date(row.occurred_at).getTime();
      const existingTs = new Date(existing.occurred_at).getTime();
      if (rowTs > existingTs) {
        bestByEntity.set(key, row);
      }
    }

    const sorted = [...bestByEntity.values()].sort((a, b) => {
      const ta = new Date(a.occurred_at).getTime();
      const tb = new Date(b.occurred_at).getTime();
      return tb - ta;
    });

    const result: CommercialRecentChange[] = [];
    for (const row of sorted) {
      const occurredAt = toIso(row.occurred_at);
      if (!occurredAt || !isRecentAction(row.action)) continue;
      const entityType = mapRecentEntityType(row.entity_kind);
      result.push({
        occurredAt,
        action: row.action,
        entityType,
        entityName: row.entity_name,
        destinoTab: mapRecentDestinoTab(entityType),
      });
      if (result.length >= RECENT_CHANGES_LIMIT) break;
    }

    return result;
  }
}
