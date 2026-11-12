import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MigrationTitularErasureParticipant } from './migration-titular-erasure.participant';

/** Participante de supresión de la importación (ADR-110 D10, H2): sin depender de MigrationModule. */
@Module({
  imports: [ConfigModule],
  providers: [MigrationTitularErasureParticipant],
  exports: [MigrationTitularErasureParticipant],
})
export class MigrationPrivacyModule {}
