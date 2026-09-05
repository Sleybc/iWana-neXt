import { createHash } from 'node:crypto';
import { TenantContext } from '@iwana/db';

interface RateLimitRequestLike {
  headers?: {
    authorization?: string | string[] | undefined;
    [header: string]: string | string[] | undefined;
  };
  ip?: string | undefined;
  iwanaTenantResolutionSource?: 'jwt-verified' | 'public-header' | 'none' | undefined;
  /**
   * `sub` del JWT verificado, fijado por `TenantMiddleware` en la rama
   * `jwt-verified` (P-09, Ola 2). El throttler global corre despues del
   * middleware y antes de los guards JWT de cada ruta, asi que en este punto
   * ya esta disponible sin re-verificar el token.
   */
  iwanaVerifiedSub?: string | undefined;
}

/**
 * Construye el bucket sin depender de request.user: el throttler global se
 * ejecuta antes de los guards de autenticación de cada ruta.
 */
export function getGlobalRateLimitTracker(request: RateLimitRequestLike): string {
  const tenantId = TenantContext.get()?.tenantId;
  const authorization = Array.isArray(request.headers?.authorization)
    ? request.headers.authorization[0]
    : request.headers?.authorization;
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (request.iwanaTenantResolutionSource !== 'jwt-verified' || !tenantId) {
    // El guard global corre antes del JwtAuthGuard: sin marker de JWT verificado,
    // incluso un acceso presentado solo con X-Tenant-Slug comparte el bucket IP.
    return `anonymous:ip:${request.ip ?? 'unknown'}`;
  }

  // P-09: bucket por `sub` del token verificado — una empresa ya no comparte
  // una cuota de 100 req/min entre todos sus usuarios de cookie. El `sub` lo
  // fija el middleware al verificar el JWT de la peticion;
  // input del cliente. Sin `sub` (defensivo) se conserva el bucket anterior.
  if (typeof request.iwanaVerifiedSub === 'string' && request.iwanaVerifiedSub.length > 0) {
    return `${tenantId}:sub:${request.iwanaVerifiedSub}`;
  }

  if (bearerToken) {
    const tokenHash = createHash('sha256').update(bearerToken).digest('hex');
    return `${tenantId}:bearer:${tokenHash}`;
  }

  // Cookies autenticadas no están disponibles en request.user todavía;
  // quedan limitadas al bucket del tenant.
  return `${tenantId}:tenant`;
}
