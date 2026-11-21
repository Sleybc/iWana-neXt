/**
 * Historia de salud de plataforma — contrato P2 v1.0 congelado (2026-11-21,
 * PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0). Respuesta de
 * `GET /api/v1/platform/health/history` envuelta en `{ data }`, solo roles de
 * plataforma. Fuente: `public.platform_health_samples`. Sin datos de empresa.
 */
export type PlatformHealthComponent = 'api' | 'db' | 'redis';

export interface PlatformHealthDayComponent {
  /** Muestras del día para el componente. */
  samples: number;
  /** Muestras OK / muestras del día, 0..1; `null` si `samples = 0` (sin dato, nunca disponible). */
  availability: number | null;
}

export interface PlatformHealthDay {
  /** `YYYY-MM-DD`, día calendario America/Bogota. */
  date: string;
  components: Record<PlatformHealthComponent, PlatformHealthDayComponent>;
}

export interface PlatformQueueSnapshot {
  /** Nombre técnico de la cola; la UI lo traduce, no lo muestra. */
  name: string;
  waiting: number;
  failed: number;
  /** Segundos del trabajo en espera más viejo; `null` si no hay en espera. */
  oldestWaitingSeconds: number | null;
}

export interface PlatformHealthHistory {
  /** 30 elementos, del más antiguo al actual. */
  days: PlatformHealthDay[];
  /** Colas de la última muestra; vacío si no hay muestras. */
  queues: PlatformQueueSnapshot[];
  /** ISO 8601 de la última muestra; `null` si no hay ninguna. */
  queuesSampledAt: string | null;
  /** ISO 8601. */
  generatedAt: string;
}
