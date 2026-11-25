import { ConfigService } from '@nestjs/config';

/**
 * TTL de los tokens de sesion: duraciones configurables con default seguro.
 *
 * `JWT_ACCESS_EXPIRATION` y `JWT_REFRESH_EXPIRATION` se validan al arranque en
 * el schema Joi de `app.config.ts` (formato `<numero><s|m|h|d>` y minimos por
 * audiencia). Estos resolvers son la unica lectura del valor efectivo, tanto
 * para la firma del JWT (`expiresIn` en auth.service.ts) como para el `maxAge`
 * de las cookies de sesion (auth.controller.ts): la cookie DEBE vivir
 * exactamente lo que vive el token, si no el navegador soltaria una credencial
 * aun valida o conservaria una muerta.
 */

/** TTL por defecto del access token: 15 minutos. */
export const DEFAULT_ACCESS_TOKEN_TTL = '15m';

/** TTL por defecto del refresh token: 7 dias. */
export const DEFAULT_REFRESH_TOKEN_TTL = '7d';

/** Formato aceptado: entero positivo + unidad (segundos, minutos, horas o dias). */
const DURATION_PATTERN = /^(\d+)([smhd])$/;

/** Segundos por unidad admitida. */
const UNIT_TO_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * TTL minimo del access token en segundos (aplicado por Joi al arranque):
 * un valor menor solo puede ser un error de configuracion, no una politica.
 */
export const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;

/**
 * Convierte una duracion tipo `'15m'` | `'7d'` a segundos.
 *
 * Parser puro y tolerante: si el valor falta o es invalido devuelve el
 * fallback. El schema Joi ya rechaza configuracion invalida al arrancar; el
 * fallback cubre lecturas fuera del bootstrap validado (tests, CLIs) para que
 * el runtime nunca quede sin TTL.
 */
export function parseDurationToSeconds(raw: string | undefined, fallbackSeconds: number): number {
  if (!raw) {
    return fallbackSeconds;
  }

  const match = DURATION_PATTERN.exec(raw.trim());
  if (!match) {
    return fallbackSeconds;
  }

  const value = Number(match[1]);
  const unitSeconds = match[2] !== undefined ? UNIT_TO_SECONDS[match[2]] : undefined;
  if (unitSeconds === undefined || !Number.isFinite(value)) {
    return fallbackSeconds;
  }

  const seconds = value * unitSeconds;
  return seconds > 0 ? seconds : fallbackSeconds;
}

/** Lee `JWT_ACCESS_EXPIRATION` y la resuelve a segundos (default 15 min). */
export function resolveAccessTokenTtlSeconds(config: ConfigService): number {
  return parseDurationToSeconds(
    config.get<string | undefined>('JWT_ACCESS_EXPIRATION'),
    parseDurationToSeconds(DEFAULT_ACCESS_TOKEN_TTL, 15 * 60),
  );
}

/** Lee `JWT_REFRESH_EXPIRATION` y la resuelve a segundos (default 7 dias). */
export function resolveRefreshTokenTtlSeconds(config: ConfigService): number {
  return parseDurationToSeconds(
    config.get<string | undefined>('JWT_REFRESH_EXPIRATION'),
    parseDurationToSeconds(DEFAULT_REFRESH_TOKEN_TTL, 7 * 24 * 60 * 60),
  );
}

/** Vida absoluta de la sesión desde el ingreso, por superficie. Es también su tope en producción. */
export const SESSION_MAX_DEFAULTS = {
  platform: { env: 'SESSION_MAX_PLATFORM', value: '12h', seconds: 12 * 60 * 60 },
  tenant: { env: 'SESSION_MAX_TENANT', value: '30d', seconds: 30 * 24 * 60 * 60 },
} as const;

export function resolveSessionMaxSeconds(
  config: ConfigService,
  surface: keyof typeof SESSION_MAX_DEFAULTS,
): number {
  const { env, seconds } = SESSION_MAX_DEFAULTS[surface];
  return parseDurationToSeconds(config.get<string | undefined>(env), seconds);
}

/** Plazos de una sesión en un instante; null si ya superó su máximo. */
export interface SessionWindow {
  startedAt: Date;
  expiresAt: Date;
  accessSeconds: number;
  refreshSeconds: number;
}

export function sessionWindow(
  startedAt: Date,
  ttl: { access: number; refresh: number; max: number },
  now = Date.now(),
): SessionWindow | null {
  const started = startedAt.getTime();
  if (Number.isNaN(started) || started > now) return null;
  const expires = Math.min(now + ttl.refresh * 1000, started + ttl.max * 1000);
  const refreshSeconds = Math.floor((expires - now) / 1000);
  if (refreshSeconds < 1) return null;
  return {
    startedAt,
    expiresAt: new Date(expires),
    accessSeconds: Math.min(ttl.access, refreshSeconds),
    refreshSeconds,
  };
}
