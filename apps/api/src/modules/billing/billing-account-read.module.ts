import { Module } from '@nestjs/common';
import { BillingModule } from './billing.module';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingAccountReadPort } from './ports/billing-account-read.port';

/**
 * Expone solo el puerto de lectura de Billing al módulo CRM, no el módulo completo.
 * Nest solo reexporta módulos, no tokens de un módulo importado: el puerto se declara aquí
 * como alias de la implementación que exporta BillingModule.
 */
@Module({
  imports: [BillingModule],
  providers: [{ provide: BillingAccountReadPort, useExisting: BillingPaymentsService }],
  exports: [BillingAccountReadPort],
})
export class BillingAccountReadModule {}
