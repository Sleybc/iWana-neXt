import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { TenantModule } from '../../tenant/tenant.module';
import { CoverageReadPort } from '../ports/coverage-read.port';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import {
  TenantCoverageReadAdapter,
  TenantPlanCatalogReadAdapter,
} from '../../tenant/tenant-crm-read-adapter.service';
import { PotentialLead } from './entities/potential-lead.entity';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { ConsentRecord } from '../reviews/entities/consent-record.entity';
import { PotentialsController } from './potentials.controller';
import { PotentialsService } from './potentials.service';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    TenantModule,
    TypeOrmModule.forFeature([PotentialLead, ProspectCase, ConsentRecord]),
  ],
  controllers: [PotentialsController],
  providers: [
    PotentialsService,
    { provide: CoverageReadPort, useClass: TenantCoverageReadAdapter },
    { provide: PlanCatalogReadPort, useClass: TenantPlanCatalogReadAdapter },
  ],
  exports: [PotentialsService],
})
export class PotentialsModule {}
