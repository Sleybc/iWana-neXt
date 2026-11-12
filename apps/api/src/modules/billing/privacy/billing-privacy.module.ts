import { BillingTitularErasureParticipant } from './billing-titular-erasure.participant';
import { Module } from '@nestjs/common';
import { MediaModule } from '../../media/media.module';
import { BillingStandingReadAdapter } from './billing-standing-read.adapter';
import { IBillingStandingReadPort } from '../../privacy/requests/ports/billing-standing-read.port';

@Module({
  // STORAGE_PORT: la supresión retira el PDF histórico de los IMPORTADO (ADR-110 D5).
  imports: [MediaModule],
  providers: [
    BillingStandingReadAdapter,
    BillingTitularErasureParticipant,
    { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
  ],
  exports: [IBillingStandingReadPort, BillingTitularErasureParticipant],
})
export class BillingPrivacyModule {}
