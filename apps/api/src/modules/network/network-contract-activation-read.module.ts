import { Module } from '@nestjs/common';
import { CONTRACT_PROVISIONING_ACTIVATION_READ_PORT } from '../crm/ports/contract-provisioning-activation-read.port';
import { ContractProvisioningActivationReadAdapter } from './adapters/contract-provisioning-activation-read.adapter';

/**
 * Módulo estrecho que solo publica la fecha de activación por contrato (ADR-109 D2/D3).
 * CRM lo importa sin depender de `NetworkModule`.
 */
@Module({
  providers: [
    ContractProvisioningActivationReadAdapter,
    {
      provide: CONTRACT_PROVISIONING_ACTIVATION_READ_PORT,
      useExisting: ContractProvisioningActivationReadAdapter,
    },
  ],
  exports: [CONTRACT_PROVISIONING_ACTIVATION_READ_PORT],
})
export class NetworkContractActivationReadModule {}
