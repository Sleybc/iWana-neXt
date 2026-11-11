import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CRM_CONTRACT_PDF_QUEUE } from '@iwana/shared';
import { AccessControlModule } from '../../../access-control/access-control.module';
import { AuditModule } from '../../../audit/audit.module';
import { MediaModule } from '../../../media/media.module';
import { NetworkCommercialStatusModule } from '../../../network/network-commercial-status.module';
import { NetworkContractActivationReadModule } from '../../../network/network-contract-activation-read.module';
import { CommercialModule } from '../../../commercial/commercial.module';
import { InstalledEquipmentReadModule } from '../../../inventory/ports/installed-equipment-read.module';
import { OrganizationModule } from '../../../organization/organization.module';
import { PrivacyModule } from '../../../privacy/privacy.module';
import { ExecutionOrderSchedulingModule } from '../../../tasks/execution-order-scheduling.module';
import { TenantModule } from '../../../tenant/tenant.module';
import { SubscribersModule } from '../../subscribers/subscribers.module';
import { ContractsModule } from '../contracts.module';
import { ContractDocumentGenerationService } from './contract-document-generation.service';
import {
  ContractDocumentsController,
  ExecutionOrderContractController,
} from './contract-documents.controller';
import { ContractSignatureController } from './contract-signature.controller';
import { ContractSignatureService } from './contract-signature.service';
import { CONTRACT_SIGNED_COPY_QUEUE } from './contract-signed-copy.constants';
import { ContractSignedCopyProcessor } from './contract-signed-copy.processor';
import { ContractSignedCopyProducer } from './contract-signed-copy.producer';
import { SignedContractDocumentsController } from './signed-contract-documents.controller';
import { SignedContractDocumentsService } from './signed-contract-documents.service';

/**
 * Generación del PDF del contrato (cierre de venta, bloque B; ADR-109 D5). Encola en
 * `crm-contract-pdf`; el procesador vive en el worker (la imagen de la API no lleva Chromium).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_CONTRACT_PDF_QUEUE }),
    BullModule.registerQueue({ name: CONTRACT_SIGNED_COPY_QUEUE }),
    AccessControlModule,
    AuditModule,
    CommercialModule,
    ContractsModule,
    ExecutionOrderSchedulingModule,
    InstalledEquipmentReadModule,
    // STORAGE_PORT (objetos cifrados del contrato).
    MediaModule,
    NetworkCommercialStatusModule,
    NetworkContractActivationReadModule,
    OrganizationModule,
    PrivacyModule,
    SubscribersModule,
    TenantModule,
  ],
  controllers: [
    ContractDocumentsController,
    ExecutionOrderContractController,
    ContractSignatureController,
    SignedContractDocumentsController,
  ],
  providers: [
    ContractDocumentGenerationService,
    ContractSignatureService,
    ContractSignedCopyProducer,
    ContractSignedCopyProcessor,
    SignedContractDocumentsService,
  ],
  exports: [ContractDocumentGenerationService, ContractSignatureService],
})
export class ContractDocumentsModule {}
