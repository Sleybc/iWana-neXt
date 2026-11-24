/**
 * Nombres de las cookies de sesión (ADR-081, condición C-5).
 *
 * Cada audiencia tiene su propio nombre: un token de tenant nunca se presenta
 * donde se espera uno de plataforma y viceversa (ADR-061). El prefijo
 * `__Host-` solo se aplica a las cookies de access en producción: exige
 * `Path=/` y `Secure`, que son exactamente las opciones de la cookie de access.
 * Las cookies de refresh conservan su `path: '/api/v1/auth'` y por eso nunca
 * llevan el prefijo.
 *
 * Los nombres se resuelven como funciones para que la decisión lea `NODE_ENV`
 * en tiempo de llamada y sea comprobable en tests.
 */
export const SESSION_COOKIE_BASE_NAMES = {
  accessTenant: 'portalAccessToken',
  accessPlatform: 'webAccessToken',
  refreshTenant: 'refreshToken',
  refreshPlatform: 'webRefreshToken',
} as const;

/** Prefijo `__Host-`: solo donde la cookie va con `Path=/` y `Secure`. */
function withHostPrefix(baseName: string): string {
  return process.env['NODE_ENV'] === 'production' ? `__Host-${baseName}` : baseName;
}

/** Cookie de access del portal (audiencia tenant): cubre `Path=/`. */
export function tenantAccessCookieName(): string {
  return withHostPrefix(SESSION_COOKIE_BASE_NAMES.accessTenant);
}

/** Cookie de access de la consola de plataforma: cubre `Path=/`. */
export function platformAccessCookieName(): string {
  return withHostPrefix(SESSION_COOKIE_BASE_NAMES.accessPlatform);
}

/** Cookie de refresh del portal (audiencia tenant) — sin prefijo, path restringido. */
export function tenantRefreshCookieName(): string {
  return SESSION_COOKIE_BASE_NAMES.refreshTenant;
}

/** Cookie de refresh de la consola de plataforma — sin prefijo, path restringido. */
export function platformRefreshCookieName(): string {
  return SESSION_COOKIE_BASE_NAMES.refreshPlatform;
}

/**
 * ¿Las cookies de sesión llevan `Secure`? (ADR-081, C-5)
 *
 * En producción el flag no puede quedar en `false` (app.config.ts lo fuerza en
 * el esquema Joi). Este cálculo lo replica en runtime porque ConfigModule no
 * escribe los defaults validados de vuelta en `process.env`, y las opciones de
 * cookie se leen directamente de ahí. Fuera de producción conserva el valor
 * real de `COOKIE_SECURE` (HTTP on-prem de desarrollo sin TLS).
 */
export function isCookieSecure(): boolean {
  return process.env['NODE_ENV'] === 'production' || process.env['COOKIE_SECURE'] === 'true';
}

/** Cabecera con la que la consola declara qué sesión de navegador usa. */
export const SESSION_AUDIENCE_HEADER = 'x-session-audience';

export type SessionAudience = 'tenant' | 'platform';

interface SessionRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: unknown;
}

function headerValue(req: SessionRequest, name: string): string {
  const value = req.headers[name];
  // Node une las cabeceras repetidas con comas: cuenta la primera.
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(',')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Superficie que hace la petición, o `null` si no la declara.
 *
 * Las cookies no distinguen puertos: con consola y portal en la misma IP el
 * navegador envía las de ambos. La consola se declara con
 * `X-Session-Audience: platform`; el portal, con `X-Tenant-Slug`.
 *
 * Solo elige entre credenciales que el navegador ya envió. No autoriza ni
 * resuelve el tenant: ambas cosas salen del token firmado (ADR-061, C-1).
 */
export function declaredSessionAudience(req: SessionRequest): SessionAudience | null {
  const declared = headerValue(req, SESSION_AUDIENCE_HEADER);
  if (declared === 'platform' || declared === 'tenant') {
    return declared;
  }
  return headerValue(req, 'x-tenant-slug') ? 'tenant' : null;
}

/**
 * Cookies de access utilizables por la petición, en orden. Con superficie
 * declarada, solo la suya; sin declarar, se conserva el orden tenant → plataforma.
 */
export function accessCookieCandidates(req: SessionRequest): string[] {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const tenant = cookies[tenantAccessCookieName()];
  const platform = cookies[platformAccessCookieName()];
  const audience = declaredSessionAudience(req);
  const candidates =
    audience === 'platform' ? [platform] : audience === 'tenant' ? [tenant] : [tenant, platform];
  return candidates.filter((token): token is string => Boolean(token));
}
