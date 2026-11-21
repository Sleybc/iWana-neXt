import { ContractMediaSweepProcessor } from './processors/contract-media-sweep.processor';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataSourceOptions, SafeTypeOrmLogger } from '@iwana/db';
import { WORKER_ENTITIES } from './worker-entities';
import { createStorageAdapter, STORAGE_PORT, type StoragePort } from '@iwana/storage';
import { WORKER_QUEUE_NAMES } from './worker-queues';
import { AssuranceFieldServiceProcessor } from './processors/assurance-field-service.processor';
import { RefreshTokenPurgeProcessor } from './processors/refresh-token-purge.processor';
import { TenantSchemaPurgeProcessor } from './processors/tenant-schema-purge.processor';
import { TenantProvisioningProcessor } from './processors/tenant-provisioning.processor';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { SearchIndexWorkerService } from './search/search-index.worker.service';
import { SearchNavigationCatalogService } from './search/search-navigation-catalog.service';
import { SearchTypesenseClient } from './search/search-typesense.client';
import { SchedulerService } from './services/scheduler.service';
import {
  ExecutionOrderRelayService,
  RELAY_SCAN_TIMESTAMP_REDIS,
} from './services/execution-order-relay.service';
import { ExecutionOrderInventoryRescanService } from './services/execution-order-inventory-rescan.service';
import { ExecutionOrderEventsProcessor } from './processors/execution-order-events.processor';
import { ExecutionOrderRelayProcessor } from './processors/execution-order-relay.processor';
import { ExecutionOrderTombstoneProcessor } from './processors/execution-order-tombstone.processor';
import { ExecutionOrderDlqProcessor } from './processors/execution-order-dlq.processor';
import { ExpiredScheduleEventsProcessor } from './processors/expired-schedule-events.processor';
import { EvidenceOrphanDetectionProcessor } from './processors/evidence-orphan-detection.processor';
import { TenantSeedService } from './services/tenant-seed.service';
import { EvidenceAnalysisProcessor } from './processors/evidence-analysis.processor';
import { ContractPdfProcessor } from './processors/contract-pdf.processor';
import { ContractPdfRenderer } from './contracts/contract-pdf-renderer';
import { validateWorkerConfiguration } from './worker.config';
import { WorkerHeartbeatService } from './services/worker-heartbeat.service';
import { PlatformHealthSamplerProcessor } from './processors/platform-health-sampler.processor';

const runtimeEnv = process.env['NODE_ENV'];
const workerDevelopmentLocalEnvPath = resolve(__dirname, '../../../.env.development.local');
const workerEnvFilePath =
  runtimeEnv === 'test'
    ? [resolve(__dirname, '../../../.env.test')]
    : runtimeEnv === 'development'
      ? [resolve(__dirname, '../../../.env.development')]
      : null;

if (runtimeEnv === 'development') {
  preloadDevelopmentLocalEnv(workerDevelopmentLocalEnvPath);
}

function preloadDevelopmentLocalEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const fileContent = readFileSync(filePath, 'utf8');

  for (const rawLine of fileContent.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const currentValue = process.env[key];

    if (!currentValue || currentValue.startsWith('CHANGE_ME_')) {
      process.env[key] = value;
    }
  }
}

function createWorkerStorageAdapter(config: ConfigService): StoragePort {
  const driver = config.get<string>('STORAGE_DRIVER', 'local') as 'minio' | 'local';
  const forcePathStyleSetting = config.get<boolean | string>('S3_FORCE_PATH_STYLE', true);
  const forcePathStyle =
    typeof forcePathStyleSetting === 'boolean'
      ? forcePathStyleSetting
      : forcePathStyleSetting.trim().toLowerCase() === 'true';

  if (driver === 'minio') {
    return createStorageAdapter({
      driver: 'minio',
      minio: {
        endpoint: config.get<string>('S3_ENDPOINT', 'http://minio:9000'),
        region: config.get<string>('S3_REGION', 'us-east-1'),
        accessKeyId: config.get<string>('S3_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY', ''),
        bucket: config.get<string>('S3_BUCKET', 'iwana-media'),
        forcePathStyle,
        ...(config.get<string>('S3_PUBLIC_BASE_URL')
          ? { publicBaseUrl: config.get<string>('S3_PUBLIC_BASE_URL') as string }
          : {}),
      },
    });
  }

  return createStorageAdapter({
    driver: 'local',
    localBasePath: resolve(process.cwd(), 'storage', 'media'),
    localPublicBaseUrl: `${config.get('API_PUBLIC_BASE_URL', `http://localhost:${config.get('PORT', 3000)}`)}/storage`,
  });
}

/**
 * Modulo raiz del Worker iWana neXt.
 *
 * Sprint 1 Semana 2 — Implementacion completa.
 * Registra:
 * - ConfigModule: lee variables de entorno (.env) para todos los providers
 * - TypeOrmModule: conexion PostgreSQL compartida con @iwana/db (AppDataSource)
 * - BullModule (root): conexion Redis para consumir colas
 * - BullModule (queue: tenant-provisioning): cola de provisioning de schemas
 * - TenantProvisioningProcessor: consumer que ejecuta DDL de schemas nuevos
 *
 * El worker NO expone HTTP — arranca con app.init() sin app.listen().
 * Ver main.ts para el bootstrap.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (Async workers)
 * ADR-020: BullMQ para jobs asincronos
 */
@Module({
  imports: [
    DiscoveryModule,
    // Variables de entorno disponibles en todos los providers del worker
    ConfigModule.forRoot({
      isGlobal: true,
      // En contenedor la fuente de verdad debe ser process.env inyectado.
      // En desarrollo local, .env.development.local se precarga en process.env
      // antes del template versionado .env.development y sin mezclar .env de producción.
      ignoreEnvFile: runtimeEnv === 'production' || runtimeEnv === 'staging',
      ...(workerEnvFilePath ? { envFilePath: workerEnvFilePath } : {}),
      ...(runtimeEnv !== 'test' ? { validate: validateWorkerConfiguration } : {}),
    }),

    // Runtime TypeORM: DB_USER (rol app). DDL de provisioning usa
    // resolveMigrationDbCredentials() en TenantProvisioningProcessor (SEC-04).
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'iwana'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'iwana'),
        entities: WORKER_ENTITIES,
        migrations: dataSourceOptions.migrations ?? [],
        migrationsTableName: dataSourceOptions.migrationsTableName ?? 'typeorm_migrations',
        migrationsRun: false,
        synchronize: false,
        ssl: false,
        logging:
          config.get<string>('NODE_ENV') !== 'production' ? ['error', 'migration'] : ['error'],
        logger: new SafeTypeOrmLogger(),
        extra: dataSourceOptions.extra,
        autoLoadEntities: true,
      }),
    }),

    // Conexion Redis root para BullMQ (compartida entre todas las colas)
    BullModule.forRootAsync({
      extraOptions: { manualRegistration: true },
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
      inject: [ConfigService],
    }),

    // Colas del worker: lista única en worker-queues.ts (también la usa el muestreador de salud).
    ...WORKER_QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: createWorkerStorageAdapter,
      inject: [ConfigService],
    },
    {
      provide: RELAY_SCAN_TIMESTAMP_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB', 0),
          connectionName: 'iwana-worker-relay-telemetry',
          lazyConnect: false,
        }),
    },
    TenantProvisioningProcessor,
    TenantSeedService,
    RefreshTokenPurgeProcessor,
    TenantSchemaPurgeProcessor,
    AssuranceFieldServiceProcessor,
    SearchIndexProcessor,
    SearchIndexWorkerService,
    SearchNavigationCatalogService,
    SearchTypesenseClient,
    SchedulerService,
    WorkerHeartbeatService,
    ExecutionOrderRelayService,
    ExecutionOrderInventoryRescanService,
    ExecutionOrderEventsProcessor,
    ExecutionOrderRelayProcessor,
    ExecutionOrderTombstoneProcessor,
    ExecutionOrderDlqProcessor,
    EvidenceOrphanDetectionProcessor,
    ContractMediaSweepProcessor,
    EvidenceAnalysisProcessor,
    ExpiredScheduleEventsProcessor,
    ContractPdfRenderer,
    ContractPdfProcessor,
    PlatformHealthSamplerProcessor,
  ],
})
export class WorkerModule {}
