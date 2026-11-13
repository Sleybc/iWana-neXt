import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BillingContractPolicy,
  BillingDocument,
  BillingDocumentLine,
  BillingPeriod,
  BillingPolicy,
} from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BillingContractReadModule } from '../crm/contracts/billing-contract-read.module';
import { BillingPolicyController } from './policy/billing-policy.controller';
import { BillingPolicyService } from './policy/billing-policy.service';
import { BillingPaymentsController } from './payments/billing-payments.controller';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingAccountReadPort } from './ports/billing-account-read.port';
import { TenantModule } from '../tenant/tenant.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingGenerationProcessor } from './generation/billing-generation.processor';
import { BillingFirstChargeService } from './generation/billing-first-charge.service';
import { CRM_CONTRACT_EVENTS_QUEUE } from '@iwana/shared';
import { BILLING_GENERATION_QUEUE } from './generation/billing-generation.constants';
import { ContractActivatedProcessor } from './generation/contract-activated.processor';
import { BillingDocumentsController } from './documents/billing-documents.controller';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingImportedPdfService } from './documents/billing-imported-pdf.service';
import { MediaModule } from '../media/media.module';
import { BillingIssuerReadPort } from './ports/billing-issuer-read.port';
import { TenantBillingIssuerReadAdapter } from './ports/tenant-billing-issuer-read.adapter';
import { BillingCourtesiesController } from './courtesies/billing-courtesies.controller';
import { BillingCourtesiesService } from './courtesies/billing-courtesies.service';
import { BillingInstallationBreakdownModule } from './installation/billing-installation-breakdown.module';
import { TaxationModule } from '../taxation/taxation.module';
import { BillingWithholdingsController } from './payments/billing-withholdings.controller';
import { BillingWithholdingOptionsService } from './payments/billing-withholding-options.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingPolicy,
      BillingContractPolicy,
      BillingPeriod,
      BillingDocument,
      BillingDocumentLine,
    ]),
    AccessControlModule,
    AuditModule,
    AuthModule,
    BillingContractReadModule,
    TenantModule,
    PrivacyModule,
    // STORAGE_PORT: PDF histórico de los documentos IMPORTADO (ADR-110 D5).
    MediaModule,
    // Tarifas sugeridas de retención (spec MOD14 2026-11-13 R7), por TaxCatalogReadPort.
    TaxationModule,
    BullModule.registerQueue({ name: BILLING_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: CRM_CONTRACT_EVENTS_QUEUE }),
    // Consumo de la OT de instalación al contrato (spec 2026-11-13, bloque A).
    BillingInstallationBreakdownModule,
  ],
  controllers: [
    BillingPolicyController,
    BillingPaymentsController,
    BillingDocumentsController,
    BillingCourtesiesController,
    BillingWithholdingsController,
  ],
  providers: [
    BillingPolicyService,
    BillingPaymentsService,
    BillingDocumentsService,
    BillingCourtesiesService,
    BillingWithholdingOptionsService,
    BillingImportedPdfService,
    BillingGenerationService,
    BillingFirstChargeService,
    BillingGenerationProcessor,
    ContractActivatedProcessor,
    TenantBillingIssuerReadAdapter,
    { provide: BillingAccountReadPort, useExisting: BillingPaymentsService },
    { provide: BillingIssuerReadPort, useExisting: TenantBillingIssuerReadAdapter },
  ],
  exports: [
    BillingPolicyService,
    BillingAccountReadPort,
    BillingPaymentsService,
    BillingDocumentsService,
  ],
})
export class BillingModule {}
