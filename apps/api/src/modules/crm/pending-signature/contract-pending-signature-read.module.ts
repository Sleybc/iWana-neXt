import { Module } from '@nestjs/common';
import { NetworkContractActivationReadModule } from '../../network/network-contract-activation-read.module';
import { ContractPendingSignatureService } from './contract-pending-signature.service';

/** Lectura de «pendiente de firma» (ADR-109 D3) para el listener y las proyecciones. */
@Module({
  imports: [NetworkContractActivationReadModule],
  providers: [ContractPendingSignatureService],
  exports: [ContractPendingSignatureService],
})
export class ContractPendingSignatureReadModule {}
