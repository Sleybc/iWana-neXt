/**
 * `GET /api/v1/tenants/usage` contra PostgreSQL real (ADR-114 D4–D6, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4
 * §A.5). Guards reales (JwtStrategy RS256 con par de claves efímero, RolesGuard con frontera de
 * tipo de token) y servicio real sobre `public.tenants` y `public.tenant_usage_snapshots`,
 * dentro de una transacción que se revierte.
 *
 * Casos: `SYSTEM_ADMIN` 200 con solo los campos del contrato; empresa `ACTIVE` sin medición →
 * `null` (nunca 0); empresa no `ACTIVE` fuera; auditoría `LIST_ACCESS` con actor, IP y
 * cantidad; anónimo 401; `IWANA_SUPPORT` 403; JWT de empresa (`ADMIN`) 403.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js tenant-usage
 */
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, type QueryRunner } from 'typeorm';
import { PlatformAuditLog, resolveMigrationDbCredentials } from '@iwana/db';
import { AuditAction, PlatformRole, UserRole } from '@iwana/shared';
import type { TenantUsage } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { TenantUsageService } from './tenant-usage.service';

// El controlador inyecta AuthService (otplib es ESM); esta ruta no lo usa.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const PATH = '/api/v1/tenants/usage';
const RUN = randomBytes(4).toString('hex');

describeWithDb('GET /tenants/usage — PostgreSQL real', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let app: INestApplication;
  let jwt: JwtService;
  const adminSub = randomUUID();
  const measured = randomUUID();
  const unmeasured = randomUUID();
  const suspended = randomUUID();

  function sign(type: 'platform' | 'tenant', role: string, sub = randomUUID()): string {
    const claims = JWT_CLAIMS_BY_TOKEN_TYPE[type];
    return jwt.sign(
      {
        sub,
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
      entities: [PlatformAuditLog],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const seed: Array<[string, string, number | null]> = [
      [measured, 'ACTIVE', 100],
      [unmeasured, 'ACTIVE', null],
      [suspended, 'SUSPENDED', 50],
    ];
    for (const [id, status, max] of seed) {
      await queryRunner.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, max_subscribers)
         VALUES ($1, $2, $3, $4, $5, 'uso@example.invalid', $6)`,
        [
          id,
          `Uso ${RUN} ${id}`,
          `usage-it-${id}`,
          `tenant_usage_it_${RUN}_${id.slice(0, 8)}`,
          status,
          max,
        ],
      );
    }
    await queryRunner.query(
      `INSERT INTO public.tenant_usage_snapshots VALUES ($1, 42, now()), ($2, 9, now())`,
      [measured, suspended],
    );

    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    jwt = new JwtService({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      signOptions: { algorithm: 'RS256' },
    });

    // El EntityManager de la transacción expone `query` y `getRepository`.
    const manager = queryRunner.manager as unknown as DataSource;
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [TenantController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { getOrThrow: () => publicPem } },
        { provide: REDIS_CLIENT, useValue: { get: async () => null } },
        {
          provide: TenantUsageService,
          useFactory: () =>
            new TenantUsageService(manager, new PlatformAuditService(manager, undefined as never)),
        },
        { provide: TenantService, useValue: {} },
        { provide: TenantProvisioningService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: DashboardSummaryService, useValue: {} },
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

  it('SYSTEM_ADMIN recibe { data } con solo los campos del contrato y audita la lectura', async () => {
    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', `Bearer ${sign('platform', PlatformRole.SYSTEM_ADMIN, adminSub)}`)
      .expect(200);

    expect(Object.keys(response.body)).toEqual(['data']);
    const usage = response.body.data as TenantUsage;
    expect(Object.keys(usage).sort()).toEqual(['generatedAt', 'items']);
    for (const item of usage.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['activeSubscribers', 'maxSubscribers', 'measuredAt', 'name', 'tenantId'].sort(),
      );
    }
    const byId = new Map(usage.items.map((item) => [item.tenantId, item]));
    expect(byId.get(measured)).toMatchObject({ activeSubscribers: 42, maxSubscribers: 100 });
    expect(typeof byId.get(measured)?.measuredAt).toBe('string');
    // Sin medición: null, nunca 0.
    expect(byId.get(unmeasured)).toMatchObject({
      activeSubscribers: null,
      maxSubscribers: null,
      measuredAt: null,
    });
    expect(byId.has(suspended)).toBe(false);

    const audit = (await queryRunner.query(
      `SELECT action, ip_address, new_value
         FROM public.platform_audit_logs
        WHERE entity_type = 'TenantUsage' AND user_id = $1`,
      [adminSub],
    )) as Array<{ action: string; ip_address: string | null; new_value: unknown }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe(AuditAction.LIST_ACCESS);
    expect(audit[0]?.ip_address).toBeTruthy();
    expect(audit[0]?.new_value).toEqual({ tenantsReturned: usage.items.length });
  });

  it('anónimo recibe 401', async () => {
    await request(app.getHttpServer()).get(PATH).expect(401);
  });

  it('IWANA_SUPPORT recibe 403', async () => {
    await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', `Bearer ${sign('platform', PlatformRole.IWANA_SUPPORT)}`)
      .expect(403);
  });

  it('un JWT de empresa, incluido ADMIN, recibe 403', async () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPPORT]) {
      await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${sign('tenant', role)}`)
        .expect(403);
    }
  });
});
