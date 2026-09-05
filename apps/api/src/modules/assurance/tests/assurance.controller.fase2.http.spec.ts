import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
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
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) return true;
      const req = context.switchToHttp().getRequest();
      const tokens: Record<string, JwtPayload> = {
        'Bearer support-token': {
          sub: 'support-001',
          role: UserRole.SUPPORT,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
        'Bearer auditor-token': {
          sub: 'auditor-001',
          role: UserRole.AUDITOR,
          tenantId: 't-001',
          schemaName: 't_001',
          type: 'tenant',
        } as JwtPayload,
      };
      const h = req.headers.authorization;
      if (h && tokens[h]) {
        req.user = tokens[h];
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
      if (!user || !required.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

const TICKET_BODY = {
  type: 'CUSTOMER_INCIDENT',
  subject: 'No navega el enlace del cliente',
  requesterType: 'SUBSCRIBER',
  requesterRefId: 'subscriber-001',
  subjectType: 'SERVICE',
  subjectRefId: 'service-001',
  queueName: 'SUPPORT',
};

describe('AssuranceController Fase 2 — doble guard', () => {
  let app: INestApplication;
  const ticketsServiceMock = {
    list: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    create: jest.fn().mockResolvedValue({ id: 'ticket-001' }),
  };
  const permsMock = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: ticketsServiceMock },
        { provide: CommentsService, useValue: {} },
        { provide: TimelineService, useValue: {} },
        { provide: SlaService, useValue: {} },
        { provide: AssuranceDashboardService, useValue: {} },
        { provide: EffectivePermissionsService, useValue: permsMock },
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
    ticketsServiceMock.list.mockResolvedValue({ data: [], meta: { total: 0 } });
    ticketsServiceMock.create.mockResolvedValue({ id: 'ticket-001' });
  });

  it('GET /assurance/tickets — 200 para AUDITOR con permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
  });

  it('GET /assurance/tickets — 403 para AUDITOR sin permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer auditor-token')
      .expect(403);
  });

  it('POST /assurance/tickets — 201 para SUPPORT con permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer support-token')
      .send(TICKET_BODY)
      .expect(201);
  });

  it('POST /assurance/tickets — 403 para SUPPORT sin permiso', async () => {
    permsMock.getEffectivePermissionsForUser.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer support-token')
      .send(TICKET_BODY)
      .expect(403);
  });
});
