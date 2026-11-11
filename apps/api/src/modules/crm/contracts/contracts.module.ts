import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CRM_CONTRACT_EVENTS_QUEUE } from '@iwana/shared';
import { ContractActivationEventsPublisher } from './contract-activation-events';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractPermanenceRecord } from './entities/contract-permanence.entity';
import { ContractPermanenceController } from './contract-permanence.controller';
import { ContractPermanenceService } from './contract-permanence.service';
import { ContractSignGuard } from './guards/contract-sign.guard';
import { AccessControlModule } from '../../access-control/access-control.module';
import { AuditModule } from '../../audit/audit.module';
import { CommercialModule } from '../../commercial/commercial.module';
import { TaxationModule } from '../../taxation/taxation.module';
import { MediaModule } from '../../media/media.module';
import { PrivacyModule } from '../../privacy/privacy.module';
import { ContractsBlockedTitularGuard } from './guards/contracts-blocked-titular.guard';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { TenantModule } from '../../tenant/tenant.module';
import { BillingCyclesController } from './billing-cycles.controller';
import { ContractsTenantSettingsReadAdapter } from './ports/contracts-tenant-settings-read.adapter';
import { ContractsTenantSettingsReadPort } from './ports/contracts-tenant-settings-read.port';
import { ContractAutoCreationService } from './contract-auto-creation.service';
import { ContractAutoCreationPort } from '../ports/contract-auto-creation.port';
import { BillingAccountReadModule } from '../../billing/billing-account-read.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, ContractPermanenceRecord]),
    BullModule.registerQueue({ name: CRM_CONTRACT_EVENTS_QUEUE }),
    AccessControlModule,
    AuditModule,
    CommercialModule,
    TaxationModule,
    MediaModule,
    PrivacyModule,
    SubscribersModule,
    TenantModule,
    BillingAccountReadModule,
  ],
  controllers: [ContractsController, BillingCyclesController, ContractPermanenceController],
  providers: [
    ContractsService,
    ContractPermanenceService,
    ContractActivationEventsPublisher,
    ContractSignGuard,
    ContractsBlockedTitularGuard,
    ContractsTenantSettingsReadAdapter,
    { provide: ContractsTenantSettingsReadPort, useExisting: ContractsTenantSettingsReadAdapter },
    ContractAutoCreationService,
    { provide: ContractAutoCreationPort, useExisting: ContractAutoCreationService },
  ],
  exports: [
    ContractsService,
    ContractPermanenceService,
    ContractActivationEventsPublisher,
    ContractsTenantSettingsReadPort,
  ],
})
export class ContractsModule {}
