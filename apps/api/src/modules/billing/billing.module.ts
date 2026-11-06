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
import { BILLING_GENERATION_QUEUE } from './generation/billing-generation.constants';
import { BillingDocumentsController } from './documents/billing-documents.controller';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingIssuerReadPort } from './ports/billing-issuer-read.port';
import { TenantBillingIssuerReadAdapter } from './ports/tenant-billing-issuer-read.adapter';

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
    BullModule.registerQueue({ name: BILLING_GENERATION_QUEUE }),
  ],
  controllers: [BillingPolicyController, BillingPaymentsController, BillingDocumentsController],
  providers: [
    BillingPolicyService,
    BillingPaymentsService,
    BillingDocumentsService,
    BillingGenerationService,
    BillingGenerationProcessor,
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
