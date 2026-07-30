import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisModule } from '../redis/redis.module';
import { TasksModule } from '../tasks/tasks.module';

/**
 * Módulo de health check.
 * Provee GET /api/v1/health para Docker healthcheck y monitoreo externo.
 */
@Module({
  imports: [RedisModule, TasksModule],
  controllers: [HealthController],
})
export class HealthModule {}
