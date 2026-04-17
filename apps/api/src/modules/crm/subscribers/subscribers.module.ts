import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from './entities/subscriber.entity';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { SubscriberCreationService } from './subscriber-creation.service';
import { AuditModule } from '../../audit/audit.module';
import { SubscriberActivationListener } from './listeners/subscriber-activation.listener';
import { SubscriberCancellationListener } from './listeners/subscriber-cancellation.listener';

@Module({
  imports: [TypeOrmModule.forFeature([Subscriber]), AuditModule],
  controllers: [SubscribersController],
  providers: [
    VatTreatmentService,
    SubscriberStatusTransitionService,
    SubscribersService,
    SubscriberCreationService,
    SubscriberActivationListener,
    SubscriberCancellationListener,
  ],
  exports: [SubscribersService, SubscriberCreationService, VatTreatmentService],
})
export class SubscribersModule {}
