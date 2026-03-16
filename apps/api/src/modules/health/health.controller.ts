import { Controller, Get, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Public } from '../auth/decorators/public.decorator';

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
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — verifica DB y Redis' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    db: 'ok' | 'error';
    redis: 'ok' | 'error';
    timestamp: string;
  }> {
    let dbStatus: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';

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

    return {
      status: dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
