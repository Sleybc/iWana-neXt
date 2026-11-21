import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisModule } from '../redis/redis.module';

/**
 * Módulo de health check.
 * Provee GET /api/v1/health para Docker healthcheck y monitoreo externo.
 * La telemetría del relay vive en `GET /tasks/execution-orders/health/relay`, con guards.
 */
@Module({
  imports: [RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
