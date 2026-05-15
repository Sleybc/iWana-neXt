import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderSourceContext,
  WfmWorkType,
  WorkOrderPriority,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WfmController } from '../wfm.controller';

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

      return false;
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
    }): boolean {
      const handler = context.getHandler() as object;
      const roles = Reflect.getMetadata('roles', handler);
      if (!roles || roles.length === 0) return true;

      const req = context.switchToHttp().getRequest();
      const user = req.user;
      if (!user) return false;

      return roles.includes(user.role);
    }
  },
}));

describe('VisitRequestsController (HTTP Contract)', () => {
  let app: INestApplication;
  const mockVisitRequestsService = {
    listVisitRequests: jest.fn(),
    createVisitRequest: jest.fn(),
    getVisitRequestById: jest.fn(),
    updateVisitRequestContext: jest.fn(),
    scheduleVisitRequest: jest.fn(),
    cancelVisitRequest: jest.fn(),
    rejectVisitRequest: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WfmController],
      providers: [{ provide: 'VisitRequestsService', useValue: mockVisitRequestsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new (JwtAuthGuard as any)())
      .overrideGuard(RolesGuard)
      .useValue(new (RolesGuard as any)())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/wfm/visit-requests — list with filters', () => {
    it('should return 400 when invalid status enum is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ status: 'INVALID_STATUS' })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('status');
    });

    it('should return 400 when invalid originContext enum is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ originContext: 'INVALID_CONTEXT' })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('originContext');
    });

    it('should return 400 when invalid workType enum is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ workType: 'INVALID_TYPE' })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('workType');
    });

    it('should return 400 when invalid priority enum is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ priority: 'INVALID_PRIORITY' })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('priority');
    });

    it('should return 400 when page is less than 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ page: 0 })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('page');
    });

    it('should return 400 when limit exceeds 100', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ limit: 101 })
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('limit');
    });

    it('should return 403 when TECHNICIAN role tries to list global visit requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });

    it('should allow ADMIN to list visit requests with valid filters', async () => {
      mockVisitRequestsService.listVisitRequests.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({
          status: VisitRequestStatus.PENDING,
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.HIGH,
          page: 1,
          limit: 20,
        })
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(mockVisitRequestsService.listVisitRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          status: VisitRequestStatus.PENDING,
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.HIGH,
          page: 1,
          limit: 20,
        }),
        expect.objectContaining({ role: UserRole.ADMIN }),
      );
    });

    it('should allow NOC to list visit requests with municipality filter', async () => {
      mockVisitRequestsService.listVisitRequests.mockResolvedValue({
        items: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests')
        .query({ municipality: 'Bogota' })
        .set('Authorization', 'Bearer noc-token')
        .expect(200);

      expect(mockVisitRequestsService.listVisitRequests).toHaveBeenCalledWith(
        expect.objectContaining({ municipality: 'Bogota' }),
        expect.objectContaining({ role: UserRole.NOC }),
      );
    });
  });

  describe('POST /api/v1/wfm/visit-requests — create', () => {
    const validPayload = {
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'EXP-2026-001',
      originLabel: 'Expediente EXP-2026-001',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalacion fibra optica',
      description: 'Instalacion residencial',
      address: 'Calle 123 #45-67',
      municipality: 'Bogota',
      sector: 'Chapinero',
      latitude: 4.711,
      longitude: -74.0721,
    };

    it('should return 400 when originContext is missing', async () => {
      const { originContext, ...payload } = validPayload;
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('originContext');
    });

    it('should return 400 when workType is missing', async () => {
      const { workType, ...payload } = validPayload;
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('workType');
    });

    it('should return 400 when title is missing', async () => {
      const { title, ...payload } = validPayload;
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('title');
    });

    it('should return 400 when title exceeds max length', async () => {
      const payload = { ...validPayload, title: 'a'.repeat(161) };
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('title');
    });

    it('should return 201 and create visit request with valid payload', async () => {
      mockVisitRequestsService.createVisitRequest.mockResolvedValue({
        id: 'vr-001',
        ...validPayload,
        status: VisitRequestStatus.PENDING,
        tenantId: 'tenant-001',
        requestedByUserId: 'admin-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(validPayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(201);

      expect(response.body.id).toBe('vr-001');
      expect(response.body.status).toBe(VisitRequestStatus.PENDING);
      expect(mockVisitRequestsService.createVisitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          originContext: WorkOrderSourceContext.CRM,
          workType: WfmWorkType.INSTALLATION,
          title: 'Instalacion fibra optica',
        }),
        expect.objectContaining({ sub: 'admin-001' }),
      );
    });

    it('should return 403 when TECHNICIAN role tries to create visit request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests')
        .send(validPayload)
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });
  });

  describe('GET /api/v1/wfm/visit-requests/:id — get by ID', () => {
    it('should return 404 when visit request is not found', async () => {
      mockVisitRequestsService.getVisitRequestById.mockRejectedValue(
        new NotFoundException('Visit request not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests/non-existent-id')
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('should return 200 and visit request when found', async () => {
      const mockVisitRequest = {
        id: 'vr-001',
        status: VisitRequestStatus.PENDING,
        originContext: WorkOrderSourceContext.CRM,
        workType: WfmWorkType.INSTALLATION,
        priority: WorkOrderPriority.NORMAL,
        title: 'Instalacion fibra optica',
        tenantId: 'tenant-001',
      };

      mockVisitRequestsService.getVisitRequestById.mockResolvedValue(mockVisitRequest);

      const response = await request(app.getHttpServer())
        .get('/api/v1/wfm/visit-requests/vr-001')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.id).toBe('vr-001');
      expect(response.body.status).toBe(VisitRequestStatus.PENDING);
    });
  });

  describe('PATCH /api/v1/wfm/visit-requests/:id/context — update context', () => {
    const updatePayload = {
      description: 'Informacion adicional',
      address: 'Calle 123 #45-67',
      municipality: 'Bogota',
      sector: 'Chapinero',
      latitude: 4.711,
      longitude: -74.0721,
    };

    it('should return 404 when visit request is not found', async () => {
      mockVisitRequestsService.updateVisitRequestContext.mockRejectedValue(
        new NotFoundException('Visit request not found'),
      );

      await request(app.getHttpServer())
        .patch('/api/v1/wfm/visit-requests/non-existent-id/context')
        .send(updatePayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('should return 200 and updated visit request', async () => {
      const mockUpdated = {
        id: 'vr-001',
        status: VisitRequestStatus.READY_TO_SCHEDULE,
        ...updatePayload,
      };

      mockVisitRequestsService.updateVisitRequestContext.mockResolvedValue(mockUpdated);

      const response = await request(app.getHttpServer())
        .patch('/api/v1/wfm/visit-requests/vr-001/context')
        .send(updatePayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.id).toBe('vr-001');
      expect(response.body.status).toBe(VisitRequestStatus.READY_TO_SCHEDULE);
    });
  });

  describe('POST /api/v1/wfm/visit-requests/:id/schedule — schedule', () => {
    const schedulePayload = {
      scheduledStartAt: '2026-06-01T09:00:00Z',
      scheduledEndAt: '2026-06-01T11:00:00Z',
      assignedUserId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should return 400 when scheduledStartAt is missing', async () => {
      const { scheduledStartAt, ...payload } = schedulePayload;
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/schedule')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('scheduledStartAt');
    });

    it('should return 400 when assignedUserId is missing', async () => {
      const { assignedUserId, ...payload } = schedulePayload;
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/schedule')
        .send(payload)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('assignedUserId');
    });

    it('should return 201 and schedule visit request', async () => {
      const mockScheduled = {
        id: 'vr-001',
        status: VisitRequestStatus.SCHEDULED,
        scheduleEventId: 'se-001',
        workOrderId: 'wo-001',
      };

      mockVisitRequestsService.scheduleVisitRequest.mockResolvedValue(mockScheduled);

      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/schedule')
        .send(schedulePayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(201);

      expect(response.body.status).toBe(VisitRequestStatus.SCHEDULED);
      expect(response.body.scheduleEventId).toBe('se-001');
      expect(response.body.workOrderId).toBe('wo-001');
    });

    it('should return 403 when TECHNICIAN role tries to schedule', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/schedule')
        .send(schedulePayload)
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });
  });

  describe('POST /api/v1/wfm/visit-requests/:id/cancel — cancel', () => {
    const cancelPayload = {
      cancelReason: 'Suscriptor solicito cancelacion',
    };

    it('should return 400 when cancelReason is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/cancel')
        .send({})
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('cancelReason');
    });

    it('should return 200 and cancel visit request', async () => {
      const mockCancelled = {
        id: 'vr-001',
        status: VisitRequestStatus.CANCELLED,
        cancelReason: 'Suscriptor solicito cancelacion',
      };

      mockVisitRequestsService.cancelVisitRequest.mockResolvedValue(mockCancelled);

      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/cancel')
        .send(cancelPayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.status).toBe(VisitRequestStatus.CANCELLED);
    });
  });

  describe('POST /api/v1/wfm/visit-requests/:id/reject — reject', () => {
    const rejectPayload = {
      rejectReason: 'Direccion invalida o sin cobertura',
    };

    it('should return 400 when rejectReason is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/reject')
        .send({})
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      expect(response.body.message).toContain('rejectReason');
    });

    it('should return 200 and reject visit request', async () => {
      const mockRejected = {
        id: 'vr-001',
        status: VisitRequestStatus.REJECTED,
        rejectReason: 'Direccion invalida o sin cobertura',
      };

      mockVisitRequestsService.rejectVisitRequest.mockResolvedValue(mockRejected);

      const response = await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/reject')
        .send(rejectPayload)
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.status).toBe(VisitRequestStatus.REJECTED);
    });

    it('should return 403 when TECHNICIAN role tries to reject', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/wfm/visit-requests/vr-001/reject')
        .send(rejectPayload)
        .set('Authorization', 'Bearer tech-token')
        .expect(403);
    });
  });
});
