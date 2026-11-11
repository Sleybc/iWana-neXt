import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HabeasDataModule } from './habeas-data/habeas-data.module';
import { QuotesModule } from './quotes/quotes.module';
import { ContractsModule } from './contracts/contracts.module';
import { ContractDocumentsModule } from './contracts/documents/contract-documents.module';
import { CoverageReadPort } from './ports/coverage-read.port';
import { ExecutionPolicyReadPort } from './ports/execution-policy-read.port';
import { TenantModule } from '../tenant/tenant.module';
import { TenantCoverageReadAdapter } from '../tenant/tenant-crm-read-adapter.service';
import { ExpedientesModule } from './expedientes/expedientes.module';
import { ExecutionPolicyMode } from './enums/execution-policy-mode.enum';
import { AttributionsModule } from './attributions/attributions.module';
import { ResponsibilitiesModule } from './responsibilities/responsibilities.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { NetworkCommercialStatusModule } from '../network/network-commercial-status.module';
import { ContractPendingSignatureReadModule } from './pending-signature/contract-pending-signature-read.module';
import { ContractPendingSignatureAlertsModule } from './pending-signature/contract-pending-signature-alerts.module';
import { ServiceProvisioningActivationListener } from './subscribers/listeners/service-provisioning-activation.listener';

class TenantExecutionPolicyReadAdapter extends ExecutionPolicyReadPort {
  async resolvePolicy(
    _tenantId: string,
    _schemaName: string,
  ): Promise<{
    ref: string;
    mode: ExecutionPolicyMode;
    requiresApproval: boolean;
    sourceModule: 'MOD03';
  }> {
    return {
      ref: 'mod03-default-policy',
      mode: ExecutionPolicyMode.MANUAL,
      requiresApproval: true,
      sourceModule: 'MOD03',
    };
  }
}

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TenantModule,
    // D-CONT: ContactsModule desmontado; `subscriber_contacts` no tiene migración (ADR-030: usar party_contact).
    HabeasDataModule,
    // D-OPP: OpportunitiesModule desmontado; `opportunities` no tiene migración.
    QuotesModule,
    ContractsModule,
    ContractDocumentsModule,
    ExpedientesModule,
    AttributionsModule,
    ResponsibilitiesModule,
    SubscribersModule,
    NetworkCommercialStatusModule,
    ContractPendingSignatureReadModule,
    ContractPendingSignatureAlertsModule,
  ],
  providers: [
    { provide: CoverageReadPort, useClass: TenantCoverageReadAdapter },
    { provide: ExecutionPolicyReadPort, useClass: TenantExecutionPolicyReadAdapter },
    ServiceProvisioningActivationListener,
  ],
  exports: [CoverageReadPort, ExecutionPolicyReadPort],
})
export class CrmModule {}
