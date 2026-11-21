import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import type { PublicHealth } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Endpoint de health check para Docker healthcheck y Nginx.
 *
 * GET /api/v1/health — público, sin autenticación. Contrato `PublicHealth` v1.0:
 * solo `status`, `db`, `redis` y `timestamp`. 200 si DB y Redis responden; 503 con
 * el mismo cuerpo si alguno falla, para que Docker y nginx lo vean como caído.
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
  @ApiResponse({ status: 200, description: 'DB y Redis disponibles.' })
  @ApiResponse({ status: 503, description: 'DB o Redis no disponibles; mismo cuerpo.' })
  async check(@Res({ passthrough: true }) res: Response): Promise<PublicHealth> {
    const [db, redis] = await Promise.all([
      this.dataSource.query('SELECT 1').then(
        () => 'ok' as const,
        () => 'error' as const,
      ),
      this.redis.ping().then(
        () => 'ok' as const,
        () => 'error' as const,
      ),
    ]);

    const healthy = db === 'ok' && redis === 'ok';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'ok' : 'degraded',
      db,
      redis,
      timestamp: new Date().toISOString(),
    };
  }
}
