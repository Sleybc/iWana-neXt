import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberTaxProfile } from './entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from './entities/subscriber-tax-assignment.entity';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { SubscriberCreationService } from './subscriber-creation.service';
import { SubscriberTaxProfileService } from './subscriber-tax-profile.service';
import { SubscriberTaxController } from './subscriber-tax.controller';
import { AuditModule } from '../../audit/audit.module';
import { SubscriberActivationListener } from './listeners/subscriber-activation.listener';
import { SubscriberCancellationListener } from './listeners/subscriber-cancellation.listener';
import { PartiesModule } from '../../parties/parties.module';
import { TaxationModule } from '../../taxation/taxation.module';
import { CrmSubscriberReadPort } from '../ports/crm-subscriber-read.port';
import { AccessControlModule } from '../../access-control/access-control.module';
import { PrivacyModule } from '../../privacy/privacy.module';
import { SubscribersBlockedTitularGuard } from './guards/subscribers-blocked-titular.guard';
import { CrmLifecycleChange } from './entities/crm-lifecycle-change.entity';
import { SubscriberLifecycleService } from './subscriber-lifecycle.service';
import { InventoryModule } from '../../inventory/inventory.module';
import { ExecutionOrderSchedulingModule } from '../../tasks/execution-order-scheduling.module';
import { CommercialModule } from '../../commercial/commercial.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscriber,
      SubscriberTaxProfile,
      SubscriberTaxAssignment,
      CrmLifecycleChange,
    ]),
    AuditModule,
    PartiesModule,
    TaxationModule,
    AccessControlModule,
    PrivacyModule,
    InventoryModule,
    ExecutionOrderSchedulingModule,
    CommercialModule,
  ],
  controllers: [SubscribersController, SubscriberTaxController],
  providers: [
    VatTreatmentService,
    SubscriberFiscalCompletenessService,
    SubscriberStatusTransitionService,
    SubscriberLifecycleService,
    SubscribersService,
    SubscriberCreationService,
    SubscriberActivationListener,
    SubscriberCancellationListener,
    SubscriberTaxProfileService,
    SubscribersBlockedTitularGuard,
    { provide: CrmSubscriberReadPort, useExisting: SubscribersService },
  ],
  exports: [
    SubscribersService,
    CrmSubscriberReadPort,
    SubscriberCreationService,
    VatTreatmentService,
    SubscriberFiscalCompletenessService,
    SubscriberTaxProfileService,
    SubscriberLifecycleService,
  ],
})
export class SubscribersModule {}
