import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, PlatformRole, UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { SubscribersBlockedTitularGuard } from '../guards/subscribers-blocked-titular.guard';
import {
  SubscriberTagAssignmentController,
  SubscriberTagCatalogController,
} from './subscriber-tags.controller';
import { SubscriberTagsService } from './subscriber-tags.service';

const SUBSCRIBER_ID = '00000000-0000-4000-a000-0000000000a1';
const TAG_ID = '00000000-0000-4000-a000-0000000000b2';
const READ = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
const MANAGE = [
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
];

class HeaderJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: JwtPayload }>();
    req.user = JSON.parse(req.headers['x-test-user'] ?? '{}') as JwtPayload;
    return true;
  }
}

function tenantUser(role: UserRole): string {
  return JSON.stringify({
    sub: `user-${role.toLowerCase()}`,
    role,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    type: 'tenant',
  });
}

describe('Etiquetas del suscriptor — HTTP (ADR-110 D8)', () => {
  let app: INestApplication;
  const tags = {
    listCatalog: jest.fn().mockResolvedValue([]),
    createTag: jest.fn().mockResolvedValue({ id: TAG_ID }),
    updateTag: jest.fn().mockResolvedValue({ id: TAG_ID }),
    deleteTag: jest.fn().mockResolvedValue(undefined),
    assign: jest.fn().mockResolvedValue([]),
    unassign: jest.fn().mockResolvedValue([]),
  };
  const permissions = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriberTagCatalogController, SubscriberTagAssignmentController],
      providers: [
        { provide: SubscriberTagsService, useValue: tags },
        { provide: EffectivePermissionsService, useValue: permissions },
        Reflector,
        RolesGuard,
        PermissionsGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderJwtGuard)
      .overrideGuard(SubscribersBlockedTitularGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.AUDITOR, UserRole.NOC])(
    'GET catálogo con crm.subscribers.read: %s lo lee',
    async (role) => {
      permissions.getEffectivePermissionsForUser.mockResolvedValue(READ);
      const res = await request(app.getHttpServer())
        .get('/crm/subscriber-tags')
        .set('x-test-user', tenantUser(role))
        .expect(200);
      expect(res.body).toEqual({ data: [] });
    },
  );

  it('GET catálogo sin permiso o con token de plataforma: 403', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/crm/subscriber-tags')
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .expect(403);
    await request(app.getHttpServer())
      .get('/crm/subscriber-tags')
      .set(
        'x-test-user',
        JSON.stringify({ sub: 'p', role: PlatformRole.SYSTEM_ADMIN, type: 'platform' }),
      )
      .expect(403);
    expect(tags.listCatalog).not.toHaveBeenCalled();
  });

  it('POST catálogo: ADMIN con manage crea; el color llega en mayúsculas', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
    await request(app.getHttpServer())
      .post('/crm/subscriber-tags')
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .send({ name: ' VIP ', color: '#aabbcc' })
      .expect(201);
    expect(tags.createTag).toHaveBeenCalledWith({ name: 'VIP', color: '#AABBCC' }, 'user-admin');
  });

  it.each([UserRole.SALES, UserRole.SUPPORT])(
    'POST/PATCH/DELETE catálogo: %s con manage recibe 403',
    async (role) => {
      permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
      const server = app.getHttpServer();
      const user = tenantUser(role);
      await request(server)
        .post('/crm/subscriber-tags')
        .set('x-test-user', user)
        .send({ name: 'X', color: '#000000' })
        .expect(403);
      await request(server)
        .patch(`/crm/subscriber-tags/${TAG_ID}`)
        .set('x-test-user', user)
        .send({ color: '#000000' })
        .expect(403);
      await request(server)
        .delete(`/crm/subscriber-tags/${TAG_ID}`)
        .set('x-test-user', user)
        .expect(403);
      expect(tags.createTag).not.toHaveBeenCalled();
      expect(tags.deleteTag).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ name: '', color: '#000000' }],
    [{ name: 'X', color: 'rojo' }],
    [{ name: 'X'.repeat(41), color: '#000000' }],
    [{ name: 'X', color: '#000000', extra: true }],
  ])('POST catálogo inválido %j: 400', async (body) => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
    await request(app.getHttpServer())
      .post('/crm/subscriber-tags')
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .send(body)
      .expect(400);
    expect(tags.createTag).not.toHaveBeenCalled();
  });

  it('PATCH vacío: 400; DELETE: 204', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
    const server = app.getHttpServer();
    const user = tenantUser(UserRole.ADMIN);
    await request(server)
      .patch(`/crm/subscriber-tags/${TAG_ID}`)
      .set('x-test-user', user)
      .send({})
      .expect(400);
    await request(server)
      .delete(`/crm/subscriber-tags/${TAG_ID}`)
      .set('x-test-user', user)
      .expect(204);
    expect(tags.deleteTag).toHaveBeenCalledWith(TAG_ID, 'user-admin');
  });

  it.each([UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT])(
    'PUT/DELETE asignación: %s con manage asigna y quita',
    async (role) => {
      permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
      const server = app.getHttpServer();
      await request(server)
        .put(`/crm/subscribers/${SUBSCRIBER_ID}/tags/${TAG_ID}`)
        .set('x-test-user', tenantUser(role))
        .expect(200);
      await request(server)
        .delete(`/crm/subscribers/${SUBSCRIBER_ID}/tags/${TAG_ID}`)
        .set('x-test-user', tenantUser(role))
        .expect(200);
      expect(tags.assign).toHaveBeenCalledWith(SUBSCRIBER_ID, TAG_ID, `user-${role.toLowerCase()}`);
      expect(tags.unassign).toHaveBeenCalledWith(
        SUBSCRIBER_ID,
        TAG_ID,
        `user-${role.toLowerCase()}`,
      );
    },
  );

  it('PUT asignación: NOC con manage o ADMIN sin manage reciben 403; uuid inválido 400', async () => {
    const server = app.getHttpServer();
    permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
    await request(server)
      .put(`/crm/subscribers/${SUBSCRIBER_ID}/tags/${TAG_ID}`)
      .set('x-test-user', tenantUser(UserRole.NOC))
      .expect(403);
    permissions.getEffectivePermissionsForUser.mockResolvedValue(READ);
    await request(server)
      .put(`/crm/subscribers/${SUBSCRIBER_ID}/tags/${TAG_ID}`)
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .expect(403);
    permissions.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
    await request(server)
      .put(`/crm/subscribers/${SUBSCRIBER_ID}/tags/no-es-uuid`)
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .expect(400);
    expect(tags.assign).not.toHaveBeenCalled();
  });
});
