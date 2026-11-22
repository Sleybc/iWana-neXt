import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PlatformHealthSample } from '@iwana/db';
import type {
  PlatformHealthComponent,
  PlatformHealthDay,
  PlatformHealthDayComponent,
  PlatformHealthHistory,
  PlatformQueueSnapshot,
} from '@iwana/shared';

export const PLATFORM_HEALTH_HISTORY_DAYS = 30;
/** America/Bogota no tiene horario de verano: UTC−5 fijo. */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMPONENTS: readonly PlatformHealthComponent[] = ['api', 'db', 'redis'];

interface DayRow {
  day: string;
  api_samples: number;
  api_ok: number;
  db_samples: number;
  db_ok: number;
  redis_samples: number;
  redis_ok: number;
}

/** `YYYY-MM-DD` del día calendario de Bogotá que contiene `instant`. */
export function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Los 30 días de Bogotá que terminan en el de `now`, del más antiguo al actual. */
export function historyDates(now: Date): string[] {
  const today = Date.parse(`${bogotaDate(now)}T00:00:00Z`);
  return Array.from({ length: PLATFORM_HEALTH_HISTORY_DAYS }, (_, index) =>
    new Date(today - (PLATFORM_HEALTH_HISTORY_DAYS - 1 - index) * DAY_MS)
      .toISOString()
      .slice(0, 10),
  );
}

function component(samples: number, ok: number): PlatformHealthDayComponent {
  return { samples, availability: samples === 0 ? null : ok / samples };
}

/** Rellena los 30 días: un día sin filas queda con `samples = 0` y `availability = null`. */
export function buildHistoryDays(dates: string[], rows: DayRow[]): PlatformHealthDay[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return dates.map((date) => {
    const row = byDay.get(date);
    const components = Object.fromEntries(
      COMPONENTS.map((name) => [
        name,
        component(Number(row?.[`${name}_samples`] ?? 0), Number(row?.[`${name}_ok`] ?? 0)),
      ]),
    ) as PlatformHealthDay['components'];
    return { date, components };
  });
}

function toQueueSnapshot(value: unknown): PlatformQueueSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw['name'] !== 'string') return null;
  const count = (field: unknown): number =>
    typeof field === 'number' && Number.isFinite(field) ? field : 0;
  const oldest = raw['oldestWaitingSeconds'];
  const failed = count(raw['failed']);
  const recent = raw['failedRecent'];
  return {
    name: raw['name'],
    waiting: count(raw['waiting']),
    failed,
    // B(b): una muestra anterior al despliegue no trae `failedRecent`: se usa el total
    // (conservador; solo afecta a la última muestra previa).
    failedRecent: typeof recent === 'number' && Number.isFinite(recent) ? recent : failed,
    oldestWaitingSeconds: typeof oldest === 'number' && Number.isFinite(oldest) ? oldest : null,
  };
}

/**
 * Historia de salud de plataforma (contrato P2 v1.0, `@iwana/shared`). Dueño de
 * `public.platform_health_samples` en el API: solo la lee; la escribe el muestreador del worker.
 * La disponibilidad sale solo de muestras reales: un día sin muestras es `null`, nunca 1.
 */
@Injectable()
export class PlatformHealthHistoryService {
  constructor(
    @InjectRepository(PlatformHealthSample)
    private readonly samples: Repository<PlatformHealthSample>,
  ) {}

  async getHistory(now: Date = new Date()): Promise<PlatformHealthHistory> {
    const dates = historyDates(now);
    const from = new Date(Date.parse(`${dates[0]}T00:00:00Z`) - BOGOTA_OFFSET_MS);
    const to = new Date(
      Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + DAY_MS - BOGOTA_OFFSET_MS,
    );

    const rows = (await this.samples.query(
      `SELECT to_char((sampled_at AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS day,
              COUNT(api_ok)::int                          AS api_samples,
              COUNT(*) FILTER (WHERE api_ok)::int         AS api_ok,
              COUNT(*)::int                               AS db_samples,
              COUNT(*) FILTER (WHERE db_ok)::int          AS db_ok,
              COUNT(*)::int                               AS redis_samples,
              COUNT(*) FILTER (WHERE redis_ok)::int       AS redis_ok
         FROM public.platform_health_samples
        WHERE sampled_at >= $1 AND sampled_at < $2
        GROUP BY 1`,
      [from, to],
    )) as DayRow[];

    const latest = (await this.samples.query(
      `SELECT sampled_at, queues
         FROM public.platform_health_samples
        WHERE sampled_at < $1
        ORDER BY sampled_at DESC
        LIMIT 1`,
      [to],
    )) as Array<{ sampled_at: Date; queues: unknown }>;
    const last = latest[0];
    const queues = Array.isArray(last?.queues)
      ? last.queues.map(toQueueSnapshot).filter((queue): queue is PlatformQueueSnapshot => !!queue)
      : [];

    return {
      days: buildHistoryDays(dates, rows),
      queues,
      queuesSampledAt: last ? new Date(last.sampled_at).toISOString() : null,
      generatedAt: now.toISOString(),
    };
  }
}
