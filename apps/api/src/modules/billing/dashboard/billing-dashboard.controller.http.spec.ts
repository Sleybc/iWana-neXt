import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import {
  AccessPermissionKey,
  BillingDashboardSummarySchema,
  UserRole,
  type BillingDashboardSummary,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  BILLING_DASHBOARD_SUMMARY_RESPONSE_SCHEMA,
  BillingDashboardController,
} from './billing-dashboard.controller';
import { BillingDashboardService } from './billing-dashboard.service';

const MONTHS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];

const summary: BillingDashboardSummary = BillingDashboardSummarySchema.parse({
  asOf: '2026-11-17',
  invoicedAmount: '1500.00',
  collectedAmount: '800.00',
  overdue: {
    amount: '100.00',
    documentCount: 1,
    subscriberCount: 1,
    buckets: [
      { bucket: '1_30', amount: '100.00', documentCount: 1 },
      { bucket: '31_60', amount: '0.00', documentCount: 0 },
      { bucket: '61_90', amount: '0.00', documentCount: 0 },
      { bucket: '90_plus', amount: '0.00', documentCount: 0 },
    ],
  },
  series: MONTHS.map((month, index) => ({
    month,
    invoicedAmount: index === 11 ? '1500.00' : '0.00',
    collectedAmount: index === 11 ? '800.00' : '0.00',
  })),
});

const BOTH = [AccessPermissionKey.BILLING_INVOICES_READ, AccessPermissionKey.BILLING_PAYMENTS_READ];

/** HLD-MOD02 v3.0 §3 N1 y §8.5: ADMIN y ACCOUNTANT con ambos permisos de lectura. */
describe('HTTP GET /billing/dashboard/summary', () => {
  const url = '/api/v1/billing/dashboard/summary';
  const actor = '7a3f69a7-9463-4085-b8a6-4d73ae0077dc';
  let app: INestApplication;
  let grants: AccessPermissionKey[];
  const service = { summary: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingDashboardController],
      providers: [
        { provide: BillingDashboardService, useValue: service },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: async () => grants },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user: unknown }>();
          const role = req.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          req.user = { sub: actor, role, type: 'tenant' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    grants = [...BOTH];
    service.summary.mockReset().mockResolvedValue(summary);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sin sesión responde 401', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    expect(service.summary).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.ACCOUNTANT])(
    '%s con ambos permisos recibe 200 sin caché',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('x-test-role', role)
        .expect(200);
      expect(response.body).toEqual({ data: summary });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(service.summary).toHaveBeenCalledWith();
    },
  );

  it.each([
    UserRole.SUPPORT,
    UserRole.SALES,
    UserRole.NOC,
    UserRole.AUDITOR,
    UserRole.TECHNICIAN,
    UserRole.HR,
    UserRole.SUBSCRIBER,
    UserRole.CONTRACTOR,
    UserRole.PARTNER,
    UserRole.INVESTOR,
  ])('el rol %s recibe 403 aunque tenga ambos permisos', async (role) => {
    await request(app.getHttpServer()).get(url).set('x-test-role', role).expect(403);
    expect(service.summary).not.toHaveBeenCalled();
  });

  it.each([
    [UserRole.ADMIN, [AccessPermissionKey.BILLING_INVOICES_READ]],
    [UserRole.ADMIN, [AccessPermissionKey.BILLING_PAYMENTS_READ]],
    [UserRole.ACCOUNTANT, [AccessPermissionKey.BILLING_INVOICES_READ]],
    [UserRole.ACCOUNTANT, [AccessPermissionKey.BILLING_PAYMENTS_READ]],
    [UserRole.ACCOUNTANT, []],
  ])('%s con el permiso revocado (%j) recibe 403', async (role, granted) => {
    grants = granted;
    await request(app.getHttpServer()).get(url).set('x-test-role', role).expect(403);
    expect(service.summary).not.toHaveBeenCalled();
  });

  it.each([['months=24'], ['tenantId=00000000-0000-4000-8000-000000000001'], ['asOf=2026-01-01']])(
    'rechaza cualquier parámetro (%s) con 400',
    async (queryString) => {
      await request(app.getHttpServer())
        .get(`${url}?${queryString}`)
        .set('x-test-role', UserRole.ADMIN)
        .expect(400);
      expect(service.summary).not.toHaveBeenCalled();
    },
  );

  it('publica la operación en OpenAPI con el esquema espejo del contrato', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
    const operation = document.paths['/api/v1/billing/dashboard/summary']?.get;
    expect(operation).toBeDefined();
    expect(operation?.parameters ?? []).toEqual([]);
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403']);
    const ok = operation?.responses['200'] as { content: Record<string, { schema: unknown }> };
    expect(ok.content['application/json']?.schema).toEqual(
      BILLING_DASHBOARD_SUMMARY_RESPONSE_SCHEMA,
    );
    const data = (
      BILLING_DASHBOARD_SUMMARY_RESPONSE_SCHEMA.properties as Record<
        string,
        { properties: Record<string, unknown> }
      >
    )['data']!;
    expect(Object.keys(data.properties).sort()).toEqual(
      Object.keys(BillingDashboardSummarySchema.innerType().shape).sort(),
    );
  });
});
