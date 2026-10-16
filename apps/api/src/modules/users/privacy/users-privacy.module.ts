import { Module } from '@nestjs/common';
import { UserAccountErasureParticipant } from './user-account-erasure.participant';

@Module({
  providers: [UserAccountErasureParticipant],
  exports: [UserAccountErasureParticipant],
})
export class UsersPrivacyModule {}
