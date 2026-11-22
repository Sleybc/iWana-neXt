/**
 * `GET /api/v1/platform/health/history` contra PostgreSQL real (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3
 * §A). Guards reales (JwtStrategy RS256 con un par de claves efímero) y servicio real sobre
 * `public.platform_health_samples`, dentro de una transacción que se revierte: la tabla se vacía
 * solo para esta corrida y nada queda escrito.
 *
 * Bordes: día sin muestras, día parcial (API no medido en una muestra), muestra fuera de la
 * ventana, cola sin trabajos en la última muestra, anónimo 401, token de tenant 403.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-health-history
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, type QueryRunner } from 'typeorm';
import { PlatformHealthSample, resolveMigrationDbCredentials } from '@iwana/db';
import { PlatformRole, UserRole } from '@iwana/shared';
import type { PlatformHealthHistory } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PlatformHealthController } from './platform-health.controller';
import { historyDates, PlatformHealthHistoryService } from './platform-health-history.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const PATH = '/api/v1/platform/health/history';

/** Mediodía de Bogotá (17:00 UTC) del día `date`, desplazado `minutes`. */
function bogotaNoon(date: string, minutes = 0): Date {
  return new Date(Date.parse(`${date}T17:00:00Z`) + minutes * 60_000);
}

describeWithDb('GET /platform/health/history — PostgreSQL real', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let app: INestApplication;
  let jwt: JwtService;
  let dates: string[];

  function sign(type: 'platform' | 'tenant', role: string): string {
    const claims = JWT_CLAIMS_BY_TOKEN_TYPE[type];
    return jwt.sign(
      {
        sub: randomUUID(),
        email: 'hash-sintetico',
        role,
        tenantId: type === 'tenant' ? randomUUID() : null,
        schemaName: type === 'tenant' ? 'tenant_sintetico' : null,
        jti: randomUUID(),
        type,
      },
      { issuer: claims.issuer, audience: claims.audience, expiresIn: 300 },
    );
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [PlatformHealthSample],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query('DELETE FROM public.platform_health_samples');

    dates = historyDates(new Date());
    const today = dates[29] as string;
    const repo = queryRunner.manager.getRepository(PlatformHealthSample);
    await repo.insert([
      // Fuera de la ventana: el día anterior al más antiguo.
      {
        sampledAt: bogotaNoon(dates[0] as string, -24 * 60),
        apiOk: false,
        dbOk: false,
        redisOk: false,
        queues: [],
      },
      // Hoy, parcial: 3 muestras; el API no se midió en una.
      { sampledAt: bogotaNoon(today, -10), apiOk: true, dbOk: true, redisOk: true, queues: [] },
      { sampledAt: bogotaNoon(today, -5), apiOk: false, dbOk: true, redisOk: false, queues: [] },
      {
        sampledAt: bogotaNoon(today, -1),
        apiOk: null,
        dbOk: true,
        redisOk: true,
        queues: [
          { name: 'search-index', waiting: 0, failed: 0, oldestWaitingSeconds: null },
          { name: 'tenant-provisioning', waiting: 3, failed: 1, oldestWaitingSeconds: 125 },
        ],
      },
    ]);

    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    jwt = new JwtService({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      signOptions: { algorithm: 'RS256' },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [PlatformHealthController],
      providers: [
        JwtStrategy,
        PlatformHealthHistoryService,
        { provide: ConfigService, useValue: { getOrThrow: () => publicPem } },
        { provide: REDIS_CLIENT, useValue: { get: async () => null } },
        { provide: getRepositoryToken(PlatformHealthSample), useValue: repo },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('anónimo → 401 y token inválido → 401', async () => {
    await request(app.getHttpServer()).get(PATH).expect(401);
    await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  it('token de tenant → 403', async () => {
    await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', `Bearer ${sign('tenant', UserRole.ADMIN)}`)
      .expect(403);
  });

  it.each([PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT])(
    '%s → 200 con 30 días, día parcial, días sin dato y colas de la última muestra',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${sign('platform', role)}`)
        .expect(200);
      const history = response.body.data as PlatformHealthHistory;

      expect(history.days.map((day) => day.date)).toEqual(dates);
      // Día parcial: el API cuenta 2 muestras (una no medida), Redis 2 de 3.
      expect(history.days[29]?.components).toEqual({
        api: { samples: 2, availability: 0.5 },
        db: { samples: 3, availability: 1 },
        redis: { samples: 3, availability: 2 / 3 },
      });
      // Día sin muestras y muestra fuera de la ventana: sin dato, nunca disponible.
      for (const day of history.days.slice(0, 29)) {
        for (const component of Object.values(day.components)) {
          expect(component).toEqual({ samples: 0, availability: null });
        }
      }
      // Cola sin trabajos: antigüedad null.
      // Muestra sin `failedRecent` (previa a B(b)): el API usa el total.
      expect(history.queues).toEqual([
        {
          name: 'search-index',
          waiting: 0,
          failed: 0,
          failedRecent: 0,
          oldestWaitingSeconds: null,
        },
        {
          name: 'tenant-provisioning',
          waiting: 3,
          failed: 1,
          failedRecent: 1,
          oldestWaitingSeconds: 125,
        },
      ]);
      expect(history.queuesSampledAt).toBe(bogotaNoon(dates[29] as string, -1).toISOString());
    },
  );

  it('sin ninguna muestra: 30 días sin dato, colas vacías y queuesSampledAt null', async () => {
    await queryRunner.query('SAVEPOINT empty');
    try {
      await queryRunner.query('DELETE FROM public.platform_health_samples');
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${sign('platform', PlatformRole.SYSTEM_ADMIN)}`)
        .expect(200);
      const history = response.body.data as PlatformHealthHistory;
      expect(history.days).toHaveLength(30);
      expect(history.days.every((day) => day.components.api.availability === null)).toBe(true);
      expect(history.queues).toEqual([]);
      expect(history.queuesSampledAt).toBeNull();
    } finally {
      await queryRunner.query('ROLLBACK TO SAVEPOINT empty');
    }
  });
});
