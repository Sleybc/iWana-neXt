/**
 * Constantes de nombres de eventos de dominio del Módulo Comercial.
 * Usar estas constantes en lugar de strings literales para evitar typos.
 */
export const COMMERCIAL_EVENTS = {
  PRICE_UPDATED: 'commercial.price.updated',
  ITEM_DEACTIVATED: 'commercial.item.deactivated',
  BUNDLE_CREATED: 'commercial.bundle.created',
  PROMOTION_STARTED: 'commercial.promotion.started',
  PROMOTION_EXPIRED: 'commercial.promotion.expired',
  TAX_RULE_CHANGED: 'commercial.tax-rule.changed',
} as const;

// ─── Tipos de payloads de eventos ───────────────────────────────────────────

export interface PriceUpdatedEvent {
  itemId: string;
  segment: string;
  oldPrice: string | null;
  newPrice: string;
  changedBy: string;
  tenantId: string;
}

export interface ItemDeactivatedEvent {
  itemId: string;
  name: string;
  deactivatedBy: string;
}

export interface BundleCreatedEvent {
  bundleId: string;
  name: string;
  itemIds: string[];
  tenantId: string;
}

export interface PromotionStartedEvent {
  promotionId: string;
  code: string;
  validFrom: Date;
  validTo: Date;
  tenantId: string;
}

export interface PromotionExpiredEvent {
  promotionId: string;
  code: string;
  totalUses: number;
  tenantId: string;
}

export interface TaxRuleChangedEvent {
  ruleId: string;
  taxType: string;
  oldRate: string | null;
  newRate: string;
  changedBy: string;
}
