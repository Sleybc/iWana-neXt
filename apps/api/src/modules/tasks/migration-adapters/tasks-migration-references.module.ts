import { Module } from '@nestjs/common';
import { MigrationWorkOrderReferencesPort } from '../../migration/ports/migration-import.ports';
import { TasksMigrationReferencesAdapter } from './tasks-migration-references.adapter';

/** Expone a la importación solo el conteo de OT por titular (ADR-110 D7). */
@Module({
  providers: [
    TasksMigrationReferencesAdapter,
    { provide: MigrationWorkOrderReferencesPort, useExisting: TasksMigrationReferencesAdapter },
  ],
  exports: [MigrationWorkOrderReferencesPort],
})
export class TasksMigrationReferencesModule {}
