import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Bootstrap del proceso Worker iWana neXt.
 *
 * El worker NO expone un puerto HTTP — es un proceso de consumo
 * de colas BullMQ. Solo llama a app.init() sin app.listen().
 *
 * Sprint 0 — Scaffold minimo.
 * Sprint 1 Semana 2: Se registran los processors BullMQ:
 * - TenantProvisioningProcessor (cola: tenant-provisioning)
 * - RefreshTokenPurgeProcessor (cola: refresh-token-purge)
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  await app.init();
}

bootstrap();
