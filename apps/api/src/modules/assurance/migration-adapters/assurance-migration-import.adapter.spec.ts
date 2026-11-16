import { Test } from '@nestjs/testing';
import { TICKET_ATTACHMENTS_MAX_PER_COMMENT } from '@iwana/shared';
import { AssuranceMigrationImportAdapter } from './assurance-migration-import.adapter';
import {
  TicketAttachmentMediaPort,
  type TicketAttachmentInspection,
} from '../ports/ticket-attachment-media.port';

/**
 * Adaptador de Soporte para la importación UISP: cableado del puerto de medios, `tenant_id` en
 * los borrados, re-atribución de los adjuntos importados (M3) y motivos de no importación (M4)
 * por la ruta del adaptador. El SQL real lo ejercita ticket-attachments.postgres.integration.
 */
const TENANT = '66666666-6666-4666-8666-666666666666';
const BATCH = '55555555-5555-4555-8555-555555555555';
const IMPORTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-4111-8111-111111111111';
const OTRO = '77777777-7777-4777-8777-777777777777';
const TICKET = '88888888-8888-4888-8888-888888888888';
const COMMENT = '99999999-9999-4999-8999-999999999999';

function mediaPort(inspection?: TicketAttachmentInspection) {
  return {
    inspect: jest.fn().mockReturnValue(
      inspection ?? {
        ok: true,
        contentType: 'application/pdf',
        sizeBytes: 8,
        filename: 'acta.pdf',
      },
    ),
    store: jest.fn().mockResolvedValue({ mediaAssetId: 'asset-1' }),
    startAnalysis: jest.fn(),
    removeObjects: jest.fn().mockResolvedValue(0),
    readStatuses: jest.fn(),
    signDownload: jest.fn(),
    retire: jest.fn().mockResolvedValue(1),
  };
}

function writeCtx(query: jest.Mock) {
  return {
    manager: { query },
    tenantId: TENANT,
    schemaName: 'tenant_prueba',
    batchId: BATCH,
    actorId: IMPORTER,
  } as never;
}

const attachmentInput = {
  ticketId: TICKET,
  commentId: COMMENT,
  externalId: 'uisp:ticket_attachment:5',
  filename: 'acta.pdf',
  declaredContentType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7'),
  uploadedByUserId: null,
};

describe('AssuranceMigrationImportAdapter', () => {
  describe('cableado', () => {
    it('falla al arrancar si no hay TicketAttachmentMediaPort (sin @Optional)', async () => {
      await expect(
        Test.createTestingModule({ providers: [AssuranceMigrationImportAdapter] }).compile(),
      ).rejects.toThrow(/TicketAttachmentMediaPort/);
    });

    it('arranca con el puerto de medios registrado', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          AssuranceMigrationImportAdapter,
          { provide: TicketAttachmentMediaPort, useValue: mediaPort() },
        ],
      }).compile();
      expect(moduleRef.get(AssuranceMigrationImportAdapter)).toBeInstanceOf(
        AssuranceMigrationImportAdapter,
      );
    });
  });

  describe('retireBatchAttachments', () => {
    it('borra los adjuntos del lote acotando por tenant_id', async () => {
      const media = mediaPort();
      const adapter = new AssuranceMigrationImportAdapter(media as never);
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'att-1', media_asset_id: 'asset-1', imported: true }])
        .mockResolvedValueOnce([]);

      await expect(adapter.retireBatchAttachments(writeCtx(query))).resolves.toEqual({
        attachments: 1,
        manual: 0,
        mediaAssetIds: ['asset-1'],
      });
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/DELETE FROM ticket_comment_attachments/);
      expect(sql).toMatch(/tenant_id = \$1/);
      expect(params).toEqual([TENANT, ['att-1']]);
    });
  });

  describe('refreshImportedAuthors — adjuntos importados (M3)', () => {
    function refreshQuery(attachments: Array<{ id: string; uploaded_by: string }>) {
      return jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM support_tickets')) {
          return [{ assigned: ANA, created_by: ANA }];
        }
        if (sql.includes('FROM ticket_comments')) {
          return [
            {
              id: COMMENT,
              body: 'Abre',
              created_at: new Date('2023-03-01T00:00:00Z'),
              author: IMPORTER,
            },
          ];
        }
        if (sql.includes('FROM ticket_comment_attachments')) return attachments;
        return [];
      });
    }

    it('pasa al autor del comentario los adjuntos importados que siguen a nombre de quien importó', async () => {
      const adapter = new AssuranceMigrationImportAdapter(mediaPort() as never);
      const query = refreshQuery([
        { id: 'att-1', uploaded_by: IMPORTER },
        { id: 'att-2', uploaded_by: OTRO },
        { id: 'att-3', uploaded_by: ANA },
      ]);

      const result = await adapter.refreshImportedAuthors(
        { ...(writeCtx(query) as object), importerIds: [IMPORTER] } as never,
        [
          {
            ticketId: TICKET,
            assignedUserId: null,
            createdByUserId: null,
            comments: [{ body: 'Abre', createdAt: '2023-03-01T00:00:00Z', authorUserId: ANA }],
          },
        ],
      );

      const select = query.mock.calls.find(([sql]) =>
        String(sql).includes('FROM ticket_comment_attachments'),
      ) as [string, unknown[]];
      expect(select[0]).toMatch(/tenant_id = \$1/);
      expect(select[0]).toMatch(/import_batch_id = \$3/);
      expect(select[1]).toEqual([TENANT, COMMENT, BATCH]);
      const update = query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE ticket_comment_attachments'),
      ) as [string, unknown[]];
      expect(update[0]).toMatch(/SET uploaded_by_user_id = \$3::uuid/);
      expect(update[0]).toMatch(/tenant_id = \$1/);
      expect(update[1]).toEqual([TENANT, ['att-1'], ANA]);
      expect(result.comments).toBe(1);
      // El adjunto que alguien cambió después se respeta y se cuenta.
      expect(result.respected).toBe(1);
      expect(result.changes).toContainEqual({
        entity: 'TICKET_COMMENT_ATTACHMENT',
        id: 'att-1',
        field: 'uploaded_by_user_id',
        from: IMPORTER,
        to: ANA,
      });
    });

    it('sin adjuntos importados en el comentario no emite UPDATE de adjuntos', async () => {
      const adapter = new AssuranceMigrationImportAdapter(mediaPort() as never);
      const query = refreshQuery([]);
      await adapter.refreshImportedAuthors(
        { ...(writeCtx(query) as object), importerIds: [IMPORTER] } as never,
        [
          {
            ticketId: TICKET,
            assignedUserId: null,
            createdByUserId: null,
            comments: [{ body: 'Abre', createdAt: '2023-03-01T00:00:00Z', authorUserId: ANA }],
          },
        ],
      );
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('UPDATE ticket_comment_attachments')),
      ).toBe(false);
    });
  });

  describe('createImportedAttachment — motivos de no importación (M4)', () => {
    it(`EXCEDE_MAXIMO_POR_COMENTARIO con ${TICKET_ATTACHMENTS_MAX_PER_COMMENT} adjuntos ya en el comentario, sin validar ni subir`, async () => {
      const media = mediaPort();
      const adapter = new AssuranceMigrationImportAdapter(media as never);
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: TICKET_ATTACHMENTS_MAX_PER_COMMENT }]);

      await expect(
        adapter.createImportedAttachment(writeCtx(query), attachmentInput),
      ).resolves.toEqual({ status: 'SKIPPED', reason: 'EXCEDE_MAXIMO_POR_COMENTARIO' });
      expect(media.inspect).not.toHaveBeenCalled();
      expect(media.store).not.toHaveBeenCalled();
    });

    it.each([
      ['TAMANO_EXCEDIDO', 'TAMANO_EXCEDIDO'],
      ['FIRMA_NO_COINCIDE', 'TIPO_NO_PERMITIDO'],
      ['TIPO_NO_PERMITIDO', 'TIPO_NO_PERMITIDO'],
      ['ARCHIVO_VACIO', 'ARCHIVO_AUSENTE'],
    ] as const)('rechazo %s de medios → motivo %s, sin subir', async (code, reason) => {
      const media = mediaPort({ ok: false, code, message: 'rechazado' });
      const adapter = new AssuranceMigrationImportAdapter(media as never);
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      await expect(
        adapter.createImportedAttachment(writeCtx(query), attachmentInput),
      ).resolves.toEqual({ status: 'SKIPPED', reason });
      expect(media.store).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(2);
    });
  });
});
