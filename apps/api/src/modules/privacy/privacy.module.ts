import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { DataAuthorizationEntity } from './entities/data-authorization.entity';
import { LegalTextEntity } from './entities/legal-text.entity';
import { PartyPrivacyMarkEntity } from './entities/party-privacy-mark.entity';
import { RetentionPolicyEntity } from './entities/retention-policy.entity';
import { PrivacyIncidentEntity } from './entities/privacy-incident.entity';
import { DataSubjectRequestEntity } from './entities/data-subject-request.entity';
import { DataSubjectRequestEventEntity } from './entities/data-subject-request-event.entity';
import { DataSubjectRequestTaskEntity } from './entities/data-subject-request-task.entity';
import { AuthorizationsController } from './authorizations/authorizations.controller';
import { AuthorizationsService } from './authorizations/authorizations.service';
import { PrivacyAuthorizationAdapter } from './authorizations/privacy-authorization.adapter';
import { LegalTextsController } from './legal-texts/legal-texts.controller';
import { LegalTextsService } from './legal-texts/legal-texts.service';
import { MarksController } from './marks/marks.controller';
import { MarksService } from './marks/marks.service';
import { PrivacyMarksAdapter } from './marks/privacy-marks.adapter';
import { RetentionController } from './retention/retention.controller';
import { RetentionService } from './retention/retention.service';
import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsService } from './incidents/incidents.service';
import { PrivacyInventoryController } from './inventory/inventory.controller';
import { PrivacyInventoryService } from './inventory/inventory.service';
import { PrivacyEvidenceController } from './evidence/privacy-evidence.controller';
import { PrivacyRequestsController } from './requests/requests.controller';
import { PrivacyRequestsService } from './requests/requests.service';
import { IPrivacyRequestsReadPort } from './requests/ports/privacy-requests-read.port';
import { PrivacyRequestsReadAdapter } from './requests/ports/privacy-requests-read.adapter';
import { IPrivacyAuthorizationReadPort } from './ports/privacy-authorization-read.port';
import { IPrivacyAuthorizationWritePort } from './ports/privacy-authorization-write.port';
import { IPrivacyLegalTextReadPort } from './ports/privacy-legal-text-read.port';
import { IPrivacyMarksReadPort } from './ports/privacy-marks-read.port';
import { IPersonalDataBlockPort } from './ports/personal-data-block.port';
import { IPersonalDataErasurePort } from './ports/personal-data-erasure.port';
import {
  PersonalDataBlockUnavailableAdapter,
  PersonalDataErasureUnavailableAdapter,
} from './ports/unavailable-privacy-ports.adapters';
import { CrmPrivacyAdaptersModule } from '../crm/privacy-adapters/crm-privacy-adapters.module';
import { PrivacyDueAlertsProcessor } from './alerts/privacy-due-alerts.processor';
import { PrivacyDueAlertsMetrics } from './alerts/privacy-due-alerts.metrics';
import { PRIVACY_DUE_ALERTS_QUEUE } from './alerts/privacy-due-alerts.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataAuthorizationEntity,
      LegalTextEntity,
      PartyPrivacyMarkEntity,
      RetentionPolicyEntity,
      PrivacyIncidentEntity,
      DataSubjectRequestEntity,
      DataSubjectRequestEventEntity,
      DataSubjectRequestTaskEntity,
    ]),
    AccessControlModule,
    AuditModule,
    MediaModule,
    forwardRef(() => CrmPrivacyAdaptersModule),
    BullModule.registerQueue({ name: PRIVACY_DUE_ALERTS_QUEUE }),
  ],
  controllers: [
    AuthorizationsController,
    LegalTextsController,
    MarksController,
    RetentionController,
    IncidentsController,
    PrivacyInventoryController,
    PrivacyRequestsController,
    PrivacyEvidenceController,
  ],
  providers: [
    AuthorizationsService,
    PrivacyAuthorizationAdapter,
    {
      provide: IPrivacyAuthorizationReadPort,
      useExisting: PrivacyAuthorizationAdapter,
    },
    {
      provide: IPrivacyAuthorizationWritePort,
      useExisting: PrivacyAuthorizationAdapter,
    },
    MarksService,
    PrivacyMarksAdapter,
    {
      provide: IPrivacyMarksReadPort,
      useExisting: PrivacyMarksAdapter,
    },
    LegalTextsService,
    {
      provide: IPrivacyLegalTextReadPort,
      useExisting: LegalTextsService,
    },
    RetentionService,
    IncidentsService,
    PrivacyInventoryService,
    PrivacyRequestsService,
    PrivacyDueAlertsProcessor,
    PrivacyDueAlertsMetrics,
    PrivacyRequestsReadAdapter,
    {
      provide: IPrivacyRequestsReadPort,
      useExisting: PrivacyRequestsReadAdapter,
    },
    PersonalDataBlockUnavailableAdapter,
    {
      provide: IPersonalDataBlockPort,
      useExisting: PersonalDataBlockUnavailableAdapter,
    },
    PersonalDataErasureUnavailableAdapter,
    {
      provide: IPersonalDataErasurePort,
      useExisting: PersonalDataErasureUnavailableAdapter,
    },
  ],
  exports: [
    IPrivacyAuthorizationReadPort,
    IPrivacyAuthorizationWritePort,
    IPrivacyLegalTextReadPort,
    IPrivacyMarksReadPort,
    IPrivacyRequestsReadPort,
    CrmPrivacyAdaptersModule,
    IPersonalDataBlockPort,
    IPersonalDataErasurePort,
  ],
})
export class PrivacyModule {}
