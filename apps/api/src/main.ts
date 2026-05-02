import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Bootstrap de la aplicacion iWana neXt API — MOD01 produccion.
 *
 * Configuracion de seguridad activa:
 * - Helmet: headers HTTP de seguridad (CSP, HSTS, X-Frame-Options, etc.)
 * - ValidationPipe global: class-validator + class-transformer, whitelist estricto
 * - cookie-parser: lectura de refresh token httpOnly
 * - Rate limiting global: ThrottlerModule 100 req/min (configurado en AppModule)
 * - Swagger UI: solo en non-prod, accesible en /api/v1/docs
 * - CORS: origen controlado por variable CORS_ORIGIN (validada por Joi en AppModule)
 *
 * Puerto: process.env.PORT ?? 3000
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Prefijo global de la API — todos los endpoints quedan en /api/v1/*
  app.setGlobalPrefix('api/v1');

  // Storage local de desarrollo: expone /storage/* para que los assets subidos
  // puedan usarse como imágenes públicas en branding sin depender de MinIO público.
  if (process.env['STORAGE_DRIVER'] !== 'minio') {
    app.useStaticAssets(join(process.cwd(), 'storage', 'media'), {
      prefix: '/storage/',
      setHeaders: (response: Response) => {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    });
  }

  // Validacion global de DTOs: rechaza propiedades desconocidas y transforma tipos
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // HTTP 400 si llegan propiedades extra
      transform: true, // Convierte tipos primitivos (string → number en @Query)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Helmet: headers HTTP de seguridad — debe aplicarse antes de cualquier otro middleware
  // Configura: Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
  // En desarrollo se relaja crossOriginResourcePolicy a 'same-site' para que el visor
  // JSON de Firefox pueda cargar recursos (favicon, etc.) sin error CORP.
  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: process.env['NODE_ENV'] === 'production' ? 'same-origin' : 'same-site',
      },
    }),
  );

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'GET' && request.path === '/') {
      response
        .type('text/plain; charset=utf-8')
        .setHeader('Cross-Origin-Resource-Policy', 'same-site')
        .send('iWana neXt API. Health: /api/v1/health. Docs: /api/v1/docs');
      return;
    }

    if (request.method === 'GET' && request.path === '/favicon.ico') {
      response
        .status(204)
        .setHeader('Cache-Control', 'public, max-age=86400')
        .setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        .end();
      return;
    }

    next();
  });

  // Habilitar lectura de cookies (refresh token llega como cookie httpOnly)
  app.use(cookieParser());

  // CORS: origen controlado por CORS_ORIGIN (puede ser lista separada por comas)
  // En produccion Joi garantiza que CORS_ORIGIN esta definido; el fallback solo aplica a dev local
  const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // Necesario para enviar/recibir cookies
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI — Swagger UI disponible en /api/v1/docs
  // Solo se habilita fuera de produccion para no exponer el schema en ambientes productivos
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('iWana neXt API')
      .setDescription('API REST del sistema ISP/OSS/BSS/NMS/EMS/ERP iWana neXt Colombia')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('auth', 'Autenticacion, MFA TOTP y gestion de sesiones')
      .addTag('tenants', 'Gestion de tenants (SYSTEM_ADMIN)')
      .addTag('users', 'Gestion de usuarios por tenant')
      .addTag('audit-logs', 'Consulta del audit trail del tenant')
      .addTag('search', 'Busqueda global indexada de plataforma')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

bootstrap();
