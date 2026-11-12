import { Module } from '@nestjs/common';
import { MigrationSupportImportPort } from '../../migration/ports/migration-import.ports';
import { AssuranceMigrationImportAdapter } from './assurance-migration-import.adapter';

/** Expone a la importación solo el puerto de tickets históricos (ADR-110 D3, D7). */
@Module({
  providers: [
    AssuranceMigrationImportAdapter,
    { provide: MigrationSupportImportPort, useExisting: AssuranceMigrationImportAdapter },
  ],
  exports: [MigrationSupportImportPort],
})
export class AssuranceMigrationImportModule {}
