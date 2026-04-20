import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCatalogReadPort } from '../crm/ports/plan-catalog-read.port';
import { CommercialCatalogReadPort } from './ports/commercial-catalog-read.port';

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
import { TaxClassification } from './entities/tax-classification.entity';
import { TaxRule } from './entities/tax-rule.entity';

// ─── Servicios ────────────────────────────────────────────────────────────────
import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';
import { BundleService } from './services/bundle.service';
import { PromotionService } from './services/promotion.service';
import { CompatibilityService } from './services/compatibility.service';
import { TaxClassificationService } from './services/tax-classification.service';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { CatalogController } from './controllers/catalog.controller';
import { BundleController } from './controllers/bundle.controller';
import { PromotionController } from './controllers/promotion.controller';
import { CompatibilityController } from './controllers/compatibility.controller';
import { TaxController } from './controllers/tax.controller';

// ─── Puerto y adaptador ───────────────────────────────────────────────────────
import { CommercialCatalogReadAdapter } from './ports/commercial-catalog-read.adapter';

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
      TaxClassification,
      TaxRule,
    ]),
  ],
  controllers: [
    CatalogController,
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
    TaxClassificationService,
    CommercialCatalogReadAdapter,
    {
      provide: CommercialCatalogReadPort,
      useExisting: CommercialCatalogReadAdapter,
    },
    {
      provide: PlanCatalogReadPort,
      useExisting: CommercialCatalogReadPort,
    },
  ],
  exports: [CommercialCatalogReadPort, PlanCatalogReadPort, CatalogService, PriceHistoryService],
})
export class CommercialModule {}
