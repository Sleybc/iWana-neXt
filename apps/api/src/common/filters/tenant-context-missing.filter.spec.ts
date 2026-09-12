import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { APP_FILTER } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TenantContextMissingFilter } from './tenant-context-missing.filter';

/**
 * El filtro es `@Catch()` sin argumentos: atrapa TODA excepción del API. Antes
 * relanzaba con `throw` lo que no era error de tenant, y eso sacaba la
 * excepción del pipeline de Nest hacia el manejador por defecto de Express,
 * que responde HTML con stack trace. Estos casos fijan que cualquier excepción
 * ajena al tenant sigue saliendo como el JSON estándar de Nest.
 */
@Controller('diag')
class DiagnosticsController {
  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('No hay disponible suficiente: 0.00 en existencia.');
  }

  @Get('boom')
  boom(): never {
    throw new Error('fallo inesperado con ruta C:/appiw/apps/api/src/secreto.ts');
  }

  @Get('rate-limited')
  rateLimited(@Res({ passthrough: true }) response: Response): never {
    // Reproduce al `TenantAwareThrottlerGuard`: fija las cabeceras de cuota y
    // DESPUÉS lanza el 429.
    response.setHeader('X-RateLimit-Limit', '120');
    response.setHeader('X-RateLimit-Remaining', '0');
    throw new HttpException(
      { code: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas solicitudes.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  @Get('tenant-missing')
  tenantMissing(): never {
    const error = Object.assign(new Error('sin tenant'), { isTenantContextMissing: true });
    throw error;
  }
}

describe('TenantContextMissingFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DiagnosticsController],
      providers: [{ provide: APP_FILTER, useClass: TenantContextMissingFilter }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve el 400 explicativo cuando falta el contexto de tenant', async () => {
    const response = await request(app.getHttpServer()).get('/diag/tenant-missing').expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      message: 'Debe indicar el tenant via header X-Tenant-Slug para este endpoint.',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('preserva el JSON de una HttpException ajena al tenant en vez de HTML de Express', async () => {
    const response = await request(app.getHttpServer()).get('/diag/bad-request').expect(400);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({
      statusCode: 400,
      message: 'No hay disponible suficiente: 0.00 en existencia.',
    });
    expect(response.text).not.toContain('<!DOCTYPE html>');
  });

  it('conserva las cabeceras fijadas antes de lanzar la excepción', async () => {
    // El filtro es `@Catch()`: toda excepción pasa por él. Cuando relanzaba con
    // `throw`, la respuesta la componía el `finalhandler` de Express, que BORRA
    // las cabeceras ya fijadas — y con ellas la cuota que el guard de rate
    // limit había puesto antes del 429. Este caso fija que delegar en
    // `super.catch()` las preserva.
    const response = await request(app.getHttpServer()).get('/diag/rate-limited').expect(429);

    expect(response.headers['x-ratelimit-limit']).toBe('120');
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
    expect(response.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('convierte un error no controlado en 500 JSON sin filtrar el stack trace', async () => {
    const response = await request(app.getHttpServer()).get('/diag/boom').expect(500);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ statusCode: 500 });
    expect(response.text).not.toContain('<!DOCTYPE html>');
    expect(response.text).not.toContain('secreto.ts');
  });
});
