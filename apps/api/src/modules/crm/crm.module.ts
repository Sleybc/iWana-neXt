import { Module } from '@nestjs/common';
import { ContactsModule } from './contacts/contacts.module';
import { HabeasDataModule } from './habeas-data/habeas-data.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { QuotesModule } from './quotes/quotes.module';
import { ContractsModule } from './contracts/contracts.module';
import { CoverageReadPort } from './ports/coverage-read.port';
import { ExecutionPolicyReadPort } from './ports/execution-policy-read.port';
import { TenantModule } from '../tenant/tenant.module';
import { TenantCoverageReadAdapter } from '../tenant/tenant-crm-read-adapter.service';
import { ExpedientesModule } from './expedientes/expedientes.module';
import { ExecutionPolicyMode } from './enums/execution-policy-mode.enum';
import { AttributionsModule } from './attributions/attributions.module';
import { ResponsibilitiesModule } from './responsibilities/responsibilities.module';

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
    TenantModule,
    ContactsModule,
    HabeasDataModule,
    OpportunitiesModule,
    QuotesModule,
    ContractsModule,
    ExpedientesModule,
    AttributionsModule,
    ResponsibilitiesModule,
  ],
  providers: [
    { provide: CoverageReadPort, useClass: TenantCoverageReadAdapter },
    { provide: ExecutionPolicyReadPort, useClass: TenantExecutionPolicyReadAdapter },
  ],
  exports: [CoverageReadPort, ExecutionPolicyReadPort],
})
export class CrmModule {}
