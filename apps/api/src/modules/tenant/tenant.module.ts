import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '@iwana/db';
import { TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { TenantController } from './tenant.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';

/**
 * Modulo de gestion de tenants.
 *
 * Boundary: operaciones de ciclo de vida de tenants en public.tenants.
 * Expone TenantService para ser consumido por otros modulos (AuthModule,
 * AuditModule) via imports — no acceso directo a repositorios ajenos.
 *
 * Sprint 1 Semana 2: se agrega TenantProvisioningService con BullMQ
 * para encolar el provisioning del schema PostgreSQL al crear un tenant.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (@iwana/tenant)
 */
@Module({
  imports: [
    // JwtModule exportado por AuthModule para verificar claims de tenant en middleware
    AuthModule,

    // Audit trail para cambios de configuración funcional
    AuditModule,

    // Registra el repositorio de Tenant en el scope de este modulo
    TypeOrmModule.forFeature([Tenant]),

    // Cola BullMQ de provisioning de schemas de tenant
    BullModule.registerQueue({
      name: TENANT_PROVISIONING_QUEUE,
    }),
  ],
  controllers: [TenantController],
  providers: [TenantService, TenantProvisioningService, TenantMiddleware],
  // Exportar TenantService para que AuthModule y otros modulos puedan
  // resolver tenants sin acceder al repositorio directamente (boundary)
  exports: [TenantService, TenantProvisioningService, TenantMiddleware],
})
export class TenantModule {}
