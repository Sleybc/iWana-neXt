/**
 * Contrato aditivo del resumen comercial (MOD06 · H8 / Fase E).
 * Extiende los conteos legacy activos/total con KPIs operativos.
 * Ref: docs/specs/2026-07-22-mod06-comercial-resumen-navegacion-ux.md § Enmienda G2b
 * Q4 (cambios recientes): proyección liviana sin tabla de actividad ni PII.
 */

export const COMMERCIAL_ATTENTION_REASONS = [
  'expiring_soon',
  'near_use_limit',
  'missing_current_price',
  'bundle_inactive_items',
  'tax_rules_coverage_gap',
] as const;

export type CommercialAttentionReason = (typeof COMMERCIAL_ATTENTION_REASONS)[number];

export const COMMERCIAL_ATTENTION_ENTITY_TYPES = [
  'plan',
  'product',
  'service',
  'bundle',
  'promotion',
] as const;

export type CommercialAttentionEntityType = (typeof COMMERCIAL_ATTENTION_ENTITY_TYPES)[number];

export const COMMERCIAL_ATTENTION_DESTINO_TABS = [
  'plans',
  'products',
  'services',
  'bundles',
  'promotions',
  'taxation',
] as const;

export type CommercialAttentionDestinoTab = (typeof COMMERCIAL_ATTENTION_DESTINO_TABS)[number];

export interface CommercialAttentionItem {
  id: string;
  entityType: CommercialAttentionEntityType;
  name: string;
  reason: CommercialAttentionReason;
  destinoTab: CommercialAttentionDestinoTab;
  /** ISO 8601 cuando aplica (vigencia de oferta). */
  validTo?: string | null;
  /** Usos restantes cuando reason = near_use_limit. */
  usesRemaining?: number | null;
}

/** Acciones tipadas del feed Q4; el FE traduce a español. */
export const COMMERCIAL_RECENT_CHANGE_ACTIONS = [
  'created',
  'deactivated',
  'updated',
  'promotion_started',
  'promotion_expired',
] as const;

export type CommercialRecentChangeAction = (typeof COMMERCIAL_RECENT_CHANGE_ACTIONS)[number];

export const COMMERCIAL_RECENT_CHANGE_ENTITY_TYPES = [
  'plan',
  'product',
  'service',
  'bundle',
  'promotion',
  'compatibility_rule',
  'tax_rule',
] as const;

export type CommercialRecentChangeEntityType =
  (typeof COMMERCIAL_RECENT_CHANGE_ENTITY_TYPES)[number];

export const COMMERCIAL_RECENT_CHANGE_DESTINO_TABS = [
  'plans',
  'products',
  'services',
  'bundles',
  'promotions',
  'compatibility',
  'taxation',
] as const;

export type CommercialRecentChangeDestinoTab =
  (typeof COMMERCIAL_RECENT_CHANGE_DESTINO_TABS)[number];

/**
 * Evento de cambio reciente (ventana 7 días, máx. 5 filas).
 * Sin userId / email / changedBy ni otro PII.
 */
export interface CommercialRecentChange {
  /** ISO 8601 del instante del evento proyectado. */
  occurredAt: string;
  action: CommercialRecentChangeAction;
  entityType: CommercialRecentChangeEntityType;
  entityName: string;
  destinoTab: CommercialRecentChangeDestinoTab;
}

/**
 * Respuesta de GET /commercial/dashboard/summary.
 * Campos legacy se conservan para no-regresión de consumidores.
 */
export interface CommercialDashboardSummary {
  // ── Legacy (intactos) ────────────────────────────────────────────────────
  plansCount: number;
  activePlansCount: number;
  productsCount: number;
  activeProductsCount: number;
  servicesCount: number;
  activeServicesCount: number;
  bundlesCount: number;
  activeBundlesCount: number;
  promotionsCount: number;
  activePromotionsCount: number;
  compatibilityRulesCount: number;
  activeCompatibilityRulesCount: number;
  taxRulesCount: number;
  activeTaxRulesCount: number;

  // ── H8 aditivos (Fase E) ─────────────────────────────────────────────────
  /** Combos/promos con validTo en los próximos 7 días. */
  offersExpiringSoonCount: number;
  /** Promos activas cerca del cupo (≥80% usos o ≤2 restantes). */
  offersNearUseLimitCount: number;
  /** Unión de ofertas en riesgo (expiran pronto o cerca de usos). */
  offersAtRiskCount: number;

  catalogActiveCount: number;
  catalogSellableActiveCount: number;
  catalogIncompleteActiveCount: number;
  missingCurrentPriceCount: number;

  activeBundlesWithInactiveItemsCount: number;
  /**
   * Si hay planes activos y cero reglas tributarias activas con ≥1 aplicación
   * activa en vigencia → activePlansCount; si no → 0.
   */
  taxRulesCoverageGapCount: number;
  /** Suma de huecos Q3 (bundles con ítems inactivos + cobertura tributaria). */
  rulesGapCount: number;

  /** Combos activos en vigencia + promociones vigentes. */
  activeOffersCount: number;

  /** Máximo 5 filas priorizadas; sin PII. */
  attentionItems: CommercialAttentionItem[];

  /**
   * Q4 — cambios recientes (máx. 5, ventana 7 días).
   * Proyección SQL sobre tablas commercial; sin PII ni outbox.
   */
  recentChanges: CommercialRecentChange[];
}
