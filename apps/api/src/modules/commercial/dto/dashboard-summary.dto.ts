import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CommercialAttentionDestinoTab,
  CommercialAttentionEntityType,
  CommercialAttentionItem,
  CommercialAttentionReason,
  CommercialDashboardSummary,
  CommercialRecentChange,
  CommercialRecentChangeAction,
  CommercialRecentChangeDestinoTab,
  CommercialRecentChangeEntityType,
} from '@iwana/shared';

export class CommercialAttentionItemDto implements CommercialAttentionItem {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['plan', 'product', 'service', 'bundle', 'promotion'] })
  entityType: CommercialAttentionEntityType;

  @ApiProperty()
  name: string;

  @ApiProperty({
    enum: [
      'expiring_soon',
      'near_use_limit',
      'missing_current_price',
      'bundle_inactive_items',
      'tax_rules_coverage_gap',
    ],
  })
  reason: CommercialAttentionReason;

  @ApiProperty({
    enum: ['plans', 'products', 'services', 'bundles', 'promotions', 'taxation'],
  })
  destinoTab: CommercialAttentionDestinoTab;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 fin de vigencia' })
  validTo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  usesRemaining?: number | null;
}

/**
 * Cambio reciente Q4. Códigos tipados en `action`; el FE traduce a español.
 * Sin userId / email / changedBy.
 */
export class CommercialRecentChangeDto implements CommercialRecentChange {
  @ApiProperty({ description: 'ISO 8601 del instante proyectado' })
  occurredAt: string;

  @ApiProperty({
    enum: ['created', 'deactivated', 'updated', 'promotion_started', 'promotion_expired'],
    description:
      'Código tipado. FE: created→creado, deactivated→desactivado, updated→actualizado, promotion_started→promoción iniciada, promotion_expired→promoción vencida',
  })
  action: CommercialRecentChangeAction;

  @ApiProperty({
    enum: ['plan', 'product', 'service', 'bundle', 'promotion', 'compatibility_rule', 'tax_rule'],
  })
  entityType: CommercialRecentChangeEntityType;

  @ApiProperty({ description: 'Nombre visible de la entidad; sin PII' })
  entityName: string;

  @ApiProperty({
    enum: ['plans', 'products', 'services', 'bundles', 'promotions', 'compatibility', 'taxation'],
  })
  destinoTab: CommercialRecentChangeDestinoTab;
}

/**
 * DTO OpenAPI del resumen comercial (aditivo H8 + Q4).
 * Los campos legacy se documentan para no-regresión contractual.
 */
export class CommercialDashboardSummaryDto implements CommercialDashboardSummary {
  @ApiProperty() plansCount: number;
  @ApiProperty() activePlansCount: number;
  @ApiProperty() productsCount: number;
  @ApiProperty() activeProductsCount: number;
  @ApiProperty() servicesCount: number;
  @ApiProperty() activeServicesCount: number;
  @ApiProperty() bundlesCount: number;
  @ApiProperty() activeBundlesCount: number;
  @ApiProperty() promotionsCount: number;
  @ApiProperty() activePromotionsCount: number;
  @ApiProperty() compatibilityRulesCount: number;
  @ApiProperty() activeCompatibilityRulesCount: number;
  @ApiProperty() taxRulesCount: number;
  @ApiProperty() activeTaxRulesCount: number;

  @ApiProperty({ description: 'Ofertas que vencen en los próximos 7 días' })
  offersExpiringSoonCount: number;

  @ApiProperty({ description: 'Promociones cerca del límite de usos (≥80% o ≤2 restantes)' })
  offersNearUseLimitCount: number;

  @ApiProperty({ description: 'Unión de ofertas en riesgo temporal' })
  offersAtRiskCount: number;

  @ApiProperty() catalogActiveCount: number;
  @ApiProperty({ description: 'Activos con ≥1 precio is_current' })
  catalogSellableActiveCount: number;
  @ApiProperty() catalogIncompleteActiveCount: number;
  @ApiProperty() missingCurrentPriceCount: number;

  @ApiProperty() activeBundlesWithInactiveItemsCount: number;
  @ApiProperty({
    description: 'Hueco tenant-level: planes activos sin reglas tributarias de aplicación vigentes',
  })
  taxRulesCoverageGapCount: number;
  @ApiProperty() rulesGapCount: number;

  @ApiProperty({ description: 'Combos en vigencia + promociones vigentes' })
  activeOffersCount: number;

  @ApiProperty({ type: [CommercialAttentionItemDto], maxItems: 5 })
  attentionItems: CommercialAttentionItemDto[];

  @ApiProperty({
    type: [CommercialRecentChangeDto],
    maxItems: 5,
    description:
      'Q4: hasta 5 cambios en los últimos 7 días (proyección SQL, sin PII). Orden occurredAt DESC.',
  })
  recentChanges: CommercialRecentChangeDto[];
}
