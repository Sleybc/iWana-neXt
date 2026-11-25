import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type INestApplication, Controller, Get, Post, HttpCode } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { consoleSurfaceMiddleware, isConsoleSurface, isPlatformPath } from './console-surface';

@Controller()
class EchoController {
  @Post('auth/platform/login')
  @HttpCode(200)
  login(): string {
    return 'ok';
  }
  @Get('platform-users/bootstrap/status')
  status(): string {
    return 'ok';
  }
  @Get('tenants/me')
  me(): string {
    return 'ok';
  }
}

it('main.ts la aplica antes de leer cookies y de las rutas', () => {
  const main = readFileSync(join(__dirname, '../main.ts'), 'utf8');
  const at = main.indexOf('app.use(consoleSurfaceMiddleware)');
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(main.indexOf('app.use(cookieParser())'));
});

describe('superficie de la consola', () => {
  const original = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = original;
  });

  it.each([
    '/api/v1/auth/platform/login',
    '/api/v1/AUTH/Platform/mfa/setup',
    '/api/v1//auth//platform/login',
    '/api/v1/auth/%70latform/login',
    '/api/v1/platform-users/bootstrap',
    '/api/v1/platform/branding/public',
    '/api/v1/platform-audit-logs/',
    '/api/v1/tenants',
    '/api/v1/tenants/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    '/api/v1/tenants/mean',
    '/api/v1/%E0%A4%A',
  ])('%s es de plataforma', (path) => {
    expect(isPlatformPath(path)).toBe(true);
  });

  it.each([
    '/api/v1/tenants/me',
    '/api/v1/tenants/me/settings',
    '/api/v1/tenants/public-branding',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/crm/platform',
    '/api/v1/health',
  ])('%s no lo es', (path) => {
    expect(isPlatformPath(path)).toBe(false);
  });

  it.each([
    ['production', 'console', true],
    ['production', 'portal', false],
    ['staging', undefined, false],
    ['production', undefined, false],
    ['production', ['console', 'portal'], false],
    ['development', undefined, true],
    ['test', undefined, true],
  ])('%s con cabecera %s → %s', (nodeEnv, header, expected) => {
    process.env['NODE_ENV'] = nodeEnv;
    expect(isConsoleSurface({ headers: { 'x-iwana-surface': header } })).toBe(expected);
  });

  describe('HTTP en producción', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = (
        await Test.createTestingModule({ controllers: [EchoController] }).compile()
      ).createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.use(consoleSurfaceMiddleware);
      await app.init();
    });
    afterAll(() => app.close());
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
    });

    it.each([
      ['post', '/api/v1/auth/platform/login'],
      ['post', '/api/v1/Auth/PLATFORM/login/'],
      ['get', '/api/v1/platform-users/bootstrap/status'],
    ] as const)('%s %s solo responde desde la consola', async (method, path) => {
      const send = () => request(app.getHttpServer())[method](path);
      await send().expect(404);
      await send().set('X-Iwana-Surface', 'portal').expect(404);
      await send().set('X-Iwana-Surface', 'console').expect(200);
    });

    it('lo que usa el portal no cambia', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tenants/me')
        .set('X-Iwana-Surface', 'portal')
        .expect(200);
    });
  });
});
