import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCatalogReadPort } from './ports/plan-catalog-read.port';
import { CommercialCatalogReadPort } from './ports/commercial-catalog-read.port';
import { CommercialCompatibilityReadPort } from './ports/commercial-compatibility-read.port';

import { CatalogItem } from './entities/catalog-item.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { ProductDetail } from './entities/product-detail.entity';
import { ServiceDetail } from './entities/service-detail.entity';
import { CatalogPriceHistory } from './entities/catalog-price-history.entity';
import { CatalogBundle } from './entities/catalog-bundle.entity';
import { CatalogBundleItem } from './entities/catalog-bundle-item.entity';
import { CatalogPromotion } from './entities/catalog-promotion.entity';
import { CompatibilityRule } from './entities/compatibility-rule.entity';

import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';
import { BundleService } from './services/bundle.service';
import { PromotionService } from './services/promotion.service';
import { CompatibilityService } from './services/compatibility.service';
import { CommercialDashboardService } from './services/commercial-dashboard.service';

import { CatalogController } from './controllers/catalog.controller';
import { CommercialDashboardController } from './controllers/commercial-dashboard.controller';
import { CommercialPickerSearchController } from './controllers/commercial-picker-search.controller';
import { BundleController } from './controllers/bundle.controller';
import { PromotionController } from './controllers/promotion.controller';
import { CompatibilityController } from './controllers/compatibility.controller';

import { CommercialCatalogReadAdapter } from './ports/commercial-catalog-read.adapter';
import { CommercialCompatibilityReadAdapter } from './ports/commercial-compatibility-read.adapter';

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
    ]),
    TaxationModule,
  ],
  controllers: [
    CatalogController,
    CommercialDashboardController,
    CommercialPickerSearchController,
    BundleController,
    PromotionController,
    CompatibilityController,
  ],
  providers: [
    CatalogService,
    PriceHistoryService,
    BundleService,
    PromotionService,
    CompatibilityService,
    CommercialDashboardService,
    CommercialCatalogReadAdapter,
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
  exports: [CommercialCatalogReadPort, PlanCatalogReadPort, CommercialCompatibilityReadPort],
})
export class CommercialModule {}
