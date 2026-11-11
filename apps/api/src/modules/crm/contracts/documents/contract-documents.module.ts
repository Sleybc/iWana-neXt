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
import { SubscribersModule } from '../../subscribers/subscribers.module';
import { ContractsModule } from '../contracts.module';
import { ContractDocumentGenerationService } from './contract-document-generation.service';
import { ContractDocumentsController } from './contract-documents.controller';
import { ContractSignatureController } from './contract-signature.controller';
import { ContractSignatureService } from './contract-signature.service';

/**
 * Generación del PDF del contrato (cierre de venta, bloque B; ADR-109 D5). Encola en
 * `crm-contract-pdf`; el procesador vive en el worker (la imagen de la API no lleva Chromium).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_CONTRACT_PDF_QUEUE }),
    AccessControlModule,
    AuditModule,
    CommercialModule,
    ContractsModule,
    ExecutionOrderSchedulingModule,
    InstalledEquipmentReadModule,
    MediaModule,
    NetworkCommercialStatusModule,
    NetworkContractActivationReadModule,
    OrganizationModule,
    PrivacyModule,
    SubscribersModule,
  ],
  controllers: [ContractDocumentsController, ContractSignatureController],
  providers: [ContractDocumentGenerationService, ContractSignatureService],
  exports: [ContractDocumentGenerationService, ContractSignatureService],
})
export class ContractDocumentsModule {}
