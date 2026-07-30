import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { TenantContext } from '@iwana/db';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { REDIS_CLIENT } from '../../redis/redis.module';

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
const REDIS_COMMAND_TIMEOUT_MS = 100;
const RATE_LIMIT_KEY_PREFIX = 'operations-rate';

/** Incrementa el bucket y fija su expiración en una única operación Redis. */
const INCREMENT_BUCKET_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

type HttpRequest = {
  url?: string;
  method?: string;
  ip?: string;
  user?: JwtPayload;
};

type HttpResponse = {
  setHeader: (name: string, value: string) => void;
};

/**
 * Guard tenant-aware para rate limiting de endpoints de OT de ejecución.
 *
 * Deriva actor y tenant del JWT ya verificado y aplica límites diferenciados
 * por tipo de endpoint. El store es Redis compartido con BullMQ para que el
 * límite sea consistente entre réplicas de la API.
 *
 * Carpetas:
 * - lightweight-read: 120 req/min (GET)
 * - sensitive-command: 20 req/min (POST mutaciones)
 * - evidence-media: 10 req/min (POST evidencia/media)
 */
@Injectable()
export class TenantAwareThrottlerGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();

    const bucket = this.resolveBucket(request);
    const limit = BUCKET_LIMITS[bucket];
    if (!limit) return true; // Sin límite definido, permitir

    const { actorId, tenantId } = this.resolveIdentity(request);
    const key = `${RATE_LIMIT_KEY_PREFIX}:${bucket}:${actorId}:${tenantId}`;
    const resetAt = Date.now() + WINDOW_MS;

    let count: number;
    try {
      count = await this.incrementBucket(key);
    } catch {
      // El bypass de rate limit ante una caída de Redis no es aceptable para
      // comandos operativos: se falla cerrado sin exponer detalles internos.
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_STORE_UNAVAILABLE',
        message: 'El control de solicitudes no esta disponible temporalmente.',
      });
    }

    const remaining = Math.max(0, limit - count);
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > limit) {
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

  private async incrementBucket(key: string): Promise<number> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.redis.eval(INCREMENT_BUCKET_SCRIPT, 1, key, String(WINDOW_MS)) as Promise<number>,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis rate limit command timed out')),
            REDIS_COMMAND_TIMEOUT_MS,
          );
        }),
      ]);

      if (!Number.isInteger(result) || result < 1) {
        throw new Error('Redis rate limit command returned an invalid count');
      }

      return result;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private resolveIdentity(request: HttpRequest): { actorId: string; tenantId: string } {
    const user = request.user;
    if (!user?.sub || !user.tenantId) {
      throw new UnauthorizedException('El contexto autenticado de actor y tenant es requerido.');
    }

    try {
      const contextTenantId = TenantContext.getOrThrow().tenantId;
      if (contextTenantId !== user.tenantId) {
        throw new UnauthorizedException('El contexto de tenant no coincide con el token.');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Los tests unitarios pueden no instalar TenantMiddleware; el tenant
      // sigue siendo exclusivamente el claim verificado del JWT.
    }

    return { actorId: user.sub, tenantId: user.tenantId };
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
