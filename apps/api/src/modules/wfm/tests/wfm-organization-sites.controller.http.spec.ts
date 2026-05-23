import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { OrganizationSiteCapability, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WfmController } from '../wfm.controller';
import { WfmOrganizationSitesReadPort } from '../ports/wfm-organization-sites-read.port';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { CompanyBusinessHoursService } from '../services/company-business-hours.service';
import { HolidayBlackoutsService } from '../services/holiday-blackouts.service';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';
import { SiteBusinessHoursService } from '../services/site-business-hours.service';
import { TechnicianAvailabilityService } from '../services/technician-availability.service';
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

describe('Wfm organization sites HTTP', () => {
  let app: INestApplication;

  const wfmOrganizationSitesReadPortMock = {
    listDispatchSites: jest.fn(),
  };
  const operatingSitesServiceMock = {
    list: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WfmController],
      providers: [
        { provide: ScheduleEventsService, useValue: {} },
        { provide: VisitRequestsService, useValue: {} },
        { provide: ScheduleRecommendationsService, useValue: {} },
        { provide: WorkOrdersService, useValue: {} },
        { provide: TechnicianAvailabilityService, useValue: {} },
        { provide: WfmDashboardService, useValue: {} },
        { provide: CompanyBusinessHoursService, useValue: {} },
        { provide: SiteBusinessHoursService, useValue: {} },
        { provide: HolidayBlackoutsService, useValue: {} },
        { provide: WfmTenantSettingsReadPort, useValue: {} },
        { provide: OperatingWindowResolverService, useValue: {} },
        { provide: WfmOrganizationSitesReadPort, useValue: wfmOrganizationSitesReadPortMock },
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

  it('lista sedes de despacho para SUPPORT', async () => {
    wfmOrganizationSitesReadPortMock.listDispatchSites.mockResolvedValue([
      {
        id: '4a98ba31-9c6f-4a3b-a21d-f0b6de5e7161',
        name: 'Centro operativo norte',
        code: 'NORTE',
        capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
        isActive: true,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/wfm/dispatch-sites')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          expect.objectContaining({
            id: '4a98ba31-9c6f-4a3b-a21d-f0b6de5e7161',
            code: 'NORTE',
          }),
        ]);
        expect(wfmOrganizationSitesReadPortMock.listDispatchSites).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenant-001', role: UserRole.SUPPORT }),
        );
      });
  });
});
