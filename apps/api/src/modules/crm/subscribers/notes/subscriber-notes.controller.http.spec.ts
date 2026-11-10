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
import { SubscriberNotesController } from './subscriber-notes.controller';
import { SubscriberNotesService } from './subscriber-notes.service';

const SUBSCRIBER_ID = '00000000-0000-4000-a000-0000000000a1';

/** El token del test es el JSON del payload; JwtAuthGuard real queda fuera de alcance. */
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

describe('SubscriberNotesController — lectura sin techo de roles (decisión 2026-11-10)', () => {
  let app: INestApplication;
  const notesService = {
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
    create: jest.fn(),
  };
  const permissions = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriberNotesController],
      providers: [
        { provide: SubscriberNotesService, useValue: notesService },
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

  it.each([
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.AUDITOR,
    UserRole.NOC,
    UserRole.TECHNICIAN,
  ])('GET con crm.subscribers.read: %s lee las notas', async (role) => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    await request(app.getHttpServer())
      .get(`/crm/subscribers/${SUBSCRIBER_ID}/notes`)
      .set('x-test-user', tenantUser(role))
      .expect(200);

    expect(notesService.list).toHaveBeenCalledWith(
      SUBSCRIBER_ID,
      { id: `user-${role.toLowerCase()}`, role },
      {},
    );
  });

  it('GET sin crm.subscribers.read: 403 aunque el rol antes estuviera habilitado', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get(`/crm/subscribers/${SUBSCRIBER_ID}/notes`)
      .set('x-test-user', tenantUser(UserRole.ADMIN))
      .expect(403);
    expect(notesService.list).not.toHaveBeenCalled();
  });

  it('GET con token de plataforma: 403, la frontera de tipo de token se conserva', async () => {
    await request(app.getHttpServer())
      .get(`/crm/subscribers/${SUBSCRIBER_ID}/notes`)
      .set(
        'x-test-user',
        JSON.stringify({
          sub: 'platform-001',
          role: PlatformRole.SYSTEM_ADMIN,
          tenantId: null,
          schemaName: null,
          type: 'platform',
        }),
      )
      .expect(403);
    expect(notesService.list).not.toHaveBeenCalled();
  });

  it('POST no cambia: NOC con crm.subscribers.manage sigue sin poder crear notas', async () => {
    permissions.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);

    await request(app.getHttpServer())
      .post(`/crm/subscribers/${SUBSCRIBER_ID}/notes`)
      .set('x-test-user', tenantUser(UserRole.NOC))
      .send({ body: 'Nota sintética' })
      .expect(403);
    expect(notesService.create).not.toHaveBeenCalled();
  });
});
