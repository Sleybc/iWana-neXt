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
import { DashboardSummaryService } from './dashboard-summary.service';
import { CommercialNode } from './entities/commercial-node.entity';
import { CoverageZone } from './entities/coverage-zone.entity';
import { PlanCatalogItem } from './entities/plan-catalog-item.entity';

/**
 * Modulo de gestion de tenants.
 *
 * Boundary: operaciones de ciclo de vida de tenants en public.tenants.
 * Expone TenantService para ser consumido por otros modulos (AuthModule,
 * AuditModule) via imports — no acceso directo a repositorios ajenos.
 *
 * DashboardSummaryService: query facade para el panel empresarial del tenant.
 * Inyecta AuditQueryService (exportado por AuditModule) para contar eventos
 * de los últimos 7 días. Decisión arquitectónica Opción A — CTO 2026-03-17.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (@iwana/tenant)
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.3 (DashboardSummaryService)
 */
@Module({
  imports: [
    // JwtModule exportado por AuthModule para verificar claims de tenant en middleware
    AuthModule,

    // AuditModule exporta AuditService (escritura) y AuditQueryService (lectura dashboard)
    AuditModule,

    // Registra entidades del módulo tenant en el DataSource (requerido para autoLoadEntities y qr.manager)
    TypeOrmModule.forFeature([Tenant, CommercialNode, CoverageZone, PlanCatalogItem]),

    // Cola BullMQ de provisioning de schemas de tenant
    BullModule.registerQueue({
      name: TENANT_PROVISIONING_QUEUE,
    }),
  ],
  controllers: [TenantController],
  providers: [TenantService, TenantProvisioningService, TenantMiddleware, DashboardSummaryService],
  // Exportar TenantService para que AuthModule y otros modulos puedan
  // resolver tenants sin acceder al repositorio directamente (boundary)
  exports: [TenantService, TenantProvisioningService, TenantMiddleware],
})
export class TenantModule {}
