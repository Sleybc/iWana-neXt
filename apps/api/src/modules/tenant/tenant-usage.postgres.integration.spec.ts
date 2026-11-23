/**
 * `GET /api/v1/tenants/usage` contra PostgreSQL real (ADR-114 D4–D6, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4
 * §A.5). Guards reales (JwtStrategy RS256 con par de claves efímero, RolesGuard con frontera de
 * tipo de token) y servicio real sobre `public.tenants` y `public.tenant_usage_snapshots`,
 * dentro de una transacción que se revierte.
 *
 * Casos: `SYSTEM_ADMIN` 200 con solo los campos del contrato; empresa `ACTIVE` sin medición →
 * `null` (nunca 0); empresa no `ACTIVE` fuera; auditoría `LIST_ACCESS` con actor, IP y
 * cantidad; anónimo 401; `IWANA_SUPPORT` 403 por defecto; JWT de empresa (`ADMIN`) 403.
 *
 * ADR-114 v1.3 §9 (visibilidad por rol): al conceder, Soporte ve en la siguiente petición y al
 * retirar deja de ver; Soporte y empresa reciben 403 al escribir; la escritura deja fila de
 * auditoría con valor anterior y nuevo; un rol no autorizable da 400.
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
import {
  PlatformAuditLog,
  PlatformBrandingSettings,
  resolveMigrationDbCredentials,
} from '@iwana/db';
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
import { PlatformAccessSettingsService } from '../platform-branding/platform-access-settings.service';

// El controlador inyecta AuthService (otplib es ESM); esta ruta no lo usa.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const PATH = '/api/v1/tenants/usage';
const VISIBILITY = '/api/v1/tenants/usage/visibility';
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
      entities: [PlatformAuditLog, PlatformBrandingSettings],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // Valor por defecto (solo administrador) dentro de la transacción, sea cual sea la fila previa.
    await queryRunner.query(
      `INSERT INTO public.platform_branding_settings
         (id, product_name, surface_name, metadata_title, metadata_description)
       VALUES ('platform', 'p', 's', 't', 'd') ON CONFLICT (id) DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE public.platform_branding_settings SET tenant_usage_viewer_roles = '{}' WHERE id = 'platform'`,
    );

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
          useFactory: () => {
            const audit = new PlatformAuditService(manager, undefined as never);
            return new TenantUsageService(
              manager,
              audit,
              new PlatformAccessSettingsService(
                queryRunner.manager.getRepository(PlatformBrandingSettings),
                audit,
              ),
            );
          },
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

  it('por defecto solo el administrador: IWANA_SUPPORT recibe 403', async () => {
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

  describe('visibilidad por rol (ADR-114 v1.3 §9)', () => {
    const support = () => `Bearer ${sign('platform', PlatformRole.IWANA_SUPPORT)}`;
    const admin = () => `Bearer ${sign('platform', PlatformRole.SYSTEM_ADMIN, adminSub)}`;

    it('por defecto: soporte lee canView=false y el administrador canView=true', async () => {
      const asSupport = await request(app.getHttpServer())
        .get(VISIBILITY)
        .set('Authorization', support())
        .expect(200);
      expect(asSupport.body).toEqual({ data: { grantedRoles: [], canView: false } });
      const asAdmin = await request(app.getHttpServer())
        .get(VISIBILITY)
        .set('Authorization', admin())
        .expect(200);
      expect(asAdmin.body.data.canView).toBe(true);
    });

    it('al conceder, soporte ve en la siguiente petición; al retirar, deja de ver', async () => {
      await request(app.getHttpServer())
        .put(VISIBILITY)
        .set('Authorization', admin())
        .send({ grantedRoles: [PlatformRole.IWANA_SUPPORT] })
        .expect(200, { data: { grantedRoles: [PlatformRole.IWANA_SUPPORT], canView: true } });
      await request(app.getHttpServer()).get(PATH).set('Authorization', support()).expect(200);
      const visibility = await request(app.getHttpServer())
        .get(VISIBILITY)
        .set('Authorization', support())
        .expect(200);
      expect(visibility.body.data.canView).toBe(true);

      await request(app.getHttpServer())
        .put(VISIBILITY)
        .set('Authorization', admin())
        .send({ grantedRoles: [] })
        .expect(200);
      await request(app.getHttpServer()).get(PATH).set('Authorization', support()).expect(403);
      // El administrador lo ve siempre.
      await request(app.getHttpServer()).get(PATH).set('Authorization', admin()).expect(200);
    });

    it('la escritura deja fila de auditoría con valor anterior y nuevo', async () => {
      await request(app.getHttpServer())
        .put(VISIBILITY)
        .set('Authorization', admin())
        .send({ grantedRoles: [PlatformRole.IWANA_SUPPORT] })
        .expect(200);
      await request(app.getHttpServer())
        .put(VISIBILITY)
        .set('Authorization', admin())
        .send({ grantedRoles: [] })
        .expect(200);
      const rows = (await queryRunner.query(
        `SELECT action, old_value, new_value, ip_address
           FROM public.platform_audit_logs
          WHERE entity_type = 'TenantUsageVisibility' AND user_id = $1
          ORDER BY created_at DESC, id DESC`,
        [adminSub],
      )) as Array<{ action: string; old_value: unknown; new_value: unknown; ip_address: string }>;
      // En la transacción `now()` no avanza: se busca la fila de la retirada por su contenido.
      const revoke = rows.find(
        (row) => JSON.stringify(row.new_value) === JSON.stringify({ grantedRoles: [] }),
      );
      expect(revoke).toMatchObject({
        action: AuditAction.UPDATE,
        old_value: { grantedRoles: [PlatformRole.IWANA_SUPPORT] },
        new_value: { grantedRoles: [] },
      });
      expect(revoke?.ip_address).toBeTruthy();
    });

    it('soporte recibe 403 al escribir y no cambia el ajuste', async () => {
      await request(app.getHttpServer())
        .put(VISIBILITY)
        .set('Authorization', support())
        .send({ grantedRoles: [PlatformRole.IWANA_SUPPORT] })
        .expect(403);
      await request(app.getHttpServer()).get(PATH).set('Authorization', support()).expect(403);
    });

    it('un JWT de empresa recibe 403 al leer y al escribir el ajuste', async () => {
      for (const role of [UserRole.ADMIN, UserRole.SUPPORT]) {
        const token = `Bearer ${sign('tenant', role)}`;
        await request(app.getHttpServer()).get(VISIBILITY).set('Authorization', token).expect(403);
        await request(app.getHttpServer())
          .put(VISIBILITY)
          .set('Authorization', token)
          .send({ grantedRoles: [] })
          .expect(403);
      }
    });

    it('rechaza con 400 un rol no autorizable, repetido o un campo desconocido', async () => {
      for (const body of [
        { grantedRoles: [PlatformRole.SYSTEM_ADMIN] },
        { grantedRoles: ['ADMIN'] },
        { grantedRoles: [PlatformRole.IWANA_SUPPORT, PlatformRole.IWANA_SUPPORT] },
        { grantedRoles: [], extra: true },
      ]) {
        await request(app.getHttpServer())
          .put(VISIBILITY)
          .set('Authorization', admin())
          .send(body)
          .expect(400);
      }
    });
  });
});
