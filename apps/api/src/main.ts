import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  const app = await NestFactory.create(AppModule);

  // Prefijo global de la API — todos los endpoints quedan en /api/v1/*
  app.setGlobalPrefix('api/v1');

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
  app.use(helmet());

  // Habilitar lectura de cookies (refresh token llega como cookie httpOnly)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  app.use(require('cookie-parser')());

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
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

bootstrap();
