import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
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
      const roles: Record<string, UserRole> = {
        'Bearer support-token': UserRole.SUPPORT,
        'Bearer tech-token': UserRole.TECHNICIAN,
        'Bearer auditor-token': UserRole.AUDITOR,
      };
      const role = roles[req.headers.authorization ?? ''];
      if (!role) throw new UnauthorizedException('Token inválido');
      req.user = {
        sub: `${role.toLowerCase()}-001`,
        role,
        tenantId: 't-001',
        schemaName: 't_001',
        type: 'tenant',
      } as JwtPayload;
      return true;
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
      const user = context.switchToHttp().getRequest().user;
      const required: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (required.length > 0 && (!user || !required.includes(user.role))) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }
      return true;
    }
  },
}));

const TICKET = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const MANAGE = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
];

describe('AssuranceController — detalle del ticket, búsqueda y vínculo de orden (MOD10 paso 2)', () => {
  let app: INestApplication;
  const tickets = {
    getDetail: jest.fn(),
    lookupExecutionOrder: jest.fn(),
    linkExecutionOrder: jest.fn(),
  };
  const perms = { getEffectivePermissionsForUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: tickets },
        { provide: CommentsService, useValue: {} },
        { provide: TimelineService, useValue: {} },
        { provide: SlaService, useValue: {} },
        { provide: AssuranceDashboardService, useValue: {} },
        { provide: TicketAttachmentsService, useValue: {} },
        { provide: EffectivePermissionsService, useValue: perms },
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
    perms.getEffectivePermissionsForUser.mockResolvedValue(MANAGE);
  });

  describe('GET /assurance/tickets/:id', () => {
    it('devuelve el detalle del servicio, con la identidad de quien consulta', async () => {
      tickets.getDetail.mockResolvedValue({ id: TICKET, allowedTransitions: [] });
      perms.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/assurance/tickets/${TICKET}`)
        .set('Authorization', 'Bearer auditor-token')
        .expect(200)
        .expect({ id: TICKET, allowedTransitions: [] });
      expect(tickets.getDetail).toHaveBeenCalledWith(
        TICKET,
        expect.objectContaining({ sub: 'auditor-001', role: UserRole.AUDITOR }),
      );
    });

    it('403 sin assurance.tickets.read', async () => {
      perms.getEffectivePermissionsForUser.mockResolvedValue([]);
      await request(app.getHttpServer())
        .get(`/api/v1/assurance/tickets/${TICKET}`)
        .set('Authorization', 'Bearer support-token')
        .expect(403);
      expect(tickets.getDetail).not.toHaveBeenCalled();
    });
  });

  describe('GET /assurance/execution-orders/lookup', () => {
    it('401 sin token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-001')
        .expect(401);
    });

    it('normaliza el número y pasa el ticket desde el que se busca', async () => {
      tickets.lookupExecutionOrder.mockResolvedValue({ id: ORDER, linkedTicket: 'NONE' });
      await request(app.getHttpServer())
        .get(
          `/api/v1/assurance/execution-orders/lookup?number=%20ote-20261116-001%20&ticketId=${TICKET}`,
        )
        .set('Authorization', 'Bearer support-token')
        .expect(200)
        .expect({ id: ORDER, linkedTicket: 'NONE' });
      expect(tickets.lookupExecutionOrder).toHaveBeenCalledWith(
        'OTE-20261116-001',
        TICKET,
        expect.objectContaining({ sub: 'support-001', role: UserRole.SUPPORT }),
      );
    });

    it('403 cuando el servicio exige operations.execution_orders.read (S-2)', async () => {
      tickets.lookupExecutionOrder.mockRejectedValue(
        new ForbiddenException({ code: 'EXECUTION_ORDERS_READ_REQUIRED' }),
      );
      const response = await request(app.getHttpServer())
        .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-001')
        .set('Authorization', 'Bearer support-token')
        .expect(403);
      expect(response.body).toMatchObject({ code: 'EXECUTION_ORDERS_READ_REQUIRED' });
    });

    it.each([
      ['prefijo', 'OTE-2026'],
      ['comodín', 'OTE-20261116-%25'],
      ['otro formato', 'WO-20261116-001'],
      ['vacío', ''],
    ])('400 con número inválido (%s), sin consultar', async (_label, value) => {
      await request(app.getHttpServer())
        .get(`/api/v1/assurance/execution-orders/lookup?number=${value}`)
        .set('Authorization', 'Bearer support-token')
        .expect(400);
      expect(tickets.lookupExecutionOrder).not.toHaveBeenCalled();
    });

    it('400 con un parámetro no admitido (consulta estricta)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-001&q=x')
        .set('Authorization', 'Bearer support-token')
        .expect(400);
    });

    it('404 cuando el servicio no encuentra la orden', async () => {
      tickets.lookupExecutionOrder.mockRejectedValue(
        new NotFoundException({ code: 'EXECUTION_ORDER_NOT_FOUND' }),
      );
      await request(app.getHttpServer())
        .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-999')
        .set('Authorization', 'Bearer support-token')
        .expect(404);
    });

    it('403 para técnico y auditor (techo de roles del vínculo)', async () => {
      for (const token of ['Bearer tech-token', 'Bearer auditor-token']) {
        await request(app.getHttpServer())
          .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-001')
          .set('Authorization', token)
          .expect(403);
      }
      expect(tickets.lookupExecutionOrder).not.toHaveBeenCalled();
    });

    it('403 para soporte sin assurance.tickets.manage', async () => {
      perms.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
      ]);
      await request(app.getHttpServer())
        .get('/api/v1/assurance/execution-orders/lookup?number=OTE-20261116-001')
        .set('Authorization', 'Bearer support-token')
        .expect(403);
    });
  });

  describe('POST /assurance/tickets/:id/link-execution-order', () => {
    it('200 con el resultado del vínculo', async () => {
      tickets.linkExecutionOrder.mockResolvedValue({ id: ORDER, outcome: 'LINKED' });
      await request(app.getHttpServer())
        .post(`/api/v1/assurance/tickets/${TICKET}/link-execution-order`)
        .set('Authorization', 'Bearer support-token')
        .send({ executionOrderId: ORDER, notes: 'Visita del lunes' })
        .expect(200)
        .expect({ id: ORDER, outcome: 'LINKED' });
      expect(tickets.linkExecutionOrder).toHaveBeenCalledWith(
        TICKET,
        { executionOrderId: ORDER, notes: 'Visita del lunes' },
        expect.objectContaining({ sub: 'support-001' }),
      );
    });

    it.each([
      ['sin orden', {}],
      ['orden no UUID', { executionOrderId: 'OTE-20261116-001' }],
      ['campo extra', { executionOrderId: ORDER, workOrderId: ORDER }],
      ['nota demasiado larga', { executionOrderId: ORDER, notes: 'x'.repeat(2001) }],
    ])('400 con cuerpo inválido (%s)', async (_label, body) => {
      await request(app.getHttpServer())
        .post(`/api/v1/assurance/tickets/${TICKET}/link-execution-order`)
        .set('Authorization', 'Bearer support-token')
        .send(body)
        .expect(400);
      expect(tickets.linkExecutionOrder).not.toHaveBeenCalled();
    });

    it('400 con id de ticket que no es UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assurance/tickets/TK-1/link-execution-order')
        .set('Authorization', 'Bearer support-token')
        .send({ executionOrderId: ORDER })
        .expect(400);
    });

    it('403 para técnico (mismo techo que link-work-order)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assurance/tickets/${TICKET}/link-execution-order`)
        .set('Authorization', 'Bearer tech-token')
        .send({ executionOrderId: ORDER })
        .expect(403);
      expect(tickets.linkExecutionOrder).not.toHaveBeenCalled();
    });

    it('409 cuando la orden es de otro caso', async () => {
      tickets.linkExecutionOrder.mockRejectedValue(
        new ConflictException({ code: 'EXECUTION_ORDER_LINKED_TO_OTHER_TICKET' }),
      );
      await request(app.getHttpServer())
        .post(`/api/v1/assurance/tickets/${TICKET}/link-execution-order`)
        .set('Authorization', 'Bearer support-token')
        .send({ executionOrderId: ORDER })
        .expect(409);
    });
  });
});
