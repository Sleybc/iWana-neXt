import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { HabeasDataController } from './habeas-data/habeas-data.controller';
import { HabeasDataService } from './habeas-data/habeas-data.service';
import { OpportunitiesController } from './opportunities/opportunities.controller';
import { OpportunitiesService } from './opportunities/opportunities.service';
import { PotentialsController } from './potentials/potentials.controller';
import { PotentialsService } from './potentials/potentials.service';
import { ProspectsController } from './prospects/prospects.controller';
import { ProspectsService } from './prospects/prospects.service';
import { QuotesController } from './quotes/quotes.controller';
import { QuotesService } from './quotes/quotes.service';
import { ActivationService } from './reviews/activation.service';
import { CustomerOverviewService } from './reviews/customer-overview.service';
import { ReviewCoordinationService } from './reviews/review-coordination.service';
import { ReviewsController } from './reviews/reviews.controller';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
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
      const map: Record<string, JwtPayload> = {
        'Bearer sales-token': {
          sub: 'sales-001',
          role: UserRole.SALES,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer support-token': {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          type: 'tenant',
        } as JwtPayload,
      };
      const header = req.headers.authorization;
      if (header && map[header]) {
        req.user = map[header];
        return true;
      }
      throw new UnauthorizedException('Token inválido');
    }
  },
}));

jest.mock('../auth/guards/roles.guard', () => ({
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
      if (!user || !required.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const emptyList = {
  data: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false, mode: 'page' },
};

describe('CRM subrecursos Fase 2 — doble guard', () => {
  let app: INestApplication;
  const effectivePermissionsMock = { getEffectivePermissionsForUser: jest.fn() };
  const opportunitiesServiceMock = {
    findAll: jest.fn().mockResolvedValue(emptyList),
    create: jest.fn().mockResolvedValue({ id: 'opp-001' }),
  };
  const prospectsServiceMock = {
    scheduleInstallation: jest.fn().mockResolvedValue({ id: 'pros-001' }),
  };
  const potentialsServiceMock = {
    findAll: jest.fn().mockResolvedValue(emptyList),
    create: jest.fn().mockResolvedValue({ id: 'pot-001' }),
  };
  const quotesServiceMock = {
    findAll: jest.fn().mockResolvedValue(emptyList),
    create: jest.fn().mockResolvedValue({ id: 'qt-001' }),
  };
  const contactsServiceMock = {
    findBySubscriber: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'cnt-001' }),
  };
  const contractsServiceMock = {
    findAllBySubscriber: jest.fn().mockResolvedValue(emptyList),
    create: jest.fn().mockResolvedValue({ id: 'ctr-001' }),
  };
  const reviewCoordinationServiceMock = {
    sendToReview: jest.fn().mockResolvedValue({ id: 'rev-001' }),
  };
  const customerOverviewServiceMock = {
    getCustomerOverview: jest.fn().mockResolvedValue({ id: SUB_ID }),
  };
  const habeasDataServiceMock = {
    listConsents: jest.fn().mockResolvedValue([]),
    createConsent: jest.fn().mockResolvedValue({ id: 'cons-001' }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        OpportunitiesController,
        ProspectsController,
        PotentialsController,
        QuotesController,
        ContactsController,
        ContractsController,
        ReviewsController,
        HabeasDataController,
      ],
      providers: [
        { provide: OpportunitiesService, useValue: opportunitiesServiceMock },
        { provide: ProspectsService, useValue: prospectsServiceMock },
        { provide: PotentialsService, useValue: potentialsServiceMock },
        { provide: QuotesService, useValue: quotesServiceMock },
        { provide: ContactsService, useValue: contactsServiceMock },
        { provide: ContractsService, useValue: contractsServiceMock },
        { provide: ActivationService, useValue: {} },
        { provide: ReviewCoordinationService, useValue: reviewCoordinationServiceMock },
        { provide: CustomerOverviewService, useValue: customerOverviewServiceMock },
        { provide: HabeasDataService, useValue: habeasDataServiceMock },
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
    effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
  });

  describe('opportunities', () => {
    it('GET lista — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get('/api/v1/opportunities')
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET lista — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/opportunities')
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post('/api/v1/opportunities')
        .set('Authorization', 'Bearer sales-token')
        .send({ title: 'Oportunidad demo' })
        .expect(201);
    });

    it('POST — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/opportunities')
        .set('Authorization', 'Bearer sales-token')
        .send({ title: 'Oportunidad demo' })
        .expect(403);
    });
  });

  describe('prospects', () => {
    it('POST schedule-installation — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/crm/prospects/${SUB_ID}/schedule-installation`)
        .set('Authorization', 'Bearer sales-token')
        .send({ planId: 'plan-1', ticketId: 'tic-1', workOrderId: 'wo-1' })
        .expect(201);
    });

    it('POST schedule-installation — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/crm/prospects/${SUB_ID}/schedule-installation`)
        .set('Authorization', 'Bearer sales-token')
        .send({ planId: 'plan-1', ticketId: 'tic-1', workOrderId: 'wo-1' })
        .expect(403);
    });

    it('GET lista no existe — el controller es write-only (deprecated); 404', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get('/api/v1/crm/prospects')
        .set('Authorization', 'Bearer sales-token')
        .expect(404);
    });
  });

  describe('potentials', () => {
    it('GET lista — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get('/api/v1/crm/potentials')
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET lista — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/crm/potentials')
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post('/api/v1/crm/potentials')
        .set('Authorization', 'Bearer sales-token')
        .send({ fullName: 'Potencial demo', source: 'WEB' })
        .expect(201);
    });

    it('POST — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/crm/potentials')
        .set('Authorization', 'Bearer sales-token')
        .send({ fullName: 'Potencial demo', source: 'WEB' })
        .expect(403);
    });
  });

  describe('quotes', () => {
    it('GET lista — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET lista — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', 'Bearer sales-token')
        .send({
          opportunityId: SUB_ID,
          subscriberId: SUB_ID,
          planId: 'plan-1',
          monthlyAmount: '50000',
        })
        .expect(201);
    });

    it('POST — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', 'Bearer sales-token')
        .send({
          opportunityId: SUB_ID,
          subscriberId: SUB_ID,
          planId: 'plan-1',
          monthlyAmount: '50000',
        })
        .expect(403);
    });
  });

  describe('contacts', () => {
    it('GET lista — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/subscribers/${SUB_ID}/contacts`)
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET lista — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/subscribers/${SUB_ID}/contacts`)
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/subscribers/${SUB_ID}/contacts`)
        .set('Authorization', 'Bearer sales-token')
        .send({
          fullName: 'Contacto demo',
          email: 'contacto@example.test',
          phone: '3001234567',
        })
        .expect(201);
    });

    it('POST — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/subscribers/${SUB_ID}/contacts`)
        .set('Authorization', 'Bearer sales-token')
        .send({
          fullName: 'Contacto demo',
          email: 'contacto@example.test',
          phone: '3001234567',
        })
        .expect(403);
    });
  });

  describe('contracts', () => {
    it('GET lista — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/crm/subscribers/${SUB_ID}/contracts`)
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET lista — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/crm/subscribers/${SUB_ID}/contracts`)
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/crm/subscribers/${SUB_ID}/contracts`)
        .set('Authorization', 'Bearer sales-token')
        .send({
          subscriberId: SUB_ID,
          planId: 'plan-1',
          planSnapshotJson: {},
        })
        .expect(201);
    });

    it('POST — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/crm/subscribers/${SUB_ID}/contracts`)
        .set('Authorization', 'Bearer sales-token')
        .send({
          subscriberId: SUB_ID,
          planId: 'plan-1',
          planSnapshotJson: {},
        })
        .expect(403);
    });
  });

  describe('reviews', () => {
    it('GET overview — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/crm/customers/${SUB_ID}/overview`)
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET overview — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/crm/customers/${SUB_ID}/overview`)
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST send-to-review — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/crm/prospects/${SUB_ID}/send-to-review`)
        .set('Authorization', 'Bearer sales-token')
        .send({ cause: 'CAPACITY' })
        .expect(201);
    });

    it('POST send-to-review — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/crm/prospects/${SUB_ID}/send-to-review`)
        .set('Authorization', 'Bearer sales-token')
        .send({ cause: 'CAPACITY' })
        .expect(403);
    });
  });

  describe('habeas-data', () => {
    it('GET consents — 200 con crm.expedientes.read', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_READ,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/subscribers/${SUB_ID}/habeas-data/consents`)
        .set('Authorization', 'Bearer sales-token')
        .expect(200);
    });

    it('GET consents — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/subscribers/${SUB_ID}/habeas-data/consents`)
        .set('Authorization', 'Bearer sales-token')
        .expect(403);
    });

    it('POST consent — 201 con crm.expedientes.manage', async () => {
      effectivePermissionsMock.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
      ]);
      await request(app.getHttpServer())
        .post(`/api/v1/subscribers/${SUB_ID}/habeas-data/consent`)
        .set('Authorization', 'Bearer sales-token')
        .send({ accepted: true, channel: 'WEB' })
        .expect(201);
    });

    it('POST consent — 403 sin permiso aunque rol pase', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/subscribers/${SUB_ID}/habeas-data/consent`)
        .set('Authorization', 'Bearer sales-token')
        .send({ accepted: true, channel: 'WEB' })
        .expect(403);
    });
  });
});
