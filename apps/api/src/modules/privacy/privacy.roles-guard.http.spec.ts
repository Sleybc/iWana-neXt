import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import { AccessPermissionKey, TenantStatus, UserRole } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantMiddleware } from '../tenant/tenant.middleware';
import { TenantService } from '../tenant/tenant.service';
import { AuthorizationsController } from './authorizations/authorizations.controller';
import { AuthorizationsService } from './authorizations/authorizations.service';
import { PrivacyEvidenceController } from './evidence/privacy-evidence.controller';
import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsService } from './incidents/incidents.service';
import { PrivacyInventoryController } from './inventory/inventory.controller';
import { PrivacyInventoryService } from './inventory/inventory.service';
import { LegalTextsController } from './legal-texts/legal-texts.controller';
import { LegalTextsService } from './legal-texts/legal-texts.service';
import { MarksController } from './marks/marks.controller';
import { MarksService } from './marks/marks.service';
import { PurposesController } from './purposes/purposes.controller';
import { PurposesService } from './purposes/purposes.service';
import { PrivacyRequestsController } from './requests/requests.controller';
import { PrivacyRequestsService } from './requests/requests.service';
import { RetentionController } from './retention/retention.controller';
import { RetentionService } from './retention/retention.service';
import { MediaService } from '../media/media.service';
import request from 'supertest';

const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const tenantId = '67000000-0000-4000-8000-000000000001';
const schemaName = 'tenant_privacy_guard_test';
const platformUserId = '67000000-0000-4000-8000-000000000010';
const auditorId = '67000000-0000-4000-8000-000000000011';
const adminId = '67000000-0000-4000-8000-000000000012';
const supportId = '67000000-0000-4000-8000-000000000013';
const tenant = {
  id: tenantId,
  schemaName,
  slug: 'privacy-guard-test',
  status: TenantStatus.ACTIVE,
};

describe('Privacy controller role guard — HTTP', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const purposesService = {
    list: jest.fn().mockResolvedValue([{ purpose: 'CONTACTO_COMERCIAL', enabled: true }]),
    update: jest.fn().mockImplementation(async (input: { items: unknown[] }) => input.items),
  };
  const legalTextsService = {
    getCurrent: jest.fn().mockResolvedValue({
      id: '67000000-0000-4000-8000-000000000020',
      type: 'AUTORIZACION',
      version: '1',
      sha256: 'a'.repeat(64),
      content: 'Texto de prueba sintético.',
      format: 'PLAIN',
      publishedAt: '2026-10-14T15:00:00.000Z',
      url: null,
      isCurrent: true,
    }),
    list: jest.fn(),
    create: jest.fn(),
  };
  const tenantService = {
    findById: jest.fn().mockResolvedValue(tenant),
    findBySlug: jest.fn().mockResolvedValue(tenant),
  };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest.fn(async (userId: string) =>
      userId === supportId ? [] : [AccessPermissionKey.PRIVACY_MANAGE],
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
          signOptions: { algorithm: 'RS256' },
          verifyOptions: { algorithms: ['RS256'] },
        }),
      ],
      controllers: [
        AuthorizationsController,
        PrivacyEvidenceController,
        IncidentsController,
        PrivacyInventoryController,
        LegalTextsController,
        MarksController,
        PurposesController,
        PrivacyRequestsController,
        RetentionController,
      ],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        PermissionsGuard,
        TenantMiddleware,
        { provide: ConfigService, useValue: { getOrThrow: () => keyPair.publicKey } },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: TenantService, useValue: tenantService },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsService },
        { provide: AuthorizationsService, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn(), logWithin: jest.fn() } },
        { provide: IncidentsService, useValue: {} },
        { provide: PrivacyInventoryService, useValue: {} },
        { provide: LegalTextsService, useValue: legalTextsService },
        { provide: MarksService, useValue: {} },
        { provide: PurposesService, useValue: purposesService },
        { provide: PrivacyRequestsService, useValue: {} },
        { provide: RetentionService, useValue: {} },
        { provide: MediaService, useValue: {} },
      ],
    }).compile();

    jwtService = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    const tenantMiddleware = moduleRef.get(TenantMiddleware);
    app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      void tenantMiddleware.use(req, res, next).catch(next);
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    purposesService.update.mockClear();
    effectivePermissionsService.getEffectivePermissionsForUser.mockClear();
    tenantService.findBySlug.mockClear();
  });

  function signedToken(type: 'platform' | 'tenant', role: string, sub: string): string {
    const claims = JWT_CLAIMS_BY_TOKEN_TYPE[type];
    return jwtService.sign(
      {
        sub,
        email: 'a'.repeat(64),
        role,
        tenantId: type === 'tenant' ? tenantId : null,
        schemaName: type === 'tenant' ? schemaName : null,
        jti: `privacy-${randomUUID()}`,
        type,
      },
      { issuer: claims.issuer, audience: claims.audience },
    );
  }

  it('monta los tres guards en el orden requerido en los nueve controladores', () => {
    const controllers = [
      AuthorizationsController,
      PrivacyEvidenceController,
      IncidentsController,
      PrivacyInventoryController,
      LegalTextsController,
      MarksController,
      PurposesController,
      PrivacyRequestsController,
      RetentionController,
    ];

    for (const controller of controllers) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ]);
    }
  });

  it.each([
    ['POST', '/privacy/legal-texts'],
    ['PUT', '/privacy/purposes'],
    ['POST', '/privacy/requests'],
    ['POST', '/privacy/incidents'],
    ['POST', '/privacy/authorizations'],
    ['PATCH', '/privacy/retention-policies'],
  ])('deniega token de plataforma con slug en %s %s', async (method, path) => {
    const token = signedToken('platform', 'SYSTEM_ADMIN', platformUserId);
    const httpRequest = request(app.getHttpServer());
    const testRequest =
      method === 'POST'
        ? httpRequest.post(path)
        : method === 'PUT'
          ? httpRequest.put(path)
          : httpRequest.patch(path);

    await testRequest
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', tenant.slug)
      .send({})
      .expect(403);
    expect(tenantService.findBySlug).toHaveBeenCalledWith(tenant.slug);
  });

  it.each([
    [UserRole.AUDITOR, auditorId],
    [UserRole.ADMIN, adminId],
  ])('permite al rol tenant %s con privacy.manage actualizar finalidades', async (role, sub) => {
    const token = signedToken('tenant', role, sub);

    await request(app.getHttpServer())
      .put('/privacy/purposes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', tenant.slug)
      .send({ items: [{ purpose: 'CONTACTO_COMERCIAL', enabled: false }] })
      .expect(200);

    expect(effectivePermissionsService.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      sub,
      undefined,
    );
    expect(purposesService.update).toHaveBeenCalledTimes(1);
  });

  it('deniega al rol SUPPORT sin permisos de privacidad', async () => {
    const token = signedToken('tenant', UserRole.SUPPORT, supportId);

    await request(app.getHttpServer())
      .put('/privacy/purposes')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ purpose: 'CONTACTO_COMERCIAL', enabled: false }] })
      .expect(403);

    expect(purposesService.update).not.toHaveBeenCalled();
  });

  it('conserva la lectura pública de current y purposes para plataforma con slug', async () => {
    const token = signedToken('platform', 'SYSTEM_ADMIN', platformUserId);

    await request(app.getHttpServer())
      .get('/privacy/legal-texts/current?type=AUTORIZACION')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', tenant.slug)
      .expect(200);

    await request(app.getHttpServer())
      .get('/privacy/purposes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Slug', tenant.slug)
      .expect(200);
  });
});
