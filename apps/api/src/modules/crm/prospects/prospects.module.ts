import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { TenantModule } from '../../tenant/tenant.module';
import { ProspectCase } from './entities/prospect-case.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { CommercialModule } from '../../commercial/commercial.module';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';
import { AccessControlModule } from '../../access-control/access-control.module';
import { ProspectQuotesService } from './quotes.service';

@Module({
  imports: [
    AuditModule,
    CommercialModule,
    TenantModule,
    TypeOrmModule.forFeature([ProspectCase, Quote]),
    AccessControlModule,
  ],
  controllers: [ProspectsController],
  providers: [ProspectsService, ProspectQuotesService],
  exports: [ProspectsService, ProspectQuotesService],
})
export class ProspectsModule {}
