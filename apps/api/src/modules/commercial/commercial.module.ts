import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCatalogReadPort } from './ports/plan-catalog-read.port';
import { CommercialCatalogReadPort } from './ports/commercial-catalog-read.port';
import { CommercialCompatibilityReadPort } from './ports/commercial-compatibility-read.port';
import { ITaxApplicationReadPort } from './ports/tax-application-read.port';

// ─── Entidades ────────────────────────────────────────────────────────────────
import { CatalogItem } from './entities/catalog-item.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { ProductDetail } from './entities/product-detail.entity';
import { ServiceDetail } from './entities/service-detail.entity';
import { CatalogPriceHistory } from './entities/catalog-price-history.entity';
import { CatalogBundle } from './entities/catalog-bundle.entity';
import { CatalogBundleItem } from './entities/catalog-bundle-item.entity';
import { CatalogPromotion } from './entities/catalog-promotion.entity';
import { CompatibilityRule } from './entities/compatibility-rule.entity';
import { TaxRule } from './entities/tax-rule.entity';
import { TaxRuleApplication } from './entities/tax-rule-application.entity';

// ─── Servicios ────────────────────────────────────────────────────────────────
import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';
import { BundleService } from './services/bundle.service';
import { PromotionService } from './services/promotion.service';
import { CompatibilityService } from './services/compatibility.service';
import { TaxApplicationService } from './services/tax-application.service';
import { CommercialDashboardService } from './services/commercial-dashboard.service';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { CatalogController } from './controllers/catalog.controller';
import { CommercialDashboardController } from './controllers/commercial-dashboard.controller';
import { CommercialPickerSearchController } from './controllers/commercial-picker-search.controller';
import { BundleController } from './controllers/bundle.controller';
import { PromotionController } from './controllers/promotion.controller';
import { CompatibilityController } from './controllers/compatibility.controller';
import { TaxController } from './controllers/tax.controller';

// ─── Puertos y adaptadores ────────────────────────────────────────────────────
import { TaxApplicationReadAdapter } from './ports/tax-application-read.adapter';
import { CommercialCatalogReadAdapter } from './ports/commercial-catalog-read.adapter';
import { CommercialCompatibilityReadAdapter } from './ports/commercial-compatibility-read.adapter';

// ─── Módulos externos ─────────────────────────────────────────────────────────
import { TaxationModule } from '../taxation/taxation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogItem,
      PlanDetail,
      ProductDetail,
      ServiceDetail,
      CatalogPriceHistory,
      CatalogBundle,
      CatalogBundleItem,
      CatalogPromotion,
      CompatibilityRule,
      TaxRule,
      TaxRuleApplication,
    ]),
    // TaxationModule exporta TaxCatalogReadPort para que TaxApplicationService lo inyecte
    TaxationModule,
  ],
  controllers: [
    CatalogController,
    CommercialDashboardController,
    CommercialPickerSearchController,
    BundleController,
    PromotionController,
    CompatibilityController,
    TaxController,
  ],
  providers: [
    CatalogService,
    PriceHistoryService,
    BundleService,
    PromotionService,
    CompatibilityService,
    TaxApplicationService,
    CommercialDashboardService,
    CommercialCatalogReadAdapter,
    TaxApplicationReadAdapter,
    {
      provide: ITaxApplicationReadPort,
      useExisting: TaxApplicationReadAdapter,
    },
    {
      provide: CommercialCatalogReadPort,
      useExisting: CommercialCatalogReadAdapter,
    },
    {
      provide: PlanCatalogReadPort,
      useExisting: CommercialCatalogReadPort,
    },
    CommercialCompatibilityReadAdapter,
    {
      provide: CommercialCompatibilityReadPort,
      useExisting: CommercialCompatibilityReadAdapter,
    },
  ],
  exports: [
    CommercialCatalogReadPort,
    PlanCatalogReadPort,
    CommercialCompatibilityReadPort,
    ITaxApplicationReadPort,
  ],
})
export class CommercialModule {}
