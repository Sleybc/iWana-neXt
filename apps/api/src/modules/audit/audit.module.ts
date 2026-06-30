import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { PlatformAuditService } from './platform-audit.service';
import { AuditQueryService } from './audit-query.service';
import { AuditActorResolver } from './audit-actor.resolver';
import { AuditController } from './audit.controller';
import { PlatformAuditController } from './platform-audit.controller';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Modulo de auditoria de iWana neXt.
 *
 * Responsabilidades:
 * - AuditService: escritura append-only en audit_logs del schema de tenant.
 *   Exportado para que otros modulos (AuthModule, UsersModule, etc.) puedan
 *   emitir eventos de audit explicitamente.
 * - PlatformAuditService: escritura append-only en public.platform_audit_logs.
 *   Usado exclusivamente para operaciones de SYSTEM_ADMIN e IWANA_SUPPORT (RF-AUD-03, ADR-018).
 * - AuditInterceptor: auditoria automatica de operaciones CUD vía HTTP.
 *   Enruta al servicio correcto segun jwt.type ('platform' vs 'tenant').
 *   Registrado como APP_INTERCEPTOR global en AppModule.
 * - AuditQueryService + AuditController: consulta paginada del audit log.
 *
 * NOTA: APP_INTERCEPTOR se registra en AppModule (no aqui) para garantizar
 * que Nest lo aplique globalmente despues de inicializar todos los modulos.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
@Module({
  controllers: [AuditController, PlatformAuditController],
  providers: [AuditService, PlatformAuditService, AuditQueryService, AuditActorResolver],
  exports: [AuditService, PlatformAuditService, AuditQueryService],
})
export class AuditModule {}

/**
 * Factory del APP_INTERCEPTOR global para AuditInterceptor.
 * Usar en AppModule.providers:
 *   { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
 *
 * Se exporta como re-export para conveniencia del registration en AppModule.
 */
export { APP_INTERCEPTOR, AuditInterceptor };
