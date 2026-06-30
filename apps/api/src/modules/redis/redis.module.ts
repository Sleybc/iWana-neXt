import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Token de inyeccion del cliente Redis.
 * Se inyecta como dependencia en estrategias y servicios que necesitan Redis.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Modulo global de Redis.
 *
 * Expone un cliente ioredis configurado desde las variables de entorno.
 * Es global para que cualquier modulo que necesite Redis pueda inyectarlo
 * sin importar RedisModule explicitamente.
 *
 * Variables de entorno requeridas:
 *   REDIS_HOST: host del servidor Redis (default: localhost)
 *   REDIS_PORT: puerto Redis (default: 6379)
 *   REDIS_PASSWORD: password Redis (opcional, default: vacio)
 *   REDIS_DB: base de datos Redis (default: 0)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/auth — JTI blacklist)
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        return new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB', 0),
          // Reconnect automaticamente en caso de desconexion
          retryStrategy: (times: number) => Math.min(times * 100, 3000),
          // Nombre para identificar la conexion en logs de Redis
          connectionName: 'iwana-api',
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
