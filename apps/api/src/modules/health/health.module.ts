import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformHealthSample } from '@iwana/db';
import { HealthController } from './health.controller';
import { PlatformHealthController } from './platform-health.controller';
import { PlatformHealthHistoryService } from './platform-health-history.service';
import { RedisModule } from '../redis/redis.module';

/**
 * Módulo de health check.
 * Provee GET /api/v1/health para Docker healthcheck y monitoreo externo.
 * La telemetría del relay vive en `GET /tasks/execution-orders/health/relay`, con guards.
 * `GET /platform/health/history` lee `public.platform_health_samples`, que este módulo
 * posee en el API (la escribe el muestreador del worker).
 */
@Module({
  imports: [RedisModule, TypeOrmModule.forFeature([PlatformHealthSample])],
  controllers: [HealthController, PlatformHealthController],
  providers: [PlatformHealthHistoryService],
})
export class HealthModule {}
