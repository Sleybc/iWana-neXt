import { MigrationPromotionService } from './migration-promotion.service';
import { migrationTicketAttachmentExternalId } from '@iwana/shared';
import type { UispTicketAttachmentPlan } from './uisp/uisp-ticket-attachments';

/**
 * M4: motivos de no importación de adjuntos por la ruta de la promoción (spec MOD09 adjuntos
 * §2.3). `NOMBRE_INVALIDO` lo decide la promoción con el plan; `EXCEDE_MAXIMO_POR_COMENTARIO` y
 * `TAMANO_EXCEDIDO` los devuelve Soporte y la promoción los cuenta sin tocar el comentario.
 */
type ImportTicketAttachments = (
  ctx: unknown,
  input: {
    created: { ticketId: string; commentIds: Array<string | null> };
    plan: UispTicketAttachmentPlan;
    comments: Array<{ body: string; internal: boolean; createdAt: string | null }>;
    ticketSourceId: string;
    entries: ReadonlyMap<string, Buffer>;
    attachmentAssets: string[];
  },
) => Promise<{ importados: number; existentes: number; noImportados: Record<string, number> }>;

function ref(id: string, filename: string) {
  return {
    uispId: id,
    externalId: migrationTicketAttachmentExternalId(id),
    filename,
    declaredContentType: null,
  };
}

describe('MigrationPromotionService — adjuntos de tickets por motivo (M4)', () => {
  it('cuenta NOMBRE_INVALIDO, EXCEDE_MAXIMO_POR_COMENTARIO y TAMANO_EXCEDIDO sin perder los creados', async () => {
    const support = {
      createImportedAttachment: jest
        .fn()
        .mockResolvedValueOnce({
          status: 'CREATED',
          attachmentId: 'att-1',
          mediaAssetId: 'asset-1',
        })
        .mockResolvedValueOnce({ status: 'SKIPPED', reason: 'EXCEDE_MAXIMO_POR_COMENTARIO' })
        .mockResolvedValueOnce({ status: 'SKIPPED', reason: 'TAMANO_EXCEDIDO' }),
    };
    const service = new MigrationPromotionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      support as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const entries = new Map<string, Buffer>([
      ['tickets/41/acta.pdf', Buffer.from('%PDF-1.7')],
      ['tickets/41/once.pdf', Buffer.from('%PDF-1.7')],
      ['tickets/41/video.mp4', Buffer.from('grande')],
    ]);
    const attachmentAssets: string[] = [];

    const report = await (
      service as unknown as { importTicketAttachments: ImportTicketAttachments }
    ).importTicketAttachments(
      { tenantId: 't', schemaName: 'tenant_prueba', batchId: 'b', actorId: 'a', manager: {} },
      {
        created: { ticketId: 'ticket-1', commentIds: ['comment-1'] },
        plan: {
          byComment: [
            {
              refs: [ref('1', 'acta.pdf'), ref('2', 'once.pdf'), ref('3', 'video.mp4')],
              invalid: 2,
            },
          ],
          orphaned: 0,
        },
        comments: [{ body: 'Con adjuntos', internal: false, createdAt: null }],
        ticketSourceId: '41',
        entries,
        attachmentAssets,
      },
    );

    expect(report).toEqual({
      importados: 1,
      existentes: 0,
      noImportados: {
        NOMBRE_INVALIDO: 2,
        EXCEDE_MAXIMO_POR_COMENTARIO: 1,
        TAMANO_EXCEDIDO: 1,
      },
    });
    expect(attachmentAssets).toEqual(['asset-1']);
    expect(support.createImportedAttachment).toHaveBeenCalledTimes(3);
    expect(support.createImportedAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ commentId: 'comment-1', filename: 'video.mp4' }),
    );
  });
});
