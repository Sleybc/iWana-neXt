import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataSourceOptions } from '@iwana/db';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { TenantContextMissingFilter } from './common/filters/tenant-context-missing.filter';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { PlatformUsersModule } from './modules/platform-users/platform-users.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { RedisModule } from './modules/redis/redis.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantMiddleware } from './modules/tenant/tenant.middleware';
import { CrmModule } from './modules/crm/crm.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { TaxationModule } from './modules/taxation/taxation.module';
import { WfmModule } from './modules/wfm/wfm.module';
import { PartiesModule } from './modules/parties/parties.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformBrandingModule } from './modules/platform-branding/platform-branding.module';
import { SearchQueueModule } from './modules/search/search-queue.module';
import { SearchModule } from './modules/search/search.module';
import { AssuranceModule } from './modules/assurance/assurance.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TasksModule } from './modules/tasks/tasks.module';

const runtimeEnv = process.env['NODE_ENV'];
const apiDevelopmentLocalEnvPath = resolve(__dirname, '../../../.env.development.local');
const apiEnvFilePath =
  runtimeEnv === 'test'
    ? [resolve(__dirname, '../../../.env.test')]
    : runtimeEnv === 'development'
      ? [resolve(__dirname, '../../../.env.development')]
      : null;

if (runtimeEnv === 'development') {
  preloadDevelopmentLocalEnv(apiDevelopmentLocalEnvPath);
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

    // Solo rellena huecos y placeholders: no pisa lo que venga del shell o de
    // CI, que deben conservar la máxima precedencia.
    //
    // Ojo: esta función NO es lo que garantiza que `.env.development.local` gane
    // al `.env.development` versionado. Para cuando se ejecuta, el import de
    // `@iwana/db` (línea 10) ya volcó el fichero versionado entero vía
    // `ensureDatabaseEnvLoaded`, de modo que `currentValue` estaría definido y
    // este guard lo respetaría. La precedencia se fija allí, cargando el
    // `.local` primero — ver `packages/database/src/data-source.ts`. Esto queda
    // como red de seguridad para las claves que aquel mecanismo no alcance.
    if (!currentValue || currentValue.startsWith('CHANGE_ME_')) {
      process.env[key] = value;
    }
  }
}

/**
 * Modulo raiz de la aplicacion iWana neXt API — Sprint 1 Semana 2.
 *
 * Configuracion completada en Sprint 1:
 * - ConfigModule: variables de entorno con validacion
 * - TypeOrmModule: DataSource multi-tenant (schema publico por defecto)
 * - RedisModule: cliente ioredis para JTI blacklist y cache de tenant
 * - BullMQModule: configuracion global de BullMQ con Redis
 * - TenantModule: CRUD de tenants + middleware de resolucion de contexto
 * - AuthModule: JWT RS256, MFA TOTP, refresh token rotation, guards RBAC/ABAC
 * - AuditModule: interceptor global CUD + AuditService para eventos de dominio
 *
 * Completado en Sprint 1 (continuacion):
 * - UsersModule: CRUD de usuarios por tenant, RBAC, idempotencia, audit trail
 * - MailerModule: envio de correos con modo dev (Logger) y produccion (Nodemailer SMTP)
 *
 * Pendiente (Sprint 2+):
 * - ValidationPipe global configurado en main.ts
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (NestJS Modulith)
 * - ADR-019 (NestJS Modulith pattern)
 */
@Module({
  imports: [
    // Variables de entorno disponibles globalmente con validacion fail-fast en produccion
    ConfigModule.forRoot({
      isGlobal: true,
      // En Docker/produccion la fuente de verdad debe ser process.env inyectado,
      // no archivos locales que puedan haberse copiado accidentalmente a la imagen.
      // En desarrollo, .env.development.local se precarga en process.env
      // antes del template versionado .env.development.
      ignoreEnvFile: runtimeEnv === 'production' || runtimeEnv === 'staging',
      ...(apiEnvFilePath ? { envFilePath: apiEnvFilePath } : {}),
      // Validacion Joi omitida en modo test para no requerir todas las vars en CI
      ...(process.env['NODE_ENV'] !== 'test' && {
        validationSchema: Joi.object({
          NODE_ENV: Joi.string()
            .valid('development', 'staging', 'production')
            .default('development'),
          PORT: Joi.number().default(3000),
          // Base de datos (variables usadas por @iwana/db dataSourceOptions)
          DB_HOST: Joi.string().default('localhost'),
          DB_PORT: Joi.number().default(5432),
          DB_NAME: Joi.string().required(),
          DB_USER: Joi.string().required(),
          DB_PASSWORD: Joi.string().allow('').required(),
          // Redis
          REDIS_HOST: Joi.string().default('localhost'),
          REDIS_PORT: Joi.number().default(6379),
          REDIS_PASSWORD: Joi.string().allow('').optional(),
          REDIS_DB: Joi.number().default(0),
          // Claves JWT RS256 (contenido PEM; usar \\n para saltos en .env)
          JWT_PRIVATE_KEY: Joi.string().required(),
          JWT_PUBLIC_KEY: Joi.string().required(),
          // Clave AES-256-GCM: 64 caracteres hexadecimales (256 bits)
          MFA_ENCRYPTION_KEY: Joi.string().length(64).required(),
          // CORS: URI del frontend; en dev admite localhost
          CORS_ORIGIN: Joi.string().default('http://localhost:3001,http://localhost:3002'),
          // Cookie Secure: false para HTTP on-prem; true solo con HTTPS/TLS
          COOKIE_SECURE: Joi.boolean().default(false),
          APP_NAME: Joi.string().default('iWana neXt'),
          // Variables SMTP — todas opcionales; ausencia de SMTP_HOST activa modo dev en MailerService
          SMTP_HOST: Joi.string().allow('').optional(),
          SMTP_PORT: Joi.number().integer().min(1).max(65535).optional(),
          SMTP_USER: Joi.string().allow('').optional(),
          SMTP_PASS: Joi.string().allow('').optional(),
          SMTP_FROM: Joi.string().allow('').optional(),
          SMTP_SECURE: Joi.boolean().optional(),
          // URL del frontend — usada para construir enlaces en correos (forgot password, etc.)
          FRONTEND_URL: Joi.string().uri().optional(),
          // URL pública del API — usada para exponer assets locales en desarrollo.
          API_PUBLIC_BASE_URL: Joi.string().uri().optional(),
          // Storage (ADR-033): driver 'minio' en prod, 'local' solo en dev
          STORAGE_DRIVER: Joi.string().valid('minio', 'local').default('local'),
          S3_ENDPOINT: Joi.string().uri().optional(),
          S3_REGION: Joi.string().default('us-east-1'),
          S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
          S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
          S3_BUCKET: Joi.string().default('iwana-media'),
          S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
          S3_USE_SSL: Joi.boolean().default(false),
          S3_PUBLIC_BASE_URL: Joi.string().uri().optional(),
          S3_BUCKET_PUBLIC: Joi.boolean().default(false),
          TYPESENSE_HOST: Joi.string().default('localhost'),
          TYPESENSE_PORT: Joi.number().default(8108),
          TYPESENSE_PROTOCOL: Joi.string().valid('http', 'https').default('http'),
          TYPESENSE_API_KEY: Joi.string().default('CHANGE_ME_TYPESENSE_DEV_KEY'),
          TYPESENSE_TIMEOUT_MS: Joi.number().integer().min(100).default(3000),
        }),
        validationOptions: { abortEarly: false },
      }),
    }),

    // TypeORM con DataSource multi-tenant — sin synchronize, solo migraciones
    // El dataSourceOptions de @iwana/db lee process.env en tiempo de import (antes
    // que ConfigModule cargue el .env). Por eso se construye el objeto explicitamente
    // usando ConfigService, que ya tiene los valores del .env cargados.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'iwana'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'iwana_next'),
        entities: dataSourceOptions.entities ?? [],
        migrations: dataSourceOptions.migrations ?? [],
        migrationsTableName: dataSourceOptions.migrationsTableName ?? 'typeorm_migrations',
        // Correr migraciones automáticamente en producción — nunca synchronize
        migrationsRun: config.get<string>('NODE_ENV') === 'production',
        synchronize: false,
        ssl: false,
        logging:
          config.get<string>('NODE_ENV') !== 'production' ? ['error', 'migration'] : ['error'],
        extra: dataSourceOptions.extra,
        // autoLoadEntities permite que TypeOrmModule.forFeature() registre entidades
        autoLoadEntities: true,
      }),
    }),

    // Modulo de correo electronico: modo dev (Logger) o produccion (Nodemailer SMTP)
    MailerModule,

    // Redis global (JTI blacklist, cache de tenant, MFA pending secrets)
    RedisModule,

    // Rate limiting: global 100 req/min, endpoints de auth con limite mas bajo
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000, // 1 minuto en ms
        limit: 100,
      },
    ]),

    // BullMQ global configurado con Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    // Modulo de auditoria: audit trail append-only + interceptor global CUD
    AuditModule,

    // Modulo de tenants: CRUD + provisioning BullMQ
    TenantModule,

    // Modulo de autenticacion: JWT RS256 + MFA TOTP + guards
    AuthModule,

    // Modulo de usuarios: CRUD de usuarios por tenant con RBAC y audit trail
    UsersModule,

    // MOD00 Fase 03: shell federado de settings por metadata, sin ownership de datos cross-module
    ConfigurationModule,

    // MOD00 Fase 01: sedes organizacionales del tenant
    OrganizationModule,

    // MOD00 Fase 01: perfiles de acceso y catálogo de permisos tenant-aware
    AccessControlModule,

    // Modulo de perfil del usuario de plataforma (SYSTEM_ADMIN / IWANA_SUPPORT)
    PlatformUsersModule,

    // Health check — GET /api/v1/health (Docker healthcheck + monitoreo)
    HealthModule,

    // Modulo CRM: expedientes, contactos, contratos, pipeline
    CrmModule,

    // Modulo Comercial: catálogo, precios SCD, bundles, promociones, compatibilidad, tributario
    CommercialModule,

    // Modulo Taxation (MOD07): catálogo de impuestos unificado, presets DIAN, CRUD tenant-aware
    TaxationModule,

    // Modulo Parties (MOD08): gestión unificada de terceros — parties, roles, contactos
    PartiesModule,

    // Módulo Media (MOD03): subida, almacenamiento y gestión de assets de branding
    MediaModule,

    // Branding propio de la plataforma: identidad visual global de apps/web
    PlatformBrandingModule,

    // Cola transversal de indexación para búsqueda global
    SearchQueueModule,

    // Búsqueda global indexada: consulta a Typesense protegida por backend
    SearchModule,

    // Modulo WFM (MOD09) Fase 01: agenda operativa, work orders, disponibilidad de tecnicos
    WfmModule,

    // Modulo Assurance (MOD10): tickets, SLA y trazabilidad de mesa de ayuda
    AssuranceModule,

    // Modulo Inventario / SCM (MOD12): compras, stock, seriales y ledger
    InventoryModule,

    // Modulo Tasks (MOD11): ejecucion operativa transversal
    TasksModule,
  ],
  controllers: [],
  providers: [
    // AuditInterceptor registrado globalmente: intercepta todas las operaciones CUD.
    // Enruta segun jwt.type: 'platform' → platform_audit_logs, 'tenant' → <schema>.audit_logs.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Convierte la falta de contexto de tenant en 400 en vez del 500 generico
    // que producia el Error suelto de TenantContext.getOrThrow().
    { provide: APP_FILTER, useClass: TenantContextMissingFilter },
  ],
})
export class AppModule implements NestModule {
  /**
   * Aplica TenantMiddleware a las rutas que requieren contexto de tenant.
   *
   * EXCLUYE:
   * - /tenants/** (administracion de plataforma — schema publico)
   *
   * Auth y futuros modulos tenant-scoped SI pasan por este middleware:
   * - rutas protegidas: el tenant se resuelve desde claims verificados del JWT
   * - rutas publicas de auth: fallback transitorio a X-Tenant-Slug
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'tenants', method: RequestMethod.ALL },
        { path: 'tenants/*path', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
