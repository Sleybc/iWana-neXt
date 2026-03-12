import { Module } from '@nestjs/common';

/**
 * Modulo raiz del Worker iWana neXt.
 *
 * Sprint 0 — Scaffold vacio.
 * Los workers se implementan en Sprint 1 Semana 2:
 * - TenantProvisioningWorker: ejecuta provisioning de schemas PostgreSQL
 * - RefreshTokenPurgeWorker: purga tokens expirados periodicamente
 *
 * Todos los workers consumen colas BullMQ conectadas a Redis.
 * Las colas se encolan en @iwana/api y se consumen aqui.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (Async workers)
 * - ADR-020 (BullMQ para jobs asincronos)
 */
@Module({
  imports: [],
  providers: [],
})
export class WorkerModule {}
