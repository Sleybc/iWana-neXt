import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BusinessHoursWeekday, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { OrganizationController } from '../../organization/organization.controller';
import { OrganizationService } from '../../organization/organization.service';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { WfmController } from '../wfm.controller';
import { WfmOrganizationSitesReadPort } from '../ports/wfm-organization-sites-read.port';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { OperationalEventualitiesService } from '../services/operational-eventualities.service';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';
import { TechnicianAvailabilityService } from '../services/technician-availability.service';
import { VisitRequestsService } from '../services/visit-requests.service';
import { WfmDashboardService } from '../services/wfm-dashboard.service';
import { WorkOrdersService } from '../services/work-orders.service';

type TenantCtx = { tenantId: string; schemaName: string };

interface CompanyHoursRow {
  tenantId: string;
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

interface ExceptionRow {
  id: string;
  tenantId: string;
  organizationSiteId: string | null;
  exceptionDate: string;
  isRecurring: boolean;
  isOpen: boolean;
  name: string;
  description: string | null;
}

const mockRunInTenantSchema = jest.fn();
let activeTenantContext: TenantCtx = { tenantId: 'tenant-001', schemaName: 'tenant_001' };

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      ...(actual.TenantContext as Record<string, unknown>),
      getOrThrow: () => activeTenantContext,
    },
  };
});

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
        activeTenantContext = { tenantId: 'tenant-001', schemaName: 'tenant_001' };
        req.user = {
          sub: 'admin-001',
          email: 'admin@test.com',
          role: UserRole.ADMIN,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-admin',
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

function buildWeekdayHours(
  weekday: BusinessHoursWeekday,
  isOpen: boolean,
  opensAt: string | null,
  closesAt: string | null,
): Array<{
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}> {
  return [
    {
      weekday,
      isOpen,
      opensAt,
      closesAt,
    },
  ];
}

describe('Calendar -> WFM operating window HTTP contract', () => {
  let app: INestApplication;
  const companyHoursStore: CompanyHoursRow[] = [];
  const exceptionsStore: ExceptionRow[] = [];

  const organizationServiceMock = {
    getCompanyHours: jest.fn(async () =>
      companyHoursStore
        .filter((row) => row.tenantId === activeTenantContext.tenantId)
        .map((row) => ({
          weekday: row.weekday,
          isOpen: row.isOpen,
          opensAt: row.opensAt,
          closesAt: row.closesAt,
        })),
    ),
    replaceCompanyHours: jest.fn(
      async (dto: {
        businessHours: Array<{
          weekday: BusinessHoursWeekday;
          isOpen: boolean;
          opensAt?: string | null;
          closesAt?: string | null;
        }>;
      }) => {
        for (let index = companyHoursStore.length - 1; index >= 0; index -= 1) {
          if (companyHoursStore[index]?.tenantId === activeTenantContext.tenantId) {
            companyHoursStore.splice(index, 1);
          }
        }

        dto.businessHours.forEach((entry) => {
          companyHoursStore.push({
            tenantId: activeTenantContext.tenantId,
            weekday: entry.weekday,
            isOpen: entry.isOpen,
            opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
            closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
          });
        });

        return companyHoursStore
          .filter((row) => row.tenantId === activeTenantContext.tenantId)
          .map((row) => ({
            weekday: row.weekday,
            isOpen: row.isOpen,
            opensAt: row.opensAt,
            closesAt: row.closesAt,
          }));
      },
    ),
    getExceptions: jest.fn(async () =>
      exceptionsStore
        .filter((row) => row.tenantId === activeTenantContext.tenantId)
        .map((row) => ({ ...row })),
    ),
    createException: jest.fn(
      async (dto: {
        organizationSiteId?: string | null;
        exceptionDate: string;
        isRecurring?: boolean;
        isOpen: boolean;
        opensAt?: string | null;
        closesAt?: string | null;
        name: string;
        description?: string | null;
      }) => {
        const next: ExceptionRow = {
          id: `ex-${exceptionsStore.length + 1}`,
          tenantId: activeTenantContext.tenantId,
          organizationSiteId: dto.organizationSiteId ?? null,
          exceptionDate: dto.exceptionDate,
          isRecurring: dto.isRecurring ?? false,
          isOpen: dto.isOpen,
          name: dto.name,
          description: dto.description ?? null,
        };
        exceptionsStore.push(next);
        return { ...next };
      },
    ),
    updateException: jest.fn(),
    deleteException: jest.fn(),
  };

  beforeAll(async () => {
    mockRunInTenantSchema.mockImplementation(
      async (_ds: DataSource, _schemaName: string, callback) =>
        callback({
          manager: {
            find: jest
              .fn()
              .mockImplementation(
                async (
                  entity: { name?: string },
                  options?: { where?: Record<string, unknown> },
                ) => {
                  if (entity?.name === 'OrganizationBusinessHoursException') {
                    const tenantId = options?.where?.['tenantId'];
                    return exceptionsStore.filter((row) => row.tenantId === tenantId);
                  }
                  return [];
                },
              ),
            findOne: jest
              .fn()
              .mockImplementation(
                async (
                  entity: { name?: string },
                  options?: { where?: Record<string, unknown> },
                ) => {
                  if (entity?.name === 'OrganizationCompanyBusinessHours') {
                    const tenantId = options?.where?.['tenantId'];
                    const weekday = options?.where?.['weekday'];
                    return (
                      companyHoursStore.find(
                        (row) => row.tenantId === tenantId && row.weekday === weekday,
                      ) ?? null
                    );
                  }
                  return null;
                },
              ),
          },
        }),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController, WfmController],
      providers: [
        { provide: OrganizationService, useValue: organizationServiceMock },
        { provide: ScheduleEventsService, useValue: {} },
        { provide: VisitRequestsService, useValue: {} },
        { provide: ScheduleRecommendationsService, useValue: {} },
        { provide: WorkOrdersService, useValue: {} },
        { provide: TechnicianAvailabilityService, useValue: {} },
        { provide: WfmDashboardService, useValue: {} },
        { provide: OperationalEventualitiesService, useValue: {} },
        { provide: WfmOrganizationSitesReadPort, useValue: { listDispatchSites: jest.fn() } },
        {
          provide: WfmTenantSettingsReadPort,
          useValue: { getTimezone: jest.fn().mockResolvedValue('America/Bogota') },
        },
        OperatingWindowResolverService,
        { provide: DataSource, useValue: {} },
        JwtAuthGuard,
        RolesGuard,
        { provide: PermissionsGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    companyHoursStore.length = 0;
    exceptionsStore.length = 0;
    activeTenantContext = { tenantId: 'tenant-001', schemaName: 'tenant_001' };
    jest.clearAllMocks();
  });

  it('aplica inmediatamente el horario base de calendario al resolver ventana operativa WFM', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/organization/business-hours/company')
      .set('Authorization', 'Bearer admin-token')
      .send({
        businessHours: buildWeekdayHours(BusinessHoursWeekday.FRIDAY, true, '09:00', '17:00'),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-window/resolve')
      .set('Authorization', 'Bearer admin-token')
      .send({ dateLocal: '2026-06-05' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'OPEN',
            source: 'COMPANY_HOURS',
            startTime: '09:00',
            endTime: '17:00',
          }),
        );
      });

    await request(app.getHttpServer())
      .put('/api/v1/organization/business-hours/company')
      .set('Authorization', 'Bearer admin-token')
      .send({
        businessHours: buildWeekdayHours(BusinessHoursWeekday.FRIDAY, false, null, null),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-window/resolve')
      .set('Authorization', 'Bearer admin-token')
      .send({ dateLocal: '2026-06-05' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'CLOSED',
            source: 'COMPANY_HOURS',
            reason: 'La empresa esta cerrada para la fecha consultada.',
          }),
        );
      });
  });

  it('prioriza cierre especial de calendario sobre horario base en la resolución WFM', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/organization/business-hours/company')
      .set('Authorization', 'Bearer admin-token')
      .send({
        businessHours: buildWeekdayHours(BusinessHoursWeekday.FRIDAY, true, '07:00', '18:00'),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/organization/business-hours/exceptions')
      .set('Authorization', 'Bearer admin-token')
      .send({
        exceptionDate: '2026-06-05',
        isRecurring: false,
        isOpen: false,
        name: 'Cierre por mantenimiento eléctrico',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/wfm/operating-window/resolve')
      .set('Authorization', 'Bearer admin-token')
      .send({ dateLocal: '2026-06-05' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'CLOSED',
            source: 'HOLIDAY_BLACKOUT',
            reason: 'Cierre por mantenimiento eléctrico',
          }),
        );
      });
  });
});
