import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CatalogItemType,
  CustomerSegment,
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
import {
  COMMERCIAL_EXPIRING_WINDOW_DAYS,
  COMMERCIAL_NEAR_USE_RATIO,
  COMMERCIAL_NEAR_USE_REMAINING,
} from '../utils/commercial-offer-filters';

/** Ventana fija de producto (UX H8 / Q4): 7 días calendario. */
const EXPIRING_WINDOW_DAYS = COMMERCIAL_EXPIRING_WINDOW_DAYS;
/** Umbral G2b: cerca del límite si ratio ≥ 0.8. */
const NEAR_USE_RATIO = COMMERCIAL_NEAR_USE_RATIO;
/** Umbral G2b: cerca del límite si quedan ≤ 2 usos. */
const NEAR_USE_REMAINING = COMMERCIAL_NEAR_USE_REMAINING;
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

      const [catalogRows, kpi, attentionCandidates, recentChangeRows] = await Promise.all([
        this.fetchCatalogCounts(em, tenantId),
        this.fetchOfferKpis(em, tenantId, now, windowEnd),
        this.fetchAttentionCandidates(em, tenantId, now, windowEnd),
        this.fetchRecentChangeCandidates(em, tenantId, recentWindowStart, now),
      ]);

      const empty = { total: 0, active: 0, sellable: 0, missingResidentialPrice: 0 };
      const catalogCounts = {
        plans: { ...empty },
        products: { ...empty },
        services: { ...empty },
      };
      for (const row of catalogRows) {
        const bucket = {
          total: toInt(row.total),
          active: toInt(row.active),
          sellable: toInt(row.sellable),
          missingResidentialPrice: toInt(row.missing_residential_price),
        };
        if (row.type === CatalogItemType.PLAN) catalogCounts.plans = bucket;
        else if (row.type === CatalogItemType.PRODUCT) catalogCounts.products = bucket;
        else if (row.type === CatalogItemType.SERVICE) catalogCounts.services = bucket;
      }

      const plansCount = catalogCounts.plans.total;
      const activePlansCount = catalogCounts.plans.active;
      const productsCount = catalogCounts.products.total;
      const activeProductsCount = catalogCounts.products.active;
      const servicesCount = catalogCounts.services.total;
      const activeServicesCount = catalogCounts.services.active;

      const catalogActiveCount = activePlansCount + activeProductsCount + activeServicesCount;
      const missingCurrentPriceCount =
        catalogCounts.plans.missingResidentialPrice +
        catalogCounts.products.missingResidentialPrice +
        catalogCounts.services.missingResidentialPrice;
      const catalogIncompleteActiveCount = missingCurrentPriceCount;
      const catalogSellable =
        catalogCounts.plans.sellable +
        catalogCounts.products.sellable +
        catalogCounts.services.sellable;

      const hasTaxCoverage = toInt(kpi.tax_coverage) > 0;
      const activeBundlesWithInactiveItemsCount = toInt(kpi.inactive_bundle_items);
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
        bundlesCount: toInt(kpi.bundles_total),
        activeBundlesCount: toInt(kpi.bundles_active),
        promotionsCount: toInt(kpi.promotions_total),
        activePromotionsCount: toInt(kpi.promotions_active),
        compatibilityRulesCount: toInt(kpi.compatibility_total),
        activeCompatibilityRulesCount: toInt(kpi.compatibility_active),
        taxRulesCount: toInt(kpi.tax_total),
        activeTaxRulesCount: toInt(kpi.tax_active),

        offersExpiringSoonCount: toInt(kpi.offers_expiring_soon),
        offersNearUseLimitCount: toInt(kpi.offers_near_use_limit),
        offersAtRiskCount: toInt(kpi.offers_at_risk),

        catalogActiveCount,
        catalogSellableActiveCount: catalogSellable,
        catalogIncompleteActiveCount,
        missingCurrentPriceCount,

        activeBundlesWithInactiveItemsCount,
        taxRulesCoverageGapCount,
        rulesGapCount,

        activeOffersCount: toInt(kpi.active_offers),
        attentionItems,
        recentChanges,
      };
    });
  }

  private async fetchCatalogCounts(
    em: EntityManager,
    tenantId: string,
  ): Promise<
    Array<{
      type: string;
      total: string | number;
      active: string | number;
      sellable: string | number;
      missing_residential_price: string | number;
    }>
  > {
    const rows = await em.query(
      `
      SELECT ci.type,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ci.is_active = true)::int AS active,
             COUNT(*) FILTER (
               WHERE ci.is_active = true
                 AND EXISTS (
                   SELECT 1 FROM catalog_price_history ph
                   WHERE ph.item_id = ci.id AND ph.is_current = true
                 )
             )::int AS sellable,
             COUNT(*) FILTER (
               WHERE ci.is_active = true
                 AND NOT EXISTS (
                   SELECT 1 FROM catalog_price_history ph
                   WHERE ph.item_id = ci.id
                     AND ph.is_current = true
                     AND ph.customer_segment = $2
                 )
             )::int AS missing_residential_price
      FROM catalog_items ci
      WHERE ci.tenant_id = $1
        AND ci.deleted_at IS NULL
      GROUP BY ci.type
      `,
      [tenantId, CustomerSegment.RESIDENTIAL],
    );
    return rows as Array<{
      type: string;
      total: string | number;
      active: string | number;
      sellable: string | number;
      missing_residential_price: string | number;
    }>;
  }

  private async fetchOfferKpis(
    em: EntityManager,
    tenantId: string,
    now: Date,
    windowEnd: Date,
  ): Promise<Record<string, string | number>> {
    const rows = await em.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM catalog_bundles WHERE tenant_id = $1) AS bundles_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = true)::int FROM catalog_bundles WHERE tenant_id = $1) AS bundles_active,
        (SELECT COUNT(*)::int FROM catalog_promotions WHERE tenant_id = $1) AS promotions_total,
        (SELECT COUNT(*) FILTER (
           WHERE is_active = true
             AND valid_from <= $2
             AND valid_to >= $2
             AND (max_uses IS NULL OR current_uses < max_uses)
         )::int FROM catalog_promotions WHERE tenant_id = $1) AS promotions_active,
        (SELECT COUNT(*)::int FROM catalog_compatibility_rules WHERE tenant_id = $1) AS compatibility_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = true)::int FROM catalog_compatibility_rules WHERE tenant_id = $1) AS compatibility_active,
        (SELECT COUNT(*)::int FROM tax_rules WHERE tenant_id = $1) AS tax_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = true)::int FROM tax_rules WHERE tenant_id = $1) AS tax_active,
        (
          (SELECT COUNT(*)::int FROM catalog_bundles b
            WHERE b.tenant_id = $1 AND b.is_active = true
              AND b.valid_to IS NOT NULL AND b.valid_to >= $2 AND b.valid_to <= $3)
          +
          (SELECT COUNT(*)::int FROM catalog_promotions p
            WHERE p.tenant_id = $1 AND p.is_active = true
              AND p.valid_to >= $2 AND p.valid_to <= $3
              AND (p.max_uses IS NULL OR p.current_uses < p.max_uses))
        ) AS offers_expiring_soon,
        (SELECT COUNT(*)::int FROM catalog_promotions p
          WHERE p.tenant_id = $1 AND p.is_active = true
            AND p.valid_from <= $2 AND p.valid_to >= $2
            AND p.max_uses IS NOT NULL AND p.current_uses < p.max_uses
            AND (
              (p.current_uses::numeric / p.max_uses::numeric) >= $4
              OR (p.max_uses - p.current_uses) <= $5
            )
        ) AS offers_near_use_limit,
        (SELECT COUNT(*)::int FROM (
          SELECT b.id::text AS oid FROM catalog_bundles b
          WHERE b.tenant_id = $1 AND b.is_active = true
            AND b.valid_to IS NOT NULL AND b.valid_to >= $2 AND b.valid_to <= $3
          UNION
          SELECT p.id::text AS oid FROM catalog_promotions p
          WHERE p.tenant_id = $1 AND p.is_active = true
            AND p.valid_to >= $2 AND p.valid_to <= $3
            AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
          UNION
          SELECT p.id::text AS oid FROM catalog_promotions p
          WHERE p.tenant_id = $1 AND p.is_active = true
            AND p.valid_from <= $2 AND p.valid_to >= $2
            AND p.max_uses IS NOT NULL AND p.current_uses < p.max_uses
            AND (
              (p.current_uses::numeric / p.max_uses::numeric) >= $4
              OR (p.max_uses - p.current_uses) <= $5
            )
        ) at_risk) AS offers_at_risk,
        (
          (SELECT COUNT(*)::int FROM catalog_bundles b
            WHERE b.tenant_id = $1 AND b.is_active = true
              AND b.valid_from <= $2 AND (b.valid_to IS NULL OR b.valid_to >= $2))
          +
          (SELECT COUNT(*)::int FROM catalog_promotions p
            WHERE p.tenant_id = $1 AND p.is_active = true
              AND p.valid_from <= $2 AND p.valid_to >= $2
              AND (p.max_uses IS NULL OR p.current_uses < p.max_uses))
        ) AS active_offers,
        (SELECT COUNT(DISTINCT b.id)::int
          FROM catalog_bundles b
          INNER JOIN catalog_bundle_items bi ON bi.bundle_id = b.id
          INNER JOIN catalog_items ci ON ci.id = bi.item_id
          WHERE b.tenant_id = $1 AND b.is_active = true AND ci.is_active = false
        ) AS inactive_bundle_items,
        (SELECT COUNT(*)::int FROM tax_rules tr
          WHERE tr.tenant_id = $1 AND tr.is_active = true
            AND tr.valid_from <= $2 AND (tr.valid_to IS NULL OR tr.valid_to >= $2)
            AND EXISTS (
              SELECT 1 FROM tax_rule_applications tra
              WHERE tra.tax_rule_id = tr.id AND tra.is_active = true
            )
        ) AS tax_coverage
      `,
      [tenantId, now, windowEnd, NEAR_USE_RATIO, NEAR_USE_REMAINING],
    );
    return (rows[0] ?? {}) as Record<string, string | number>;
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
            WHERE ph.item_id = ci.id
              AND ph.is_current = true
              AND ph.customer_segment = $7
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
      [
        tenantId,
        now,
        windowEnd,
        NEAR_USE_RATIO,
        NEAR_USE_REMAINING,
        ATTENTION_LIMIT,
        CustomerSegment.RESIDENTIAL,
      ],
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
        SELECT entity_id, entity_name, entity_kind, action, occurred_at
        FROM (
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
        ) catalog_recent
        WHERE action IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $4
      )
      UNION ALL
      (
        SELECT entity_id, entity_name, entity_kind, action, occurred_at
        FROM (
        SELECT b.id::text AS entity_id,
               b.name AS entity_name,
               'bundle'::text AS entity_kind,
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
               END AS action,
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
               END AS occurred_at
        FROM catalog_bundles b
        WHERE b.tenant_id = $1
          AND (
            (b.created_at >= $2 AND b.created_at <= $3)
            OR (b.updated_at >= $2 AND b.updated_at <= $3)
          )
        ) bundle_recent
        WHERE action IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $4
      )
      UNION ALL
      (
        SELECT entity_id, entity_name, entity_kind, action, occurred_at
        FROM (
        SELECT p.id::text AS entity_id,
               p.name AS entity_name,
               'promotion'::text AS entity_kind,
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
               END AS action,
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
               END AS occurred_at
        FROM catalog_promotions p
        WHERE p.tenant_id = $1
          AND (
            (p.created_at >= $2 AND p.created_at <= $3)
            OR (p.updated_at >= $2 AND p.updated_at <= $3)
          )
        ) promo_recent
        WHERE action IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $4
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
        ORDER BY p.valid_from DESC
        LIMIT $4
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
        ORDER BY p.valid_to DESC
        LIMIT $4
      )
      UNION ALL
      (
        SELECT entity_id, entity_name, entity_kind, action, occurred_at
        FROM (
        SELECT r.id::text AS entity_id,
               COALESCE(
                 NULLIF(BTRIM(r.description), ''),
                 src.name || ' → ' || tgt.name
               ) AS entity_name,
               'compatibility_rule'::text AS entity_kind,
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
               END AS action,
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
               END AS occurred_at
        FROM catalog_compatibility_rules r
        INNER JOIN catalog_items src ON src.id = r.source_item_id
        INNER JOIN catalog_items tgt ON tgt.id = r.target_item_id
        WHERE r.tenant_id = $1
          AND (
            (r.created_at >= $2 AND r.created_at <= $3)
            OR (r.updated_at >= $2 AND r.updated_at <= $3)
          )
        ) compat_recent
        WHERE action IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $4
      )
      UNION ALL
      (
        SELECT entity_id, entity_name, entity_kind, action, occurred_at
        FROM (
        SELECT tr.id::text AS entity_id,
               (tr.tax_type || ' ' || tr.rate_percentage::text || '%') AS entity_name,
               'tax_rule'::text AS entity_kind,
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
               END AS action,
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
               END AS occurred_at
        FROM tax_rules tr
        WHERE tr.tenant_id = $1
          AND (
            (tr.created_at >= $2 AND tr.created_at <= $3)
            OR (tr.updated_at >= $2 AND tr.updated_at <= $3)
          )
        ) tax_recent
        WHERE action IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $4
      )
      `,
      [tenantId, windowStart, now, RECENT_CHANGES_LIMIT],
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
