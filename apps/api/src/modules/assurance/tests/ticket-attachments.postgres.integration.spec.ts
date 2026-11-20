import { randomBytes, randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  MediaAsset,
  resolveMigrationDbCredentials,
  runInTenantSchema,
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
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import {
  syntheticFakeExecutable,
  syntheticMp4,
  syntheticPdf,
  syntheticPng,
} from '../../media/testing/synthetic-files';
import { TicketAttachmentMediaProvider } from '../../media/ticket-attachment-media.provider';
import { AssuranceMigrationImportAdapter } from '../migration-adapters/assurance-migration-import.adapter';
import { AssuranceTitularErasureParticipant } from '../privacy/assurance-titular-erasure.participant';
import { CommentsService } from '../services/comments.service';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * Adjuntos de tickets contra PostgreSQL real (spec MOD09 adjuntos §5 y §6; gate de la ola 2).
 * Schema tenant efímero con la cadena de migraciones vigente (incluye la 212) y
 * `public.media_assets` real (032). El almacenamiento es un doble en memoria; los archivos
 * son sintéticos generados en la prueba.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const schemaName = `tenant_ticket_att_${randomBytes(5).toString('hex')}`;
const quotedSchema = `"${schemaName}"`;
const tenantId = randomUUID();
const subscriberId = randomUUID();
const supportId = randomUUID();
const technicianId = randomUUID();

if (dbAvailable && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName)) {
  throw new Error('Integración de adjuntos: DB_NAME debe ser test o iwana_it_*.');
}

function actor(sub: string, role: UserRole): JwtPayload {
  return {
    sub,
    email: 'adjuntos-it@example.invalid',
    role,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };
}
const support = actor(supportId, UserRole.SUPPORT);
const technician = actor(technicianId, UserRole.TECHNICIAN);

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

const file = (buffer: Buffer, originalname: string, mimetype: string) => ({
  buffer,
  originalname,
  mimetype,
});

describeWithDb('Adjuntos de tickets — PostgreSQL real', () => {
  let dataSource: DataSource;
  let storage: MemoryStorage;
  let media: TicketAttachmentMediaProvider;
  let service: TicketAttachmentsService;
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'ticket-att-it' }, operation);

  async function insertTicket(assignedUserId: string | null = technicianId): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quotedSchema}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, sla_breach_status, field_decision,
         created_by_user_id, assigned_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())`,
      [
        id,
        tenantId,
        `IT-${randomBytes(8).toString('hex')}`,
        TicketType.CUSTOMER_INCIDENT,
        TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Ticket sintético de adjuntos',
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

  async function count(table: string, ticketId: string): Promise<number> {
    const rows = (await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${quotedSchema}.${table} WHERE ticket_id = $1`,
      [ticketId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function mediaRows(): Promise<
    Array<{ id: string; asset_status: string; deleted_at: Date | null }>
  > {
    return (await dataSource.query(
      `SELECT id::text AS id, asset_status, deleted_at FROM public.media_assets
        WHERE tenant_schema = $1 ORDER BY created_at`,
      [schemaName],
    )) as Array<{ id: string; asset_status: string; deleted_at: Date | null }>;
  }

  async function setStatus(mediaAssetId: string, status: string): Promise<void> {
    await dataSource.query(`UPDATE public.media_assets SET asset_status = $2 WHERE id = $1`, [
      mediaAssetId,
      status,
    ]);
  }

  async function mediaAssetOf(attachmentId: string): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT media_asset_id::text AS id FROM ${quotedSchema}.ticket_comment_attachments WHERE id = $1`,
      [attachmentId],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
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
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Adjuntos sintético',
        `ticket-att-${tenantId.slice(0, 8)}`,
        schemaName,
        'ticket-att@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `ticket-att-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    storage = new MemoryStorage();
    const config = {
      get: (key: string, fallback?: unknown) =>
        (({ STORAGE_DRIVER: 'minio', NODE_ENV: 'test' }) as Record<string, unknown>)[key] ??
        fallback,
    } as ConfigService;
    media = new TicketAttachmentMediaProvider(
      dataSource,
      storage as unknown as StoragePort,
      config,
      queue as unknown as Queue,
    );
    service = new TicketAttachmentsService(
      dataSource,
      new TimelineService(dataSource),
      { assertWritableReferences: jest.fn() } as unknown as CrmSubscriberReadPort,
      media,
    );
  }, 240_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DELETE FROM public.media_assets WHERE tenant_schema = $1`, [
          schemaName,
        ]);
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('crea un comentario con foto, PDF y MP4 válidos: tres adjuntos en revisión y cuarentena encolada', async () => {
    const ticketId = await insertTicket();
    const comment = await inTenant(() =>
      service.createCommentWithAttachments(
        ticketId,
        { body: 'Evidencia de la visita', isInternal: false },
        [
          file(syntheticPng(), 'foto.png', 'image/png'),
          file(syntheticPdf(), 'C:\\acta\\acta visita.pdf', 'application/pdf'),
          file(syntheticMp4(), 'video', 'application/octet-stream'),
        ],
        support,
      ),
    );

    expect(comment.attachments.map((a) => [a.filename, a.contentType, a.status])).toEqual([
      ['foto.png', 'image/png', 'IN_REVIEW'],
      ['acta visita.pdf', 'application/pdf', 'IN_REVIEW'],
      ['video.mp4', 'video/mp4', 'IN_REVIEW'],
    ]);
    expect(await count('ticket_comment_attachments', ticketId)).toBe(3);
    const assets = await mediaRows();
    expect(assets.filter((row) => row.asset_status === 'QUARANTINED')).toHaveLength(3);
    for (const asset of assets) {
      expect(storage.objects.has(`${schemaName}/ticket_attachment/${asset.id}`)).toBe(true);
    }
    expect(queue.add).toHaveBeenCalledTimes(3);

    // En cuarentena no se firma.
    await expect(
      inTenant(() => service.signLink(ticketId, comment.attachments[0]!.id, 'inline', support)),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ATTACHMENT_IN_REVIEW' } });
    // Rechazada por la cuarentena: «Archivo bloqueado», tampoco se firma.
    await setStatus(await mediaAssetOf(comment.attachments[1]!.id), 'REJECTED');
    await expect(
      inTenant(() => service.signLink(ticketId, comment.attachments[1]!.id, 'inline', support)),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ATTACHMENT_BLOCKED' } });
    const listed = await inTenant(() => service.listForTicket(ticketId, support));
    expect(listed.map((a) => a.status)).toEqual(['IN_REVIEW', 'BLOCKED', 'IN_REVIEW']);
    // `size_bytes` (integer) llega como número, no como texto, y vale el tamaño real.
    const sizes = [syntheticPng().length, syntheticPdf().length, syntheticMp4().length];
    for (const view of [comment.attachments, listed]) {
      expect(view.map((a) => typeof a.sizeBytes)).toEqual(['number', 'number', 'number']);
      expect(view.map((a) => a.sizeBytes)).toEqual(sizes);
    }
  });

  it('GATE (a): el adjunto de un comentario interno no se descarga sin permiso de ver internos y sí con él', async () => {
    const ticketId = await insertTicket(technicianId);
    const internal = await inTenant(() =>
      service.createCommentWithAttachments(
        ticketId,
        { body: 'Nota interna', isInternal: true },
        [file(syntheticPdf(), 'interno.pdf', 'application/pdf')],
        support,
      ),
    );
    const visible = await inTenant(() =>
      service.createCommentWithAttachments(
        ticketId,
        { body: 'Para el cliente', isInternal: false },
        [file(syntheticPng(), 'publico.png', 'image/png')],
        support,
      ),
    );
    const internalId = internal.attachments[0]!.id;
    await setStatus(await mediaAssetOf(internalId), 'AVAILABLE');
    await setStatus(await mediaAssetOf(visible.attachments[0]!.id), 'AVAILABLE');
    storage.getSignedUrl.mockClear();

    // Técnico asignado al ticket: no ve internos → 404, sin firmar nada.
    const denied = await inTenant(() =>
      service.signLink(ticketId, internalId, 'attachment', technician),
    ).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(NotFoundException);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    // Tampoco lo ve listado ni contado.
    const techList = await inTenant(() => service.listForTicket(ticketId, technician));
    expect(techList.map((a) => a.filename)).toEqual(['publico.png']);
    const techCount = await inTenant(() =>
      service.decorateTicketList({ data: [{ id: ticketId }] }, technician),
    );
    expect(techCount.data).toEqual([
      { id: ticketId, attachmentCount: 1, commentCount: 1, firstCommentExcerpt: 'Para el cliente' },
    ]);
    // Sí descarga el adjunto del comentario visible.
    await expect(
      inTenant(() => service.signLink(ticketId, visible.attachments[0]!.id, 'inline', technician)),
    ).resolves.toMatchObject({ filename: 'publico.png', contentType: 'image/png' });

    // Soporte (ve internos): firma el interno con nombre saneado, tipo forzado y 300 s.
    const link = await inTenant(() =>
      service.signLink(ticketId, internalId, 'attachment', support),
    );
    expect(link).toMatchObject({ filename: 'interno.pdf', contentType: 'application/pdf' });
    expect(storage.getSignedUrl).toHaveBeenLastCalledWith(
      expect.stringContaining(`${schemaName}/ticket_attachment/`),
      300,
      {
        responseContentType: 'application/pdf',
        responseContentDisposition: `attachment; filename="interno.pdf"; filename*=UTF-8''interno.pdf`,
      },
    );
    const supportCount = await inTenant(() =>
      service.decorateTicketList({ data: [{ id: ticketId }] }, support),
    );
    expect(supportCount.data).toEqual([
      { id: ticketId, attachmentCount: 2, commentCount: 2, firstCommentExcerpt: 'Nota interna' },
    ]);
  });

  it('GATE (b): un archivo con firma falsa se rechaza y no se guarda nada (ni comentario ni archivos)', async () => {
    const ticketId = await insertTicket();
    const before = (await mediaRows()).length;
    const objectsBefore = storage.objects.size;
    storage.putObject.mockClear();

    for (const fake of [
      file(syntheticFakeExecutable(), 'foto.png', 'image/png'),
      file(Buffer.from('texto plano que dice ser un video'), 'visita.mp4', 'video/mp4'),
    ]) {
      const error = await inTenant(() =>
        service.createCommentWithAttachments(
          ticketId,
          { body: 'Con archivo falso', isInternal: false },
          [file(syntheticPdf(), 'valido.pdf', 'application/pdf'), fake],
          support,
        ),
      ).catch((caught: unknown) => caught);
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        'TICKET_ATTACHMENT_REJECTED',
      );
      expect((error as { response: { message: string } }).response.message).toContain(
        `«${fake.originalname}»`,
      );
    }

    expect(await count('ticket_comments', ticketId)).toBe(0);
    expect(await count('ticket_comment_attachments', ticketId)).toBe(0);
    expect(await count('ticket_timeline_events', ticketId)).toBe(0);
    expect((await mediaRows()).length).toBe(before);
    expect(storage.objects.size).toBe(objectsBefore);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('si el almacenamiento falla a mitad, revierte filas y borra los objetos ya subidos', async () => {
    const ticketId = await insertTicket();
    const before = (await mediaRows()).length;
    const objectsBefore = storage.objects.size;
    storage.putObject
      .mockImplementationOnce(async (key: string, body: Buffer) => {
        storage.objects.set(key, Buffer.from(body));
      })
      .mockRejectedValueOnce(new Error('minio sintético caído'));

    await expect(
      inTenant(() =>
        service.createCommentWithAttachments(
          ticketId,
          { body: 'Falla de almacenamiento', isInternal: false },
          [
            file(syntheticPng(), 'a.png', 'image/png'),
            file(syntheticPdf(), 'b.pdf', 'application/pdf'),
          ],
          support,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ATTACHMENT_STORAGE_FAILED' } });
    expect(await count('ticket_comments', ticketId)).toBe(0);
    expect((await mediaRows()).length).toBe(before);
    expect(storage.objects.size).toBe(objectsBefore);
  });

  it('la supresión del titular retira filas de adjuntos y retira sus activos (no firmables); el objeto queda purgable', async () => {
    const ticketId = await insertTicket();
    const created = await inTenant(() =>
      service.createCommentWithAttachments(
        ticketId,
        { body: 'Dato del titular', isInternal: false },
        [file(syntheticPng(), 'cedula titular.png', 'image/png')],
        support,
      ),
    );
    const mediaAssetId = await mediaAssetOf(created.attachments[0]!.id);
    const keys = {
      hashKey: randomBytes(32),
      activeEncryptionKey: randomBytes(32),
      previousEncryptionKey: null,
    };
    const config = { get: () => undefined } as unknown as ConfigService;

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      const scope = {
        partyId: null,
        subscriberIds: [subscriberId],
        expedienteIds: [],
        userIds: [],
        tenantSchema: schemaName,
        cryptoKeys: keys,
        relatedIds: { contractIds: [] as string[] },
      };
      const assurance = new AssuranceTitularErasureParticipant(config);
      await assurance.resolveScope(scope, qr);
      expect(scope.relatedIds).toMatchObject({
        ticketAttachmentMediaIds: expect.arrayContaining([mediaAssetId]),
      });
      const results = await assurance.apply(scope, qr, 'apply');
      expect(results[0]).toMatchObject({ table: 'ticket_comment_attachments', residual: 0 });
      expect(results[0]!.changed).toBeGreaterThanOrEqual(1);
      const mediaResults = await new MediaTitularErasureParticipant().apply(scope, qr, 'apply');
      expect(mediaResults.find((r) => r.table === 'media_assets:ticket_attachment')).toMatchObject({
        residual: 0,
      });
    });

    expect(await count('ticket_comment_attachments', ticketId)).toBe(0);
    const asset = (await mediaRows()).find((row) => row.id === mediaAssetId);
    expect(asset?.deleted_at).not.toBeNull();
    await expect(media.readStatuses(schemaName, [mediaAssetId])).resolves.toEqual(new Map());
    // El objeto lo borra la fase 4 del worker `evidence-orphan-detection` (S-1; su integración
    // lo prueba contra PostgreSQL): aquí se comprueba que el activo retirado ya es purgable.
    await expect(media.removeObjects(schemaName, [mediaAssetId])).resolves.toBe(0);
    expect(storage.objects.has(`${schemaName}/ticket_attachment/${mediaAssetId}`)).toBe(false);
  });

  describe('ticket cerrado en solo lectura (spec 2026-11-20)', () => {
    it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
      'en %s rechaza el comentario con adjuntos con 409 y no guarda nada',
      async (status) => {
        const ticketId = await insertTicket();
        await dataSource.query(
          `UPDATE ${quotedSchema}.support_tickets SET status = $2 WHERE id = $1`,
          [ticketId, status],
        );
        await expect(
          inTenant(() =>
            service.createCommentWithAttachments(
              ticketId,
              { body: 'Tarde', isInternal: true },
              [file(syntheticPng(), 'foto.png', 'image/png')],
              support,
            ),
          ),
        ).rejects.toMatchObject({ status: 409, response: { code: 'TICKET_CLOSED_READ_ONLY' } });
        expect(await count('ticket_comments', ticketId)).toBe(0);
        expect(await count('ticket_comment_attachments', ticketId)).toBe(0);
      },
    );

    it('la importación de UISP sigue adjuntando sobre un ticket cerrado (CA-3)', async () => {
      const adapter = new AssuranceMigrationImportAdapter(media);
      const batchId = randomUUID();
      const ticketId = await insertTicket();
      await dataSource.query(
        `UPDATE ${quotedSchema}.support_tickets SET status = $2, import_batch_id = $3 WHERE id = $1`,
        [ticketId, TicketStatus.CLOSED, batchId],
      );
      const insertedComments = (await dataSource.query(
        `INSERT INTO ${quotedSchema}.ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id)
         VALUES ($1, $2, 'Comentario importado', false, $3) RETURNING id::text AS id`,
        [ticketId, tenantId, supportId],
      )) as Array<{ id: string }>;
      const commentId = insertedComments[0]!.id;
      const result = (await runInTenantSchema(dataSource, schemaName, (qr) =>
        adapter.createImportedAttachment(
          { manager: qr.manager, tenantId, schemaName, batchId, actorId: supportId },
          {
            ticketId,
            commentId,
            externalId: 'uisp:ticket_attachment:900099',
            filename: 'acta.pdf',
            declaredContentType: 'application/pdf',
            buffer: syntheticPdf(),
            uploadedByUserId: null,
          },
        ),
      )) as { status: string };
      expect(result.status).toBe('CREATED');
      expect(await count('ticket_comment_attachments', ticketId)).toBe(1);
    });
  });

  it('puerto de importación (bloque C): idempotente por external_id, motivo por rechazo y retiro del lote', async () => {
    const adapter = new AssuranceMigrationImportAdapter(media);
    const batchId = randomUUID();
    const ticketId = await insertTicket();
    await dataSource.query(
      `UPDATE ${quotedSchema}.support_tickets SET import_batch_id = $2 WHERE id = $1`,
      [ticketId, batchId],
    );
    const commentRows = (await dataSource.query(
      `INSERT INTO ${quotedSchema}.ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id)
       VALUES ($1, $2, 'Comentario importado', false, $3) RETURNING id::text AS id`,
      [ticketId, tenantId, supportId],
    )) as Array<{ id: string }>;
    const commentId = commentRows[0]!.id;
    const input = {
      ticketId,
      commentId,
      externalId: 'uisp:ticket_attachment:900001',
      filename: 'acta.pdf',
      declaredContentType: 'application/pdf',
      buffer: syntheticPdf(),
      uploadedByUserId: null,
    };
    const write = (
      fn: (ctx: Parameters<typeof adapter.createImportedAttachment>[0]) => Promise<unknown>,
    ) =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        fn({ manager: qr.manager, tenantId, schemaName, batchId, actorId: supportId }),
      );

    const first = (await write((ctx) => adapter.createImportedAttachment(ctx, input))) as {
      status: string;
      mediaAssetId: string;
    };
    expect(first.status).toBe('CREATED');
    const again = await write((ctx) => adapter.createImportedAttachment(ctx, input));
    expect(again).toMatchObject({ status: 'EXISTING' });
    const rejected = await write((ctx) =>
      adapter.createImportedAttachment(ctx, {
        ...input,
        externalId: 'uisp:ticket_attachment:900002',
        filename: 'programa.exe',
        declaredContentType: 'image/jpg',
        buffer: syntheticFakeExecutable(),
      }),
    );
    expect(rejected).toEqual({ status: 'SKIPPED', reason: 'TIPO_NO_PERMITIDO' });
    expect(await count('ticket_comment_attachments', ticketId)).toBe(1);
    expect((await mediaRows()).find((row) => row.id === first.mediaAssetId)?.asset_status).toBe(
      'AVAILABLE',
    );

    const retired = (await write((ctx) => adapter.retireBatchAttachments(ctx))) as {
      attachments: number;
      manual: number;
      mediaAssetIds: string[];
    };
    expect(retired).toEqual({ attachments: 1, manual: 0, mediaAssetIds: [first.mediaAssetId] });
    await expect(
      adapter.purgeImportedAttachmentFiles(schemaName, retired.mediaAssetIds),
    ).resolves.toBe(0);
    expect(storage.objects.has(`${schemaName}/ticket_attachment/${first.mediaAssetId}`)).toBe(
      false,
    );
    // Sin adjuntos, la reversión ya puede borrar el comentario (la FK es RESTRICT).
    await write((ctx) => adapter.revertBatch(ctx));
    expect(await count('ticket_comments', ticketId)).toBe(0);
  });

  it('la FK RESTRICT impide borrar un comentario con adjuntos (23001)', async () => {
    const ticketId = await insertTicket();
    const created = await inTenant(() =>
      service.createCommentWithAttachments(
        ticketId,
        { body: 'Con adjunto', isInternal: false },
        [file(syntheticPng(), 'f.png', 'image/png')],
        support,
      ),
    );
    await expect(
      dataSource.query(`DELETE FROM ${quotedSchema}.ticket_comments WHERE id = $1`, [created.id]),
    ).rejects.toMatchObject({ driverError: { code: '23001' } });
  });
  // Vista dividida §4 (CA-9, CA-10): el resumen del listado coincide, rol por rol, con lo que
  // muestra el detalle de comentarios; un interno nunca se cuenta ni aparece en el extracto.
  describe('resumen de comentarios del listado por rol', () => {
    const roles: Array<[UserRole, boolean]> = [
      [UserRole.ADMIN, true],
      [UserRole.NOC, true],
      [UserRole.SUPPORT, true],
      [UserRole.TECHNICIAN, false],
      [UserRole.CONTRACTOR, false],
    ];
    let ticketId: string;
    let quietTicketId: string;
    let comments: CommentsService;

    async function insertComment(
      id: string,
      body: string,
      isInternal: boolean,
      at: string,
    ): Promise<void> {
      await dataSource.query(
        `INSERT INTO ${quotedSchema}.ticket_comments
           (ticket_id, tenant_id, body, is_internal, author_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tenantId, body, isInternal, supportId, at],
      );
    }

    beforeAll(async () => {
      comments = new CommentsService(
        dataSource,
        new TimelineService(dataSource),
        {} as unknown as CrmSubscriberReadPort,
      );
      // Ticket importado sin descripción: el primero es interno; luego un público con espacios y
      // saltos, un público vacío y otro interno.
      ticketId = await insertTicket(null);
      await insertComment(ticketId, 'Diagnóstico interno reservado', true, '2026-11-01T10:00:00Z');
      await insertComment(
        ticketId,
        `  Sin servicio

 desde ayer ${'x'.repeat(300)}`,
        false,
        '2026-11-01T11:00:00Z',
      );
      await insertComment(ticketId, '   ', false, '2026-11-01T12:00:00Z');
      await insertComment(ticketId, 'Otra nota interna', true, '2026-11-01T13:00:00Z');
      // Ticket con solo comentarios internos.
      quietTicketId = await insertTicket(null);
      await insertComment(quietTicketId, 'Solo interno', true, '2026-11-01T10:00:00Z');
    });

    it.each(roles)('%s: conteo y extracto iguales al detalle', async (role, seesInternal) => {
      const viewer = actor(randomUUID(), role);
      // Técnico y contratista solo abren tickets asignados: se asignan para leer el detalle real.
      await dataSource.query(
        `UPDATE ${quotedSchema}.support_tickets SET assigned_user_id = $2 WHERE id = ANY($1::uuid[])`,
        [[ticketId, quietTicketId], viewer.sub],
      );
      const visibleInDetail = await inTenant(() => comments.listComments(ticketId, viewer));
      const quietDetail = await inTenant(() => comments.listComments(quietTicketId, viewer));

      const listed = await inTenant(() =>
        service.decorateTicketList(
          {
            data: [
              { id: ticketId, description: null },
              { id: quietTicketId, description: '' },
            ],
          },
          viewer,
        ),
      );
      const [row, quiet] = listed.data as unknown as Array<{
        commentCount: number;
        firstCommentExcerpt: string | null;
      }>;

      expect(row!.commentCount).toBe(visibleInDetail.length);
      expect(row!.commentCount).toBe(seesInternal ? 4 : 2);
      expect(quiet!.commentCount).toBe(quietDetail.length);
      expect(quiet!.commentCount).toBe(seesInternal ? 1 : 0);
      if (seesInternal) {
        expect(row!.firstCommentExcerpt).toBe('Diagnóstico interno reservado');
        expect(quiet!.firstCommentExcerpt).toBe('Solo interno');
      } else {
        expect(row!.firstCommentExcerpt).toMatch(/^Sin servicio desde ayer x+$/u);
        expect(row!.firstCommentExcerpt).toHaveLength(200);
        expect(JSON.stringify(listed)).not.toMatch(/interno|reservado/iu);
        expect(quiet!.firstCommentExcerpt).toBeNull();
      }
    });

    it('la regla del detalle es la misma: el técnico asignado recibe exactamente esos comentarios', async () => {
      const assigned = actor(randomUUID(), UserRole.TECHNICIAN);
      await dataSource.query(
        `UPDATE ${quotedSchema}.support_tickets SET assigned_user_id = $2 WHERE id = $1`,
        [ticketId, assigned.sub],
      );
      const detail = await inTenant(() => comments.listComments(ticketId, assigned));
      const listed = await inTenant(() =>
        service.decorateTicketList({ data: [{ id: ticketId, description: null }] }, assigned),
      );
      expect(detail.every((c) => !c.isInternal)).toBe(true);
      expect((listed.data[0] as unknown as { commentCount: number }).commentCount).toBe(
        detail.length,
      );
    });

    it('con descripción no se envía extracto', async () => {
      const listed = await inTenant(() =>
        service.decorateTicketList(
          { data: [{ id: ticketId, description: 'Relato del cliente' }] },
          support,
        ),
      );
      expect(listed.data[0]).toMatchObject({ commentCount: 4, firstCommentExcerpt: null });
    });
  });
});
