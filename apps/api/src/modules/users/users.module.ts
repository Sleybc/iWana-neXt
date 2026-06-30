import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { SearchQueueModule } from '../search/search-queue.module';
import { TenantModule } from '../tenant/tenant.module';
import { UsersController } from './users.controller';
import { UsersBulkController } from './users-bulk.controller';
import { UsersService } from './users.service';

/**
 * Modulo de gestion de usuarios por tenant.
 *
 * Importa AuditModule para poder registrar eventos CREATE/UPDATE/DELETE en el audit trail.
 * Importa TypeOrmModule con la entidad User para que UsersService pueda realizar
 * operaciones directas via QueryRunner (necesario para runInTenantSchema).
 * Importa ConfigModule para derivar MFA_ENCRYPTION_KEY en UsersService.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 — Seccion 4 (Capa de usuarios del tenant)
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    AccessControlModule,
    AuditModule,
    TenantModule,
    SearchQueueModule,
  ],
  controllers: [UsersController, UsersBulkController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
