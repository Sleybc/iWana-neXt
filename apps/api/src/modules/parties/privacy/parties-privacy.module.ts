import { Module } from '@nestjs/common';
import { PartyTitularErasureParticipant } from './party-titular-erasure.participant';

@Module({
  providers: [PartyTitularErasureParticipant],
  exports: [PartyTitularErasureParticipant],
})
export class PartiesPrivacyModule {}
