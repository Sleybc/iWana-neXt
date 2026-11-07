import { Module } from '@nestjs/common';
import { NetworkTitularErasureParticipant } from './network-titular-erasure.participant';

@Module({
  providers: [NetworkTitularErasureParticipant],
  exports: [NetworkTitularErasureParticipant],
})
export class NetworkPrivacyModule {}
