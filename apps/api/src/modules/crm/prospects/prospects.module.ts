import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { TenantModule } from '../../tenant/tenant.module';
import { ProspectCase } from './entities/prospect-case.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { TenantPlanCatalogReadAdapter } from '../../tenant/tenant-crm-read-adapter.service';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';
import { ProspectQuotesService } from './quotes.service';

@Module({
  imports: [AuditModule, TenantModule, TypeOrmModule.forFeature([ProspectCase, Quote])],
  controllers: [ProspectsController],
  providers: [
    ProspectsService,
    ProspectQuotesService,
    { provide: PlanCatalogReadPort, useClass: TenantPlanCatalogReadAdapter },
  ],
  exports: [ProspectsService, ProspectQuotesService],
})
export class ProspectsModule {}
