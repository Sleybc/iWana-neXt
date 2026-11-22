import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { UnrecoverableError, type Job, type Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { countUsageSubscribers, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { MAINTENANCE_JOB_RETENTION, TenantStatus } from '@iwana/shared';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { listSweepableTenants } from '../common/tenant-sweep';
import { TENANT_USAGE_SAMPLER_QUEUE } from '../worker-queues';

export const TENANT_USAGE_SAMPLER_JOB = 'sample';
/** Id fijo del programador: `upsertJobScheduler` lo reemplaza en cada arranque, no lo duplica. */
export const TENANT_USAGE_SAMPLER_SCHEDULER_ID = 'tenant-usage-sampler-every-1h';
export const TENANT_USAGE_SAMPLE_INTERVAL_MS = 60 * 60 * 1000;
/** Tope de la consulta de conteo por empresa (ADR-114 §7 condición 2). */
export const TENANT_USAGE_STATEMENT_TIMEOUT_MS = 5_000;

/**
 * Datos del job. El horario va sin datos y mide todas las empresas; el que encola el
 * aprovisionamiento al activar lleva `tenantId` y mide solo esa (ADR-114 D2). Tipo local del
 * worker: la cola no tiene contrato en `@iwana/shared` (ni productor fuera del worker).
 */
export interface TenantUsageSampleJobData {
  tenantId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface SampledTenant {
  id: string;
  schemaName: string;
}

export interface TenantUsageSampleResult {
  measured: number;
  failed: number;
}

/**
 * Muestreador de uso por empresa (ADR-114 D2, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4 §A.3).
 *
 * Cada hora, por cada empresa vigente (`listSweepableTenants`: `ACTIVE` y no retirada), cuenta sus
 * suscriptores con la definición de CRM sin anonimizados (`countUsageSubscribers`, ADR-114 §8)
 * dentro de `runInTenantSchema` con `statement_timeout`. Al activar una empresa, el job trae su
 * `tenantId` y solo mide esa. Guarda solo el número en `public.tenant_usage_snapshots`.
 * Consultas secuenciales; el fallo de una empresa no detiene a las demás ni escribe 0: su medición
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
        // B(b) familia M: `upsertJobScheduler` reemplaza las opciones del programador.
        opts: { ...MAINTENANCE_JOB_RETENTION },
      },
    );
  }

  @SanitizeFailedReason()
  async process(job: Job<TenantUsageSampleJobData | undefined>): Promise<TenantUsageSampleResult> {
    const tenantId = job?.data?.tenantId;
    if (tenantId === undefined) return this.sample();
    if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
      throw new UnrecoverableError('TENANT_USAGE_INVALID_TENANT_ID');
    }
    return this.sampleTenant(tenantId);
  }

  /** Muestreo horario: todas las empresas `ACTIVE` y no retiradas. */
  async sample(): Promise<TenantUsageSampleResult> {
    // Filtro compartido de empresas vigentes (ACTIVE, no retiradas, schema válido).
    const tenants: SampledTenant[] = await listSweepableTenants(this.dataSource);

    let measured = 0;
    let failed = 0;
    for (const tenant of tenants) {
      if (await this.measure(tenant)) measured += 1;
      else failed += 1;
    }
    this.logger.log(
      `tenant_usage.sample tenants=${tenants.length} measured=${measured} failed=${failed}`,
    );
    return { measured, failed };
  }

  /**
   * Medición bajo demanda al activar una empresa (ADR-114 D2): solo esa empresa, y solo si
   * sigue `ACTIVE` y no retirada al correr el job; si no, no mide nada.
   */
  async sampleTenant(tenantId: string): Promise<TenantUsageSampleResult> {
    const tenants = (await this.dataSource.query(
      `SELECT id::text AS id, schema_name AS "schemaName"
         FROM public.tenants
        WHERE id = $1 AND status = $2 AND deleted_at IS NULL`,
      [tenantId, TenantStatus.ACTIVE],
    )) as SampledTenant[];
    const tenant = tenants[0];
    if (!tenant) {
      this.logger.log(`tenant_usage.measured tenantId=${tenantId} result=skipped_not_active`);
      return { measured: 0, failed: 0 };
    }
    return (await this.measure(tenant)) ? { measured: 1, failed: 0 } : { measured: 0, failed: 1 };
  }

  /** Mide una empresa; el fallo queda aislado (no escribe 0 ni detiene a las demás). */
  private async measure(tenant: SampledTenant): Promise<boolean> {
    const startedAt = Date.now();
    try {
      const count = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
        await qr.query(`SET LOCAL statement_timeout = ${TENANT_USAGE_STATEMENT_TIMEOUT_MS}`);
        return countUsageSubscribers(qr, tenant.id);
      });
      await this.dataSource.query(
        `INSERT INTO public.tenant_usage_snapshots (tenant_id, active_subscribers, measured_at)
         VALUES ($1, $2, now())
         ON CONFLICT (tenant_id) DO UPDATE
           SET active_subscribers = EXCLUDED.active_subscribers,
               measured_at = EXCLUDED.measured_at`,
        [tenant.id, count],
      );
      this.logger.log(
        `tenant_usage.measured tenantId=${tenant.id} durationMs=${Date.now() - startedAt} result=ok`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `tenant_usage.measured tenantId=${tenant.id} durationMs=${Date.now() - startedAt} ` +
          `result=failed ${summarizeErrorForLog(error)}`,
      );
      return false;
    }
  }
}
