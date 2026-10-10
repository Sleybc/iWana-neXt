import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { hostname } from 'node:os';
import { RELAY_SCAN_TIMESTAMP_REDIS } from './execution-order-relay.service';
import { resolveWorkerHeartbeatTiming, WORKER_HEARTBEAT_PREFIX } from './worker-heartbeat.health';

/** Publica un latido acotado para distinguir un worker activo de un PID colgado. */
@Injectable()
export class WorkerHeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly key = `${WORKER_HEARTBEAT_PREFIX}${hostname()}`;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly ttlSeconds: number;
  private timer: NodeJS.Timeout | undefined;
  private writeInFlight = false;
  private warnedAboutRedis = false;

  constructor(
    @Inject(RELAY_SCAN_TIMESTAMP_REDIS) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.enabled =
      config.get<string>('NODE_ENV') === 'production' ||
      config.get<string>('WORKER_HEARTBEAT_ENABLED') === 'true';
    const timing = resolveWorkerHeartbeatTiming(
      config.get<string>('WORKER_HEARTBEAT_INTERVAL_SECONDS'),
      config.get<string>('WORKER_HEARTBEAT_TTL_SECONDS'),
    );
    this.intervalMs = timing.intervalSeconds * 1000;
    this.ttlSeconds = timing.ttlSeconds;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      return;
    }

    void this.renewHeartbeat();
    this.timer = setInterval(() => void this.renewHeartbeat(), this.intervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async renewHeartbeat(): Promise<void> {
    if (this.writeInFlight) {
      return;
    }

    this.writeInFlight = true;
    try {
      await this.redis.set(this.key, Date.now().toString(), 'EX', this.ttlSeconds);
      this.warnedAboutRedis = false;
    } catch {
      if (!this.warnedAboutRedis) {
        this.logger.warn('No se pudo renovar el heartbeat Redis del worker.');
        this.warnedAboutRedis = true;
      }
    } finally {
      this.writeInFlight = false;
    }
  }
}
