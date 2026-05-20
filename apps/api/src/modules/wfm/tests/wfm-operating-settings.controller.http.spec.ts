import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WfmController } from '../wfm.controller';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { CompanyBusinessHoursService } from '../services/company-business-hours.service';
import { HolidayBlackoutsService } from '../services/holiday-blackouts.service';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { OperatingSitesService } from '../services/operating-sites.service';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';
import { SiteBusinessHoursService } from '../services/site-business-hours.service';
import { TechnicianAvailabilityService } from '../services/technician-availability.service';
import { TechnicianBusinessOverridesService } from '../services/technician-business-overrides.service';
import { VisitRequestsService } from '../services/visit-requests.service';
import { WfmDashboardService } from '../services/wfm-dashboard.service';
import { WorkOrdersService } from '../services/work-orders.service';

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

      if (authHeader === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@test.com',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
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

describe('Wfm operating settings HTTP', () => {
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

  const visitRequestsServiceMock = {
    listVisitRequests: jest.fn(),
    createVisitRequest: jest.fn(),
    getVisitRequestById: jest.fn(),
    updateVisitRequestContext: jest.fn(),
    prepareVisitRequestRecommendation: jest.fn(),
    scheduleVisitRequest: jest.fn(),
    cancelVisitRequest: jest.fn(),
    rejectVisitRequest: jest.fn(),
  };

  const scheduleRecommendationsServiceMock = {
    recommend: jest.fn(),
  };

  const workOrdersServiceMock = {
    list: jest.fn(),
    getById: jest.fn(),
    transitionStatus: jest.fn(),
  };

  const technicianAvailabilityServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
  };

  const dashboardServiceMock = {
    getSummary: jest.fn(),
  };

  const operatingSitesServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const companyBusinessHoursServiceMock = {
    getWeek: jest.fn(),
    replaceWeek: jest.fn(),
  };

  const siteBusinessHoursServiceMock = {
    getWeek: jest.fn(),
    replaceWeek: jest.fn(),
  };

  const technicianBusinessOverridesServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const holidayBlackoutsServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const tenantSettingsReadPortMock = {
    getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
  };

  const operatingWindowResolverMock = {
    resolve: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WfmController],
      providers: [
        { provide: ScheduleEventsService, useValue: scheduleEventsServiceMock },
        { provide: VisitRequestsService, useValue: visitRequestsServiceMock },
        { provide: ScheduleRecommendationsService, useValue: scheduleRecommendationsServiceMock },
        { provide: WorkOrdersService, useValue: workOrdersServiceMock },
        { provide: TechnicianAvailabilityService, useValue: technicianAvailabilityServiceMock },
        { provide: WfmDashboardService, useValue: dashboardServiceMock },
        { provide: OperatingSitesService, useValue: operatingSitesServiceMock },
        { provide: CompanyBusinessHoursService, useValue: companyBusinessHoursServiceMock },
        { provide: SiteBusinessHoursService, useValue: siteBusinessHoursServiceMock },
        {
          provide: TechnicianBusinessOverridesService,
          useValue: technicianBusinessOverridesServiceMock,
        },
        { provide: HolidayBlackoutsService, useValue: holidayBlackoutsServiceMock },
        { provide: WfmTenantSettingsReadPort, useValue: tenantSettingsReadPortMock },
        { provide: OperatingWindowResolverService, useValue: operatingWindowResolverMock },
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

  it('lista sedes operativas para NOC', async () => {
    operatingSitesServiceMock.list.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111', name: 'Sede norte', code: 'NORTE' },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/wfm/operating-sites')
      .set('Authorization', 'Bearer noc-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(operatingSitesServiceMock.list).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenant-001', role: UserRole.NOC }),
        );
      });
  });

  it('crea una sede operativa para ADMIN', async () => {
    operatingSitesServiceMock.create.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Sede norte',
      code: 'NORTE',
    });

    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-sites')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Sede norte', code: 'NORTE' })
      .expect(201)
      .expect(() => {
        expect(operatingSitesServiceMock.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Sede norte', code: 'NORTE' }),
          expect.objectContaining({ tenantId: 'tenant-001', role: UserRole.ADMIN }),
        );
      });
  });

  it('rechaza crear sede operativa para NOC', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-sites')
      .set('Authorization', 'Bearer noc-token')
      .send({ name: 'Sede norte', code: 'NORTE' })
      .expect(403);
  });

  it('reemplaza el horario base de empresa para ADMIN', async () => {
    companyBusinessHoursServiceMock.replaceWeek.mockResolvedValue([
      { weekday: 'MONDAY', startTime: '07:00', endTime: '18:00', isEnabled: true },
    ]);

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(
      (weekday) => ({ weekday, startTime: '07:00', endTime: '18:00', isEnabled: true }),
    );

    await request(app.getHttpServer())
      .put('/api/v1/wfm/business-hours/company')
      .set('Authorization', 'Bearer admin-token')
      .send({ days })
      .expect(200)
      .expect(() => {
        expect(companyBusinessHoursServiceMock.replaceWeek).toHaveBeenCalledWith(
          expect.objectContaining({ days }),
          expect.objectContaining({ tenantId: 'tenant-001', role: UserRole.ADMIN }),
        );
      });
  });

  it('lista festivos y cierres para SUPPORT', async () => {
    holidayBlackoutsServiceMock.list.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        blackoutDate: '2026-05-18',
        name: 'Festivo nacional',
        isEnabled: true,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/wfm/holiday-blackouts')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].name).toBe('Festivo nacional');
        expect(holidayBlackoutsServiceMock.list).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenant-001', role: UserRole.SUPPORT }),
        );
      });
  });

  it('resuelve la ventana operativa efectiva para SUPPORT', async () => {
    operatingWindowResolverMock.resolve.mockResolvedValue({
      status: 'CLOSED',
      source: 'HOLIDAY_BLACKOUT',
      startTime: null,
      endTime: null,
      reason: 'Festivo nacional',
    });

    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-window/resolve')
      .set('Authorization', 'Bearer support-token')
      .send({ dateLocal: '2026-05-18' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.reason).toBe('Festivo nacional');
        expect(tenantSettingsReadPortMock.getTimezone).toHaveBeenCalledWith('tenant-001');
        expect(operatingWindowResolverMock.resolve).toHaveBeenCalledWith({
          tenantId: 'tenant-001',
          siteId: null,
          technicianId: null,
          dateLocal: '2026-05-18',
          timezone: 'America/Bogota',
        });
      });
  });
});
