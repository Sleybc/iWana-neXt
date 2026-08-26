import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberTaxProfile } from './entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from './entities/subscriber-tax-assignment.entity';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscriber, SubscriberTaxProfile, SubscriberTaxAssignment]),
    AuditModule,
    PartiesModule,
    TaxationModule,
  ],
  controllers: [SubscribersController, SubscriberTaxController],
  providers: [
    VatTreatmentService,
    SubscriberStatusTransitionService,
    SubscribersService,
    SubscriberCreationService,
    SubscriberActivationListener,
    SubscriberCancellationListener,
    SubscriberTaxProfileService,
    { provide: CrmSubscriberReadPort, useExisting: SubscribersService },
  ],
  exports: [
    SubscribersService,
    CrmSubscriberReadPort,
    SubscriberCreationService,
    VatTreatmentService,
    SubscriberTaxProfileService,
  ],
})
export class SubscribersModule {}
