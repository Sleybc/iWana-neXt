import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type INestApplication, Controller, HttpCode, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { surfaceOriginMiddleware } from './surface-origin';

const CONSOLE = 'https://consola.example';
const PORTAL = 'https://portal.example:8443';
const handled = jest.fn();

@Controller()
class EchoController {
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(): string {
    handled();
    return 'ok';
  }
}

it('main.ts la aplica antes de CORS', () => {
  const main = readFileSync(join(__dirname, '../main.ts'), 'utf8');
  const at = main.indexOf('app.use(surfaceOriginMiddleware(corsOrigins))');
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(main.indexOf('app.enableCors('));
});

describe('origen por superficie (HTTP)', () => {
  const original = process.env['NODE_ENV'];
  let app: INestApplication;

  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ controllers: [EchoController] }).compile()
    ).createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(surfaceOriginMiddleware([CONSOLE, PORTAL]));
    app.enableCors({ origin: [CONSOLE, PORTAL], credentials: true });
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => handled.mockClear());
  afterEach(() => {
    process.env['NODE_ENV'] = original;
  });

  const send = (method: 'post' | 'options', own?: string, origin?: string) => {
    const call = request(app.getHttpServer())[method]('/api/v1/auth/refresh');
    if (method === 'options') void call.set('Access-Control-Request-Method', 'POST');
    if (own) void call.set('X-Iwana-Origin', own);
    if (origin) void call.set('Origin', origin);
    return call;
  };

  describe.each(['production', 'staging'])('%s', (nodeEnv) => {
    beforeEach(() => {
      process.env['NODE_ENV'] = nodeEnv;
    });

    it.each([CONSOLE, PORTAL])(
      '%s admite su propio origen y la ausencia de origen',
      async (own) => {
        const response = await send('post', own, own).expect(200);
        expect(response.headers['access-control-allow-origin']).toBe(own);
        await send('post', own).expect(200);
        await send('options', own, own).expect(204);
      },
    );

    it.each([
      [CONSOLE, PORTAL],
      [PORTAL, CONSOLE],
      [PORTAL, 'https://portal.example'],
      [CONSOLE, 'http://consola.example'],
      [CONSOLE, 'null'],
      [CONSOLE, 'https://ajeno.example'],
      // Nombre desconocido en el vhost por defecto: coincide consigo, pero no está en CORS_ORIGIN.
      ['https://ajeno.example', 'https://ajeno.example'],
      [undefined, CONSOLE],
    ])('%s rechaza el origen %s antes del handler', async (own, origin) => {
      for (const method of ['post', 'options'] as const) {
        const response = await send(method, own, origin).expect(403);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      }
      expect(handled).not.toHaveBeenCalled();
    });
  });

  it.each(['development', 'test'])('%s no cambia', async (nodeEnv) => {
    process.env['NODE_ENV'] = nodeEnv;
    const response = await send('post', undefined, PORTAL).expect(200);
    expect(response.headers['access-control-allow-origin']).toBe(PORTAL);
  });
});
