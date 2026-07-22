/**
 * Separacion criptografica de las dos audiencias de token (H-01, defensa en profundidad).
 *
 * Ambos tokens —plataforma y tenant— se firman con la MISMA clave RSA. Sin
 * `iss` / `aud` diferenciados eran indistinguibles a nivel de verificacion de
 * firma, de modo que la unica frontera entre la consola de plataforma y un
 * tenant era logica de aplicacion. Con estos claims, presentar un token de
 * tenant donde se espera uno de plataforma falla en la verificacion del token,
 * antes de llegar a cualquier guard.
 *
 * `JwtStrategy` acepta ambos pares y despues exige que el par recibido case con
 * el claim `type` del payload.
 */

/** Prefijo comun de emisor. */
const JWT_ISSUER_BASE = 'iwana-next';

/** Emisor de los tokens de usuarios de plataforma (PlatformUser). */
export const JWT_ISSUER_PLATFORM = `${JWT_ISSUER_BASE}/platform`;

/** Emisor de los tokens de usuarios de tenant (User). */
export const JWT_ISSUER_TENANT = `${JWT_ISSUER_BASE}/tenant`;

/** Audiencia de la consola de plataforma. */
export const JWT_AUDIENCE_PLATFORM = `${JWT_ISSUER_BASE}:platform-api`;

/** Audiencia de la superficie de tenant. */
export const JWT_AUDIENCE_TENANT = `${JWT_ISSUER_BASE}:tenant-api`;

/** Emisores aceptados en verificacion (tupla no vacia — lo exige jsonwebtoken). */
export const JWT_ACCEPTED_ISSUERS: [string, ...string[]] = [JWT_ISSUER_PLATFORM, JWT_ISSUER_TENANT];

/** Audiencias aceptadas en verificacion (tupla no vacia — lo exige jsonwebtoken). */
export const JWT_ACCEPTED_AUDIENCES: [string, ...string[]] = [
  JWT_AUDIENCE_PLATFORM,
  JWT_AUDIENCE_TENANT,
];

/**
 * Par (iss, aud) que corresponde a cada tipo de token. Fuente unica usada
 * tanto al firmar como al validar la coherencia del token recibido.
 */
export const JWT_CLAIMS_BY_TOKEN_TYPE: Record<
  'platform' | 'tenant',
  { issuer: string; audience: string }
> = {
  platform: { issuer: JWT_ISSUER_PLATFORM, audience: JWT_AUDIENCE_PLATFORM },
  tenant: { issuer: JWT_ISSUER_TENANT, audience: JWT_AUDIENCE_TENANT },
};
