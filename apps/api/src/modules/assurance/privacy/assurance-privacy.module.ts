import { Module } from '@nestjs/common';
import { IPqrRetentionReadPort } from '../../privacy/requests/ports/pqr-retention-read.port';
import { PqrRetentionReadAdapter } from './pqr-retention-read.adapter';
import { AssuranceTitularErasureParticipant } from './assurance-titular-erasure.participant';

@Module({
  providers: [
    AssuranceTitularErasureParticipant,
    PqrRetentionReadAdapter,
    { provide: IPqrRetentionReadPort, useExisting: PqrRetentionReadAdapter },
  ],
  exports: [AssuranceTitularErasureParticipant, IPqrRetentionReadPort],
})
export class AssurancePrivacyModule {}
