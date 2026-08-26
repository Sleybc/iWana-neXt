import { createHash } from 'node:crypto';
import { TenantContext } from '@iwana/db';

interface RateLimitRequestLike {
  headers?: {
    authorization?: string | string[] | undefined;
    [header: string]: string | string[] | undefined;
  };
  ip?: string | undefined;
  iwanaTenantResolutionSource?: 'jwt-verified' | 'public-header' | 'none' | undefined;
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
    // incluso un bearer acompañado de X-Tenant-Slug comparte el bucket IP.
    return `anonymous:ip:${request.ip ?? 'unknown'}`;
  }

  if (bearerToken) {
    const tokenHash = createHash('sha256').update(bearerToken).digest('hex');
    return `${tenantId}:bearer:${tokenHash}`;
  }

  // Cookies autenticadas no están disponibles en request.user todavía;
  // quedan limitadas al bucket del tenant.
  return `${tenantId}:tenant`;
}
