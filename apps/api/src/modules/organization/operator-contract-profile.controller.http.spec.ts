import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey } from '@iwana/shared';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OperatorContractProfileController } from './operator-contract-profile.controller';
import { OperatorContractProfileService } from './operator-contract-profile.service';

jest.mock('../auth/guards/jwt-auth.guard', () => {
  const { UserRole: Role } = jest.requireActual('@iwana/shared');
  const users: Record<string, object> = {
    'Bearer admin': { sub: 'usr-admin', role: Role.ADMIN, tenantId: 't', schemaName: 's' },
    'Bearer support': { sub: 'usr-support', role: Role.SUPPORT, tenantId: 't', schemaName: 's' },
  };
  return {
    JwtAuthGuard: class {
      canActivate(context: {
        switchToHttp: () => {
          getRequest: () => { headers: Record<string, string | undefined>; user?: object };
        };
      }): boolean {
        const req = context.switchToHttp().getRequest();
        const user = users[req.headers['authorization'] ?? ''];
        if (!user) {
          const { UnauthorizedException: Unauthorized } = jest.requireActual('@nestjs/common');
          throw new Unauthorized();
        }
        req.user = user;
        return true;
      }
    },
  };
});

jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user: { role: string } } };
      getHandler: () => object;
    }): boolean {
      const roles: string[] = Reflect.getMetadata('roles', context.getHandler()) ?? [];
      if (roles.length && !roles.includes(context.switchToHttp().getRequest().user.role)) {
        const { ForbiddenException: Forbidden } = jest.requireActual('@nestjs/common');
        throw new Forbidden();
      }
      return true;
    }
  },
}));

const view = {
  profile: {
    legalName: 'Operador Sintético SAS',
    nit: '900000001',
    qualityAndCoverageUrl: null,
    customerServiceChannels: [],
    reconnectionFee: null,
    annualIncreaseCapPercent: null,
    equipmentIncidentReportChannel: null,
    otherConditions: null,
    updatedAt: null,
  },
  missingFields: ['qualityAndCoverageUrl'],
};

const body = {
  qualityAndCoverageUrl: 'https://operador.example/calidad',
  customerServiceChannels: [{ kind: 'EMAIL', value: 'soporte@operador.example', label: null }],
  reconnectionFee: 12000.5,
  annualIncreaseCapPercent: 4,
  equipmentIncidentReportChannel: 'Línea de soporte',
  otherConditions: null,
};

describe('OperatorContractProfileController HTTP', () => {
  let app: INestApplication;
  const service = { get: jest.fn(), update: jest.fn() };
  const permissions = { getEffectivePermissionsForUser: jest.fn() };
  const url = '/api/v1/organization/contract-profile';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OperatorContractProfileController],
      providers: [
        { provide: OperatorContractProfileService, useValue: service },
        { provide: EffectivePermissionsService, useValue: permissions },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    permissions.getEffectivePermissionsForUser.mockImplementation(async (userId: string) =>
      userId === 'usr-admin'
        ? [
            AccessPermissionKey.ORGANIZATION_SITES_READ,
            AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
          ]
        : [AccessPermissionKey.ORGANIZATION_SITES_READ],
    );
    service.get.mockResolvedValue(view);
    service.update.mockResolvedValue(view);
  });

  it('GET devuelve los datos y los obligatorios faltantes en meta', async () => {
    const response = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer support')
      .expect(200);
    expect(response.body).toEqual({
      data: view.profile,
      meta: { missingFields: ['qualityAndCoverageUrl'] },
    });
  });

  it('GET sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
  });

  it('PUT guarda con el usuario del JWT', async () => {
    await request(app.getHttpServer())
      .put(url)
      .set('Authorization', 'Bearer admin')
      .send(body)
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(
      body,
      expect.objectContaining({ userId: 'usr-admin' }),
    );
  });

  it('PUT rechaza razón social o NIT en el cuerpo (no se editan aquí)', async () => {
    await request(app.getHttpServer())
      .put(url)
      .set('Authorization', 'Bearer admin')
      .send({ ...body, legalName: 'Otra' })
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('PUT rechaza montos con más de dos decimales y topes mayores a 100', async () => {
    for (const invalid of [{ reconnectionFee: 1.234 }, { annualIncreaseCapPercent: 101 }]) {
      await request(app.getHttpServer())
        .put(url)
        .set('Authorization', 'Bearer admin')
        .send({ ...body, ...invalid })
        .expect(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });

  it('PUT exige rol de administración', async () => {
    await request(app.getHttpServer())
      .put(url)
      .set('Authorization', 'Bearer support')
      .send(body)
      .expect(403);
    expect(service.update).not.toHaveBeenCalled();
  });
});
