import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrivacyModule } from '../../privacy/privacy.module';
import { SubscriberTagAssignmentPort } from '../ports/subscriber-tag-assignment.port';
import { SubscriberTagsService } from '../subscribers/tags/subscriber-tags.service';

/**
 * Módulo delgado para la importación (ADR-110 D8): provee y exporta solo
 * `SubscriberTagAssignmentPort`, sin exponer el resto de SubscribersModule.
 */
@Module({
  imports: [AuditModule, PrivacyModule],
  providers: [
    SubscriberTagsService,
    { provide: SubscriberTagAssignmentPort, useExisting: SubscriberTagsService },
  ],
  exports: [SubscriberTagAssignmentPort],
})
export class CrmMigrationTagAssignmentModule {}
