import { getQueueToken, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue, type Job } from 'bullmq';
import type { DataSource } from 'typeorm';
import { PlatformHealthSample, summarizeErrorForLog } from '@iwana/db';
import type { PlatformHealthSampleQueue } from '@iwana/db';
import {
  MAINTENANCE_JOB_RETENTION,
  PLATFORM_API_QUEUE_NAMES,
  QUEUE_FAILED_MAX_AGE_SECONDS,
  QUEUE_FAILED_RECENT_WINDOW_MS,
  SAMPLED_QUEUE_NAMES,
} from '@iwana/shared';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { PLATFORM_HEALTH_SAMPLER_QUEUE } from '../worker-queues';

const API_QUEUE_NAMES = new Set<string>(PLATFORM_API_QUEUE_NAMES);

/** Tope de fallidos retirados por cola en cada vuelta (cada 5 min). */
const FAILED_CLEAN_BATCH = 1000;

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
 * trabajo en espera más viejo, y fallidos de las últimas 72 h (`failedRecent`). Guarda una fila en `public.platform_health_samples` y borra las
 * de más de 35 días. Sin datos de empresa: solo booleanos y conteos.
 */
@Injectable()
@Processor(PLATFORM_HEALTH_SAMPLER_QUEUE, { concurrency: 1 })
export class PlatformHealthSamplerProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PlatformHealthSamplerProcessor.name);
  private readonly apiHealthUrl: string | null;
  /** Colas del API que el muestreador abre por su cuenta (el worker no las registra). */
  private readonly apiQueues = new Map<string, Queue>();

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
      this.logger.warn(
        'platform_health.api_not_measured reason=API_INTERNAL_URL_missing_or_invalid',
      );
    }
    await this.queue.upsertJobScheduler(
      PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
      { every: PLATFORM_HEALTH_SAMPLE_INTERVAL_MS },
      {
        name: PLATFORM_HEALTH_SAMPLER_JOB,
        data: {},
        // B(b) familia M: `upsertJobScheduler` reemplaza las opciones del programador.
        opts: { ...MAINTENANCE_JOB_RETENTION },
      },
    );
  }

  @SanitizeFailedReason()
  async process(_job: Job<unknown>): Promise<PlatformHealthSampleResult> {
    return this.sample(new Date());
  }

  async sample(now: Date): Promise<PlatformHealthSampleResult> {
    // sec-eng C-3: antes de contar, la edad máxima de los fallidos se aplica de verdad.
    await this.pruneExpiredFailures();
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
      const ok = response.status === 200;
      // Solo cuenta el status: el cuerpo se cancela para liberar el socket (L-1, F3-D3).
      await response.body?.cancel().catch(() => undefined);
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * Cola a leer: la registrada en el worker o, para las que procesa el API, una propia sobre la
   * misma conexión de Redis (solo lectura de conteos; se cierra al apagar el módulo).
   */
  private queueFor(name: string): Queue {
    if (!API_QUEUE_NAMES.has(name)) {
      return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
    }
    let queue = this.apiQueues.get(name);
    if (!queue) {
      const { connection, prefix } = this.queue.opts;
      queue = new Queue(name, prefix === undefined ? { connection } : { connection, prefix });
      // Sin manejador, un error de conexión de esta cola de lectura tumbaría el proceso.
      queue.on('error', (error) => {
        this.logger.warn(
          `platform_health.queue_connection_error queue=${name} ${summarizeErrorForLog(error)}`,
        );
      });
      this.apiQueues.set(name, queue);
    }
    return queue;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.apiQueues.values()].map((queue) => queue.close()));
    this.apiQueues.clear();
  }

  /**
   * `removeOnFail.age` solo recorta cuando falla otro trabajo de la misma cola: en una cola que
   * dejó de fallar, los fallidos viejos (con su payload) se quedarían. Cada vuelta del muestreo
   * aplica `clean(age, 1000, 'failed')` con la edad de `QUEUE_FAILED_MAX_AGE_SECONDS`. El fallo de
   * una cola no detiene a las demás ni a la muestra.
   */
  async pruneExpiredFailures(): Promise<number> {
    let removed = 0;
    for (const [name, ageSeconds] of Object.entries(QUEUE_FAILED_MAX_AGE_SECONDS)) {
      try {
        const queue = this.queueFor(name);
        const cleaned = await withTimeout(
          queue.clean(ageSeconds * 1000, FAILED_CLEAN_BATCH, 'failed'),
          PLATFORM_HEALTH_PROBE_TIMEOUT_MS,
        );
        removed += cleaned.length;
      } catch (error) {
        this.logger.warn(
          `platform_health.failed_cleanup_error queue=${name} ${summarizeErrorForLog(error)}`,
        );
      }
    }
    if (removed > 0) this.logger.log(`platform_health.failed_cleanup removed=${removed}`);
    return removed;
  }

  private async readQueues(now: Date): Promise<PlatformHealthSampleQueue[]> {
    const snapshots: PlatformHealthSampleQueue[] = [];
    // Todas las colas de la plataforma, también las que procesa el API (AI-EM-ARCH 2026-11-22).
    for (const name of SAMPLED_QUEUE_NAMES) {
      try {
        const queue = this.queueFor(name);
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
    // B(b): el conjunto `failed` es un zset ordenado por `finishedOn` (ms). Los fallidos de la
    // ventana salen con un ZCOUNT, sin traer trabajos.
    const client = await queue.client;
    const failedRecent = await client.zcount(
      queue.keys['failed'] as string,
      now.getTime() - QUEUE_FAILED_RECENT_WINDOW_MS,
      '+inf',
    );
    return {
      name,
      waiting,
      failed: counts['failed'] ?? 0,
      failedRecent,
      oldestWaitingSeconds,
    };
  }
}
