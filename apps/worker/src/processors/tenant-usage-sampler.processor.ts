import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { countListedSubscribers, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { TENANT_USAGE_SAMPLER_QUEUE } from '../worker-queues';

export const TENANT_USAGE_SAMPLER_JOB = 'sample';
/** Id fijo del programador: `upsertJobScheduler` lo reemplaza en cada arranque, no lo duplica. */
export const TENANT_USAGE_SAMPLER_SCHEDULER_ID = 'tenant-usage-sampler-every-1h';
export const TENANT_USAGE_SAMPLE_INTERVAL_MS = 60 * 60 * 1000;
/** Tope de la consulta de conteo por empresa (ADR-114 §7 condición 2). */
export const TENANT_USAGE_STATEMENT_TIMEOUT_MS = 5_000;

export interface TenantUsageSampleResult {
  measured: number;
  failed: number;
}

/**
 * Muestreador de uso por empresa (ADR-114 D2, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4 §A.3).
 *
 * Cada hora, por cada empresa `ACTIVE` de `public.tenants`, cuenta sus suscriptores con la
 * definición de CRM (`countListedSubscribers`) dentro de `runInTenantSchema` con
 * `statement_timeout`, y guarda solo el número en `public.tenant_usage_snapshots`. Consultas
 * secuenciales; el fallo de una empresa no detiene a las demás ni escribe 0: su medición
 * anterior queda y envejece. Usa la conexión por defecto del worker (`DB_USER`), nunca
 * `DB_MIGRATOR_USER` ni `DB_PURGER_USER`. Logs: `tenantId`, duración y resultado.
 */
@Injectable()
@Processor(TENANT_USAGE_SAMPLER_QUEUE, { concurrency: 1 })
export class TenantUsageSamplerProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantUsageSamplerProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(TENANT_USAGE_SAMPLER_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TENANT_USAGE_SAMPLER_SCHEDULER_ID,
      { every: TENANT_USAGE_SAMPLE_INTERVAL_MS },
      {
        name: TENANT_USAGE_SAMPLER_JOB,
        data: {},
        opts: { removeOnComplete: { count: 24 }, removeOnFail: { count: 24 } },
      },
    );
  }

  @SanitizeFailedReason()
  async process(_job: Job<unknown>): Promise<TenantUsageSampleResult> {
    return this.sample();
  }

  async sample(): Promise<TenantUsageSampleResult> {
    const tenants = (await this.dataSource.query(
      `SELECT id::text AS id, schema_name AS "schemaName"
         FROM public.tenants
        WHERE status = $1
        ORDER BY id`,
      [TenantStatus.ACTIVE],
    )) as Array<{ id: string; schemaName: string }>;

    let measured = 0;
    let failed = 0;
    for (const tenant of tenants) {
      const startedAt = Date.now();
      try {
        const count = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
          await qr.query(`SET LOCAL statement_timeout = ${TENANT_USAGE_STATEMENT_TIMEOUT_MS}`);
          return countListedSubscribers(qr, tenant.id);
        });
        await this.dataSource.query(
          `INSERT INTO public.tenant_usage_snapshots (tenant_id, active_subscribers, measured_at)
           VALUES ($1, $2, now())
           ON CONFLICT (tenant_id) DO UPDATE
             SET active_subscribers = EXCLUDED.active_subscribers,
                 measured_at = EXCLUDED.measured_at`,
          [tenant.id, count],
        );
        measured += 1;
        this.logger.log(
          `tenant_usage.measured tenantId=${tenant.id} durationMs=${Date.now() - startedAt} result=ok`,
        );
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `tenant_usage.measured tenantId=${tenant.id} durationMs=${Date.now() - startedAt} ` +
            `result=failed ${summarizeErrorForLog(error)}`,
        );
      }
    }
    this.logger.log(
      `tenant_usage.sample tenants=${tenants.length} measured=${measured} failed=${failed}`,
    );
    return { measured, failed };
  }
}
