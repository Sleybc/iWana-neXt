import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import {
  AccessPermissionKey,
  AssuranceDashboardSeriesSchema,
  UserRole,
  type AssuranceDashboardSeries,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AssuranceDashboardSeriesController } from './assurance-dashboard-series.controller';
import {
  AssuranceDashboardSeriesService,
  datesEndingAt,
} from './assurance-dashboard-series.service';

/**
 * Solo se sustituye JwtAuthGuard (como en N1): `Bearer <rol>-token` autentica con ese rol de
 * tenant. RolesGuard y PermissionsGuard son los reales.
 */
const fakeJwtAuthGuard = {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: JwtPayload }>();
    const match = /^Bearer ([a-z]+)-token$/u.exec(req.headers.authorization ?? '');
    const role = match?.[1]?.toUpperCase() as UserRole | undefined;
    if (!role || !Object.values(UserRole).includes(role)) {
      throw new UnauthorizedException('Token inválido');
    }
    req.user = {
      sub: `${role.toLowerCase()}-001`,
      role,
      tenantId: 't-001',
      schemaName: 'tenant_t_001',
      type: 'tenant',
    } as JwtPayload;
    return true;
  },
};

const ALLOWED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT];
const EXCLUDED_ROLES = Object.values(UserRole).filter((role) => !ALLOWED_ROLES.includes(role));

const PATH = '/api/v1/assurance/dashboard/series';

function seriesFixture(days: number): AssuranceDashboardSeries {
  return {
    asOf: '2026-11-17',
    days,
    series: datesEndingAt('2026-11-17', days).map((date) => ({ date, created: 0, resolved: 0 })),
  };
}

describe('AssuranceDashboardSeriesController — GET /assurance/dashboard/series', () => {
  let app: INestApplication;
  const seriesServiceMock = { getSeries: jest.fn() };
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AssuranceDashboardSeriesController],
      providers: [
        { provide: AssuranceDashboardSeriesService, useValue: seriesServiceMock },
        { provide: EffectivePermissionsService, useValue: permsMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    seriesServiceMock.getSeries.mockImplementation(async (days: number) => seriesFixture(days));
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
    ]);
  });

  it.each(ALLOWED_ROLES.map((role) => role.toLowerCase()))(
    '200 para %s con assurance.tickets.read; 14 días por defecto',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${role}-token`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(AssuranceDashboardSeriesSchema.parse(response.body.data)).toEqual(seriesFixture(14));
      expect(seriesServiceMock.getSeries).toHaveBeenCalledWith(14);
    },
  );

  it.each([7, 31])('acepta days=%i en el borde del rango', async (days) => {
    const response = await request(app.getHttpServer())
      .get(`${PATH}?days=${days}`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body.data.series).toHaveLength(days);
    expect(seriesServiceMock.getSeries).toHaveBeenCalledWith(days);
  });

  it.each(['days=6', 'days=32', 'days=abc', 'days=7.5', 'days=14&tenant=otro', 'from=2026-01-01'])(
    '400 con %s',
    async (query) => {
      const response = await request(app.getHttpServer())
        .get(`${PATH}?${query}`)
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(400);
      expect(seriesServiceMock.getSeries).not.toHaveBeenCalled();
    },
  );

  it.each(EXCLUDED_ROLES.map((role) => role.toLowerCase()))(
    '403 para %s aunque tenga el permiso',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${role}-token`);

      expect(response.status).toBe(403);
      expect(seriesServiceMock.getSeries).not.toHaveBeenCalled();
    },
  );

  it('403 para ADMIN con el permiso revocado', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
    ]);

    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(403);
    expect(seriesServiceMock.getSeries).not.toHaveBeenCalled();
  });

  it('401 sin token', async () => {
    const response = await request(app.getHttpServer()).get(PATH);

    expect(response.status).toBe(401);
    expect(seriesServiceMock.getSeries).not.toHaveBeenCalled();
  });

  it('documenta la ruta en OpenAPI con `days` y su esquema', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger N3').setVersion('1.0').build(),
    );
    const operation = document.paths[PATH]?.get;
    const days = (operation?.parameters ?? []).find(
      (parameter) => 'name' in parameter && parameter.name === 'days',
    ) as { in?: string; required?: boolean; schema?: Record<string, unknown> } | undefined;
    const schema = (operation?.responses?.['200'] as { content?: Record<string, unknown> })
      ?.content?.['application/json'] as { schema?: { required?: string[] } } | undefined;

    expect(days).toMatchObject({ in: 'query', required: false });
    expect(days?.schema).toMatchObject({ minimum: 7, maximum: 31 });
    expect(operation?.security).toEqual([{ 'access-token': [] }]);
    expect(schema?.schema?.required).toEqual(['data']);
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });
});
