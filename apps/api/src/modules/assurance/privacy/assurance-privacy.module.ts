import { Module } from '@nestjs/common';
import { AssuranceTitularErasureParticipant } from './assurance-titular-erasure.participant';

@Module({
  providers: [AssuranceTitularErasureParticipant],
  exports: [AssuranceTitularErasureParticipant],
})
export class AssurancePrivacyModule {}
