import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { REDIS_CLIENT } from '../redis/redis.module';

function buildController(db: 'ok' | 'error', redis: 'ok' | 'error'): HealthController {
  return new HealthController(
    {
      query:
        db === 'ok'
          ? jest.fn().mockResolvedValue([{ '?column?': 1 }])
          : jest.fn().mockRejectedValue(new Error('db caída')),
    } as never,
    {
      ping:
        redis === 'ok'
          ? jest.fn().mockResolvedValue('PONG')
          : jest.fn().mockRejectedValue(new Error('redis caído')),
    } as never,
  );
}

function buildResponse(): Response & { status: jest.Mock } {
  const res = { status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
}

describe('HealthController', () => {
  it('responde 200 con el contrato PublicHealth cuando DB y Redis están arriba', async () => {
    const res = buildResponse();

    const body = await buildController('ok', 'ok').check(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(body).toEqual({ status: 'ok', db: 'ok', redis: 'ok', timestamp: expect.any(String) });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('responde 503 con el mismo cuerpo cuando falla la DB', async () => {
    const res = buildResponse();

    const body = await buildController('error', 'ok').check(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toEqual({
      status: 'degraded',
      db: 'error',
      redis: 'ok',
      timestamp: expect.any(String),
    });
  });

  it('responde 503 con el mismo cuerpo cuando falla Redis', async () => {
    const res = buildResponse();

    const body = await buildController('ok', 'error').check(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toEqual({
      status: 'degraded',
      db: 'ok',
      redis: 'error',
      timestamp: expect.any(String),
    });
  });

  it('no expone relay ni otra telemetría: solo las cuatro claves del contrato', async () => {
    const body = await buildController('ok', 'ok').check(buildResponse());

    expect(Object.keys(body).sort()).toEqual(['db', 'redis', 'status', 'timestamp']);
    expect(body).not.toHaveProperty('relay');
  });
});

describe('HealthController (HTTP)', () => {
  // Prueba sobre Express real: el código de estado sale del `res.status` con passthrough.

  async function serve(dbFails: boolean, redisFails: boolean) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getDataSourceToken(),
          useValue: {
            query: dbFails
              ? jest.fn().mockRejectedValue(new Error('db caída'))
              : jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: REDIS_CLIENT,
          useValue: {
            ping: redisFails
              ? jest.fn().mockRejectedValue(new Error('redis caído'))
              : jest.fn().mockResolvedValue('PONG'),
          },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it.each([
    [false, false, 200, 'ok'],
    [true, false, 503, 'degraded'],
    [false, true, 503, 'degraded'],
  ])('db falla=%s, redis falla=%s → HTTP %i', async (dbFails, redisFails, code, status) => {
    const app = await serve(dbFails, redisFails);
    try {
      const response = await request(app.getHttpServer()).get('/health').expect(code);
      expect(response.body.status).toBe(status);
      expect(Object.keys(response.body).sort()).toEqual(['db', 'redis', 'status', 'timestamp']);
    } finally {
      await app.close();
    }
  });
});
