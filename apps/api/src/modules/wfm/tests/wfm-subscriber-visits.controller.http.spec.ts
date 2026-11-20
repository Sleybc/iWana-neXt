import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { WfmSubscriberVisitsController } from '../wfm-subscriber-visits.controller';
import { SubscriberUpcomingVisitsService } from '../services/subscriber-upcoming-visits.service';

const ROLE_BY_TOKEN: Record<string, UserRole> = {
  'Bearer admin-token': UserRole.ADMIN,
  'Bearer support-token': UserRole.SUPPORT,
  'Bearer sales-token': UserRole.SALES,
  'Bearer tech-token': UserRole.TECHNICIAN,
};

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { headers: Record<string, string>; user?: unknown } };
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const role = ROLE_BY_TOKEN[req.headers['authorization'] ?? ''];
      if (!role) throw new UnauthorizedException();
      req.user = {
        sub: 'user-001',
        role,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti',
        type: 'tenant',
      };
      return true;
    }
  },
}));
jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: { role: string } } };
      getHandler: () => object;
    }): boolean {
      const roles: string[] = Reflect.getMetadata('roles', context.getHandler()) ?? [];
      const user = context.switchToHttp().getRequest().user;
      if (roles.length > 0 && (!user || !roles.includes(user.role))) {
        throw new ForbiddenException();
      }
      return true;
    }
  },
}));

describe('WfmSubscriberVisitsController HTTP (spec 2026-11-20 v1.1, CA-15)', () => {
  let app: INestApplication;
  const SUBSCRIBER_ID = '11111111-1111-4111-8111-111111111111';
  const serviceMock = { list: jest.fn() };
  const permissionsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WfmSubscriberVisitsController],
      providers: [
        { provide: SubscriberUpcomingVisitsService, useValue: serviceMock },
        { provide: EffectivePermissionsService, useValue: permissionsMock },
        Reflector,
        PermissionsGuard,
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.WFM_SCHEDULE_READ,
    ]);
    serviceMock.list.mockResolvedValue({ items: [], total: 0, truncated: false });
  });

  const url = (id: string) => `/api/v1/wfm/subscribers/${id}/upcoming-visits`;

  it('responde 200 con wfm.schedule.read y delega con el actor del JWT', async () => {
    const response = await request(app.getHttpServer())
      .get(url(SUBSCRIBER_ID))
      .set('Authorization', 'Bearer support-token')
      .expect(200);
    expect(response.body).toEqual({ items: [], total: 0, truncated: false });
    expect(serviceMock.list).toHaveBeenCalledWith(
      SUBSCRIBER_ID,
      expect.objectContaining({ role: UserRole.SUPPORT, tenantId: 'tenant-001' }),
    );
  });

  it('deniega sin wfm.schedule.read aunque el rol esté permitido', async () => {
    permissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get(url(SUBSCRIBER_ID))
      .set('Authorization', 'Bearer admin-token')
      .expect(403);
    expect(serviceMock.list).not.toHaveBeenCalled();
  });

  it.each(['Bearer sales-token', 'Bearer tech-token'])(
    'deniega el rol fuera de alcance (%s)',
    async (token) => {
      await request(app.getHttpServer())
        .get(url(SUBSCRIBER_ID))
        .set('Authorization', token)
        .expect(403);
      expect(serviceMock.list).not.toHaveBeenCalled();
    },
  );

  it('rechaza un subscriberId que no es UUID', async () => {
    await request(app.getHttpServer())
      .get(url('no-es-uuid'))
      .set('Authorization', 'Bearer admin-token')
      .expect(400);
    expect(serviceMock.list).not.toHaveBeenCalled();
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get(url(SUBSCRIBER_ID)).expect(401);
  });
});
