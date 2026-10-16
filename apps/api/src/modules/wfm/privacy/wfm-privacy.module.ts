import { Module } from '@nestjs/common';
import { WfmTitularErasureParticipant } from './wfm-titular-erasure.participant';

@Module({
  providers: [WfmTitularErasureParticipant],
  exports: [WfmTitularErasureParticipant],
})
export class WfmPrivacyModule {}
