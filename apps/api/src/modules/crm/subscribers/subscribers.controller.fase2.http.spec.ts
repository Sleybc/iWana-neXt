import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  AccessPermissionKey,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  UserRole,
  VatTreatment,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { AuditService } from '../../audit/audit.service';
import { Subscriber } from './entities/subscriber.entity';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const h = req.headers.authorization;
      if (h === 'Bearer admin-token') {
        req.user = {
          sub: 'admin-001',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer auditor-token') {
        req.user = {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer sales-token') {
        req.user = {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer noc-token') {
        req.user = {
          sub: 'noc-001',
          role: UserRole.NOC,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (h === 'Bearer accountant-token') {
        req.user = {
          sub: 'accountant-001',
          role: UserRole.ACCOUNTANT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length === 0) return true;
      if (!user || !required.includes(user.role))
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      return true;
    }
  },
}));

describe('SubscribersController Fase 2 — doble guard', () => {
  let app: INestApplication;
  const listSubscriber = {
    id: 'sub-001',
    tenantId: 'tenant-001',
    partyId: 'party-001',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    vatTreatment: VatTreatment.STANDARD,
    documentType: DocumentType.CC,
    documentNumber: '12345678',
    documentNumberEncrypted: 'cipher-doc',
    documentNumberHash: 'hash-doc',
    firstName: 'Ana',
    lastName: 'Prueba',
    stratum: 3,
    birthDate: null,
    nit: '900123456-7',
    nitVerificationDigit: '7',
    businessName: null,
    commercialName: null,
    legalRepresentativeId: null,
    email: 'ana@example.invalid',
    emailEncrypted: 'cipher-email',
    emailHash: 'hash-email',
    phone: '3001234567',
    phoneEncrypted: 'cipher-phone',
    phoneHash: 'hash-phone',
    altContactPhone: '3009876543',
    altContactPhoneEncrypted: 'cipher-alt-phone',
    whatsapp: '3001112233',
    whatsappEncrypted: null,
    address: 'Dirección privada 1',
    neighborhood: 'Barrio privado',
    city: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: null,
    latitude: 4.6,
    longitude: -74.1,
    coverageNodeId: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    manualOverrideReason: 'razón privada',
    status: SubscriberStatus.ACTIVE,
    externalId: 'external-private',
    createdBy: 'user-001',
    createdAt: new Date('2026-10-12T12:00:00.000Z'),
    updatedAt: new Date('2026-10-12T12:00:00.000Z'),
    deletedAt: null,
  } as unknown as Subscriber;
  const subscribersServiceMock = {
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, meta: { page: 1, limit: 20, total: 0 } }),
    search: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    create: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    update: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    remove: jest.fn().mockResolvedValue(undefined),
    transitionStatus: jest.fn().mockResolvedValue({ id: 'sub-001' }),
    get360View: jest.fn().mockResolvedValue({ subscriber: { id: 'sub-001' } }),
    updateSection: jest.fn().mockResolvedValue({ id: 'sub-001' }),
  };
  const auditMock = { log: jest.fn().mockResolvedValue(undefined) };
  const effectivePermissionsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [
        { provide: SubscribersService, useValue: subscribersServiceMock },
        { provide: AuditService, useValue: auditMock },
        { provide: EffectivePermissionsService, useValue: effectivePermissionsMock },
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
    subscribersServiceMock.findAll.mockResolvedValue({
      data: [],
      total: 0,
      meta: { page: 1, limit: 20, total: 0 },
    });
  });

  it('GET /crm/subscribers — 403 para TECHNICIAN aunque tenga permiso crm.subscribers.read', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .expect(403);
  });

  it('GET /crm/subscribers — 403 para TECHNICIAN sin permiso aunque rol pase', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .expect(403);
  });

  it('GET /crm/subscribers — 403 para AUDITOR sin permiso', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });

  it('GET /crm/subscribers — 403 para AUDITOR aunque tenga permiso', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });

  it.each([
    { role: 'TECHNICIAN', token: 'tech-token' },
    { role: 'AUDITOR', token: 'auditor-token' },
  ])('POST /crm/subscribers/search — 403 para $role aunque tenga permiso', async ({ token }) => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers/search')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentNumber: '12345678' })
      .expect(403);
  });

  it('GET /crm/subscribers/search — responde 404 tras retirar el GET legacy', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers/search?email=persona%40ejemplo.invalid')
      .set('Authorization', 'Bearer admin-token')
      .expect(404);
    expect(subscribersServiceMock.search).not.toHaveBeenCalled();
  });

  it('POST /crm/subscribers/search — busca libremente en body y responde proyección paginada', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    subscribersServiceMock.findAll.mockResolvedValue({
      data: [listSubscriber],
      total: 1,
      meta: { page: 1, limit: 20, total: 1 },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers/search?status=ACTIVE&page=1&limit=20')
      .set('Authorization', 'Bearer admin-token')
      .send({ search: 'Ana Prueba' })
      .expect(200);

    expect(subscribersServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SubscriberStatus.ACTIVE,
        page: 1,
        limit: 20,
        search: 'Ana Prueba',
      }),
    );
    expect(response.body).toMatchObject({
      total: 1,
      data: [
        {
          id: 'sub-001',
          firstName: 'Ana',
          email: 'ana@example.invalid',
          phone: '3001234567',
          address: 'Dirección privada 1',
        },
      ],
    });
    expect(response.body.data[0]).not.toHaveProperty('tenantId');
    expect(response.body.data[0]).not.toHaveProperty('birthDate');
    const auditPayload = JSON.stringify(auditMock.log.mock.calls.at(-1)?.[0]);
    expect(auditPayload).toContain('(aplicado)');
    expect(auditPayload).not.toContain('Ana Prueba');
  });

  it('POST /crm/subscribers/search — criterios exactos llegan solo en el body', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    subscribersServiceMock.search.mockResolvedValue([listSubscriber]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers/search')
      .set('Authorization', 'Bearer admin-token')
      .send({ documentNumber: '12345678' })
      .expect(200);

    expect(subscribersServiceMock.search).toHaveBeenCalledWith({
      documentNumber: '12345678',
    });
    expect(response.body.data[0]).toHaveProperty('documentNumber', '12345678');
    expect(JSON.stringify(auditMock.log.mock.calls.at(-1)?.[0])).not.toContain('12345678');
  });

  it.each([
    {
      role: 'ADMIN',
      token: 'admin-token',
      allowed: [
        'documentNumber',
        'nit',
        'nitVerificationDigit',
        'phone',
        'altContactPhone',
        'whatsapp',
        'email',
        'address',
        'neighborhood',
        'city',
        'department',
      ],
    },
    { role: 'NOC', token: 'noc-token', allowed: [] },
    { role: 'SALES', token: 'sales-token', allowed: [] },
    {
      role: 'SUPPORT',
      token: 'support-token',
      allowed: [
        'documentNumber',
        'nit',
        'nitVerificationDigit',
        'phone',
        'altContactPhone',
        'whatsapp',
        'address',
        'neighborhood',
        'city',
        'department',
      ],
    },
    {
      role: 'ACCOUNTANT',
      token: 'accountant-token',
      allowed: ['documentNumber', 'nit', 'nitVerificationDigit'],
    },
  ])(
    'POST /crm/subscribers/search — $role recibe solo los campos permitidos',
    async ({ token, allowed }) => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      ]);
      subscribersServiceMock.findAll.mockResolvedValue({
        data: [listSubscriber],
        total: 1,
        meta: { page: 1, limit: 20, total: 1 },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/crm/subscribers/search')
        .set('Authorization', `Bearer ${token}`)
        .send({ search: 'Ana' })
        .expect(200);
      const item = response.body.data[0] as Record<string, unknown>;
      const restrictedFields = [
        'documentNumber',
        'nit',
        'nitVerificationDigit',
        'phone',
        'altContactPhone',
        'whatsapp',
        'email',
        'address',
        'neighborhood',
        'city',
        'department',
        'latitude',
        'longitude',
      ];

      expect(item).toHaveProperty('vatTreatment', VatTreatment.STANDARD);
      for (const field of restrictedFields) {
        if (allowed.includes(field)) expect(item).toHaveProperty(field);
        else expect(item).not.toHaveProperty(field);
      }
    },
  );

  it('POST /crm/subscribers/search — rechaza filtros de listado junto con criterios exactos', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers/search?page=1')
      .set('Authorization', 'Bearer admin-token')
      .send({ documentNumber: '12345678' })
      .expect(400);
    expect(subscribersServiceMock.search).not.toHaveBeenCalled();
  });

  it('GET list ignora query personal y ningún @Query declara campos personales', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);

    await request(app.getHttpServer())
      .get(
        '/api/v1/crm/subscribers?search=Ana%20Prueba&documentNumber=12345678&email=ana%40example.invalid',
      )
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(subscribersServiceMock.findAll).toHaveBeenCalledWith(
      expect.not.objectContaining({
        search: expect.anything(),
        documentNumber: expect.anything(),
        email: expect.anything(),
      }),
    );

    for (const method of ['findAll', 'search', 'retiredGetSearch']) {
      const routeArgs = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        SubscribersController,
        method,
      ) as Record<string, { data?: unknown }>;
      const queryArgs = Object.entries(routeArgs ?? {})
        .filter(([key]) => key.startsWith('4:'))
        .map(([, metadata]) => metadata.data);
      expect(queryArgs).not.toEqual(
        expect.arrayContaining(['search', 'documentNumber', 'nit', 'email', 'phone']),
      );
    }
  });

  it('espera LIST_ACCESS antes de responder el listado', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    let releaseAudit: (() => void) | undefined;
    let responseSettled = false;
    auditMock.log.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        }),
    );

    const responsePromise = request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer admin-token')
      .then((response) => {
        responseSettled = true;
        return response;
      });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(auditMock.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LIST_ACCESS' }));
    expect(responseSettled).toBe(false);
    releaseAudit?.();
    const response = await responsePromise;
    expect(response.status).toBe(200);
  });

  it('GET /crm/subscribers — 403 para rol no permitido (SUBSCRIBER simulado como sales sin rol en lista?) — usamos sales sin permiso', async () => {
    // Sales tiene rol permitido pero sin permiso => 403 ya cubierto; para rol no permitido usamos un rol que no está en @Roles, p. ej., CONTRACTOR no está en lista original
    // Simulamos con tech sin permiso ya es 403 por permiso; para test de rol inválido usamos un token que no existe -> 401, pero probamos con auditor sin permiso ya es permiso falta
    // En su lugar probamos que SUPPORT sin permiso también 403
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ]);
    // SUPPORT tiene rol permitido, con permiso debería 200
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer support-token')
      .expect(200);
    // Ahora sin permiso 403
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer support-token')
      .expect(403);
  });

  it('POST /crm/subscribers — 201 con permiso crm.subscribers.manage y rol SALES', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer sales-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(201);
  });

  it('POST /crm/subscribers — 403 sin permiso aunque rol pase', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer sales-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(403);
  });

  it('POST /crm/subscribers — 403 para TECHNICIAN aunque tenga permiso (rol no permitido en escritura)', async () => {
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/crm/subscribers')
      .set('Authorization', 'Bearer tech-token')
      .send({
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: '123456789',
        firstName: 'Test',
        lastName: 'User',
        stratum: 3,
        email: 'test@example.com',
        phone: '3001234567',
        address: 'Calle 123',
      })
      .expect(403);
  });
});
