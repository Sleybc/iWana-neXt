import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ScheduleEventStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WfmController } from '../wfm.controller';
import { WfmOrganizationSitesReadPort } from '../ports/wfm-organization-sites-read.port';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import { ScheduleEventsService } from '../services/schedule-events.service';
import { ScheduleConflictService } from '../services/schedule-conflict.service';
import { WorkOrdersService } from '../services/work-orders.service';
import { TechnicianAvailabilityService } from '../services/technician-availability.service';
import { WfmDashboardService } from '../services/wfm-dashboard.service';
import { OperatingWindowResolverService } from '../services/operating-window-resolver.service';
import { OperationalEventualitiesService } from '../services/operational-eventualities.service';
import { ScheduleRecommendationsService } from '../services/schedule-recommendations.service';
import { VisitRequestsService } from '../services/visit-requests.service';
import { NonRealizationCausesService } from '../services/non-realization-causes.service';
import { NonRealizationSlaService } from '../services/non-realization-sla.service';

type TenantCtx = { tenantId: string; schemaName: string };

const schemaCalls: string[] = [];
let activeTenantContext: TenantCtx = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
const mockRunInTenantSchema = jest.fn();

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

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;

      if (authHeader === 'Bearer tenant-a-token') {
        activeTenantContext = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
        request.user = {
          sub: 'admin-tenant-a',
          email: 'hash-tenant-a',
          role: UserRole.ADMIN,
          tenantId: 'tenant-a-id',
          schemaName: 'tenant_a',
          jti: 'jti-tenant-a',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }

      if (authHeader === 'Bearer tenant-b-token') {
        activeTenantContext = { tenantId: 'tenant-b-id', schemaName: 'tenant_b' };
        request.user = {
          sub: 'admin-tenant-b',
          email: 'hash-tenant-b',
          role: UserRole.ADMIN,
          tenantId: 'tenant-b-id',
          schemaName: 'tenant_b',
          jti: 'jti-tenant-b',
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

const sharedEventId = '11111111-1111-4111-8111-111111111111';
const exclusiveTenantBEventId = '22222222-2222-4222-8222-222222222222';

const tenantEvents = [
  {
    id: sharedEventId,
    tenantId: 'tenant-a-id',
    type: 'INSTALLATION',
    status: ScheduleEventStatus.SCHEDULED,
    title: 'Instalacion tenant A',
    assignedUserId: 'tech-a',
  },
  {
    id: sharedEventId,
    tenantId: 'tenant-b-id',
    type: 'INSTALLATION',
    status: ScheduleEventStatus.SCHEDULED,
    title: 'Instalacion tenant B',
    assignedUserId: 'tech-b',
  },
  {
    id: exclusiveTenantBEventId,
    tenantId: 'tenant-b-id',
    type: 'TECHNICAL_VISIT',
    status: ScheduleEventStatus.DRAFT,
    title: 'Visita exclusiva tenant B',
    assignedUserId: 'tech-b',
  },
];

function buildManager() {
  return {
    findOne: jest
      .fn()
      .mockImplementation(
        async (entity: { name?: string }, options?: { where?: Record<string, unknown> }) => {
          if (entity?.name !== 'ScheduleEvent') {
            return null;
          }

          const where = options?.where ?? {};
          return (
            tenantEvents.find(
              (event) => event.id === where['id'] && event.tenantId === where['tenantId'],
            ) ?? null
          );
        },
      ),
  };
}

describe('WfmController tenant isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockRunInTenantSchema.mockImplementation(
      async (
        _ds: DataSource,
        schemaName: string,
        callback: (qr: { manager: ReturnType<typeof buildManager> }) => Promise<unknown>,
      ) => {
        schemaCalls.push(schemaName);
        return callback({ manager: buildManager() });
      },
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WfmController],
      providers: [
        {
          provide: NonRealizationCausesService,
          useValue: { listActive: jest.fn().mockResolvedValue([]), seedDefaults: jest.fn() },
        },
        {
          provide: NonRealizationSlaService,
          useValue: {
            evaluateSlaAction: jest.fn(),
            consumesRetry: jest.fn(),
            isCustomerCause: jest.fn(),
            computeReclassificationRetryDelta: jest.fn(),
          },
        },
        ScheduleEventsService,
        { provide: DataSource, useValue: {} },
        {
          provide: ScheduleConflictService,
          useValue: { hasConflict: jest.fn(), hasConflictWithManager: jest.fn() },
        },
        {
          provide: WorkOrdersService,
          useValue: { list: jest.fn(), getById: jest.fn(), transitionStatus: jest.fn() },
        },
        {
          provide: TechnicianAvailabilityService,
          useValue: { list: jest.fn(), create: jest.fn() },
        },
        { provide: WfmDashboardService, useValue: { getSummary: jest.fn() } },
        { provide: OperationalEventualitiesService, useValue: {} },
        { provide: VisitRequestsService, useValue: { listVisitRequests: jest.fn() } },
        { provide: ScheduleRecommendationsService, useValue: { recommend: jest.fn() } },
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
    schemaCalls.length = 0;
    activeTenantContext = { tenantId: 'tenant-a-id', schemaName: 'tenant_a' };
  });

  it('resuelve el mismo evento dentro del schema del tenant A', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/wfm/events/${sharedEventId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(200);

    expect(response.body.title).toBe('Instalacion tenant A');
    expect(schemaCalls).toEqual(['tenant_a']);
  });

  it('resuelve el mismo evento dentro del schema del tenant B', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/wfm/events/${sharedEventId}`)
      .set('Authorization', 'Bearer tenant-b-token')
      .expect(200);

    expect(response.body.title).toBe('Instalacion tenant B');
    expect(schemaCalls).toEqual(['tenant_b']);
  });

  it('no permite leer desde tenant A un evento que solo existe en tenant B', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/wfm/events/${exclusiveTenantBEventId}`)
      .set('Authorization', 'Bearer tenant-a-token')
      .expect(404);

    expect(schemaCalls).toEqual(['tenant_a']);
  });
});
