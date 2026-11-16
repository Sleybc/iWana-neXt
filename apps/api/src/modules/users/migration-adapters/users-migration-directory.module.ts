import { Module } from '@nestjs/common';
import { MigrationUserDirectoryPort } from '../../migration/ports/migration-user-directory.port';
import { MigrationUserProvisioningPort } from '../../migration/ports/migration-user-provisioning.port';
import { AuditModule } from '../../audit/audit.module';
import { SearchQueueModule } from '../../search/search-queue.module';
import { UsersMigrationDirectoryAdapter } from './users-migration-directory.adapter';
import { UsersMigrationProvisioningAdapter } from './users-migration-provisioning.adapter';

/**
 * Usuarios consumido por la importación (ADR-110 D15). Expone solo los puertos: la migración no
 * importa el módulo de Usuarios ni las clases de los adaptadores. Lectura (atribución y
 * coincidencia por correo) y escritura (crear usuarios importados e invitarlos, bloque C).
 * `MailerService` y `ConfigService` son globales.
 */
@Module({
  imports: [AuditModule, SearchQueueModule],
  providers: [
    UsersMigrationDirectoryAdapter,
    UsersMigrationProvisioningAdapter,
    { provide: MigrationUserDirectoryPort, useExisting: UsersMigrationDirectoryAdapter },
    { provide: MigrationUserProvisioningPort, useExisting: UsersMigrationProvisioningAdapter },
  ],
  exports: [MigrationUserDirectoryPort, MigrationUserProvisioningPort],
})
export class UsersMigrationDirectoryModule {}
