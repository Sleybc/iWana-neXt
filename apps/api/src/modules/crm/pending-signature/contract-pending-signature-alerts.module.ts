import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccessControlModule } from '../../access-control/access-control.module';
import { CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE } from './contract-pending-signature.constants';
import { ContractPendingSignatureAlertsProcessor } from './contract-pending-signature-alerts.processor';
import { ContractPendingSignatureReadModule } from './contract-pending-signature-read.module';

/** Trabajo diario del aviso de contratos pendientes de firma (ADR-109 D3, spec G5). */
@Module({
  imports: [
    BullModule.registerQueue({ name: CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE }),
    AccessControlModule,
    ContractPendingSignatureReadModule,
  ],
  providers: [ContractPendingSignatureAlertsProcessor],
})
export class ContractPendingSignatureAlertsModule {}
