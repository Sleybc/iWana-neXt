import { BillingTitularErasureParticipant } from './billing-titular-erasure.participant';
import { Module } from '@nestjs/common';
import { BillingStandingReadAdapter } from './billing-standing-read.adapter';
import { IBillingStandingReadPort } from '../../privacy/requests/ports/billing-standing-read.port';

@Module({
  providers: [
    BillingStandingReadAdapter,
    BillingTitularErasureParticipant,
    { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
  ],
  exports: [IBillingStandingReadPort, BillingTitularErasureParticipant],
})
export class BillingPrivacyModule {}
