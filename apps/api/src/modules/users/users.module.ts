import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@iwana/db';
import { USERS_BULK_CREATE_QUEUE } from '@iwana/shared';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { SearchQueueModule } from '../search/search-queue.module';
import { TenantModule } from '../tenant/tenant.module';
import { UsersController } from './users.controller';
import { UsersBulkController } from './users-bulk.controller';
import { UsersBulkCreateProcessor } from './users-bulk-create.processor';
import { UsersService } from './users.service';
import { SettingsPriorityUsersReadAdapter } from './ports/settings-priority-users-read.adapter';
import { SettingsPriorityUsersReadPort } from './ports/settings-priority-users-read.port';

/**
 * Modulo de gestion de usuarios por tenant.
 *
 * Importa AuditModule para poder registrar eventos CREATE/UPDATE/DELETE en el audit trail.
 * Importa TypeOrmModule con la entidad User para que UsersService pueda realizar
 * operaciones directas via QueryRunner (necesario para runInTenantSchema).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 — Seccion 4 (Capa de usuarios del tenant)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AccessControlModule,
    AuditModule,
    TenantModule,
    SearchQueueModule,
    BullModule.registerQueue({
      name: USERS_BULK_CREATE_QUEUE,
    }),
  ],
  controllers: [UsersController, UsersBulkController],
  providers: [
    UsersService,
    UsersBulkCreateProcessor,
    SettingsPriorityUsersReadAdapter,
    { provide: SettingsPriorityUsersReadPort, useExisting: SettingsPriorityUsersReadAdapter },
  ],
  exports: [UsersService, SettingsPriorityUsersReadPort],
})
export class UsersModule {}
