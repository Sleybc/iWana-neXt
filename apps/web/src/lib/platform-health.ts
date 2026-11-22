import type {
  PlatformHealthComponent,
  PlatformHealthDay,
  PlatformHealthHistory,
  PlatformQueueSnapshot,
} from '@iwana/shared';
import type { Tone } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;
const COMPONENTS: PlatformHealthComponent[] = ['api', 'db', 'redis'];

/** Umbral de día sin fallas: todas las muestras OK. */
const FULL = 1;
/** Por debajo, el día cuenta como caída (error); entre ambos, fallas parciales (warning). */
const DEGRADED_FLOOR = 0.99;

export interface TrackerDay {
  date: string;
  /** Peor disponibilidad del día entre componentes con muestras; `null` = sin dato. */
  availability: number | null;
  tone: Extract<Tone, 'success' | 'warning' | 'error' | 'neutral'>;
}

/**
 * Peor componente del día. Un componente sin muestras deja el día sin dato salvo que
 * otro ya muestre fallas: un hueco nunca se pinta verde (CA-PP3-01).
 */
export function toTrackerDay(day: PlatformHealthDay): TrackerDay {
  const values = COMPONENTS.map((c) => day.components[c]?.availability ?? null);
  const known = values.filter((v): v is number => v !== null);
  const worst = known.length > 0 ? Math.min(...known) : null;
  const hasGap = known.length < values.length;
  if (worst === null || (hasGap && worst >= FULL)) {
    return { date: day.date, availability: null, tone: 'neutral' };
  }
  return { date: day.date, availability: worst, tone: availabilityTone(worst) };
}

export function availabilityTone(value: number): TrackerDay['tone'] {
  if (value >= FULL) return 'success';
  if (value >= DEGRADED_FLOOR) return 'warning';
  return 'error';
}

export interface AvailabilitySummary {
  /** 0..1 del peor componente en 30 días, solo con muestras reales; `null` sin muestras. */
  availability: number | null;
  worst: PlatformHealthComponent | null;
  daysWithoutData: number;
  days: TrackerDay[];
}

export function summarizeAvailability(history: PlatformHealthHistory): AvailabilitySummary {
  let availability: number | null = null;
  let worst: PlatformHealthComponent | null = null;
  for (const component of COMPONENTS) {
    let samples = 0;
    let ok = 0;
    for (const day of history.days) {
      const entry = day.components[component];
      if (!entry || entry.availability === null || entry.samples <= 0) continue;
      samples += entry.samples;
      ok += entry.availability * entry.samples;
    }
    if (samples === 0) continue;
    const ratio = ok / samples;
    if (availability === null || ratio < availability) {
      availability = ratio;
      worst = component;
    }
  }
  const days = history.days.map(toTrackerDay);
  return {
    availability,
    worst,
    daysWithoutData: days.filter((d) => d.availability === null).length,
    days,
  };
}

export type WorkQueuesState = 'failed' | 'backlog' | 'clear';

export interface WorkQueuesSummary {
  state: WorkQueuesState;
  /** Colas con trabajos en espera o fallidos en 72 h, en el orden recibido. */
  withNews: PlatformQueueSnapshot[];
  quietCount: number;
  /** Fallidos de las últimas 72 h (`recentFailed`), no el histórico retenido. */
  failedTotal: number;
  waitingTotal: number;
}

/**
 * Antigüedad mínima del trabajo en espera para avisar (C-D2). Provisional: 5 min,
 * a confirmar por prod-ux. Una espera más corta es tránsito normal.
 */
export const QUEUE_BACKLOG_ALERT_SECONDS = 300;

/**
 * Fallidos que deciden el aviso (dirección §8.0): los de 72 h. Una muestra anterior al
 * despliegue no trae `failedRecent`; entonces cuenta `failed` (conservador).
 */
export function recentFailed(queue: PlatformQueueSnapshot): number {
  return queue.failedRecent ?? queue.failed;
}

/**
 * Regla única de Colas de trabajo (área y «Requiere tu atención»): hay aviso si
 * alguna cola tiene fallidos en 72 h (`failed`) o espera de al menos
 * `QUEUE_BACKLOG_ALERT_SECONDS` (`backlog`);
 * los fallidos mandan sobre la espera.
 */
export function summarizeWorkQueues(
  queues: readonly PlatformQueueSnapshot[] | null | undefined,
): WorkQueuesSummary {
  const rows = queues ?? [];
  // Solo fallidos históricos no es novedad: la cola cuenta como «sin novedad» (§8.0).
  const withNews = rows.filter((q) => q.waiting > 0 || recentFailed(q) > 0);
  const failedTotal = rows.reduce((sum, q) => sum + recentFailed(q), 0);
  const waitingTotal = rows.reduce((sum, q) => sum + q.waiting, 0);
  const staleBacklog = rows.some(
    (q) =>
      q.waiting > 0 &&
      q.oldestWaitingSeconds !== null &&
      q.oldestWaitingSeconds >= QUEUE_BACKLOG_ALERT_SECONDS,
  );
  const state: WorkQueuesState = failedTotal > 0 ? 'failed' : staleBacklog ? 'backlog' : 'clear';
  return { state, withNews, quietCount: rows.length - withNews.length, failedTotal, waitingTotal };
}

/** Nombre visible de una cola; nunca el técnico. */
export function queueLabel(name: string): string {
  return COPY.queueNames[name] ?? COPY.queuesUnknown;
}

/** Antigüedad legible del trabajo en espera más viejo. */
export function formatWaitingAge(seconds: number | null): string {
  if (seconds === null) return COPY.queuesOldestNone;
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** Centésimas de punto porcentual (basis points): 1 = 0,01 %. */
const BASIS_POINTS = 10000;
/** Meta de la celda de 30 días (decisión CTO 2026-11-22): verde desde 99,9 %. */
export const AVAILABILITY_GOAL = 0.999;
/** Ámbar desde 99 %; por debajo, rojo. */
export const AVAILABILITY_FLOOR = 0.99;

/**
 * Fronteras de color de celda y tracker (1, 99,9 %, 99 %), en centésimas de punto. Una cifra
 * nunca se muestra cruzando una (AI-EM-ARCH 2026-11-22): si el redondeo la llevaría a la
 * frontera estando por debajo, se trunca.
 */
const COLOR_BOUNDARIES_BP = [BASIS_POINTS, 9990, 9900] as const;

/**
 * Cifra mostrada, en centésimas de punto: redondeo a 2 decimales (F3-D6), salvo junto a una
 * frontera de color, donde se trunca (0,99899 → 99,89 %; 0,99996 → 99,99 %).
 * Solo para mostrar: el tono compara la razón exacta.
 */
function displayedBasisPoints(value: number): number {
  const bp = Math.round(value * BASIS_POINTS);
  const crosses = COLOR_BOUNDARIES_BP.some(
    (boundary) => value < boundary / BASIS_POINTS && bp >= boundary,
  );
  return crosses ? Math.floor(value * BASIS_POINTS) : bp;
}

/**
 * Tono de la celda «Disponibilidad, 30 días» frente a la meta prometida a las empresas.
 * Razón exacta (TCR-ola1 4c): 99,8958 % incumple la meta aunque esté a una centésima.
 */
export function availabilityGoalTone(
  value: number,
): Extract<Tone, 'success' | 'warning' | 'error'> {
  if (value >= AVAILABILITY_GOAL) return 'success';
  if (value >= AVAILABILITY_FLOOR) return 'warning';
  return 'error';
}

export function formatPercent(value: number): string {
  return COPY.availabilityValue(displayedBasisPoints(value) / 100);
}
