import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { REFRESH_TOKEN_PURGE_QUEUE, TENANT_SCHEMA_PURGE_QUEUE } from '@iwana/shared';
import { registerMaintenanceRepeatable } from '../common/maintenance-repeatable';

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

  constructor(
    @InjectQueue(REFRESH_TOKEN_PURGE_QUEUE) private readonly purgeQueue: Queue,
    @InjectQueue(TENANT_SCHEMA_PURGE_QUEUE) private readonly tenantSchemaPurgeQueue: Queue,
  ) {}

  /**
   * Registra los jobs repetibles al iniciar el worker.
   * La opción jobId fija garantiza idempotencia — BullMQ no crea duplicados
   * si el job con ese ID ya existe en la cola.
   */
  async onApplicationBootstrap(): Promise<void> {
    // B(b) familia M: retira el repetible y lo registra con la retención de mantenimiento.
    await registerMaintenanceRepeatable(
      this.purgeQueue,
      'purge-expired-tokens',
      { pattern: '0 3 * * *' },
      'refresh-token-purge-daily',
    );

    this.logger.log(
      '[scheduler] Job repetible de purga de refresh tokens registrado (cron: 0 3 * * * — 3am UTC / 10pm Colombia)',
    );

    await registerMaintenanceRepeatable(
      this.tenantSchemaPurgeQueue,
      'purge-marked-tenant-schemas',
      { pattern: '30 3 * * *' },
      'tenant-schema-purge-daily',
    );

    this.logger.log(
      '[scheduler] Job repetible de purga de schemas tenant registrado (cron: 30 3 * * * — 3:30am UTC / 10:30pm Colombia)',
    );
  }
}
