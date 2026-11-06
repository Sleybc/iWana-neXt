import { Module } from '@nestjs/common';
import { TenantModule } from '../../tenant/tenant.module';
import { BillingContractReadPort } from '../../billing/ports/billing-contract-read.port';
import { BillingContractReadAdapter } from './billing-contract-read.adapter';

/**
 * Módulo de lectura CRM consumido por Billing; no importa el módulo CRM completo.
 * Expone solo el puerto: Billing nunca importa la clase del adaptador (HLD §8.1 c).
 */
@Module({
  imports: [TenantModule],
  providers: [
    BillingContractReadAdapter,
    { provide: BillingContractReadPort, useExisting: BillingContractReadAdapter },
  ],
  exports: [BillingContractReadPort],
})
export class BillingContractReadModule {}
