import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommercialModule } from '../../commercial/commercial.module';
import { MigrationCrmImportPort } from '../../migration/ports/migration-import.ports';
import { PartiesModule } from '../../parties/parties.module';
import { CrmMigrationTagAssignmentModule } from './crm-migration-tag-assignment.module';
import { CrmMigrationImportAdapter } from './crm-migration-import.adapter';

/**
 * Escritura CRM consumida por la importación (ADR-110 D3, D7, D8, D13). Expone solo puertos:
 * el de promoción/reversión y el de etiquetas (módulo delgado, sin SubscribersModule).
 */
@Module({
  imports: [ConfigModule, PartiesModule, CommercialModule, CrmMigrationTagAssignmentModule],
  providers: [
    CrmMigrationImportAdapter,
    { provide: MigrationCrmImportPort, useExisting: CrmMigrationImportAdapter },
  ],
  exports: [MigrationCrmImportPort, CrmMigrationTagAssignmentModule],
})
export class CrmMigrationImportModule {}
