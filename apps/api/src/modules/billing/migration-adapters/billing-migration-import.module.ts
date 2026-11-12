import { Module } from '@nestjs/common';
import { MigrationBillingImportPort } from '../../migration/ports/migration-import.ports';
import { BillingMigrationImportAdapter } from './billing-migration-import.adapter';

/** Expone a la importación solo el puerto de cobros históricos (ADR-110 D5–D7). */
@Module({
  providers: [
    BillingMigrationImportAdapter,
    { provide: MigrationBillingImportPort, useExisting: BillingMigrationImportAdapter },
  ],
  exports: [MigrationBillingImportPort],
})
export class BillingMigrationImportModule {}
