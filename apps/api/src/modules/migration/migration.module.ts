import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MIGRATION_IMPORT_QUEUE } from '@iwana/shared';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AssuranceMigrationImportModule } from '../assurance/migration-adapters/assurance-migration-import.module';
import { BillingMigrationImportModule } from '../billing/migration-adapters/billing-migration-import.module';
import { CrmMigrationImportModule } from '../crm/migration-adapters/crm-migration-import.module';
import { CrmMigrationTitularLookupModule } from '../crm/migration-adapters/crm-migration-titular-lookup.module';
import { TasksMigrationReferencesModule } from '../tasks/migration-adapters/tasks-migration-references.module';
import { UsersMigrationDirectoryModule } from '../users/migration-adapters/users-migration-directory.module';
import { MediaModule } from '../media/media.module';
import { TenantModule } from '../tenant/tenant.module';
import { MigrationBatchesController, MigrationMappingsController } from './migration.controller';
import { MigrationSourceConnectionService } from './migration-source-connection.service';
import {
  MigrationSourceConnectionController,
  MigrationUispUsersController,
} from './migration-uisp-users.controller';
import { MigrationUispUsersService } from './migration-uisp-users.service';
import { MigrationUispUsersResolutionService } from './migration-uisp-users-resolution.service';
import {
  UISP_API_CLIENT_OPTIONS,
  UispApiClient,
  uispApiClientOptionsFromConfig,
} from './uisp-api/uisp-api.client';
import { MigrationBatchesService } from './migration-batches.service';
import { MigrationCrypto } from './migration-crypto';
import { MigrationImportProcessor } from './migration-import.processor';
import { MigrationMappingsService } from './migration-mappings.service';
import { MigrationPromotionService } from './migration-promotion.service';
import { MigrationPurgeService } from './migration-purge.service';
import { MigrationRevertService } from './migration-revert.service';
import { MigrationSimulationService } from './migration-simulation.service';

/**
 * Importación por lotes desde UISP (ADR-110). Bloque B: subida cifrada, simulación en
 * BullMQ, informe por entidad y motivo, equivalencias y purga a 30 días. Bloque C: promoción
 * idempotente, conciliación por titular y reversión por lote.
 *
 * Boundaries: CRM, Billing y Soporte solo por los puertos de `ports/` (adaptadores en cada
 * módulo dueño) y la lectura de OT por `MigrationWorkOrderReferencesPort`; storage por
 * `STORAGE_PORT` de MediaModule. No lee ni escribe tablas de otros módulos.
 *
 * Usuarios del personal desde la API de UISP (D15): conexión cifrada, cliente HTTP de solo
 * lectura con huella TLS fijada, lectura en cola y lista de revisión; la coincidencia con
 * Usuarios va por `MigrationUserDirectoryPort`. Resolver (enlazar, crear, descartar) e invitar
 * crean y activan usuarios solo por `MigrationUserProvisioningPort`.
 */
@Module({
  imports: [
    ConfigModule,
    AccessControlModule,
    AuditModule,
    AuthModule,
    TenantModule,
    MediaModule,
    CrmMigrationTitularLookupModule,
    CrmMigrationImportModule,
    BillingMigrationImportModule,
    AssuranceMigrationImportModule,
    TasksMigrationReferencesModule,
    UsersMigrationDirectoryModule,
    BullModule.registerQueue({ name: MIGRATION_IMPORT_QUEUE }),
  ],
  controllers: [
    MigrationBatchesController,
    MigrationMappingsController,
    MigrationSourceConnectionController,
    MigrationUispUsersController,
  ],
  providers: [
    MigrationCrypto,
    MigrationBatchesService,
    MigrationMappingsService,
    MigrationSimulationService,
    MigrationPurgeService,
    MigrationPromotionService,
    MigrationRevertService,
    MigrationImportProcessor,
    {
      // S-1: excepción SSRF solo de pruebas (prohibida en producción por app.config).
      provide: UISP_API_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: uispApiClientOptionsFromConfig,
    },
    UispApiClient,
    MigrationSourceConnectionService,
    MigrationUispUsersService,
    MigrationUispUsersResolutionService,
  ],
})
export class MigrationModule {}
