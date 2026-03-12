import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Bootstrap de la aplicacion iWana neXt API.
 *
 * Sprint 0 — Configuracion minima de scaffold.
 * La configuracion completa se aplica en Sprint 1:
 * - ValidationPipe global (class-validator + class-transformer)
 * - Helmet (headers de seguridad HTTP)
 * - CORS restrictivo (origenes aprobados en configuracion)
 * - Rate limiting via @nestjs/throttler
 * - JWT Guards globales
 * - Interceptor de audit trail
 *
 * Puerto: process.env.PORT ?? 3000
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

bootstrap();
