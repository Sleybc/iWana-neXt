import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AssuranceController } from '../assurance.controller';
import { AssuranceDashboardService } from '../services/assurance-dashboard.service';
import { CommentsService } from '../services/comments.service';
import { SlaService } from '../services/sla.service';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';

const USERS: Record<string, JwtPayload> = {
  'Bearer support-token': {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-support',
    type: 'tenant',
  },
  'Bearer auditor-token': {
    sub: 'auditor-001',
    email: 'auditor@example.test',
    role: UserRole.AUDITOR,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-auditor',
    type: 'tenant',
  },
};

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = USERS[req.headers.authorization ?? ''];
      if (!user) throw new UnauthorizedException();
      req.user = user;
      return true;
    }
  },
}));

jest.mock('../../access-control/guards/permissions.guard', () => ({
  PermissionsGuard: class PermissionsGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
    }): boolean {
      const roles: string[] = Reflect.getMetadata('roles', context.getHandler() as object) ?? [];
      const user = context.switchToHttp().getRequest().user;
      if (roles.length > 0 && (!user || !roles.includes(user.role))) {
        throw new ForbiddenException();
      }
      return true;
    }
  },
}));

const TICKET = '11111111-1111-4111-8111-111111111111';
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';
const URL = `/api/v1/assurance/tickets/${TICKET}/comments/with-attachments`;

describe('AssuranceController — adjuntos de tickets (HTTP)', () => {
  let app: INestApplication;
  const attachments = {
    createCommentWithAttachments: jest.fn(),
    listForTicket: jest.fn(),
    signLink: jest.fn(),
    decorateComments: jest.fn(async (comments: unknown) => comments),
    decorateTicketList: jest.fn(async (result: unknown) => result),
  };
  const comments = { addComment: jest.fn(), listComments: jest.fn() };
  const tickets = { getById: jest.fn(), list: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: tickets },
        { provide: CommentsService, useValue: comments },
        { provide: TimelineService, useValue: {} },
        { provide: SlaService, useValue: {} },
        { provide: AssuranceDashboardService, useValue: {} },
        { provide: TicketAttachmentsService, useValue: attachments },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('recibe texto y archivos en multipart y lee isInternal como booleano', async () => {
    attachments.createCommentWithAttachments.mockResolvedValue({ id: 'c1', attachments: [] });
    await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', 'Bearer support-token')
      .field('body', 'Evidencia de la visita')
      .field('isInternal', 'true')
      .attach('files', Buffer.from('%PDF-1.4 sintetico'), {
        filename: 'acta.pdf',
        contentType: 'application/pdf',
      })
      .attach('files', Buffer.from('otro'), { filename: 'foto.png', contentType: 'image/png' })
      .expect(201);
    const [ticketId, dto, files, actor] = attachments.createCommentWithAttachments.mock
      .calls[0] as [
      string,
      { body: string; isInternal: boolean },
      Array<{ originalname: string; mimetype: string; buffer: Buffer }>,
      JwtPayload,
    ];
    expect(ticketId).toBe(TICKET);
    expect(dto).toEqual({ body: 'Evidencia de la visita', isInternal: true });
    expect(files.map((file) => file.originalname)).toEqual(['acta.pdf', 'foto.png']);
    expect(Buffer.isBuffer(files[0]?.buffer)).toBe(true);
    expect(actor.sub).toBe('support-001');
  });

  it('rechaza con 413 por Content-Length antes de leer el cuerpo', async () => {
    await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', 'Bearer support-token')
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .set('Content-Length', String(110 * 1024 * 1024 + 1))
      .send('')
      .ok(() => true)
      .then((response) => {
        expect(response.status).toBe(413);
        expect(response.body).toMatchObject({ code: 'TICKET_ATTACHMENTS_TOO_LARGE' });
      });
    expect(attachments.createCommentWithAttachments).not.toHaveBeenCalled();
  });

  it('exige body y rechaza campos de texto desconocidos', async () => {
    await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', 'Bearer support-token')
      .field('isInternal', 'false')
      .expect(400);
    await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', 'Bearer support-token')
      .field('body', 'x')
      .field('isInternal', 'quizás')
      .expect(400);
    expect(attachments.createCommentWithAttachments).not.toHaveBeenCalled();
  });

  it('un auditor no crea comentarios con adjuntos (403)', async () => {
    await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', 'Bearer auditor-token')
      .field('body', 'x')
      .expect(403);
  });

  it('el endpoint JSON de comentarios sigue igual y añade attachments vacío', async () => {
    tickets.getById.mockResolvedValue({ id: TICKET });
    comments.addComment.mockResolvedValue({ id: 'c1', body: 'Hola', isInternal: false });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/assurance/tickets/${TICKET}/comments`)
      .set('Authorization', 'Bearer support-token')
      .send({ body: 'Hola' })
      .expect(201);
    expect(response.body).toEqual({ id: 'c1', body: 'Hola', isInternal: false, attachments: [] });
    // H3: el campo existe siempre y es un arreglo vacío (no ausente, no null).
    expect(Object.prototype.hasOwnProperty.call(response.body, 'attachments')).toBe(true);
    expect(Array.isArray(response.body.attachments)).toBe(true);
    expect(response.body.attachments).toHaveLength(0);
  });

  it('la lista de comentarios y la de tickets pasan por los adjuntos', async () => {
    tickets.getById.mockResolvedValue({ id: TICKET });
    comments.listComments.mockResolvedValue([{ id: 'c1' }]);
    attachments.decorateComments.mockResolvedValueOnce([{ id: 'c1', attachments: [] }]);
    await request(app.getHttpServer())
      .get(`/api/v1/assurance/tickets/${TICKET}/comments`)
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect([{ id: 'c1', attachments: [] }]);

    tickets.list.mockResolvedValue({ data: [{ id: TICKET }] });
    attachments.decorateTicketList.mockResolvedValueOnce({
      data: [{ id: TICKET, attachmentCount: 2 }],
    });
    await request(app.getHttpServer())
      .get('/api/v1/assurance/tickets')
      .set('Authorization', 'Bearer support-token')
      .expect(200)
      .expect({ data: [{ id: TICKET, attachmentCount: 2 }] });
  });

  it('lista adjuntos del ticket y firma con la disposición pedida', async () => {
    attachments.listForTicket.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get(`/api/v1/assurance/tickets/${TICKET}/attachments`)
      .set('Authorization', 'Bearer auditor-token')
      .expect(200);
    attachments.signLink.mockResolvedValue({ url: 'https://firmado' });
    await request(app.getHttpServer())
      .get(
        `/api/v1/assurance/tickets/${TICKET}/attachments/${ATTACHMENT}/link?disposition=attachment`,
      )
      .set('Authorization', 'Bearer support-token')
      .expect(200);
    expect(attachments.signLink).toHaveBeenCalledWith(
      TICKET,
      ATTACHMENT,
      'attachment',
      expect.objectContaining({ sub: 'support-001' }),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/assurance/tickets/${TICKET}/attachments/${ATTACHMENT}/link?disposition=otro`)
      .set('Authorization', 'Bearer support-token')
      .expect(400);
  });

  it('S-3: la subida multipart está acotada a 10 por minuto; el comentario JSON no', () => {
    const proto = AssuranceController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata('THROTTLER:LIMITglobal', proto['addCommentWithAttachments']!)).toBe(
      10,
    );
    expect(Reflect.getMetadata('THROTTLER:TTLglobal', proto['addCommentWithAttachments']!)).toBe(
      60_000,
    );
    expect(Reflect.getMetadata('THROTTLER:LIMITglobal', proto['addComment']!)).toBeUndefined();
  });
});
