import { NestFactory } from '@nestjs/core';
import { Buffer } from 'node:buffer';
import { WorkerModule } from './worker.module';

/** Asegura que el runtime productivo pueda firmar los jobs de D8. */
function validateProductionInternalQueueSigningKey(): void {
  if (process.env['NODE_ENV'] !== 'production') {
    return;
  }

  const keys = [
    ['INTERNAL_QUEUE_SIGNING_KEY', process.env['INTERNAL_QUEUE_SIGNING_KEY']],
    ['INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS', process.env['INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS']],
  ] as const;

  for (const [name, value] of keys) {
    if (name === 'INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS' && !value) {
      continue;
    }

    const key = value?.trim() ?? '';
    const isBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(key);
    const decoded = isBase64 ? Buffer.from(key, 'base64') : Buffer.alloc(0);

    if (!isBase64 || decoded.byteLength < 32 || decoded.toString('base64') !== key) {
      throw new Error(
        `${name} debe ser base64 canónico de al menos 32 bytes aleatorios para NODE_ENV=production. Genérela con: openssl rand -base64 32`,
      );
    }
  }
}

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
  try {
    validateProductionInternalQueueSigningKey();
    const app = await NestFactory.create(WorkerModule);
    await app.init();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falló el arranque del worker.';
    console.error(message);
    process.exitCode = 1;
  }
}

bootstrap();
