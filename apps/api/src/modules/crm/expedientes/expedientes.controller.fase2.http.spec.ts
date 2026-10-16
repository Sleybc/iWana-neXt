import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, AuditAction, UserRole } from '@iwana/shared';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AuditService } from '../../audit/audit.service';
import { ExpedientesController } from './expedientes.controller';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { PipelineRecommendationService } from './pipeline-recommendation.service';
import { ExpedienteDetailBootstrapService } from './expediente-detail-bootstrap.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: any): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const h = req.headers.authorization;
      const map: Record<string, any> = {
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer sales-token': {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer support-token': {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer admin-token': {
          sub: 'admin-001',
          role: UserRole.ADMIN,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer technician-token': {
          sub: 'technician-001',
          role: UserRole.TECHNICIAN,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
        'Bearer accountant-token': {
          sub: 'accountant-001',
          role: UserRole.ACCOUNTANT,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        },
      };
      if (h && map[h]) {
        req.user = map[h];
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));
jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: any): boolean {
      const req = context.switchToHttp().getRequest();
      const user: any = req.user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role)) throw new ForbiddenException('No tiene permisos');
      return true;
    }
  },
}));

describe('ExpedientesController Fase2', () => {
  let app: INestApplication;
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };
  const expedienteServiceMock = {
    findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    create: jest.fn().mockResolvedValue({ id: '1' }),
    findById: jest.fn().mockResolvedValue({ id: '1' }),
    getPrivacyMarksForExpediente: jest.fn().mockResolvedValue([]),
    retryConversionEvent: jest.fn().mockResolvedValue({ retried: true, resolved: true }),
    getTimelineSummary: jest.fn().mockResolvedValue({ changes: [], activities: [], metadata: {} }),
    getTimelinePage: jest.fn().mockResolvedValue({ data: [], meta: { totalItems: 0 } }),
    getDocumentSupports: jest.fn().mockResolvedValue([]),
    getDocumentSupportFile: jest.fn().mockResolvedValue({
      filePath: __filename,
      fileName: 'fixture.txt',
      mimeType: 'text/plain',
    }),
    uploadDocumentSupport: jest.fn().mockResolvedValue({}),
    updateDocumentSupportStatus: jest.fn().mockResolvedValue({}),
    deleteDocumentSupport: jest.fn().mockResolvedValue({}),
    createContactAttempt: jest.fn().mockResolvedValue({}),
    listContactAttempts: jest.fn().mockResolvedValue([]),
    createConsent: jest.fn().mockResolvedValue({}),
    listConsents: jest.fn().mockResolvedValue([]),
    revokeConsent: jest.fn().mockResolvedValue({}),
    createCoverageCheck: jest.fn().mockResolvedValue({}),
    listCoverageChecks: jest.fn().mockResolvedValue([]),
  };
  const auditMock = { log: jest.fn().mockResolvedValue(undefined) };
  const statusMock = { validateTransition: jest.fn().mockResolvedValue({ valid: true }) };
  const completenessMock = {
    calculate: jest.fn().mockResolvedValue({
      sectionCompleteness: {},
      installationReadiness: {},
      missingRequirements: [],
    }),
  };
  const pipelineMock = { getRecommendation: jest.fn().mockResolvedValue(null) };
  const bootstrapMock = { getDetailBootstrap: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ExpedientesController],
      providers: [
        { provide: ExpedienteService, useValue: expedienteServiceMock },
        { provide: StatusTransitionService, useValue: statusMock },
        { provide: CompletenessCalculator, useValue: completenessMock },
        { provide: PipelineRecommendationService, useValue: pipelineMock },
        { provide: ExpedienteDetailBootstrapService, useValue: bootstrapMock },
        { provide: EffectivePermissionsService, useValue: permsMock },
        { provide: AuditService, useValue: auditMock },
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
    permsMock.getEffectivePermissionsForUser.mockReset();
  });

  it('GET lista — AUDITOR con permiso 200', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_EXPEDIENTES_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });
  it('GET lista — AUDITOR sin permiso 403', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });
  it('POST — sin permiso 403 aunque rol pase', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/expedientes')
      .set('Authorization', 'Bearer sales-token')
      .send({ name: 'Test', channel: 'WEB' })
      .expect(403);
  });

  it.each([
    ['SALES', 'sales-token'],
    ['SUPPORT', 'support-token'],
  ])(
    'POST reintento de conversión — %s con CRM_SUBSCRIBERS_MANAGE recibe 403',
    async (_role, token) => {
      permsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post('/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001/retry-conversion')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(expedienteServiceMock.retryConversionEvent).not.toHaveBeenCalled();
    },
  );

  it('POST reintento de conversión — ADMIN con CRM_SUBSCRIBERS_MANAGE pasa', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001/retry-conversion')
      .set('Authorization', 'Bearer admin-token')
      .expect(201)
      .expect({ data: { retried: true, resolved: true } });
    expect(expedienteServiceMock.retryConversionEvent).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'admin-001',
    );
  });

  const blockedReadRoutes = [
    {
      name: 'timeline',
      path: '/timeline',
      method: () => expedienteServiceMock.getTimelineSummary,
      action: AuditAction.LIST_ACCESS,
      grantedBy: 'list' as const,
    },
    {
      name: 'soportes',
      path: '/document-supports',
      method: () => expedienteServiceMock.getDocumentSupports,
      action: AuditAction.LIST_ACCESS,
      grantedBy: 'list' as const,
    },
    {
      name: 'archivo de soporte',
      path: '/document-supports/DOCUMENTO/version-fixture/file',
      method: () => expedienteServiceMock.getDocumentSupportFile,
      action: AuditAction.RECORD_ACCESS,
      grantedBy: 'record' as const,
    },
    {
      name: 'intentos de contacto',
      path: '/contact-attempts',
      method: () => expedienteServiceMock.listContactAttempts,
      action: AuditAction.LIST_ACCESS,
      grantedBy: 'list' as const,
    },
    {
      name: 'consentimientos',
      path: '/consents',
      method: () => expedienteServiceMock.listConsents,
      action: AuditAction.LIST_ACCESS,
      grantedBy: 'list' as const,
    },
    {
      name: 'verificaciones de cobertura',
      path: '/coverage-checks',
      method: () => expedienteServiceMock.listCoverageChecks,
      action: AuditAction.LIST_ACCESS,
      grantedBy: 'list' as const,
    },
  ];
  const blockedReadActors = [
    { role: 'SALES', token: 'sales-token' },
    { role: 'TECHNICIAN', token: 'technician-token' },
    { role: 'ACCOUNTANT', token: 'accountant-token' },
  ];
  const blockedReadPermissions = [
    { permission: AccessPermissionKey.CRM_BLOCKED_DATA_READ, grantedBy: 'CRM_BLOCKED_DATA_READ' },
    { permission: AccessPermissionKey.PRIVACY_READ, grantedBy: 'PRIVACY_READ' },
  ];

  for (const route of blockedReadRoutes) {
    it.each(blockedReadActors)(
      `GET ${route.name} — $role sin permiso de datos bloqueados devuelve 403`,
      async ({ token }) => {
        permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
        expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);

        await request(app.getHttpServer())
          .get(`/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001${route.path}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403)
          .expect(({ body }) => expect(body.code).toBe('PRIVACY_DATA_BLOCKED'));

        expect(route.method()).not.toHaveBeenCalled();
        expect(auditMock.log).not.toHaveBeenCalled();
      },
    );

    for (const access of blockedReadPermissions) {
      it.each(blockedReadActors)(
        `GET ${route.name} — $role con ${access.grantedBy} obtiene 200 y auditoría`,
        async ({ token, role }) => {
          permsMock.getEffectivePermissionsForUser.mockResolvedValue([access.permission]);
          expedienteServiceMock.findById.mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000001',
            anonymizedAt: null,
          });
          expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue([
            'DATOS_BLOQUEADOS',
          ]);

          await request(app.getHttpServer())
            .get(`/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001${route.path}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

          expect(route.method()).toHaveBeenCalled();
          expect(auditMock.log).toHaveBeenCalledWith(
            expect.objectContaining({
              action: route.action,
              newValue: expect.objectContaining({
                role,
                privacyMark: 'DATOS_BLOQUEADOS',
                grantedBy: access.grantedBy,
                ...(route.grantedBy === 'list' ? { blockedServed: expect.any(Number) } : {}),
              }),
            }),
          );
        },
      );
    }
  }

  it('GET subrecurso bloqueado — SALES con CRM_EXPEDIENTES_READ pero sin permiso especial recibe PRIVACY_DATA_BLOCKED', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_EXPEDIENTES_READ,
    ]);
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);

    await request(app.getHttpServer())
      .get('/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001/timeline')
      .set('Authorization', 'Bearer sales-token')
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('PRIVACY_DATA_BLOCKED'));
  });

  it.each([
    {
      name: 'cargar soporte',
      method: 'POST',
      path: '/document-supports/DOCUMENTO/upload',
      body: undefined,
    },
    {
      name: 'cambiar estado de soporte',
      method: 'PATCH',
      path: '/document-supports/DOCUMENTO/version-fixture/status',
      body: { status: 'APPROVED' },
    },
    {
      name: 'eliminar soporte',
      method: 'DELETE',
      path: '/document-supports/DOCUMENTO/version-fixture',
      body: undefined,
    },
    {
      name: 'registrar intento de contacto',
      method: 'POST',
      path: '/contact-attempts',
      body: { channel: 'TELEFONO', result: 'NO_CONTESTA' },
    },
    {
      name: 'registrar consentimiento',
      method: 'POST',
      path: '/consents',
      body: { consentType: 'TRATAMIENTO_DATOS', status: 'ACEPTADO', channel: 'EMAIL' },
    },
    {
      name: 'revocar consentimiento',
      method: 'PATCH',
      path: '/consents/00000000-0000-4000-8000-000000000002/revoke',
      body: { reason: 'fixture' },
      token: 'admin-token',
    },
    {
      name: 'registrar verificación de cobertura',
      method: 'POST',
      path: '/coverage-checks',
      body: { addressUsed: 'Dirección sintética', result: 'VIABLE' },
    },
  ])('mutación $name — titular bloqueado devuelve 409', async ({ method, path, body, token }) => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
    ]);
    expedienteServiceMock.findById.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      anonymizedAt: null,
    });
    expedienteServiceMock.getPrivacyMarksForExpediente.mockResolvedValue(['DATOS_BLOQUEADOS']);
    const url = `/api/v1/crm/expedientes/00000000-0000-4000-8000-000000000001${path}`;
    const client = request(app.getHttpServer());
    const route =
      method === 'POST'
        ? client.post(url)
        : method === 'PATCH'
          ? client.patch(url)
          : client.delete(url);
    route.set('Authorization', `Bearer ${token ?? 'sales-token'}`);
    if (body) route.send(body);

    await route.expect(409).expect(({ body: responseBody }) => {
      expect(responseBody.code).toBe('PRIVACY_DATA_BLOCKED');
    });
  });
});
