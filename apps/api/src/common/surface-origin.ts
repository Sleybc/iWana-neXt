import type { NextFunction, Request, Response } from 'express';

/** Origen del vhost por el que entró la petición. La escribe nginx; no la fija el cliente. */
export const SURFACE_ORIGIN_HEADER = 'x-iwana-origin';

/**
 * Consola y portal comparten API y cookies de mismo sitio: cada vhost admite solo su propio
 * origen, y solo si está en `CORS_ORIGIN`. El resto se corta antes de CORS y de las rutas.
 * En desarrollo no hay nginx y decide CORS, como siempre.
 */
export function surfaceOriginMiddleware(allowedOrigins: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    const enforced = ['production', 'staging'].includes(process.env['NODE_ENV'] ?? '');
    if (
      !enforced ||
      origin === undefined ||
      (origin === request.headers[SURFACE_ORIGIN_HEADER] && allowedOrigins.includes(origin))
    ) {
      next();
      return;
    }
    response.status(403).json({ statusCode: 403, error: 'Forbidden', message: 'Forbidden' });
  };
}
