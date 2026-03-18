import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataSourceOptions } from '@iwana/db';
import { REFRESH_TOKEN_PURGE_QUEUE, TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import { RefreshTokenPurgeProcessor } from './processors/refresh-token-purge.processor';
import { TenantProvisioningProcessor } from './processors/tenant-provisioning.processor';
import { SchedulerService } from './services/scheduler.service';
import { TenantSeedService } from './services/tenant-seed.service';

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
    // Variables de entorno disponibles en todos los providers del worker
    ConfigModule.forRoot({
      isGlobal: true,
      // En contenedor la fuente de verdad debe ser process.env inyectado.
      // En desarrollo local, .env.development.local se precarga en process.env
      // antes del template versionado .env.development y sin mezclar .env de producción.
      ignoreEnvFile: runtimeEnv === 'production' || runtimeEnv === 'staging',
      ...(workerEnvFilePath ? { envFilePath: workerEnvFilePath } : {}),
    }),

    // La configuracion se construye con ConfigService para evitar leer process.env
    // antes de que Nest cargue el archivo .env correspondiente del entorno local.
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
        entities: dataSourceOptions.entities ?? [],
        migrations: dataSourceOptions.migrations ?? [],
        migrationsTableName: dataSourceOptions.migrationsTableName ?? 'typeorm_migrations',
        migrationsRun: false,
        synchronize: false,
        ssl: false,
        logging:
          config.get<string>('NODE_ENV') !== 'production' ? ['error', 'migration'] : ['error'],
        extra: dataSourceOptions.extra,
        autoLoadEntities: true,
      }),
    }),

    // Conexion Redis root para BullMQ (compartida entre todas las colas)
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
      inject: [ConfigService],
    }),

    // Registro de la cola — el nombre debe coincidir con el productor en @iwana/api
    BullModule.registerQueue({
      name: TENANT_PROVISIONING_QUEUE,
    }),

    // Cola de purga diaria de refresh tokens expirados
    BullModule.registerQueue({
      name: REFRESH_TOKEN_PURGE_QUEUE,
    }),
  ],
  providers: [
    TenantProvisioningProcessor,
    TenantSeedService,
    RefreshTokenPurgeProcessor,
    SchedulerService,
  ],
})
export class WorkerModule {}
