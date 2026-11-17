// SubscribersModule arrastra AuthModule (otplib ESM); solo se lee su metadato de controladores.
jest.mock('otplib', () => ({
  TOTP: jest.fn(),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import {
  AccessPermissionKey,
  SubscribersDashboardSummarySchema,
  UserRole,
  type SubscribersDashboardSummary,
} from '@iwana/shared';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { AuditService } from '../../../audit/audit.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { SubscribersController } from '../subscribers.controller';
import { SubscribersService } from '../subscribers.service';
import { SubscriberLifecycleService } from '../subscriber-lifecycle.service';
import { SubscribersModule } from '../subscribers.module';
import { SubscribersDashboardController } from './subscribers-dashboard.controller';
import { SubscribersDashboardService } from './subscribers-dashboard.service';
import { monthsEndingAt } from './subscribers-dashboard.service';

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

const ALLOWED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT];
const EXCLUDED_ROLES = Object.values(UserRole).filter((role) => !ALLOWED_ROLES.includes(role));

const PATH = '/api/v1/crm/subscribers/dashboard/summary';

function summaryFixture(): SubscribersDashboardSummary {
  const series = monthsEndingAt('2026-11', 12).map((month) => ({
    month,
    activations: month === '2026-11' ? 3 : 0,
    cancellations: month === '2026-11' ? 1 : 0,
  }));
  return { asOf: '2026-11-17', activations: 3, cancellations: 1, series };
}

describe('SubscribersDashboardController — GET /crm/subscribers/dashboard/summary', () => {
  let app: INestApplication;
  const dashboardServiceMock = { getSummary: jest.fn() };
  const subscribersServiceMock = { findById: jest.fn() };
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      // Mismo orden que SubscribersModule: el dashboard antes que `:id`.
      controllers: [SubscribersDashboardController, SubscribersController],
      providers: [
        { provide: SubscribersDashboardService, useValue: dashboardServiceMock },
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: SubscriberLifecycleService, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: EffectivePermissionsService, useValue: permsMock },
        { provide: IPrivacyMarksReadPort, useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
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
    dashboardServiceMock.getSummary.mockResolvedValue(summaryFixture());
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
  });

  it.each(ALLOWED_ROLES.map((role) => role.toLowerCase()))(
    '200 para %s con crm.subscribers.read y respuesta conforme al contrato',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${role}-token`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(SubscribersDashboardSummarySchema.parse(response.body.data)).toEqual(summaryFixture());
      expect(dashboardServiceMock.getSummary).toHaveBeenCalledTimes(1);
    },
  );

  it('la ruta no la captura `crm/subscribers/:id`', async () => {
    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(dashboardServiceMock.getSummary).toHaveBeenCalledTimes(1);
    expect(subscribersServiceMock.findById).not.toHaveBeenCalled();
  });

  it('SubscribersModule registra el dashboard antes que SubscribersController', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SubscribersModule) as
      | unknown[]
      | undefined;
    expect(controllers).toBeDefined();
    expect(controllers!.indexOf(SubscribersDashboardController)).toBeGreaterThanOrEqual(0);
    expect(controllers!.indexOf(SubscribersDashboardController)).toBeLessThan(
      controllers!.indexOf(SubscribersController),
    );
  });

  it.each(EXCLUDED_ROLES.map((role) => role.toLowerCase()))(
    '403 para %s aunque tenga el permiso',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', `Bearer ${role}-token`);

      expect(response.status).toBe(403);
      expect(dashboardServiceMock.getSummary).not.toHaveBeenCalled();
    },
  );

  it('403 para ADMIN con el permiso revocado', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(403);
    expect(dashboardServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('401 sin token', async () => {
    const response = await request(app.getHttpServer()).get(PATH);

    expect(response.status).toBe(401);
    expect(dashboardServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('400 con cualquier parámetro de consulta (query vacía estricta)', async () => {
    const response = await request(app.getHttpServer())
      .get(`${PATH}?months=24`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(400);
    expect(dashboardServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('documenta la ruta en OpenAPI con su esquema y sin parámetros', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger N2').setVersion('1.0').build(),
    );
    const operation = document.paths[PATH]?.get;
    const schema = (operation?.responses?.['200'] as { content?: Record<string, unknown> })
      ?.content?.['application/json'] as { schema?: { required?: string[] } } | undefined;

    expect(operation).toBeDefined();
    expect(operation?.parameters ?? []).toHaveLength(0);
    expect(operation?.security).toEqual([{ 'access-token': [] }]);
    expect(schema?.schema?.required).toEqual(['data']);
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });
});
