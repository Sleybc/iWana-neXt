import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import type { TicketAttachmentMediaPort } from '../ports/ticket-attachment-media.port';
import { TicketAttachmentsService } from '../services/ticket-attachments.service';
import type { TimelineService } from '../services/timeline.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  summarizeErrorForLog: jest.fn().mockReturnValue('error'),
  SupportTicket: class SupportTicket {},
  TicketComment: class TicketComment {},
  TicketCommentAttachment: class TicketCommentAttachment {},
}));

const TICKET = '11111111-1111-4111-8111-111111111111';
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

const support: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-001',
  schemaName: 'tenant_001',
  jti: 'jti',
  type: 'tenant',
};
const technician: JwtPayload = { ...support, sub: 'tech-001', role: UserRole.TECHNICIAN };

function mediaPort(): jest.Mocked<TicketAttachmentMediaPort> {
  return {
    inspect: jest.fn((file: { originalName: string; buffer: Buffer }) =>
      file.originalName.endsWith('.exe')
        ? { ok: false, code: 'TIPO_NO_PERMITIDO', message: 'Tipo de archivo no permitido.' }
        : {
            ok: true,
            contentType: 'image/png',
            sizeBytes: file.buffer.length,
            filename: file.originalName,
          },
    ),
    store: jest.fn(),
    startAnalysis: jest.fn().mockResolvedValue(undefined),
    removeObjects: jest.fn().mockResolvedValue(0),
    readStatuses: jest.fn().mockResolvedValue(new Map()),
    signDownload: jest.fn(),
    retire: jest.fn(),
  } as unknown as jest.Mocked<TicketAttachmentMediaPort>;
}

function build(media = mediaPort()) {
  const service = new TicketAttachmentsService(
    {} as DataSource,
    { recordWithManager: jest.fn() } as unknown as TimelineService,
    { assertWritableReferences: jest.fn() } as unknown as CrmSubscriberReadPort,
    media,
  );
  return { service, media };
}

const png = (name: string) => ({
  buffer: Buffer.from('png'),
  mimetype: 'image/png',
  originalname: name,
});
const run = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

describe('TicketAttachmentsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza todo si un archivo no pasa: dice cuál y por qué y no abre transacción', async () => {
    const { service, media } = build();
    const error = await service
      .createCommentWithAttachments(
        TICKET,
        { body: 'Evidencia', isInternal: false },
        [png('foto.png'), png('C:\\tmp\\informe.exe')],
        support,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as Record<string, unknown>;
    expect(body['code']).toBe('TICKET_ATTACHMENT_REJECTED');
    expect(body['message']).toContain('«informe.exe»: Tipo de archivo no permitido.');
    expect(body['rejected']).toEqual([
      { index: 1, filename: 'informe.exe', code: 'TIPO_NO_PERMITIDO', message: expect.any(String) },
    ]);
    expect(run).not.toHaveBeenCalled();
    expect(media.store).not.toHaveBeenCalled();
  });

  it('rechaza más de 10 archivos sin guardar nada', async () => {
    const { service, media } = build();
    await expect(
      service.createCommentWithAttachments(
        TICKET,
        { body: 'x', isInternal: false },
        Array.from({ length: 11 }, (_, index) => png(`f${index}.png`)),
        support,
      ),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ATTACHMENTS_TOO_MANY' } });
    expect(media.inspect).not.toHaveBeenCalled();
  });

  it('si falla el almacenamiento, revierte y borra los objetos ya subidos (todo o nada)', async () => {
    const media = mediaPort();
    media.store
      .mockResolvedValueOnce({ mediaAssetId: ASSET })
      .mockRejectedValueOnce(new Error('minio caído'));
    const { service } = build(media);
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: TICKET, assignedUserId: null }),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn(async (_entity: unknown, value: object) => ({ id: 'row', ...value })),
    };
    run.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as unknown as QueryRunner));

    await expect(
      service.createCommentWithAttachments(
        TICKET,
        { body: 'x', isInternal: false },
        [png('a.png'), png('b.png')],
        support,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'TICKET_ATTACHMENT_STORAGE_FAILED',
        message: expect.stringContaining('«b.png»'),
      },
    });
    expect(media.removeObjects).toHaveBeenCalledWith('tenant_001', [ASSET]);
    expect(media.startAnalysis).not.toHaveBeenCalled();
  });

  it('crea comentario y adjuntos en revisión y encola la cuarentena después del commit', async () => {
    const media = mediaPort();
    media.store.mockResolvedValue({ mediaAssetId: ASSET });
    const { service } = build(media);
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: TICKET, assignedUserId: null }),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn(async (_entity: unknown, value: object) => ({ id: ATTACHMENT, ...value })),
    };
    run.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as unknown as QueryRunner));

    const result = await service.createCommentWithAttachments(
      TICKET,
      { body: 'Foto', isInternal: true },
      [png('foto.png')],
      support,
    );
    expect(result.attachments).toEqual([
      {
        id: ATTACHMENT,
        filename: 'foto.png',
        contentType: 'image/png',
        sizeBytes: 3,
        status: 'IN_REVIEW',
      },
    ]);
    expect(media.store).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSchema: 'tenant_001', initialStatus: 'QUARANTINED' }),
      expect.anything(),
      expect.anything(),
    );
    expect(media.startAnalysis).toHaveBeenCalledWith('tenant_001', [ASSET]);
  });

  describe('signLink', () => {
    function withAttachment(attachment: object | null) {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(attachment),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue({ id: TICKET, assignedUserId: 'tech-001' }),
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      };
      run.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as unknown as QueryRunner));
      return qb;
    }
    const row = {
      id: ATTACHMENT,
      mediaAssetId: ASSET,
      filename: 'acta.pdf',
      contentType: 'application/pdf',
    };

    it('excluye internos para quien no puede verlos y responde 404', async () => {
      const qb = withAttachment(null);
      const { service, media } = build();
      await expect(
        service.signLink(TICKET, ATTACHMENT, 'inline', technician),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(qb.andWhere).toHaveBeenCalledWith('c.is_internal = FALSE');
      expect(media.signDownload).not.toHaveBeenCalled();
    });

    it('no filtra internos para Soporte', async () => {
      const qb = withAttachment(row);
      const media = mediaPort();
      media.readStatuses.mockResolvedValue(new Map([[ASSET, 'AVAILABLE']]));
      media.signDownload.mockResolvedValue({ url: 'https://firmado', expiresAt: new Date(0) });
      const { service } = build(media);
      await expect(service.signLink(TICKET, ATTACHMENT, 'attachment', support)).resolves.toEqual({
        url: 'https://firmado',
        expiresAt: new Date(0).toISOString(),
        filename: 'acta.pdf',
        contentType: 'application/pdf',
      });
      expect(qb.andWhere).not.toHaveBeenCalledWith('c.is_internal = FALSE');
      expect(media.signDownload).toHaveBeenCalledWith('tenant_001', ASSET, {
        filename: 'acta.pdf',
        contentType: 'application/pdf',
        disposition: 'attachment',
      });
    });

    it.each([
      ['QUARANTINED', 'TICKET_ATTACHMENT_IN_REVIEW'],
      ['REJECTED', 'TICKET_ATTACHMENT_BLOCKED'],
      [undefined, 'TICKET_ATTACHMENT_BLOCKED'],
    ])('no firma un adjunto con estado %s (%s)', async (status, code) => {
      withAttachment(row);
      const media = mediaPort();
      media.readStatuses.mockResolvedValue(
        new Map(status ? [[ASSET, status]] : []) as Map<string, string>,
      );
      const { service } = build(media);
      const error = await service
        .signLink(TICKET, ATTACHMENT, 'inline', support)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code });
      expect(media.signDownload).not.toHaveBeenCalled();
    });
  });
});
