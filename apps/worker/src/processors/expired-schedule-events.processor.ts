import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { isValidSchemaName } from '@iwana/db';
import { SCHEDULE_EVENTS_SWEEP_QUEUE } from '@iwana/shared';

/**
 * Margen de gracia configurable (minutos) tras `scheduled_end_at` antes de marcar EXPIRED.
 * Comparación en timestamptz absoluto vs NOW() — sin reinterpretar zona (ADR-077 D7 / A1).
 * Override: env EXPIRED_SCHEDULE_EVENTS_GRACE_MINUTES.
 */
export const EXPIRED_SCHEDULE_EVENTS_DEFAULT_GRACE_MINUTES = 15;

/**
 * Barrido periódico de eventos de agenda vencidos sin cierre.
 *
 * Recorre todos los tenant schemas activos y marca como EXPIRED aquellos
 * eventos en estado SCHEDULED o DRAFT cuyo scheduled_end_at ya venció
 * (más el margen de gracia).
 *
 * El barrido NO cancela, NO mueve, NO cierra nada — solo marca (ADR-077 D7).
 * Es idempotente: eventos ya EXPIRED no se tocan.
 *
 * F4.1 — MOD09-CICLO-VIDA-VISITA-CAMPO
 */
@Injectable()
@Processor(SCHEDULE_EVENTS_SWEEP_QUEUE)
export class ExpiredScheduleEventsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpiredScheduleEventsProcessor.name);
  private readonly pool: Pool;
  /** Margen de gracia en minutos (configurable vía env). */
  readonly graceMinutes: number;

  constructor(
    config: ConfigService,
    @InjectQueue(SCHEDULE_EVENTS_SWEEP_QUEUE) private readonly queue: Queue,
  ) {
    super();
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 2,
    });

    const rawGrace = config.get<string | number>(
      'EXPIRED_SCHEDULE_EVENTS_GRACE_MINUTES',
      EXPIRED_SCHEDULE_EVENTS_DEFAULT_GRACE_MINUTES,
    );
    const parsed = typeof rawGrace === 'number' ? rawGrace : Number.parseInt(String(rawGrace), 10);
    this.graceMinutes =
      Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : EXPIRED_SCHEDULE_EVENTS_DEFAULT_GRACE_MINUTES;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      'expired-sweep',
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: 'expired-schedule-events-sweep',
      },
    );
    this.logger.log(
      `[expired-schedule-events-sweep] Job repetible registrado (cron: */15 * * * * — cada 15 min; gracia=${this.graceMinutes}m)`,
    );
  }

  async process(_job: Job): Promise<void> {
    const client = await this.pool.connect();
    try {
      const tenants = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name`,
      );

      const tenantErrors: Error[] = [];
      let totalMarked = 0;
      for (const tenant of tenants.rows) {
        if (!isValidSchemaName(tenant.schema_name)) {
          this.logger.warn(`[expired-sweep] Schema inválido omitido: "${tenant.schema_name}"`);
          continue;
        }
        try {
          const count = await this.processTenant(client, tenant.schema_name);
          totalMarked += count;
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : 'unknown error';
          tenantErrors.push(new Error(`schema=${tenant.schema_name}: ${reason}`));
        }
      }

      if (tenantErrors.length > 0) {
        throw new AggregateError(
          tenantErrors,
          `Fallaron ${tenantErrors.length} tenant(s) durante el barrido de eventos vencidos`,
        );
      }

      this.logger.log(
        `[expired-sweep] Barrido completado. Eventos marcados EXPIRED: ${totalMarked}`,
      );
    } finally {
      client.release();
    }
  }

  private async processTenant(client: PoolClient, schemaName: string): Promise<number> {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);

      // Comparar timestamptz con NOW() sin reinterpretar zona.
      // Margen de gracia explícito en minutos (parametrizado).
      const result = await client.query(
        `UPDATE schedule_events
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE id IN (
           SELECT id FROM schedule_events
           WHERE status IN ('SCHEDULED', 'DRAFT')
             AND scheduled_end_at < NOW() - ($1::int * INTERVAL '1 minute')
             AND deleted_at IS NULL
           ORDER BY scheduled_end_at ASC
           LIMIT 100
         )
         RETURNING id`,
        [this.graceMinutes],
      );

      await client.query('COMMIT');

      const marked = result.rowCount ?? 0;
      if (marked > 0) {
        // Sin PII: solo conteo, no IDs individuales.
        this.logger.log(
          `[expired-sweep] schema=${schemaName}: ${marked} eventos marcados EXPIRED (gracia=${this.graceMinutes}m)`,
        );
      }
      return marked;
    } catch (error) {
      await client.query('ROLLBACK');
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`[expired-sweep] Fallo procesando schema=${schemaName}: ${reason}`);
      throw error;
    }
  }
}
