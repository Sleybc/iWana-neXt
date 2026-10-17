import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  LoggerService,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { APP_FILTER } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { TenantContextMissingFilter } from './tenant-context-missing.filter';

const errorLogLines: string[] = [];

const captureLogger: LoggerService = {
  log: (...values: unknown[]) => errorLogLines.push(values.map(String).join(' ')),
  error: (...values: unknown[]) => errorLogLines.push(values.map(String).join(' ')),
  warn: (...values: unknown[]) => errorLogLines.push(values.map(String).join(' ')),
  debug: (...values: unknown[]) => errorLogLines.push(values.map(String).join(' ')),
  verbose: (...values: unknown[]) => errorLogLines.push(values.map(String).join(' ')),
};

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

  @Get('query-failed')
  queryFailed(): never {
    const sentinel = 'CENTINELA-PII-0001';
    const driverError = Object.assign(
      new Error(`duplicate key value violates unique constraint (${sentinel})`),
      {
        code: '23505',
        detail: `Key (email_hmac)=(${sentinel}) already exists`,
        constraint: 'users_email_hmac_key',
        table: 'users',
      },
    );
    throw new QueryFailedError(
      'INSERT INTO users (email_hmac) VALUES ($1)',
      [sentinel],
      driverError,
    );
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
    app.useLogger(captureLogger);
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

  it('omite la query string del aviso de tenant ausente', async () => {
    errorLogLines.length = 0;

    await request(app.getHttpServer())
      .get('/diag/tenant-missing?source=CENTINELA-QUERY-0001')
      .expect(400);

    expect(errorLogLines.join('\n')).toContain('/diag/tenant-missing');
    expect(errorLogLines.join('\n')).not.toContain('CENTINELA-QUERY-0001');
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

  it('no registra el detalle ni los parámetros de un QueryFailedError no controlado', async () => {
    errorLogLines.length = 0;

    const response = await request(app.getHttpServer()).get('/diag/query-failed').expect(500);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(errorLogLines).toHaveLength(1);
    expect(errorLogLines[0]).toContain(
      'UNHANDLED_ERROR method=GET path=/diag/query-failed class=QueryFailedError sqlstate=23505 constraint=users_email_hmac_key table=users',
    );
    expect(errorLogLines.join('\n')).not.toContain('CENTINELA-PII-0001');
  });

  it('omite el stack de la aplicación en producción', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    errorLogLines.length = 0;

    try {
      const response = await request(app.getHttpServer()).get('/diag/boom').expect(500);

      expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(errorLogLines).toHaveLength(1);
      expect(errorLogLines[0]).toContain('UNHANDLED_ERROR method=GET path=/diag/boom');
      expect(errorLogLines[0]).not.toContain('tenant-context-missing.filter.ts');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
