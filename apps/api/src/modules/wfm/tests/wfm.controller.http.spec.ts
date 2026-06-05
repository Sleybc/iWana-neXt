import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole, ScheduleEventStatus, WorkOrderStatus } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WfmController } from '../wfm.controller';
import { WfmOrganizationSitesReadPort } from '../ports/wfm-organization-sites-read.port';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { VisitRequestsService } from '../services/visit-requests.service';
import { WorkOrdersService } from '../services/work-orders.service';
import { TechnicianAvailabilityService } from '../services/technician-availability.service';
import { WfmDashboardService } from '../services/wfm-dashboard.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { OperationalEventualitiesService } from '../services/operational-eventualities.service';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';

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

      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer admin-token') {
        req.user = {
          sub: 'admin-001',
          email: 'admin@test.com',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-admin',
          type: 'tenant',
        } as any;
        return true;
      }

      if (authHeader === 'Bearer noc-token') {
        req.user = {
          sub: 'noc-001',
          email: 'noc@test.com',
          role: UserRole.NOC,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-noc',
          type: 'tenant',
        } as any;
        return true;
      }

      if (authHeader === 'Bearer tech-token') {
        req.user = {
          sub: 'tech-001',
          email: 'tech@test.com',
          role: UserRole.TECHNICIAN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-tech',
          type: 'tenant',
        } as any;
        return true;
      }

      if (authHeader === 'Bearer contractor-token') {
        req.user = {
          sub: 'contractor-001',
          email: 'contractor@test.com',
          role: UserRole.CONTRACTOR,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-contractor',
          type: 'tenant',
        } as any;
        return true;
      }

      if (authHeader === 'Bearer sales-token') {
        req.user = {
          sub: 'sales-001',
          email: 'sales@test.com',
          role: UserRole.SALES,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-sales',
          type: 'tenant',
        } as any;
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
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) return true;

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
      }

      return true;
    }
  },
}));

describe('WfmController HTTP', () => {
  let app: INestApplication;

  const scheduleEventsServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    reschedule: jest.fn(),
    cancel: jest.fn(),
  };

  const workOrdersServiceMock = {
    list: jest.fn(),
    getById: jest.fn(),
    transitionStatus: jest.fn(),
    create: jest.fn(),
    generateCode: jest.fn(),
  };

  const technicianAvailabilityServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
  };

  const visitRequestsServiceMock = {
    listVisitRequests: jest.fn(),
    createVisitRequest: jest.fn(),
    getVisitRequestById: jest.fn(),
    updateVisitRequestContext: jest.fn(),
    scheduleVisitRequest: jest.fn(),
    cancelVisitRequest: jest.fn(),
    rejectVisitRequest: jest.fn(),
  };

  const dashboardServiceMock = {
    getSummary: jest.fn(),
  };

  const scheduleRecommendationsServiceMock = {
    recommend: jest.fn(),
  };

  const EVENT_UUID = '11111111-1111-1111-1111-111111111111';
  const EXPEDIENTE_UUID = '5acea022-2419-453a-a324-1a762853383f';

  const mockEvent = {
    id: EVENT_UUID,
    tenantId: 'tenant-001',
    type: 'INSTALLATION',
    status: ScheduleEventStatus.DRAFT,
    title: 'Instalacion fibra',
    scheduledStartAt: new Date('2026-06-01T09:00:00Z'),
    scheduledEndAt: new Date('2026-06-01T11:00:00Z'),
    assignedUserId: 'tech-001',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WfmController],
      providers: [
        { provide: ScheduleEventsService, useValue: scheduleEventsServiceMock },
        { provide: VisitRequestsService, useValue: visitRequestsServiceMock },
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
        { provide: TechnicianAvailabilityService, useValue: technicianAvailabilityServiceMock },
        { provide: WfmDashboardService, useValue: dashboardServiceMock },
        { provide: ScheduleRecommendationsService, useValue: scheduleRecommendationsServiceMock },
        {
          provide: OperationalEventualitiesService,
          useValue: {
            create: jest.fn(),
            findAllByTenant: jest.fn(),
            updateStatus: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        { provide: WfmOrganizationSitesReadPort, useValue: { listDispatchSites: jest.fn() } },
        { provide: WfmTenantSettingsReadPort, useValue: { getTimezone: jest.fn() } },
        { provide: OperatingWindowResolverService, useValue: { resolve: jest.fn() } },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/wfm/schedule-recommendations', () => {
    it('returns ordered territorial recommendations for ADMIN', async () => {
      scheduleRecommendationsServiceMock.recommend.mockResolvedValue([
        {
          technicianId: '22222222-2222-4222-8222-222222222222',
          scheduledStartAt: '2026-06-01T09:00:00.000Z',
          scheduledEndAt: '2026-06-01T11:00:00.000Z',
          score: 95,
          labels: ['Recomendado', 'Mismo sector/vereda'],
          scoreBreakdown: {
            distance: 35,
            municipality: 25,
            sector: 20,
            routeContinuity: 10,
            load: 3,
            earliest: 2,
          },
          distanceKm: 1.2,
          nearestEventId: 'evt-near',
          totalScheduledMinutes: 180,
          eventCount: 2,
        },
      ]);

      await request(app.getHttpServer())
        .post('/api/v1/wfm/schedule-recommendations')
        .set('Authorization', 'Bearer admin-token')
        .send({
          workType: 'INSTALLATION',
          durationMinutes: 120,
          windowStartAt: '2026-06-01T07:00:00.000Z',
          windowEndAt: '2026-06-01T18:00:00.000Z',
          candidateUserIds: ['22222222-2222-4222-8222-222222222222'],
          municipality: 'Soacha',
          sector: 'Vereda Primavera',
          latitude: 4.583,
          longitude: -74.216,
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body[0].labels).toContain('Recomendado');
          expect(scheduleRecommendationsServiceMock.recommend).toHaveBeenCalledWith(
            expect.objectContaining({ sector: 'Vereda Primavera' }),
          );
        });
    });

    it('returns 403 for TECHNICIAN because recommendations are coordinator-only', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/schedule-recommendations')
        .set('Authorization', 'Bearer tech-token')
        .send({
          workType: 'INSTALLATION',
          durationMinutes: 60,
          windowStartAt: '2026-06-01T07:00:00.000Z',
          windowEndAt: '2026-06-01T18:00:00.000Z',
          candidateUserIds: ['22222222-2222-4222-8222-222222222222'],
        })
        .expect(403);
    });
  });

  // ─── GET /wfm/events ─────────────────────────────────────────────────────

  describe('GET /api/v1/wfm/events', () => {
    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/wfm/events').expect(401);
    });

    it('returns 200 with list of events for ADMIN', async () => {
      scheduleEventsServiceMock.list.mockResolvedValue([mockEvent]);

      await request(app.getHttpServer())
        .get('/api/v1/wfm/events')
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(Array.isArray(body)).toBe(true);
          expect(body).toHaveLength(1);
        });
    });

    it('returns 200 for TECHNICIAN (restricted role)', async () => {
      scheduleEventsServiceMock.list.mockResolvedValue([mockEvent]);

      await request(app.getHttpServer())
        .get('/api/v1/wfm/events')
        .set('Authorization', 'Bearer tech-token')
        .expect(200);
    });

    it('returns 200 for CONTRACTOR (restricted role)', async () => {
      scheduleEventsServiceMock.list.mockResolvedValue([mockEvent]);

      await request(app.getHttpServer())
        .get('/api/v1/wfm/events')
        .set('Authorization', 'Bearer contractor-token')
        .expect(200);
    });

    it('accepts expedienteId as filter for CRM scheduling flows', async () => {
      scheduleEventsServiceMock.list.mockResolvedValue([
        { ...mockEvent, expedienteId: EXPEDIENTE_UUID },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/wfm/events')
        .query({ expedienteId: EXPEDIENTE_UUID })
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(() => {
          expect(scheduleEventsServiceMock.list).toHaveBeenCalledWith(
            expect.objectContaining({ expedienteId: EXPEDIENTE_UUID }),
            expect.objectContaining({ sub: 'admin-001', role: UserRole.ADMIN }),
          );
        });
    });

    it('rejects invalid expedienteId filters', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wfm/events')
        .query({ expedienteId: 'not-a-uuid' })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);
    });
  });

  // ─── POST /wfm/events ────────────────────────────────────────────────────

  describe('POST /api/v1/wfm/events', () => {
    const validPayload = {
      type: 'INSTALLATION',
      title: 'Instalacion fibra optica',
      scheduledStartAt: '2026-06-01T09:00:00Z',
      scheduledEndAt: '2026-06-01T11:00:00Z',
      assignedUserId: 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0',
    };

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer()).post('/api/v1/wfm/events').send(validPayload).expect(401);
    });

    it('returns 403 when TECHNICIAN tries to create an event', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer tech-token')
        .send(validPayload)
        .expect(403);
    });

    it('returns 403 when CONTRACTOR tries to create an event', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer contractor-token')
        .send(validPayload)
        .expect(403);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer admin-token')
        .send({ title: 'Solo titulo sin horario' })
        .expect(400);
    });

    it('returns 201 when ADMIN creates a valid event', async () => {
      scheduleEventsServiceMock.create.mockResolvedValue({ ...mockEvent, id: EVENT_UUID });

      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer admin-token')
        .send(validPayload)
        .expect(201);
    });

    it('returns 400 when service detects a schedule conflict', async () => {
      scheduleEventsServiceMock.create.mockRejectedValue(
        new BadRequestException('El tecnico ya tiene un evento activo en ese rango horario'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer admin-token')
        .send(validPayload)
        .expect(400);
    });

    it('returns 400 when installation is outside tenant business hours', async () => {
      scheduleEventsServiceMock.create.mockRejectedValue(
        new BadRequestException('Las instalaciones solo pueden programarse entre 07:00 y 18:00.'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/wfm/events')
        .set('Authorization', 'Bearer admin-token')
        .send(validPayload)
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe(
            'Las instalaciones solo pueden programarse entre 07:00 y 18:00.',
          );
        });
    });
  });

  // ─── PATCH /wfm/events/:id/status ─────────────────────────────────────────

  describe('PATCH /api/v1/wfm/events/:id/status', () => {
    it('returns 200 when ADMIN transitions event status', async () => {
      scheduleEventsServiceMock.transitionStatus.mockResolvedValue({
        ...mockEvent,
        status: ScheduleEventStatus.SCHEDULED,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/wfm/events/${EVENT_UUID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: ScheduleEventStatus.SCHEDULED })
        .expect(200);
    });

    it('returns 404 when event does not exist', async () => {
      scheduleEventsServiceMock.transitionStatus.mockRejectedValue(
        new NotFoundException('Evento no encontrado'),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/wfm/events/${EVENT_UUID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: ScheduleEventStatus.SCHEDULED })
        .expect(404);
    });
  });

  // ─── POST /wfm/events/:id/reschedule ──────────────────────────────────────

  describe('POST /api/v1/wfm/events/:id/reschedule', () => {
    it('returns 403 when TECHNICIAN tries to reschedule', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/wfm/events/${EVENT_UUID}/reschedule`)
        .set('Authorization', 'Bearer tech-token')
        .send({
          scheduledStartAt: '2026-06-02T09:00:00Z',
          scheduledEndAt: '2026-06-02T11:00:00Z',
          reason: 'Solicitud del cliente',
        })
        .expect(403);
    });

    it('returns 400 when reason is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/wfm/events/${EVENT_UUID}/reschedule`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          scheduledStartAt: '2026-06-02T09:00:00Z',
          scheduledEndAt: '2026-06-02T11:00:00Z',
          // reason ausente
        })
        .expect(400);
    });

    it('returns 200 when NOC reschedules with reason', async () => {
      scheduleEventsServiceMock.reschedule.mockResolvedValue({
        ...mockEvent,
        status: ScheduleEventStatus.RESCHEDULED,
        scheduledStartAt: new Date('2026-06-02T09:00:00Z'),
        scheduledEndAt: new Date('2026-06-02T11:00:00Z'),
      });

      await request(app.getHttpServer())
        .post(`/api/v1/wfm/events/${EVENT_UUID}/reschedule`)
        .set('Authorization', 'Bearer noc-token')
        .send({
          scheduledStartAt: '2026-06-02T09:00:00Z',
          scheduledEndAt: '2026-06-02T11:00:00Z',
          reason: 'Solicitud del cliente',
        })
        .expect(201);
    });

    it('returns 400 when installation reschedule is outside tenant business hours', async () => {
      scheduleEventsServiceMock.reschedule.mockRejectedValue(
        new BadRequestException('Las instalaciones solo pueden reagendarse entre 07:00 y 18:00.'),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/wfm/events/${EVENT_UUID}/reschedule`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          scheduledStartAt: '2026-06-02T09:00:00Z',
          scheduledEndAt: '2026-06-02T11:00:00Z',
          reason: 'Solicitud del cliente',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe(
            'Las instalaciones solo pueden reagendarse entre 07:00 y 18:00.',
          );
        });
    });
  });

  // ─── GET /wfm/dashboard/summary ───────────────────────────────────────────

  describe('GET /api/v1/wfm/dashboard/summary', () => {
    it('returns 403 when TECHNICIAN requests dashboard', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wfm/dashboard/summary')
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });

    it('returns 403 when CONTRACTOR requests dashboard', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wfm/dashboard/summary')
        .set('Authorization', 'Bearer contractor-token')
        .expect(403);
    });

    it('returns 200 with summary structure for NOC', async () => {
      dashboardServiceMock.getSummary.mockResolvedValue({
        todayCount: 10,
        overdueCount: 2,
        upcomingCount: 15,
        activeCount: 8,
        enRouteCount: 3,
        atRiskCount: 4,
        pendingInbox: {
          totalOpen: 7,
          readyToScheduleCount: 4,
          needsContextCount: 2,
          overdueSlaCount: 1,
          highPriorityOpenCount: 3,
        },
        alerts: [],
        technicianLoad: [{ assignedUserId: 'tech-001', todayCount: 5 }],
      });

      await request(app.getHttpServer())
        .get('/api/v1/wfm/dashboard/summary')
        .set('Authorization', 'Bearer noc-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveProperty('todayCount', 10);
          expect(body).toHaveProperty('overdueCount', 2);
          expect(body).toHaveProperty('upcomingCount', 15);
          expect(body).toHaveProperty('pendingInbox.totalOpen', 7);
          expect(Array.isArray(body.technicianLoad)).toBe(true);
        });
    });

    it('returns command center additive fields for ADMIN', async () => {
      dashboardServiceMock.getSummary.mockResolvedValue({
        todayCount: 10,
        overdueCount: 2,
        upcomingCount: 15,
        activeCount: 8,
        enRouteCount: 3,
        atRiskCount: 4,
        pendingInbox: {
          totalOpen: 7,
          readyToScheduleCount: 4,
          needsContextCount: 2,
          overdueSlaCount: 1,
          highPriorityOpenCount: 3,
        },
        alerts: [
          {
            id: 'overdue-evt-001',
            type: 'OVERDUE_EVENT',
            severity: 'critical',
            title: 'Evento atrasado',
            description: 'Instalacion pendiente',
            eventId: 'evt-001',
            assignedUserId: 'tech-001',
            scheduledStartAt: '2026-05-09T08:00:00.000Z',
          },
        ],
        technicianLoad: [
          {
            assignedUserId: 'tech-001',
            todayCount: 5,
            overdueCount: 1,
            totalScheduledMinutes: 420,
            utilizationPercent: 88,
            riskLevel: 'HIGH',
          },
        ],
      });

      await request(app.getHttpServer())
        .get('/api/v1/wfm/dashboard/summary')
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveProperty('activeCount', 8);
          expect(body).toHaveProperty('enRouteCount', 3);
          expect(body).toHaveProperty('atRiskCount', 4);
          expect(body.alerts[0]).toHaveProperty('severity', 'critical');
          expect(body.technicianLoad[0]).toHaveProperty('riskLevel', 'HIGH');
        });
    });
  });

  // ─── PATCH /wfm/work-orders/:id/status ────────────────────────────────────

  describe('PATCH /api/v1/wfm/work-orders/:id/status', () => {
    const WO_UUID = '33333333-3333-3333-3333-333333333333';

    it('returns 200 when TECHNICIAN transitions own WO to IN_PROGRESS', async () => {
      workOrdersServiceMock.transitionStatus.mockResolvedValue({
        id: WO_UUID,
        status: WorkOrderStatus.IN_PROGRESS,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/wfm/work-orders/${WO_UUID}/status`)
        .set('Authorization', 'Bearer tech-token')
        .send({ status: WorkOrderStatus.IN_PROGRESS })
        .expect(200);
    });

    it('returns 200 when CONTRACTOR transitions own WO to IN_PROGRESS', async () => {
      workOrdersServiceMock.transitionStatus.mockResolvedValue({
        id: WO_UUID,
        status: WorkOrderStatus.IN_PROGRESS,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/wfm/work-orders/${WO_UUID}/status`)
        .set('Authorization', 'Bearer contractor-token')
        .send({ status: WorkOrderStatus.IN_PROGRESS })
        .expect(200);
    });

    it('returns 400 when status is invalid', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/wfm/work-orders/${WO_UUID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });
  });
});
