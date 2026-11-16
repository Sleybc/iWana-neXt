import { generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  ConflictException,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import request from 'supertest';
import { AccessPermissionKey, TenantStatus, UserRole } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantMiddleware } from '../tenant/tenant.middleware';
import { TenantService } from '../tenant/tenant.service';
import { MigrationSourceConnectionService } from './migration-source-connection.service';
import {
  MigrationSourceConnectionController,
  MigrationUispUsersController,
} from './migration-uisp-users.controller';
import { MigrationUispUsersResolutionService } from './migration-uisp-users-resolution.service';
import { MigrationUispUsersService } from './migration-uisp-users.service';

const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const tenantId = '68000000-0000-4000-8000-000000000101';
const schemaName = 'tenant_migration_uisp_users_guard';
const adminId = '68000000-0000-4000-8000-000000000110';
const adminWithoutPermissionId = '68000000-0000-4000-8000-000000000111';
const nocId = '68000000-0000-4000-8000-000000000112';
const tenant = { id: tenantId, schemaName, slug: 'migration-uisp', status: TenantStatus.ACTIVE };
const APP_KEY = 'clave-sintetica-http-77aa';
const ROW_ID = '68000000-0000-4000-8000-0000000001a1';
const ROW_ID_2 = '68000000-0000-4000-8000-0000000001a2';

/**
 * Seguridad HTTP de la conexión con UISP y de la lista de usuarios (ADR-110 D15): solo ADMIN
 * con `migration.import.manage`, cuerpo validado con Zod y el tenant desde el JWT.
 */
describe('Usuarios de UISP — seguridad HTTP', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const connection = {
    baseUrl: 'https://uisp.example.test',
    hasAppKey: true,
    trustedCertificateSha256: null,
    lastCheckedAt: '2026-11-15T10:00:00.000Z',
    lastCheckResult: 'OK',
    updatedAt: '2026-11-15T10:00:00.000Z',
  };
  const connections = {
    get: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(connection),
    test: jest.fn().mockResolvedValue(connection),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const uispUsers = {
    requestFetch: jest
      .fn()
      .mockResolvedValue({ status: 'EN_CURSO', requestedAt: '2026-11-15T10:00:00.000Z' }),
    list: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, lastFetchedAt: null } }),
  };
  const resolution = {
    resolve: jest.fn().mockResolvedValue([]),
    invite: jest.fn().mockResolvedValue({ invitados: 1, omitidos: 0 }),
  };
  const effectivePermissions = {
    getEffectivePermissionsForUser: jest.fn(async (userId: string) =>
      userId === adminWithoutPermissionId ? [] : [AccessPermissionKey.MIGRATION_IMPORT_MANAGE],
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
      controllers: [MigrationSourceConnectionController, MigrationUispUsersController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        PermissionsGuard,
        TenantMiddleware,
        { provide: ConfigService, useValue: { getOrThrow: () => keyPair.publicKey } },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn().mockResolvedValue(null) } },
        {
          provide: TenantService,
          useValue: {
            findById: jest.fn().mockResolvedValue(tenant),
            findBySlug: jest.fn().mockResolvedValue(tenant),
          },
        },
        { provide: EffectivePermissionsService, useValue: effectivePermissions },
        { provide: MigrationSourceConnectionService, useValue: connections },
        { provide: MigrationUispUsersService, useValue: uispUsers },
        { provide: MigrationUispUsersResolutionService, useValue: resolution },
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

  beforeEach(() => jest.clearAllMocks());

  function token(role: string, sub: string): string {
    const claims = JWT_CLAIMS_BY_TOKEN_TYPE.tenant;
    return jwtService.sign(
      {
        sub,
        email: 'a'.repeat(64),
        role,
        tenantId,
        schemaName,
        jti: `migration-uisp-${randomUUID()}`,
        type: 'tenant',
      },
      { issuer: claims.issuer, audience: claims.audience },
    );
  }

  const as = (sub: string, role: string = UserRole.ADMIN) => ({
    Authorization: `Bearer ${token(role, sub)}`,
    'X-Tenant-Slug': tenant.slug,
  });

  it('monta JwtAuthGuard, RolesGuard y PermissionsGuard en ambos controladores', () => {
    for (const controller of [MigrationSourceConnectionController, MigrationUispUsersController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ]);
    }
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/migration/uisp-connection').expect(401);
    await request(app.getHttpServer()).post('/migration/uisp-users/fetch').expect(401);
  });

  it.each([
    ['NOC con el permiso', nocId, UserRole.NOC],
    ['ADMIN sin el permiso', adminWithoutPermissionId, UserRole.ADMIN],
  ])('%s recibe 403 y no llega al servicio', async (_name, sub, role) => {
    const server = app.getHttpServer();
    await request(server)
      .put('/migration/uisp-connection')
      .set(as(sub, role))
      .send({ baseUrl: 'https://uisp.example.test', appKey: APP_KEY })
      .expect(403);
    await request(server).post('/migration/uisp-users/fetch').set(as(sub, role)).expect(403);
    await request(server).get('/migration/uisp-users').set(as(sub, role)).expect(403);
    expect(connections.upsert).not.toHaveBeenCalled();
    expect(uispUsers.requestFetch).not.toHaveBeenCalled();
    expect(uispUsers.list).not.toHaveBeenCalled();
  });

  it('GET de la conexión devuelve data null si no hay', async () => {
    const response = await request(app.getHttpServer())
      .get('/migration/uisp-connection')
      .set(as(adminId))
      .expect(200);
    expect(response.body).toEqual({ data: null });
  });

  it('PUT valida con Zod y normaliza la huella; el tenant sale del JWT', async () => {
    const response = await request(app.getHttpServer())
      .put('/migration/uisp-connection')
      .set(as(adminId))
      .send({
        baseUrl: 'https://uisp.example.test',
        appKey: APP_KEY,
        trustedCertificateSha256: 'AB'.repeat(32),
      })
      .expect(200);

    expect(connections.upsert).toHaveBeenCalledWith(
      { tenantId, schemaName },
      {
        baseUrl: 'https://uisp.example.test',
        appKey: APP_KEY,
        trustedCertificateSha256: 'ab'.repeat(32),
      },
      adminId,
    );
    expect(JSON.stringify(response.body)).not.toContain(APP_KEY);
  });

  it.each([
    ['dirección http', { baseUrl: 'http://uisp.example.test', appKey: APP_KEY }],
    ['credenciales en la dirección', { baseUrl: 'https://u:p@uisp.example.test', appKey: APP_KEY }],
    ['sin clave', { baseUrl: 'https://uisp.example.test' }],
    [
      'huella corta',
      { baseUrl: 'https://uisp.example.test', appKey: APP_KEY, trustedCertificateSha256: 'ab' },
    ],
    ['campo extra', { baseUrl: 'https://uisp.example.test', appKey: APP_KEY, tenantId }],
  ])('PUT rechaza %s con 400', async (_name, body) => {
    await request(app.getHttpServer())
      .put('/migration/uisp-connection')
      .set(as(adminId))
      .send(body)
      .expect(400);
    expect(connections.upsert).not.toHaveBeenCalled();
  });

  it('POST test responde 200 y DELETE 204', async () => {
    const server = app.getHttpServer();
    await request(server).post('/migration/uisp-connection/test').set(as(adminId)).expect(200);
    await request(server).delete('/migration/uisp-connection').set(as(adminId)).expect(204);
    expect(connections.test).toHaveBeenCalledWith({ tenantId, schemaName }, adminId);
    expect(connections.remove).toHaveBeenCalledWith({ tenantId, schemaName }, adminId);
  });

  it('Traer usuarios responde 202 con EN_CURSO', async () => {
    const response = await request(app.getHttpServer())
      .post('/migration/uisp-users/fetch')
      .set(as(adminId))
      .expect(202);
    expect(response.body).toEqual({
      data: { status: 'EN_CURSO', requestedAt: '2026-11-15T10:00:00.000Z' },
    });
    expect(uispUsers.requestFetch).toHaveBeenCalledWith({ tenantId, schemaName }, adminId);
  });

  it('la lista pasa el rol del JWT al servicio (correo completo o enmascarado)', async () => {
    const response = await request(app.getHttpServer())
      .get('/migration/uisp-users')
      .set(as(adminId))
      .expect(200);
    expect(response.body).toEqual({ data: [], meta: { total: 0, lastFetchedAt: null } });
    expect(uispUsers.list).toHaveBeenCalledWith(
      { tenantId, schemaName },
      { id: adminId, role: UserRole.ADMIN },
    );
  });

  describe('resolver e invitar (bloque C)', () => {
    it('sin token responde 401', async () => {
      const server = app.getHttpServer();
      await request(server).post('/migration/uisp-users/resolve').expect(401);
      await request(server).post('/migration/uisp-users/invite').expect(401);
    });

    it.each([
      ['NOC con el permiso', nocId, UserRole.NOC],
      ['ADMIN sin el permiso', adminWithoutPermissionId, UserRole.ADMIN],
    ])('%s recibe 403 y no llega al servicio', async (_name, sub, role) => {
      const server = app.getHttpServer();
      await request(server)
        .post('/migration/uisp-users/resolve')
        .set(as(sub, role))
        .send({ items: [{ id: ROW_ID, action: 'DESCARTAR' }] })
        .expect(403);
      await request(server)
        .post('/migration/uisp-users/invite')
        .set(as(sub, role))
        .send({ ids: [ROW_ID] })
        .expect(403);
      expect(resolution.resolve).not.toHaveBeenCalled();
      expect(resolution.invite).not.toHaveBeenCalled();
    });

    it('resolver responde 200 con data y pasa el tenant del JWT', async () => {
      const items = [
        { id: ROW_ID, action: 'CREAR', role: UserRole.TECHNICIAN, isOperationalResource: false },
        { id: ROW_ID_2, action: 'ENLAZAR' },
      ];
      const response = await request(app.getHttpServer())
        .post('/migration/uisp-users/resolve')
        .set(as(adminId))
        .send({ items })
        .expect(200);
      expect(response.body).toEqual({ data: [] });
      expect(resolution.resolve).toHaveBeenCalledWith({ tenantId, schemaName }, items, adminId);
    });

    it.each([
      ['sin ítems', { items: [] }],
      ['CREAR sin rol', { items: [{ id: ROW_ID, action: 'CREAR' }] }],
      ['rol en ENLAZAR', { items: [{ id: ROW_ID, action: 'ENLAZAR', role: UserRole.NOC }] }],
      [
        'filas repetidas',
        {
          items: [
            { id: ROW_ID, action: 'DESCARTAR' },
            { id: ROW_ID, action: 'DESCARTAR' },
          ],
        },
      ],
      ['acción desconocida', { items: [{ id: ROW_ID, action: 'BORRAR' }] }],
      ['tenant en el cuerpo', { items: [{ id: ROW_ID, action: 'DESCARTAR' }], tenantId }],
    ])('resolver rechaza %s con 400', async (_name, body) => {
      await request(app.getHttpServer())
        .post('/migration/uisp-users/resolve')
        .set(as(adminId))
        .send(body)
        .expect(400);
      expect(resolution.resolve).not.toHaveBeenCalled();
    });

    it.each([
      [404, new NotFoundException({ code: 'MIGRATION_UISP_USER_NOT_FOUND' })],
      [409, new ConflictException({ code: 'MIGRATION_UISP_USER_NOT_FOUND' })],
      [422, new UnprocessableEntityException({ code: 'MIGRATION_USER_ROLE_NOT_ALLOWED' })],
    ])('resolver propaga %s con su código', async (status, error) => {
      resolution.resolve.mockRejectedValueOnce(error);
      const response = await request(app.getHttpServer())
        .post('/migration/uisp-users/resolve')
        .set(as(adminId))
        .send({ items: [{ id: ROW_ID, action: 'CREAR', role: UserRole.SUBSCRIBER }] })
        .expect(status);
      expect(response.body.code).toBeDefined();
    });

    it('invitar responde 200 con los conteos', async () => {
      const response = await request(app.getHttpServer())
        .post('/migration/uisp-users/invite')
        .set(as(adminId))
        .send({ ids: [ROW_ID, ROW_ID_2] })
        .expect(200);
      expect(response.body).toEqual({ data: { invitados: 1, omitidos: 0 } });
      // El slug sale del tenant resuelto por el contexto verificado, nunca del cuerpo.
      expect(resolution.invite).toHaveBeenCalledWith(
        { tenantId, schemaName, tenantSlug: tenant.slug },
        [ROW_ID, ROW_ID_2],
        adminId,
      );
    });

    it.each([
      ['sin ids', { ids: [] }],
      ['id no uuid', { ids: ['x'] }],
      ['ids repetidos', { ids: [ROW_ID, ROW_ID] }],
    ])('invitar rechaza %s con 400', async (_name, body) => {
      await request(app.getHttpServer())
        .post('/migration/uisp-users/invite')
        .set(as(adminId))
        .send(body)
        .expect(400);
      expect(resolution.invite).not.toHaveBeenCalled();
    });

    it('resolver e invitar están acotados a 10 por minuto', () => {
      const proto = MigrationUispUsersController.prototype as unknown as Record<string, object>;
      for (const handler of ['resolve', 'invite']) {
        const limit = Reflect.getMetadata('THROTTLER:LIMITglobal', proto[handler]!);
        expect(limit).toBe(10);
      }
    });
  });
});
