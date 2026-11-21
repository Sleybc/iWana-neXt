import { getQueueToken, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { PlatformHealthSample, summarizeErrorForLog } from '@iwana/db';
import type { PlatformHealthSampleQueue } from '@iwana/db';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { PLATFORM_HEALTH_SAMPLER_QUEUE, WORKER_QUEUE_NAMES } from '../worker-queues';

export const PLATFORM_HEALTH_SAMPLER_JOB = 'sample';
/** Id fijo del programador: `upsertJobScheduler` lo reemplaza en cada arranque, no lo duplica. */
export const PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID = 'platform-health-sampler-every-5m';
export const PLATFORM_HEALTH_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
export const PLATFORM_HEALTH_RETENTION_DAYS = 35;
/** Tope de cada medición (DB, Redis, API). */
export const PLATFORM_HEALTH_PROBE_TIMEOUT_MS = 3_000;

export interface PlatformHealthSampleResult {
  apiOk: boolean | null;
  dbOk: boolean;
  redisOk: boolean;
  queues: number;
  pruned: number;
}

/** Rechaza si la promesa tarda más que el tope; la promesa original queda descartada. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * URL del health del API a partir de `API_INTERNAL_URL` (origen interno, sin ruta). `null`
 * si falta o no es http(s): el API no se mide y la muestra lleva `api_ok = NULL`.
 */
export function resolveApiHealthUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return new URL('/api/v1/health', url.origin).toString();
  } catch {
    return null;
  }
}

/**
 * Muestreador de salud de plataforma (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3 §Diseño del muestreo).
 *
 * Cada 5 min mide `SELECT 1`, `PING` a Redis, `GET /api/v1/health` del API (solo con
 * `API_INTERNAL_URL`) y, por cola registrada en el worker, espera, fallidos y antigüedad del
 * trabajo en espera más viejo. Guarda una fila en `public.platform_health_samples` y borra las
 * de más de 35 días. Sin datos de empresa: solo booleanos y conteos.
 */
@Injectable()
@Processor(PLATFORM_HEALTH_SAMPLER_QUEUE, { concurrency: 1 })
export class PlatformHealthSamplerProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformHealthSamplerProcessor.name);
  private readonly apiHealthUrl: string | null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(PLATFORM_HEALTH_SAMPLER_QUEUE) private readonly queue: Queue,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
  ) {
    super();
    this.apiHealthUrl = resolveApiHealthUrl(config.get<string>('API_INTERNAL_URL'));
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.apiHealthUrl) {
      this.logger.warn('platform_health.api_not_measured reason=API_INTERNAL_URL_missing');
    }
    await this.queue.upsertJobScheduler(
      PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
      { every: PLATFORM_HEALTH_SAMPLE_INTERVAL_MS },
      {
        name: PLATFORM_HEALTH_SAMPLER_JOB,
        data: {},
        opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
      },
    );
  }

  @SanitizeFailedReason()
  async process(_job: Job<unknown>): Promise<PlatformHealthSampleResult> {
    return this.sample(new Date());
  }

  async sample(now: Date): Promise<PlatformHealthSampleResult> {
    const [dbOk, redisOk, apiOk, queues] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeApi(),
      this.readQueues(now),
    ]);

    await this.dataSource.getRepository(PlatformHealthSample).insert({
      sampledAt: now,
      apiOk,
      dbOk,
      redisOk,
      queues,
    });
    const pruned = await this.prune(now);

    this.logger.log(
      `platform_health.sample api=${apiOk === null ? 'unmeasured' : apiOk} db=${dbOk} ` +
        `redis=${redisOk} queues=${queues.length} pruned=${pruned}`,
    );
    return { apiOk, dbOk, redisOk, queues: queues.length, pruned };
  }

  /** Borra las muestras con más de 35 días respecto de `now`. */
  async prune(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - PLATFORM_HEALTH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(PlatformHealthSample)
      .where('sampled_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private async probeDatabase(): Promise<boolean> {
    try {
      await withTimeout(this.dataSource.query('SELECT 1'), PLATFORM_HEALTH_PROBE_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  }

  private async probeRedis(): Promise<boolean> {
    try {
      const client = await withTimeout(this.queue.client, PLATFORM_HEALTH_PROBE_TIMEOUT_MS);
      const reply = await withTimeout(client.ping(), PLATFORM_HEALTH_PROBE_TIMEOUT_MS);
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  /** `null` sin `API_INTERNAL_URL`: no medido, nunca OK. */
  private async probeApi(): Promise<boolean | null> {
    if (!this.apiHealthUrl) return null;
    try {
      const response = await fetch(this.apiHealthUrl, {
        signal: AbortSignal.timeout(PLATFORM_HEALTH_PROBE_TIMEOUT_MS),
        redirect: 'error',
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async readQueues(now: Date): Promise<PlatformHealthSampleQueue[]> {
    const snapshots: PlatformHealthSampleQueue[] = [];
    for (const name of WORKER_QUEUE_NAMES) {
      try {
        const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
        snapshots.push(
          await withTimeout(this.readQueue(queue, name, now), PLATFORM_HEALTH_PROBE_TIMEOUT_MS),
        );
      } catch (error) {
        this.logger.warn(
          `platform_health.queue_unreadable queue=${name} ${summarizeErrorForLog(error)}`,
        );
      }
    }
    return snapshots;
  }

  private async readQueue(
    queue: Queue,
    name: string,
    now: Date,
  ): Promise<PlatformHealthSampleQueue> {
    const counts = await queue.getJobCounts('waiting', 'failed');
    const waiting = counts['waiting'] ?? 0;
    let oldestWaitingSeconds: number | null = null;
    if (waiting > 0) {
      // Orden ascendente: el primero es el más viejo de la lista de espera.
      const [oldest] = await queue.getJobs(['waiting'], 0, 0, true);
      if (oldest?.timestamp) {
        oldestWaitingSeconds = Math.max(0, Math.floor((now.getTime() - oldest.timestamp) / 1000));
      }
    }
    return { name, waiting, failed: counts['failed'] ?? 0, oldestWaitingSeconds };
  }
}
