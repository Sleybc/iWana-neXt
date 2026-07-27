import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { TenantContext } from '@iwana/db';

/**
 * Configuración central de rate limiting por bucket.
 *
 * Límites por minuto:
 * - lightweight-read: 120 req/min
 * - sensitive-command: 20 req/min
 * - evidence-media: 10 req/min
 */
const BUCKET_LIMITS: Record<string, number> = {
  'eo-lightweight-read': 120,
  'eo-sensitive-command': 20,
  'eo-evidence-media': 10,
};

const WINDOW_MS = 60_000; // 1 minuto

/**
 * Store simple en memoria para rate limiting. En producción, esto
 * debe reemplazarse por Redis distribuido. Para el alcance de la
 * fase actual, es suficiente para desarrollo y pruebas.
 */
const rateStore = new Map<string, { count: number; resetAt: number }>();

function cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateStore) {
    if (entry.resetAt <= now) {
      rateStore.delete(key);
    }
  }
}

// Limpieza periódica cada 60 segundos (no bloquea el cierre del proceso)
const cleanupTimer = setInterval(cleanExpiredEntries, 60_000);
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

/**
 * Guard tenant-aware para rate limiting de endpoints de OT de ejecución.
 *
 * Deriva el tenant del contexto resuelto por TenantMiddleware y aplica
 * límites diferenciados por tipo de endpoint.
 *
 * Carpetas:
 * - lightweight-read: 120 req/min (GET)
 * - sensitive-command: 20 req/min (POST mutaciones)
 * - evidence-media: 10 req/min (POST evidencia/media)
 */
@Injectable()
export class TenantAwareThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      url?: string;
      method?: string;
      ip?: string;
    }>();
    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    const bucket = this.resolveBucket(request);
    const limit = BUCKET_LIMITS[bucket];
    if (!limit) return true; // Sin límite definido, permitir

    let tenantId: string;
    try {
      const ctx = TenantContext.getOrThrow();
      tenantId = ctx.tenantId;
    } catch {
      tenantId = request.ip ?? 'unknown';
    }

    const key = `${bucket}:${tenantId}`;
    const now = Date.now();

    let entry = rateStore.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + WINDOW_MS };
      rateStore.set(key, entry);
      response.setHeader('X-RateLimit-Limit', String(limit));
      response.setHeader('X-RateLimit-Remaining', String(limit - 1));
      response.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      return true;
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);

    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas solicitudes. Intente de nuevo en un momento.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveBucket(req: { url?: string; method?: string }): string {
    const url = req.url ?? '';
    const method = req.method ?? 'GET';

    // Endpoints de evidencia/media
    if (url.includes('/evidence-assets') || url.includes('/evidence')) {
      return 'eo-evidence-media';
    }

    // Comandos sensibles (POST)
    if (method !== 'GET') {
      return 'eo-sensitive-command';
    }

    // Lecturas ligeras (GET)
    return 'eo-lightweight-read';
  }
}
