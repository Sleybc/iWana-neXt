import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from '@iwana/db';
import { TENANT_PROVISIONING_QUEUE } from '@iwana/shared';
import { TenantProvisioningProcessor } from './processors/tenant-provisioning.processor';
import { TenantSeedService } from './services/tenant-seed.service';

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
    ConfigModule.forRoot({ isGlobal: true }),

    // Conexion PostgreSQL — reutiliza la misma DataSource del paquete @iwana/db
    TypeOrmModule.forRootAsync({
      useFactory: () => AppDataSource.options,
    }),

    // Conexion Redis root para BullMQ (compartida entre todas las colas)
    BullModule.forRootAsync({
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

    // Registro de la cola — el nombre debe coincidir con el productor en @iwana/api
    BullModule.registerQueue({
      name: TENANT_PROVISIONING_QUEUE,
    }),
  ],
  providers: [TenantProvisioningProcessor, TenantSeedService],
})
export class WorkerModule {}

