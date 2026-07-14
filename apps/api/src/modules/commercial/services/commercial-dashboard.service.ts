import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CatalogItemType } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CatalogBundle } from '../entities/catalog-bundle.entity';
import { CatalogItem } from '../entities/catalog-item.entity';
import { CatalogPromotion } from '../entities/catalog-promotion.entity';
import { CompatibilityRule } from '../entities/compatibility-rule.entity';
import { TaxRule } from '../entities/tax-rule.entity';

export interface CommercialDashboardSummary {
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
}

@Injectable()
export class CommercialDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary(): Promise<CommercialDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const now = new Date();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [catalogItems, bundles, promotions, compatibilityRules, taxRules] = await Promise.all([
        qr.manager.find(CatalogItem, { where: { tenantId } }),
        qr.manager.find(CatalogBundle, { where: { tenantId } }),
        qr.manager.find(CatalogPromotion, { where: { tenantId } }),
        qr.manager.find(CompatibilityRule, { where: { tenantId } }),
        qr.manager.find(TaxRule, { where: { tenantId } }),
      ]);

      const plans = catalogItems.filter((item) => item.type === CatalogItemType.PLAN);
      const products = catalogItems.filter((item) => item.type === CatalogItemType.PRODUCT);
      const services = catalogItems.filter((item) => item.type === CatalogItemType.SERVICE);

      const activePlansCount = plans.filter((item) => item.isActive).length;
      const activeProductsCount = products.filter((item) => item.isActive).length;
      const activeServicesCount = services.filter((item) => item.isActive).length;
      const activeBundlesCount = bundles.filter((bundle) => bundle.isActive).length;

      const activePromotionsCount = promotions.filter(
        (promotion) =>
          promotion.isActive &&
          promotion.validFrom <= now &&
          promotion.validTo >= now &&
          (promotion.maxUses === null || promotion.currentUses < promotion.maxUses),
      ).length;

      const activeCompatibilityRulesCount = compatibilityRules.filter(
        (rule) => rule.isActive,
      ).length;
      const activeTaxRulesCount = taxRules.filter((rule) => rule.isActive).length;

      return {
        plansCount: plans.length,
        activePlansCount,
        productsCount: products.length,
        activeProductsCount,
        servicesCount: services.length,
        activeServicesCount,
        bundlesCount: bundles.length,
        activeBundlesCount,
        promotionsCount: promotions.length,
        activePromotionsCount,
        compatibilityRulesCount: compatibilityRules.length,
        activeCompatibilityRulesCount,
        taxRulesCount: taxRules.length,
        activeTaxRulesCount,
      };
    });
  }
}
