import * as Joi from 'joi';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  mfaEncryptionKeyJoiSchema,
  mfaEncryptionKeyPreviousJoiSchema,
} from './common/crypto/aes-gcm.util';
import { piiHashKeyJoiSchema } from './common/crypto/pii-hash-key.util';

type ApiDataSourceOptions = Pick<
  TypeOrmModuleOptions,
  'entities' | 'migrations' | 'migrationsTableName' | 'extra'
>;

/**
 * Hosts que solo son alcanzables desde la red de desarrollo. En perfil de
 * producción cualquiera de ellos produce un fallo silencioso: los correos de
 * reset y verificación saldrían con enlaces que el destinatario no puede abrir,
 * y CORS dejaría fuera al frontend real. Riesgos 1 y 2 de ADR-070.
 */
const DEVELOPMENT_ONLY_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

type OriginVerdict = 'ok' | 'not-absolute' | 'development-only';

/** Clasifica un origen aislado sin exponer su valor en el resultado. */
function classifyProductionOrigin(raw: string): OriginVerdict {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return 'not-absolute';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'not-absolute';
  }

  const hostname = parsed.hostname.toLowerCase();

  if (DEVELOPMENT_ONLY_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return 'development-only';
  }

  return 'ok';
}

/** Valida una lista de orígenes separada por comas (formato de CORS_ORIGIN). */
const productionOriginListValidator: Joi.CustomValidator<string> = (value, helpers) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    return helpers.error('iwana.origin.notAbsolute');
  }

  for (const origin of origins) {
    const verdict = classifyProductionOrigin(origin);

    if (verdict === 'not-absolute') {
      return helpers.error('iwana.origin.notAbsolute');
    }

    if (verdict === 'development-only') {
      return helpers.error('iwana.origin.developmentOnly');
    }
  }

  // Se devuelve el valor sin normalizar: main.ts lee process.env directamente y
  // no debe divergir de lo que validó Joi.
  return value;
};

/** Valida una URL absoluta única (formato de FRONTEND_URL). */
const productionUrlValidator: Joi.CustomValidator<string> = (value, helpers) => {
  const verdict = classifyProductionOrigin(value.trim());

  if (verdict === 'not-absolute') {
    return helpers.error('iwana.origin.notAbsolute');
  }

  if (verdict === 'development-only') {
    return helpers.error('iwana.origin.developmentOnly');
  }

  return value;
};

/**
 * Construye las opciones efectivas del runtime de la API.
 *
 * El DDL productivo pertenece exclusivamente al migrator; la API solo usa
 * TypeORM para ejecutar consultas con el rol de aplicación.
 */
export function createApiTypeOrmOptions(
  config: ConfigService,
  sourceOptions: ApiDataSourceOptions,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USER', 'iwana'),
    password: config.get<string>('DB_PASSWORD', ''),
    database: config.get<string>('DB_NAME', 'iwana_next'),
    entities: sourceOptions.entities ?? [],
    migrations: sourceOptions.migrations ?? [],
    migrationsTableName: sourceOptions.migrationsTableName ?? 'typeorm_migrations',
    migrationsRun: false,
    synchronize: false,
    ssl: false,
    logging: config.get<string>('NODE_ENV') !== 'production' ? ['error', 'migration'] : ['error'],
    extra: sourceOptions.extra,
    autoLoadEntities: true,
  };
}

/** Esquema único de configuración validado por el bootstrap de AppModule. */
export function createAppConfigurationSchema(): Joi.ObjectSchema {
  return Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
    PORT: Joi.number().default(3000),
    // Interfaz de escucha (ADR-078 D2). Deliberadamente sin default en Joi: el
    // valor efectivo depende de NODE_ENV y se resuelve en main.ts (127.0.0.1
    // fuera de produccion, 0.0.0.0 dentro del contenedor productivo). Aqui solo
    // se valida el formato para que un valor invalido falle al arrancar.
    BIND_HOST: Joi.string().trim().min(1).optional(),
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
    // Clave global, sin datos de tenant, compartida por worker y API para el
    // timestamp del último ciclo real del scanner.
    OUTBOX_RELAY_SCAN_TIMESTAMP_KEY: Joi.string()
      .trim()
      .pattern(/^[a-z0-9:_-]+$/u)
      .default('iwana:platform:execution-order-relay:last-scan-at'),
    // Clave AES-256-GCM: 64 hex + rechazo de entropía nula (SEC-02 / ADR-058).
    // Generar con: openssl rand -hex 32 — nunca usar placeholders de ceros.
    MFA_ENCRYPTION_KEY: mfaEncryptionKeyJoiSchema,
    MFA_ENCRYPTION_KEY_PREVIOUS: mfaEncryptionKeyPreviousJoiSchema,
    // Clave HMAC-SHA-256 para búsquedas por PII (SEC-P1 / ADR-078 D3).
    // Independiente de MFA_ENCRYPTION_KEY — no derivar por HKDF (D-A).
    PII_HASH_KEY: piiHashKeyJoiSchema,
    // Lista de orígenes permitidos por CORS, separada por comas.
    // Producción: obligatoria y sin default a localhost — riesgo 2 de ADR-070.
    CORS_ORIGIN: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().trim().required().custom(productionOriginListValidator).messages({
        'any.required':
          'CORS_ORIGIN es obligatorio con NODE_ENV=production: sin él la API arrancaría aceptando solo orígenes de desarrollo y bloquearía al frontend real.',
        'string.empty':
          'CORS_ORIGIN debe ser una lista de orígenes absolutos http(s) separados por comas.',
        'iwana.origin.notAbsolute':
          'CORS_ORIGIN debe ser una lista de orígenes absolutos http(s) separados por comas.',
        'iwana.origin.developmentOnly':
          'CORS_ORIGIN no puede apuntar a localhost/127.0.0.1 con NODE_ENV=production.',
      }),
      otherwise: Joi.string().default('http://localhost:3001,http://localhost:3002'),
    }),
    // Credencial de arranque de la consola de plataforma (MOD01 / primer ingreso).
    //
    // Produccion la prohibe: una credencial que viaja en el fichero de entorno la
    // conoce todo el que despliega, y el cambio forzado del primer ingreso acota
    // esa ventana pero no la cierra. Fuera de produccion es la via normal de
    // arranque, y la cuenta nace marcada para cambio obligatorio.
    // `empty('')`: una variable declarada pero vacía no es una credencial, y un
    // `.env` compartido suele arrastrarlas. Se rechaza el valor real, no el hueco.
    PLATFORM_SUPER_ADMIN_EMAIL: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().allow('').empty('').forbidden().messages({
        'any.unknown':
          'PLATFORM_SUPER_ADMIN_EMAIL no puede definirse con NODE_ENV=production: la credencial de arranque es conocida por diseno. Cree el usuario de plataforma por el flujo de bootstrap autenticado.',
      }),
      // `tlds: { allow: false }`: se valida la forma del email, no que el TLD
      // este en la lista IANA. Es una variable interna de arranque y puede
      // apuntar a un dominio de laboratorio o reservado (RFC 2606).
      otherwise: Joi.string()
        .trim()
        .email({ tlds: { allow: false } })
        .optional(),
    }),
    PLATFORM_SUPER_ADMIN_PASSWORD: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().allow('').empty('').forbidden().messages({
        'any.unknown':
          'PLATFORM_SUPER_ADMIN_PASSWORD no puede definirse con NODE_ENV=production: la credencial de arranque es conocida por diseno. Cree el usuario de plataforma por el flujo de bootstrap autenticado.',
      }),
      otherwise: Joi.string().min(10).optional(),
    }),
    COOKIE_SECURE: Joi.boolean().default(false),
    APP_NAME: Joi.string().default('iWana neXt'),
    SMTP_HOST: Joi.string().allow('').optional(),
    SMTP_PORT: Joi.number().integer().min(1).max(65535).optional(),
    SMTP_USER: Joi.string().allow('').optional(),
    SMTP_PASS: Joi.string().allow('').optional(),
    SMTP_FROM: Joi.string().allow('').optional(),
    SMTP_SECURE: Joi.boolean().optional(),
    // Base de los enlaces de los correos transaccionales (reset de contraseña y
    // verificación de email, apps/api/src/modules/auth/auth.service.ts).
    // Producción: obligatoria y sin default a localhost — riesgo 1 de ADR-070.
    FRONTEND_URL: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().trim().required().custom(productionUrlValidator).messages({
        'any.required':
          'FRONTEND_URL es obligatoria con NODE_ENV=production: sin ella los correos de reset y verificación saldrían apuntando a localhost sin fallo visible al arrancar.',
        'string.empty': 'FRONTEND_URL debe ser una URL absoluta http(s).',
        'iwana.origin.notAbsolute': 'FRONTEND_URL debe ser una URL absoluta http(s).',
        'iwana.origin.developmentOnly':
          'FRONTEND_URL no puede apuntar a localhost/127.0.0.1 con NODE_ENV=production.',
      }),
      otherwise: Joi.string().uri().optional(),
    }),
    API_PUBLIC_BASE_URL: Joi.string().uri().optional(),
    STORAGE_DRIVER: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('minio').required(),
      otherwise: Joi.string().valid('minio', 'local').default('local'),
    }),
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
