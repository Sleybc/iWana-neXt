import { Controller, Get, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Public } from '../auth/decorators/public.decorator';
import {
  ExecutionOrderProjectionConvergenceService,
  type PlatformRelayTelemetry,
} from '../tasks/services/execution-order-projection-convergence.service';

/**
 * Endpoint de health check para Docker healthcheck y Nginx.
 *
 * GET /api/v1/health — público, sin autenticación.
 * Verifica conectividad con PostgreSQL y Redis.
 *
 * Usado por:
 * - Docker HEALTHCHECK en apps/api/Dockerfile
 * - Nginx en nginx/nginx.prod.conf (location /health)
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly relayTelemetry: ExecutionOrderProjectionConvergenceService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — verifica DB y Redis' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    db: 'ok' | 'error';
    redis: 'ok' | 'error';
    timestamp: string;
    relay: PlatformRelayTelemetry | { status: 'unavailable'; reason: 'telemetry_unavailable' };
  }> {
    let dbStatus: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';
    let relay: PlatformRelayTelemetry | { status: 'unavailable'; reason: 'telemetry_unavailable' } =
      {
        status: 'unavailable',
        reason: 'telemetry_unavailable',
      };

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    try {
      await this.redis.ping();
    } catch {
      redisStatus = 'error';
    }

    try {
      relay = await this.relayTelemetry.getPlatformRelayTelemetry();
    } catch {
      // La telemetría no convierte un health básico de DB/Redis en un falso
      // negativo durante una ventana de migración o una tabla aún ausente.
    }

    return {
      status: dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
      relay,
    };
  }
}
