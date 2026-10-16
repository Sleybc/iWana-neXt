import { Module } from '@nestjs/common';
import { MediaTitularErasureParticipant } from './media-titular-erasure.participant';

@Module({
  providers: [MediaTitularErasureParticipant],
  exports: [MediaTitularErasureParticipant],
})
export class MediaPrivacyModule {}
