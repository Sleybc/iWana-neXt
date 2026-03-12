import { Module } from '@nestjs/common';

/**
 * Modulo raiz de la aplicacion iWana neXt API.
 *
 * Sprint 0 — Scaffold vacio.
 * Los modulos de negocio se integran en Sprint 1:
 * - AuthModule (JWT RS256, MFA TOTP)
 * - TenantModule (multi-tenant lifecycle)
 * - AuditModule (audit trail inmutable)
 * - UsersModule (gestion de usuarios)
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (NestJS Modulith)
 * - ADR-019 (NestJS Modulith pattern)
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
