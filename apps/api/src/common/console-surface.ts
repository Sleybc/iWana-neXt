import type { NextFunction, Request, Response } from 'express';

/** Vhost por el que entró la petición. nginx la sobrescribe en todos: no la fija el cliente. */
export const SURFACE_HEADER = 'x-iwana-surface';

interface SurfaceRequest {
  headers: Record<string, string | string[] | undefined>;
}

/** Detrás de nginx, plataforma solo se alcanza desde la consola; en desarrollo nadie marca. */
export function isConsoleSurface(request: SurfaceRequest): boolean {
  if (!['production', 'staging'].includes(process.env['NODE_ENV'] ?? '')) return true;
  return request.headers[SURFACE_HEADER] === 'console';
}

/** Rutas de `/tenants` que usa el portal; las demás son de plataforma. */
const PORTAL_TENANT_PATHS = /^tenants\/(?:me|public-branding)(?:\/|$)/u;
const PLATFORM_PATHS =
  /^(?:auth\/platform|platform|platform-users|platform-audit-logs|tenants)(?:\/|$)/u;

/** Express no distingue mayúsculas ni barra final en las rutas: aquí tampoco. */
export function isPlatformPath(path: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return true;
  }
  const route = decoded
    .toLowerCase()
    .replace(/\/{2,}/gu, '/')
    .replace(/^\/api\/v1\//u, '');
  return PLATFORM_PATHS.test(route) && !PORTAL_TENANT_PATHS.test(route);
}

/**
 * Cubre también las rutas públicas de plataforma (ingreso, alta inicial), que no llevan token.
 * Responde como una ruta inexistente: no confirma la superficie.
 */
export function consoleSurfaceMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (isConsoleSurface(request) || !isPlatformPath(request.path)) {
    next();
    return;
  }
  response.status(404).json({ statusCode: 404, error: 'Not Found', message: 'Not Found' });
}
