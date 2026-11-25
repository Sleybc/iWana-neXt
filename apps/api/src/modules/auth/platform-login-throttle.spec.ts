import { randomUUID } from 'node:crypto';
import { type INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import IORedis from 'ioredis';
import request from 'supertest';

jest.mock('otplib', () => ({
  TOTP: jest.fn(),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { type PasswordAttempt, PlatformLoginThrottle } from './platform-login-throttle.service';

const config = {
  get: (key: string, fallback?: unknown) => (key === 'PII_HASH_KEY' ? 'ab'.repeat(32) : fallback),
  getOrThrow: () => 'ab'.repeat(32),
} as unknown as ConfigService;
const build = (redis: unknown): PlatformLoginThrottle =>
  new PlatformLoginThrottle(redis as IORedis, config);

describe('PlatformLoginThrottle sin Redis', () => {
  it.each([
    ['rechaza', () => Promise.reject(new Error('caído'))],
    ['no responde', () => new Promise(() => undefined)],
  ])('si Redis %s: 503 antes de 3 s', async (_caso, evaluate) => {
    const started = Date.now();
    await expect(
      build({ eval: evaluate }).reserve('a@example.test', '203.0.113.7'),
    ).rejects.toMatchObject({ status: 503 });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('con Redis detenido (conexión rechazada): 503 antes de 3 s', async () => {
    const down = new IORedis({ host: '127.0.0.1', port: 1, retryStrategy: () => 3000 });
    down.on('error', () => undefined);
    const started = Date.now();
    try {
      await expect(build(down).reserve('a@example.test', '203.0.113.7')).rejects.toMatchObject({
        status: 503,
      });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      down.disconnect();
    }
  });

  it('sin IP válida rechaza sin consultar Redis', async () => {
    const evaluate = jest.fn();
    expect(await build({ eval: evaluate }).reserve('a@example.test', undefined)).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('una reserva que llega después del 503 se devuelve', async () => {
    const evaluate = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve('tardía'), 2300)),
      )
      .mockResolvedValue(1);
    await expect(
      build({ eval: evaluate }).reserve('a@example.test', '203.0.113.7'),
    ).rejects.toMatchObject({ status: 503 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate.mock.calls[1]).toEqual([expect.any(String), 1, expect.any(String), 'tardía']);
  });

  it('HTTP: el 503 llega al cliente sin consultar la cuenta', async () => {
    const loginPlatform = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { loginPlatform } },
        { provide: ConfigService, useValue: config },
        {
          provide: PlatformLoginThrottle,
          useValue: build({ eval: () => Promise.reject(new Error('caído')) }),
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/auth/platform/login')
        .send({ email: 'a@example.test', password: 'Erronea12345!' })
        .expect(503);
      expect(loginPlatform).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('un fallo al liquidar no cambia la respuesta: la reserva ya cuenta', async () => {
    const evaluate = jest
      .fn()
      .mockResolvedValueOnce('generacion')
      .mockRejectedValue(new Error('caído'));
    const attempt = (await build({ eval: evaluate }).reserve('a@example.test', '203.0.113.7'))!;
    await expect(attempt.failed()).resolves.toEqual({ locked: false, alert: false });
  });

  it('las claves no llevan correo ni IP', async () => {
    const evaluate = jest.fn().mockResolvedValue('generacion');
    const attempt = (await build({ eval: evaluate }).reserve('Admin@Example.test', '203.0.113.7'))!;
    await attempt.failed();
    const sent = JSON.stringify(evaluate.mock.calls.map((call) => call.slice(1)));
    expect(sent).toContain('login-throttle:v1:');
    expect(sent).not.toMatch(/example|203\.0\.113/iu);
  });
});

const url = process.env['REDIS_TEST_URL'];
(url ? describe : describe.skip)('PlatformLoginThrottle con Redis real', () => {
  let redis: IORedis;
  let throttle: PlatformLoginThrottle;
  let email: string;
  const IP = '203.0.113.7';
  const reserve = (ip = IP, who = email): Promise<PasswordAttempt | null> =>
    throttle.reserve(who, ip);
  const fail = async (ip = IP, who = email) => (await reserve(ip, who))!.failed();
  const keys = (): Promise<string[]> => redis.keys('login-throttle:v1:*');

  beforeAll(() => {
    redis = new IORedis(url!);
    throttle = build(redis);
  });
  beforeEach(async () => {
    const stale = await keys();
    if (stale.length > 0) await redis.del(...stale);
    email = `${randomUUID()}@example.test`;
  });
  afterAll(async () => {
    await redis.quit();
  });

  it('la décima errónea frena esa pareja; otra IP y otra cuenta siguen', async () => {
    for (let n = 1; n < 10; n += 1) expect((await fail()).locked).toBe(false);
    expect((await fail()).locked).toBe(true);
    expect(await reserve()).toBeNull();
    expect(await reserve(IP, email.toUpperCase())).toBeNull();
    expect(await reserve('198.51.100.9')).not.toBeNull();
    expect(await reserve(IP, 'otra@example.test')).not.toBeNull();
  });

  it('los rechazados no alargan el freno y todo vence', async () => {
    for (let n = 0; n < 10; n += 1) await fail();
    const lock = (await keys()).find((key) => key.endsWith(':lock'))!;
    await redis.pexpire(lock, 5000);
    for (let n = 0; n < 5; n += 1) expect(await reserve()).toBeNull();
    expect(await redis.pttl(lock)).toBeLessThanOrEqual(5000);
    for (const key of await keys()) expect(await redis.pttl(key)).toBeGreaterThan(0);
  });

  it('la ventana es fija: los fallos no la alargan', async () => {
    await fail();
    const pair = (await keys()).find((key) => key.includes(':pair:'))!;
    await redis.pexpire(pair, 5000);
    await fail();
    expect(await redis.pttl(pair)).toBeLessThanOrEqual(5000);
  });

  it('Redis pausado: la reserva tardía no consume cupo', async () => {
    await redis.call('CLIENT', 'PAUSE', '2500', 'ALL');
    await expect(reserve()).rejects.toMatchObject({ status: 503 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const reserved = await Promise.all(Array.from({ length: 10 }, () => reserve()));
    expect(reserved.every(Boolean)).toBe(true);
  }, 15_000);

  it('veinte reservas en paralelo: diez comprobaciones', async () => {
    const reserved = await Promise.all(Array.from({ length: 20 }, () => reserve()));
    expect(reserved.filter(Boolean)).toHaveLength(10);
  });

  it('diez reservas sin confirmar no frenan: vuelven al liberarse', async () => {
    const reserved = await Promise.all(Array.from({ length: 10 }, () => reserve()));
    expect(await reserve()).toBeNull();
    await reserved[0]!.release();
    expect(await reserve()).not.toBeNull();
  });

  it('un acierto borra los fallos de su generación', async () => {
    for (let n = 0; n < 9; n += 1) await fail();
    await (await reserve())!.succeeded();
    for (let n = 0; n < 9; n += 1) expect((await fail()).locked).toBe(false);
  });

  it('un acierto en vuelo no borra un freno posterior', async () => {
    const late = (await reserve())!;
    const pair = (await keys()).find((key) => key.includes(':pair:'))!;
    await redis.set(`${pair}:lock`, '1', 'PX', 60_000);
    await late.succeeded();
    expect(await reserve()).toBeNull();
    expect(await redis.exists(pair)).toBe(1);
  });

  it('un acierto de una generación vieja no borra la nueva', async () => {
    const old = (await reserve())!;
    await redis.del(...(await keys()));
    for (let n = 0; n < 5; n += 1) await fail();
    await old.succeeded();
    for (let n = 0; n < 4; n += 1) await fail();
    expect((await fail()).locked).toBe(true);
  });

  it('cincuenta erróneas desde varias IP avisan una vez y no frenan la cuenta', async () => {
    let alerts = 0;
    for (let n = 0; n < 60; n += 1) {
      if ((await fail(`198.51.100.${Math.floor(n / 9)}`)).alert) alerts += 1;
    }
    expect(alerts).toBe(1);
    expect(await reserve('192.0.2.1')).not.toBeNull();
  });

  it('HTTP: por pareja, con la respuesta genérica y sin llegar al servicio', async () => {
    const loginPlatform = jest.fn(
      async (dto: { password: string }, _ip: string, _ua: string, attempt: PasswordAttempt) => {
        if (dto.password === 'Correcta12345!') {
          await attempt.succeeded();
          return { accessToken: '', mfaRequired: true };
        }
        if (dto.password === 'Infraestructura12345!') throw new Error('base caída');
        await attempt.failed();
        throw new UnauthorizedException('Credenciales invalidas.');
      },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { loginPlatform } },
        { provide: ConfigService, useValue: config },
        { provide: PlatformLoginThrottle, useValue: throttle },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useLogger(false);
    (app as unknown as { set: (key: string, value: number) => void }).set('trust proxy', 1);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    const send = (password: string, ip = IP) =>
      request(app.getHttpServer())
        .post('/auth/platform/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password });
    try {
      // Un error ajeno a la contraseña libera su reserva.
      for (let n = 0; n < 12; n += 1) await send('Infraestructura12345!').expect(500);
      const wrong = await send('Erronea12345!').expect(401);
      for (let n = 0; n < 9; n += 1) await send('Erronea12345!').expect(401);
      loginPlatform.mockClear();
      const frozen = await send('Correcta12345!').expect(401);
      expect(frozen.body).toEqual(wrong.body);
      expect(loginPlatform).not.toHaveBeenCalled();
      await send('Correcta12345!', '198.51.100.9').expect(200);

      // Veinte en paralelo, con una correcta entre ellas: diez llegan a comprobarse.
      loginPlatform.mockClear();
      loginPlatform.mockImplementation(async (dto, _ip, _ua, attempt) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (dto.password === 'Correcta12345!') {
          await attempt.succeeded();
          return { accessToken: '', mfaRequired: true };
        }
        await attempt.failed();
        throw new UnauthorizedException('Credenciales invalidas.');
      });
      const statuses = await Promise.all(
        Array.from({ length: 20 }, (_, n) =>
          send(n === 0 ? 'Correcta12345!' : 'Erronea12345!', '192.0.2.77').then((r) => r.status),
        ),
      );
      expect(statuses.filter((status) => status !== 200 && status !== 401)).toEqual([]);
      expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(1);
      expect(loginPlatform).toHaveBeenCalledTimes(10);
    } finally {
      await app.close();
    }
  });
});
