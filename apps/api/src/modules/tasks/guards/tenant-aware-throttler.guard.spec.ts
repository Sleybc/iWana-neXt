import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TenantAwareThrottlerGuard } from './tenant-aware-throttler.guard';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrderTemplatesController } from '../execution-order-templates.controller';

/** Clave de metadato de `@SkipThrottle()` (no se exporta desde el índice). */
// El guard de @nestjs/throttler busca `THROTTLER:SKIP` + el NOMBRE del
// throttler, y `ThrottlerModule.forRoot` lo declara como `global`. Con
// `default` el salto sería silenciosamente inefectivo.
const THROTTLER_SKIP_GLOBAL = 'THROTTLER:SKIPglobal';

/** Espejo de `BUCKET_LIMITS` del guard: los tres buckets con límite definido. */
const BUCKET_LIMITS_FOR_TEST: Record<string, number> = {
  'eo-lightweight-read': 120,
  'eo-sensitive-command': 20,
  'eo-evidence-media': 10,
};

describe('TenantAwareThrottlerGuard', () => {
  it('rechaza antes de Redis cuando falta TenantContext', async () => {
    const redis = { eval: jest.fn() };
    const setHeader = jest.fn();
    const request = {
      method: 'POST',
      url: '/tasks/execution-orders/order-001/start',
      user: {
        sub: 'actor-001',
        email: 'hash',
        role: 'TECHNICIAN',
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      } as JwtPayload,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    const guardWithRedis = new TenantAwareThrottlerGuard(redis as never);

    await expect(guardWithRedis.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.eval).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('devuelve 503 en una mutación cuando el harness no registra Redis', async () => {
    const guard = new TenantAwareThrottlerGuard(undefined);
    const setHeader = jest.fn();
    const request = {
      method: 'POST',
      url: '/tasks/execution-orders/order-001/start',
      user: {
        sub: 'actor-001',
        email: 'hash',
        role: 'TECHNICIAN',
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      } as JwtPayload,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    await TenantContext.run(
      { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'test' },
      async () => {
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );
    expect(setHeader).not.toHaveBeenCalled();
  });

  // QA-33 — aislamiento del bucket por actor/tenant y fail-closed ante Redis.
  // El doble simula el INCR del script Lua con un contador por clave; el guard
  // solo ve la misma superficie de ioredis que en producción (eval → count).
  describe('QA-33: aislamiento del bucket y fail-closed con Redis', () => {
    type CountingRedis = {
      eval: jest.Mock;
      counters: Map<string, number>;
    };

    function createCountingRedis(fail: boolean): CountingRedis {
      const counters = new Map<string, number>();
      const evalMock = jest.fn((_script: string, _numKeys: number, key: string) => {
        if (fail) return Promise.reject(new Error('Redis store no disponible'));
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return Promise.resolve(next);
      });
      return { eval: evalMock, counters };
    }

    function buildContext(sub: string, tenantId: string) {
      const setHeader = jest.fn();
      const request = {
        method: 'GET',
        url: '/tasks/execution-orders/order-001',
        user: {
          sub,
          email: 'hash',
          role: 'NOC',
          tenantId,
          schemaName: `tenant_${tenantId}`,
          jti: `jti-${sub}`,
          type: 'tenant',
        } as JwtPayload,
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({ setHeader }),
        }),
      } as unknown as ExecutionContext;
      return { context, setHeader };
    }

    it('agota el bucket de un actor sin consumir el de otro actor del mismo tenant', async () => {
      const { eval: evalMock, counters } = createCountingRedis(false);
      const guard = new TenantAwareThrottlerGuard({ eval: evalMock } as never);
      const actorA = buildContext('actor-a', 'tenant-1');
      const actorB = buildContext('actor-b', 'tenant-1');

      await TenantContext.run(
        { tenantId: 'tenant-1', schemaName: 'tenant_1', tenantSlug: 'tenant-one' },
        async () => {
          for (let i = 0; i < 120; i += 1) {
            await expect(guard.canActivate(actorA.context)).resolves.toBe(true);
          }
          // La 121ª lectura del actor A supera el límite de 120/min.
          await expect(guard.canActivate(actorA.context)).rejects.toMatchObject({
            status: 429,
          });
          // El bucket del actor B nace vacío: su primera lectura pasa con
          // cuota completa a pesar del 429 del actor A.
          await expect(guard.canActivate(actorB.context)).resolves.toBe(true);
        },
      );

      // Cuota intacta: tras su primera lectura quedan 119 de 120.
      expect(actorB.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '119');
      expect(counters.get('operations-rate:eo-lightweight-read:actor-a:tenant-1')).toBe(121);
      expect(counters.get('operations-rate:eo-lightweight-read:actor-b:tenant-1')).toBe(1);
    });

    it('agota el bucket de un tenant sin consumir el del mismo actor en otro tenant', async () => {
      const { eval: evalMock, counters } = createCountingRedis(false);
      const guard = new TenantAwareThrottlerGuard({ eval: evalMock } as never);
      const tenantA = buildContext('actor-1', 'tenant-a');
      const tenantB = buildContext('actor-1', 'tenant-b');

      await TenantContext.run(
        { tenantId: 'tenant-a', schemaName: 'tenant_a', tenantSlug: 'tenant-a' },
        async () => {
          for (let i = 0; i < 120; i += 1) {
            await expect(guard.canActivate(tenantA.context)).resolves.toBe(true);
          }
          await expect(guard.canActivate(tenantA.context)).rejects.toMatchObject({
            status: 429,
          });
        },
      );
      await TenantContext.run(
        { tenantId: 'tenant-b', schemaName: 'tenant_b', tenantSlug: 'tenant-b' },
        async () => {
          await expect(guard.canActivate(tenantB.context)).resolves.toBe(true);
        },
      );

      expect(counters.get('operations-rate:eo-lightweight-read:actor-1:tenant-a')).toBe(121);
      expect(counters.get('operations-rate:eo-lightweight-read:actor-1:tenant-b')).toBe(1);
      // Cuota intacta: tras su primera lectura quedan 119 de 120.
      expect(tenantB.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '119');
    });

    it('falla cerrado con 503 y sin headers cuando Redis no responde', async () => {
      const { eval: evalMock } = createCountingRedis(true);
      const guard = new TenantAwareThrottlerGuard({ eval: evalMock } as never);
      const { context, setHeader } = buildContext('actor-1', 'tenant-1');

      await TenantContext.run(
        { tenantId: 'tenant-1', schemaName: 'tenant_1', tenantSlug: 'tenant-one' },
        async () => {
          await expect(guard.canActivate(context)).rejects.toMatchObject({
            status: 503,
            response: expect.objectContaining({
              code: 'RATE_LIMIT_STORE_UNAVAILABLE',
            }),
          });
        },
      );
      expect(setHeader).not.toHaveBeenCalled();
    });
  });
});

describe('Autoridad de cuota en rutas operativas', () => {
  // Regresión: el `ThrottlerGuard` global (100 req/min) corre ANTES que este
  // guard y cortaba en la petición 101, con lo que el contrato de 120 req/min
  // de `eo-lightweight-read` era inalcanzable y el 429 llegaba sin cabeceras
  // `X-RateLimit-*`. Los controladores operativos se marcan con
  // `@SkipThrottle()` para que la autoridad sea este guard. Quitar esa marca
  // devuelve el defecto: el E2E `4a. Ráfaga de requests` vuelve a romperse.
  it.each([
    ['ExecutionOrdersController', ExecutionOrdersController],
    ['ExecutionOrderTemplatesController', ExecutionOrderTemplatesController],
  ])('%s se salta el throttler global', (_name, controller) => {
    expect(Reflect.getMetadata(THROTTLER_SKIP_GLOBAL, controller)).toBe(true);
  });

  it('todo bucket resuelto tiene límite: saltarse el global no deja hueco', () => {
    const guard = new TenantAwareThrottlerGuard();
    const resolve = (
      guard as unknown as { resolveBucket: (req: { url?: string; method?: string }) => string }
    ).resolveBucket.bind(guard);

    const casos = [
      { url: '/tasks/execution-orders/1', method: 'GET' },
      { url: '/tasks/execution-orders/1/start', method: 'POST' },
      { url: '/tasks/execution-orders/1/evidence-assets', method: 'POST' },
      { url: '/tasks/execution-order-templates', method: 'GET' },
      { url: '/tasks/execution-orders/1', method: 'DELETE' },
    ];

    for (const caso of casos) {
      expect(BUCKET_LIMITS_FOR_TEST[resolve(caso)]).toBeGreaterThan(0);
    }
  });
});
