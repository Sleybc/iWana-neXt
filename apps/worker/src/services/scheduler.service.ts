import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { REFRESH_TOKEN_PURGE_QUEUE } from '@iwana/shared';

/**
 * Servicio responsable de registrar jobs repetibles (cron) en BullMQ al iniciar el worker.
 *
 * Patrón OnApplicationBootstrap: los jobs se registran una sola vez al arrancar.
 * BullMQ deduplica por jobId, garantizando que no se creen duplicados aunque
 * el worker se reinicie o escale horizontalmente.
 *
 * Colas gestionadas:
 * - REFRESH_TOKEN_PURGE_QUEUE: purga diaria a las 3am UTC (10pm hora Colombia, UTC-5)
 *
 * ADR-020: BullMQ para jobs asíncronos
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(@InjectQueue(REFRESH_TOKEN_PURGE_QUEUE) private readonly purgeQueue: Queue) {}

  /**
   * Registra los jobs repetibles al iniciar el worker.
   * La opción jobId fija garantiza idempotencia — BullMQ no crea duplicados
   * si el job con ese ID ya existe en la cola.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.purgeQueue.add(
      'purge-expired-tokens',
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'refresh-token-purge-daily',
      },
    );

    this.logger.log(
      '[scheduler] Job repetible de purga de refresh tokens registrado (cron: 0 3 * * * — 3am UTC / 10pm Colombia)',
    );
  }
}
