import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BILLING_INSTALLATION_EVENTS_QUEUE } from '@iwana/shared';
import { AuditModule } from '../../audit/audit.module';
import { TenantModule } from '../../tenant/tenant.module';
import { InstallationContractReadModule } from '../../crm/contracts/installation-contract-read.module';
import { InstallationConsumptionValuationReadModule } from '../../inventory/ports/installation-consumption-valuation-read.module';
import { InstalledEquipmentReadModule } from '../../inventory/ports/installed-equipment-read.module';
import { ExecutionOrderConsumptionReadModule } from '../../tasks/ports/execution-order-consumption-read.module';
import { BillingInstallationBreakdownService } from './billing-installation-breakdown.service';
import { BillingInstallationConsumptionProcessor } from './billing-installation-consumption.processor';

/**
 * Consumo de la OT de instalación asociado al contrato (spec MOD14 2026-11-13, bloque A).
 * Solo importa módulos finos de puertos de MOD11, MOD12 y CRM.
 */
@Module({
  imports: [
    AuditModule,
    TenantModule,
    ExecutionOrderConsumptionReadModule,
    InstallationConsumptionValuationReadModule,
    InstalledEquipmentReadModule,
    InstallationContractReadModule,
    BullModule.registerQueue({ name: BILLING_INSTALLATION_EVENTS_QUEUE }),
  ],
  providers: [BillingInstallationBreakdownService, BillingInstallationConsumptionProcessor],
  exports: [BillingInstallationBreakdownService],
})
export class BillingInstallationBreakdownModule {}
