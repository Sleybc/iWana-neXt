import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { TenantModule } from '../../tenant/tenant.module';
import { TenantPlanCatalogReadAdapter } from '../../tenant/tenant-crm-read-adapter.service';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([Quote])],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    { provide: PlanCatalogReadPort, useClass: TenantPlanCatalogReadAdapter },
  ],
  exports: [QuotesService, PlanCatalogReadPort],
})
export class QuotesModule {}
