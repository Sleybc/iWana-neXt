import * as Joi from 'joi';
import {
  mfaEncryptionKeyJoiSchema,
  mfaEncryptionKeyPreviousJoiSchema,
} from './common/crypto/aes-gcm.util';

/** Esquema único de configuración validado por el bootstrap de AppModule. */
export function createAppConfigurationSchema(): Joi.ObjectSchema {
  return Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
    PORT: Joi.number().default(3000),
    // Base de datos (variables usadas por @iwana/db dataSourceOptions)
    DB_HOST: Joi.string().default('localhost'),
    DB_PORT: Joi.number().default(5432),
    DB_NAME: Joi.string().required(),
    DB_USER: Joi.string().required(),
    DB_PASSWORD: Joi.string().allow('').required(),
    // SEC-04: opcionales — CLI/migraciones y worker DDL las leen de process.env;
    // el runtime TypeORM de esta app sigue en DB_USER.
    DB_MIGRATOR_USER: Joi.string().optional(),
    DB_MIGRATOR_PASSWORD: Joi.string().allow('').optional(),
    // Redis
    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_PASSWORD: Joi.string().allow('').optional(),
    REDIS_DB: Joi.number().default(0),
    // Claves JWT RS256 (contenido PEM; usar \\n para saltos en .env)
    JWT_PRIVATE_KEY: Joi.string().required(),
    JWT_PUBLIC_KEY: Joi.string().required(),
    // Secreto HMAC para idempotencia durable de comandos de órdenes de ejecución.
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: Joi.string().min(32).required(),
    // Umbrales operativos del relay: no hay valores por defecto aprobados.
    // Si faltan, health expone la medición con "sin umbral aprobado" y no emite veredicto.
    OUTBOX_RELAY_LAG_DEGRADED_SECONDS: Joi.number().integer().min(0).optional(),
    OUTBOX_RELAY_LAG_STOPPED_SECONDS: Joi.number().integer().min(0).optional(),
    // Clave AES-256-GCM: 64 hex + rechazo de entropía nula (SEC-02 / ADR-058).
    // Generar con: openssl rand -hex 32 — nunca usar placeholders de ceros.
    MFA_ENCRYPTION_KEY: mfaEncryptionKeyJoiSchema,
    MFA_ENCRYPTION_KEY_PREVIOUS: mfaEncryptionKeyPreviousJoiSchema,
    CORS_ORIGIN: Joi.string().default('http://localhost:3001,http://localhost:3002'),
    COOKIE_SECURE: Joi.boolean().default(false),
    APP_NAME: Joi.string().default('iWana neXt'),
    SMTP_HOST: Joi.string().allow('').optional(),
    SMTP_PORT: Joi.number().integer().min(1).max(65535).optional(),
    SMTP_USER: Joi.string().allow('').optional(),
    SMTP_PASS: Joi.string().allow('').optional(),
    SMTP_FROM: Joi.string().allow('').optional(),
    SMTP_SECURE: Joi.boolean().optional(),
    FRONTEND_URL: Joi.string().uri().optional(),
    API_PUBLIC_BASE_URL: Joi.string().uri().optional(),
    STORAGE_DRIVER: Joi.string()
      .valid('minio', 'local')
      .default('local')
      .when('NODE_ENV', { is: 'production', then: Joi.required() }),
    S3_ENDPOINT: Joi.string().uri().optional(),
    S3_REGION: Joi.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: Joi.string()
      .allow('')
      .optional()
      .when('NODE_ENV', { is: 'production', then: Joi.string().min(1).required() }),
    S3_SECRET_ACCESS_KEY: Joi.string()
      .allow('')
      .optional()
      .when('NODE_ENV', { is: 'production', then: Joi.string().min(1).required() }),
    S3_BUCKET: Joi.string().default('iwana-media'),
    S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
    S3_USE_SSL: Joi.boolean().default(false),
    S3_PUBLIC_BASE_URL: Joi.string().uri().optional(),
    S3_BUCKET_PUBLIC: Joi.boolean().default(false),
    TYPESENSE_HOST: Joi.string()
      .default('localhost')
      .when('NODE_ENV', { is: 'production', then: Joi.required() }),
    TYPESENSE_PORT: Joi.number().default(8108),
    TYPESENSE_PROTOCOL: Joi.string().valid('http', 'https').default('http'),
    TYPESENSE_API_KEY: Joi.string()
      .default('CHANGE_ME_TYPESENSE_DEV_KEY')
      .when('NODE_ENV', { is: 'production', then: Joi.required() }),
    TYPESENSE_TIMEOUT_MS: Joi.number().integer().min(100).default(3000),
  });
}
