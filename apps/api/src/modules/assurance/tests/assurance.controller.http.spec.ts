import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AssuranceController } from '../assurance.controller';
import { AssuranceDashboardService } from '../services/assurance-dashboard.service';
import { CommentsService } from '../services/comments.service';
import { SlaService } from '../services/sla.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload;
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);

      if (isPublic) {
        return true;
      }

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer admin-token') {
        req.user = {
          sub: 'admin-001',
          email: 'admin@example.test',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-admin',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          email: 'tech@example.test',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
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
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) {
        return true;
      }

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('AssuranceController HTTP', () => {
  let app: INestApplication;

  const ticketsServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    requestFieldService: jest.fn(),
    assign: jest.fn(),
    linkWorkOrder: jest.fn(),
  };

  const commentsServiceMock = {
    addComment: jest.fn(),
    listComments: jest.fn(),
  };

  const timelineServiceMock = {
    listTimeline: jest.fn(),
  };

  const slaServiceMock = {
    listPolicies: jest.fn(),
    createPolicy: jest.fn(),
  };

  const dashboardServiceMock = {
    getSummary: jest.fn(),
  };

  const TICKET_UUID = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: ticketsServiceMock },
        { provide: CommentsService, useValue: commentsServiceMock },
        { provide: TimelineService, useValue: timelineServiceMock },
        { provide: SlaService, useValue: slaServiceMock },
        { provide: AssuranceDashboardService, useValue: dashboardServiceMock },
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
  });

  it('returns 401 when listing tickets without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/assurance/tickets').expect(401);
  });

  it('returns 201 when SUPPORT creates a valid ticket', async () => {
    ticketsServiceMock.create.mockResolvedValue({ id: TICKET_UUID });

    await request(app.getHttpServer())
      .post('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'CUSTOMER_INCIDENT',
        subject: 'No navega el enlace del cliente',
        requesterType: 'SUBSCRIBER',
        requesterRefId: 'subscriber-001',
        subjectType: 'SERVICE',
        subjectRefId: 'service-001',
        queueName: 'SUPPORT',
      })
      .expect(201);
  });

  it('returns 403 when TECHNICIAN tries to create a ticket', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer tech-token')
      .send({
        type: 'CUSTOMER_INCIDENT',
        subject: 'Sin servicio',
        requesterType: 'SUBSCRIBER',
      })
      .expect(403);
  });

  it('returns 201 when SUPPORT assigns a ticket', async () => {
    ticketsServiceMock.assign.mockResolvedValue({ id: TICKET_UUID, assignedUserId: 'tech-001' });

    await request(app.getHttpServer())
      .post(`/api/v1/assurance/tickets/${TICKET_UUID}/assign`)
      .set('Authorization', 'Bearer support-token')
      .send({
        assignedUserId: '22222222-2222-4222-8222-222222222222',
        queueName: 'NOC',
      })
      .expect(201);
  });

  it('returns 201 when SUPPORT links a work order reference', async () => {
    ticketsServiceMock.linkWorkOrder.mockResolvedValue({
      id: TICKET_UUID,
      workOrderId: '33333333-3333-4333-8333-333333333333',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/assurance/tickets/${TICKET_UUID}/link-work-order`)
      .set('Authorization', 'Bearer support-token')
      .send({
        workOrderId: '33333333-3333-4333-8333-333333333333',
        notes: 'OT abierta por WFM',
      })
      .expect(201);
  });

  it('returns 201 when TECHNICIAN requests field service on an owned ticket', async () => {
    ticketsServiceMock.requestFieldService.mockResolvedValue({ id: TICKET_UUID });

    await request(app.getHttpServer())
      .post(`/api/v1/assurance/tickets/${TICKET_UUID}/request-field-service`)
      .set('Authorization', 'Bearer tech-token')
      .send({ notes: 'Requiere visita de campo' })
      .expect(201);
  });

  it('returns 403 when TECHNICIAN requests dashboard summary', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/assurance/dashboard/summary')
      .set('Authorization', 'Bearer tech-token')
      .expect(403);
  });

  it('returns 200 with dashboard summary for ADMIN', async () => {
    dashboardServiceMock.getSummary.mockResolvedValue({
      openCount: 5,
      assignedCount: 3,
      inProgressCount: 2,
      atRiskCount: 1,
      breachedCount: 1,
      resolvedTodayCount: 0,
      fieldServicePendingCount: 1,
      byPriority: { HIGH: 2 },
      byType: { CUSTOMER_INCIDENT: 5 },
      byQueue: { SUPPORT: 3, NOC: 2 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/assurance/dashboard/summary')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveProperty('openCount', 5);
        expect(body).toHaveProperty('fieldServicePendingCount', 1);
        expect(body).toHaveProperty('byQueue');
        expect(body.byQueue).toHaveProperty('SUPPORT', 3);
        expect(body.byQueue).toHaveProperty('NOC', 2);
      });
  });

  it('returns 400 when assigning a ticket with empty payload (Zod refinement)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/assurance/tickets/${TICKET_UUID}/assign`)
      .set('Authorization', 'Bearer support-token')
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(body).toHaveProperty('message');
      });
  });

  it('returns 400 when listing tickets with page=0 (boundary validation)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/assurance/tickets?page=0')
      .set('Authorization', 'Bearer support-token')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('details');
      });
  });

  it('returns 400 when listing tickets with invalid UUID for assignedUserId (boundary validation)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/assurance/tickets?assignedUserId=not-a-uuid')
      .set('Authorization', 'Bearer support-token')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('details');
      });
  });

  it('returns 400 when creating a ticket without required subject field (boundary validation)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer support-token')
      .send({
        type: 'CUSTOMER_INCIDENT',
        requesterType: 'SUBSCRIBER',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('details');
      });
  });
});
