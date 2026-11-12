import { Module } from '@nestjs/common';
import { MigrationTitularLookupPort } from '../../migration/ports/migration-titular-lookup.port';
import { CrmMigrationTitularLookupAdapter } from './crm-migration-titular-lookup.adapter';

/**
 * Módulo de lectura CRM consumido por la importación (ADR-110 D11). Expone solo el puerto:
 * la migración no importa el módulo CRM completo ni la clase del adaptador.
 */
@Module({
  providers: [
    CrmMigrationTitularLookupAdapter,
    { provide: MigrationTitularLookupPort, useExisting: CrmMigrationTitularLookupAdapter },
  ],
  exports: [MigrationTitularLookupPort],
})
export class CrmMigrationTitularLookupModule {}
