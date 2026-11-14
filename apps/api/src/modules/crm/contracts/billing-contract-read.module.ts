import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { CommercialModule } from '../../commercial/commercial.module';
import { TenantModule } from '../../tenant/tenant.module';
import { BillingContractReadPort } from '../../billing/ports/billing-contract-read.port';
import { BillingContractReadAdapter } from './billing-contract-read.adapter';
import { ContractActivationEventReadPort } from '../../billing/ports/contract-activation-event-read.port';
import { ContractActivationEventReadAdapter } from './contract-activation-event-read.adapter';
import { BillingContractFirstChargePort } from '../../billing/ports/billing-contract-first-charge.port';
import { BillingContractFirstChargeAdapter } from './billing-contract-first-charge.adapter';
import { BillingTitularContactReadPort } from '../../billing/ports/billing-titular-contact-read.port';
import { BillingTitularContactReadAdapter } from './billing-titular-contact-read.adapter';

/**
 * Módulo de lectura CRM consumido por Billing; no importa el módulo CRM completo.
 * Expone solo el puerto: Billing nunca importa la clase del adaptador (HLD §8.1 c).
 */
@Module({
  imports: [TenantModule, CommercialModule, AuditModule],
  providers: [
    BillingContractReadAdapter,
    { provide: BillingContractReadPort, useExisting: BillingContractReadAdapter },
    ContractActivationEventReadAdapter,
    { provide: ContractActivationEventReadPort, useExisting: ContractActivationEventReadAdapter },
    BillingContractFirstChargeAdapter,
    { provide: BillingContractFirstChargePort, useExisting: BillingContractFirstChargeAdapter },
    // Correo registrado del titular para los envíos de Facturación (spec 2026-11-13 bloque B).
    BillingTitularContactReadAdapter,
    { provide: BillingTitularContactReadPort, useExisting: BillingTitularContactReadAdapter },
  ],
  exports: [
    BillingContractReadPort,
    ContractActivationEventReadPort,
    BillingContractFirstChargePort,
    BillingTitularContactReadPort,
  ],
})
export class BillingContractReadModule {}
