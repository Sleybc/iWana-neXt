import { Module } from '@nestjs/common';
import { SubscribersModule } from '../../crm/subscribers/subscribers.module';
import { AssuranceSubscriberTicketsReadAdapter } from './assurance-subscriber-tickets-read.adapter';
import { AssuranceSubscriberTicketsReadPort } from './assurance-subscriber-tickets-read.port';

/**
 * Módulo fino del puerto de tickets por suscriptor (spec 2026-11-20 v1.1, H13).
 * WFM lo importa sin `AssuranceModule`, que ya importa `WfmModule` (evita el ciclo).
 */
@Module({
  imports: [SubscribersModule],
  providers: [
    {
      provide: AssuranceSubscriberTicketsReadPort,
      useClass: AssuranceSubscriberTicketsReadAdapter,
    },
  ],
  exports: [AssuranceSubscriberTicketsReadPort],
})
export class AssuranceSubscriberTicketsReadModule {}
