import { randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, type INestApplication, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  MediaAsset,
  resolveMigrationDbCredentials,
  SupportTicket,
  TenantContext,
  TicketComment,
  TicketCommentAttachment,
  TicketTimelineEvent,
} from '@iwana/db';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { StoragePort } from '@iwana/storage';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import {
  syntheticFakeExecutable,
  syntheticMp4,
  syntheticPdf,
  syntheticPng,
} from '../../media/testing/synthetic-files';
import { TicketAttachmentMediaProvider } from '../../media/ticket-attachment-media.provider';
import { AssuranceController } from '../assurance.controller';
import { AssuranceDashboardService } from '../services/assurance-dashboard.service';
import { CommentsService } from '../services/comments.service';
import { SlaService } from '../services/sla.service';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ephemeralSchemaName } from '../../../../../../packages/database/test/ephemeral-schema';

/**
 * Adjuntos de tickets por HTTP real contra PostgreSQL real (spec MOD09 adjuntos §5, criterios
 * 1, 2 y 3; QA ola 4). Complementa `ticket-attachments.postgres.integration.spec.ts` (nivel
 * servicio): aquí el multipart pasa por el controlador, el interceptor de tamaño y multer, y la
 * visibilidad de comentarios internos se comprueba en las respuestas HTTP.
 *
 * Dobles: guards de JWT/roles/permisos (el actor sale del encabezado, como en
 * `assurance.attachments.http.spec.ts`), almacenamiento en memoria y la cola. `TicketsService`
 * solo responde `getById` (lo exige `GET …/comments`); comentarios, adjuntos y medios son reales.
 * Multi-tenancy: un segundo schema tenant migrado; un JWT de otro tenant no ve, no lista ni
 * firma adjuntos del primero.
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const suffix = randomBytes(5).toString('hex');
const schemaA = ephemeralSchemaName('tenant_ticket_http_');
const schemaB = ephemeralSchemaName('tenant_ticket_httpb_');
const tenantA = randomUUID();
const tenantB = randomUUID();
const supportId = randomUUID();
const technicianId = randomUUID();
const subscriberId = randomUUID();

if (dbAvailable && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName)) {
  throw new Error('Integración HTTP de adjuntos: DB_NAME debe ser test o iwana_it_*.');
}

function actor(sub: string, role: UserRole, tenantId: string, schemaName: string): JwtPayload {
  return {
    sub,
    email: 'adjuntos-http-it@example.invalid',
    role,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };
}

const USERS: Record<string, JwtPayload> = {
  'Bearer support-a': actor(supportId, UserRole.SUPPORT, tenantA, schemaA),
  'Bearer technician-a': actor(technicianId, UserRole.TECHNICIAN, tenantA, schemaA),
  'Bearer support-b': actor(randomUUID(), UserRole.SUPPORT, tenantB, schemaB),
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

class MemoryStorage {
  readonly objects = new Map<string, Buffer>();
  putObject = jest.fn(async (key: string, body: Buffer) => {
    this.objects.set(key, Buffer.from(body));
  });
  deleteObject = jest.fn(async (key: string) => {
    this.objects.delete(key);
  });
  getSignedUrl = jest.fn(async (key: string) => `https://minio.invalid/${key}?firma=sintetica`);
}

type AttachmentView = { id: string; filename: string; contentType: string; status: string };
type CommentView = { id: string; body: string; isInternal: boolean; attachments: AttachmentView[] };

describeWithDb('Adjuntos de tickets — HTTP real contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  const storage = new MemoryStorage();
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const ticketsStub = {
    getById: jest.fn(async (id: string) => ({ id })),
  };

  const http = () => request(app.getHttpServer());
  const commentsUrl = (ticketId: string) => `/api/v1/assurance/tickets/${ticketId}/comments`;
  const withAttachmentsUrl = (ticketId: string) => `${commentsUrl(ticketId)}/with-attachments`;
  const linkUrl = (ticketId: string, attachmentId: string, disposition = 'inline') =>
    `/api/v1/assurance/tickets/${ticketId}/attachments/${attachmentId}/link?disposition=${disposition}`;

  async function insertTicket(assignedUserId: string | null = technicianId): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaA}".support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, sla_breach_status, field_decision,
         created_by_user_id, assigned_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())`,
      [
        id,
        tenantA,
        `HTTP-${randomBytes(8).toString('hex')}`,
        TicketType.CUSTOMER_INCIDENT,
        TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Ticket sintético de adjuntos por HTTP',
        TicketRequesterType.SUBSCRIBER,
        subscriberId,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        supportId,
        assignedUserId,
      ],
    );
    return id;
  }

  async function countIn(table: string, ticketId: string): Promise<number> {
    const rows = (await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM "${schemaA}".${table} WHERE ticket_id = $1`,
      [ticketId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function makeAvailable(attachmentIds: string[]): Promise<void> {
    await dataSource.query(
      `UPDATE public.media_assets SET asset_status = 'AVAILABLE'
        WHERE id IN (SELECT media_asset_id FROM "${schemaA}".ticket_comment_attachments
                      WHERE id = ANY($1::uuid[]))`,
      [attachmentIds],
    );
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [
        SupportTicket,
        TicketComment,
        TicketCommentAttachment,
        TicketTimelineEvent,
        MediaAsset,
      ],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 4, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    for (const [id, schema] of [
      [tenantA, schemaA],
      [tenantB, schemaB],
    ] as const) {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
        [id, 'Adjuntos HTTP sintético', `tk-http-${id.slice(0, 8)}`, schema, 'tk@example.invalid'],
      );
    }
    // Dos schemas tenant con la cadena de migraciones vigente (incluye la 212): B prueba el
    // aislamiento entre tenants.
    for (const schema of [schemaA, schemaB]) {
      await dataSource.query(`CREATE SCHEMA "${schema}"`);
      const tenantDataSource = createTenantDataSource(dataSource, schema, `tk-http-${schema}`);
      await tenantDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(tenantDataSource);
      } finally {
        await tenantDataSource.destroy();
      }
    }

    const config = {
      get: (key: string, fallback?: unknown) =>
        (({ STORAGE_DRIVER: 'minio', NODE_ENV: 'test' }) as Record<string, unknown>)[key] ??
        fallback,
    } as ConfigService;
    const media = new TicketAttachmentMediaProvider(
      dataSource,
      storage as unknown as StoragePort,
      config,
      queue as unknown as Queue,
    );
    const timeline = new TimelineService(dataSource);
    const crm = { assertWritableReferences: jest.fn() } as unknown as CrmSubscriberReadPort;
    const attachments = new TicketAttachmentsService(dataSource, timeline, crm, media);
    const comments = new CommentsService(dataSource, timeline, crm);

    const moduleRef = await Test.createTestingModule({
      controllers: [AssuranceController],
      providers: [
        { provide: TicketsService, useValue: ticketsStub },
        { provide: CommentsService, useValue: comments },
        { provide: TimelineService, useValue: timeline },
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
    // Como `TenantMiddleware`: el contexto del tenant sale de la sesión, nunca del cuerpo.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const user = USERS[req.headers.authorization ?? ''];
      if (!user) return next();
      return TenantContext.run(
        { tenantId: user.tenantId!, schemaName: user.schemaName!, tenantSlug: 'tk-http' },
        next,
      );
    });
    await app.init();
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(
          `DELETE FROM public.media_assets WHERE tenant_schema = ANY($1::text[])`,
          [[schemaA, schemaB]],
        );
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
          [tenantA, tenantB],
        ]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  beforeEach(() => {
    storage.getSignedUrl.mockClear();
    storage.putObject.mockClear();
  });

  it('CA-1/CA-2: multipart con foto, PDF y MP4 crea el comentario con 3 adjuntos en revisión; disponibles se firman con su disposición', async () => {
    const ticketId = await insertTicket();
    const created = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .field('body', 'Evidencia de la visita por HTTP')
      .field('isInternal', 'false')
      .attach('files', syntheticPng(), { filename: 'foto.png', contentType: 'image/png' })
      .attach('files', syntheticPdf(), { filename: 'acta.pdf', contentType: 'application/pdf' })
      .attach('files', syntheticMp4(), {
        filename: 'visita',
        contentType: 'application/octet-stream',
      })
      .expect(201);

    const comment = created.body as CommentView;
    expect(comment.isInternal).toBe(false);
    expect(comment.attachments.map((a) => [a.filename, a.contentType, a.status])).toEqual([
      ['foto.png', 'image/png', 'IN_REVIEW'],
      ['acta.pdf', 'application/pdf', 'IN_REVIEW'],
      ['visita.mp4', 'video/mp4', 'IN_REVIEW'],
    ]);
    expect(await countIn('ticket_comment_attachments', ticketId)).toBe(3);
    expect(storage.putObject).toHaveBeenCalledTimes(3);

    // En revisión: 409 con su código, sin firmar.
    const inReview = await http()
      .get(linkUrl(ticketId, comment.attachments[1]!.id))
      .set('Authorization', 'Bearer support-a')
      .expect(409);
    expect(inReview.body.code).toBe('TICKET_ATTACHMENT_IN_REVIEW');
    expect(storage.getSignedUrl).not.toHaveBeenCalled();

    await makeAvailable(comment.attachments.map((a) => a.id));
    const listed = await http()
      .get(commentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .expect(200);
    expect((listed.body as CommentView[])[0]!.attachments.map((a) => a.status)).toEqual([
      'AVAILABLE',
      'AVAILABLE',
      'AVAILABLE',
    ]);

    const link = await http()
      .get(linkUrl(ticketId, comment.attachments[2]!.id, 'attachment'))
      .set('Authorization', 'Bearer support-a')
      .expect(200);
    expect(link.body).toMatchObject({ filename: 'visita.mp4', contentType: 'video/mp4' });
    expect(link.body.url).toMatch(/^https:\/\//u);
    expect(storage.getSignedUrl).toHaveBeenLastCalledWith(
      expect.stringContaining(`${schemaA}/ticket_attachment/`),
      300,
      {
        responseContentType: 'video/mp4',
        responseContentDisposition: `attachment; filename="visita.mp4"; filename*=UTF-8''visita.mp4`,
      },
    );
  });

  it('CA-1: un archivo con firma falsa responde 400 nombrando el archivo y no guarda nada', async () => {
    const ticketId = await insertTicket();
    const response = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .field('body', 'Con un ejecutable disfrazado')
      .attach('files', syntheticPdf(), { filename: 'valido.pdf', contentType: 'application/pdf' })
      .attach('files', syntheticFakeExecutable(), {
        filename: 'foto.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(response.body.code).toBe('TICKET_ATTACHMENT_REJECTED');
    expect(response.body.message).toContain('«foto.png»');
    expect(response.body.rejected).toEqual([
      expect.objectContaining({ index: 1, filename: 'foto.png' }),
    ]);
    expect(await countIn('ticket_comments', ticketId)).toBe(0);
    expect(await countIn('ticket_comment_attachments', ticketId)).toBe(0);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('CA-3: el técnico asignado no ve, no lista ni descarga adjuntos de comentarios internos (404); soporte sí', async () => {
    const ticketId = await insertTicket(technicianId);
    const internal = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .field('body', 'Nota interna con acta')
      .field('isInternal', 'true')
      .attach('files', syntheticPdf(), { filename: 'interno.pdf', contentType: 'application/pdf' })
      .expect(201);
    const visible = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .field('body', 'Foto para el cliente')
      .attach('files', syntheticPng(), { filename: 'publico.png', contentType: 'image/png' })
      .expect(201);
    const internalId = (internal.body as CommentView).attachments[0]!.id;
    const visibleId = (visible.body as CommentView).attachments[0]!.id;
    await makeAvailable([internalId, visibleId]);

    const techComments = await http()
      .get(commentsUrl(ticketId))
      .set('Authorization', 'Bearer technician-a')
      .expect(200);
    expect((techComments.body as CommentView[]).map((c) => c.body)).toEqual([
      'Foto para el cliente',
    ]);
    expect(JSON.stringify(techComments.body)).not.toContain('interno.pdf');

    const techAttachments = await http()
      .get(`/api/v1/assurance/tickets/${ticketId}/attachments`)
      .set('Authorization', 'Bearer technician-a')
      .expect(200);
    expect((techAttachments.body as AttachmentView[]).map((a) => a.filename)).toEqual([
      'publico.png',
    ]);

    await http()
      .get(linkUrl(ticketId, internalId, 'attachment'))
      .set('Authorization', 'Bearer technician-a')
      .expect(404);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    await http()
      .get(linkUrl(ticketId, visibleId))
      .set('Authorization', 'Bearer technician-a')
      .expect(200);

    const supportAttachments = await http()
      .get(`/api/v1/assurance/tickets/${ticketId}/attachments`)
      .set('Authorization', 'Bearer support-a')
      .expect(200);
    expect((supportAttachments.body as AttachmentView[]).map((a) => a.filename)).toEqual([
      'interno.pdf',
      'publico.png',
    ]);
    await http()
      .get(linkUrl(ticketId, internalId, 'attachment'))
      .set('Authorization', 'Bearer support-a')
      .expect(200);
  });

  it('multi-tenancy: un JWT de otro tenant no lista ni firma adjuntos del primero (404) y no sube a su ticket', async () => {
    const ticketId = await insertTicket(null);
    const created = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-a')
      .field('body', 'Adjunto del tenant A')
      .attach('files', syntheticPng(), { filename: 'tenant-a.png', contentType: 'image/png' })
      .expect(201);
    const attachmentId = (created.body as CommentView).attachments[0]!.id;
    await makeAvailable([attachmentId]);

    await http()
      .get(`/api/v1/assurance/tickets/${ticketId}/attachments`)
      .set('Authorization', 'Bearer support-b')
      .expect(404);
    await http()
      .get(linkUrl(ticketId, attachmentId))
      .set('Authorization', 'Bearer support-b')
      .expect(404);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    const upload = await http()
      .post(withAttachmentsUrl(ticketId))
      .set('Authorization', 'Bearer support-b')
      .field('body', 'Intento cruzado')
      .attach('files', syntheticPng(), { filename: 'cruzado.png', contentType: 'image/png' });
    expect(upload.status).toBe(404);
    expect(await countIn('ticket_comment_attachments', ticketId)).toBe(1);
  });
});
