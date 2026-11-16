import {
  MIGRATION_TICKET_ATTACHMENT_EXTERNAL_ID_PREFIX,
  MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS,
  MigrationPromotionReportSchema,
  MigrationRevertResultSchema,
  MigrationTicketAttachmentsReportSchema,
  migrationTicketAttachmentExternalId,
} from './migration-import.contract';

const uuid = '69000000-0000-4000-8000-000000000001';

const basePromotion = {
  procesamiento: 'COMPLETADO',
  promovidos: { TICKET: 2 },
  existentes: {},
  rechazados: {},
  etiquetasAsignadas: 0,
  periodosSuspension: 0,
  aplicaciones: 0,
  iniciadoEn: '2026-11-16T00:00:00.000Z',
  terminadoEn: '2026-11-16T00:01:00.000Z',
};

describe('Adjuntos de tickets en la importación UISP (spec MOD09 2026-11-16 §2.3)', () => {
  it('external_id del adjunto: uisp:ticket_attachment:<id>', () => {
    expect(MIGRATION_TICKET_ATTACHMENT_EXTERNAL_ID_PREFIX).toBe('ticket_attachment');
    expect(migrationTicketAttachmentExternalId(4711)).toBe('uisp:ticket_attachment:4711');
    expect(migrationTicketAttachmentExternalId('88')).toBe('uisp:ticket_attachment:88');
  });

  it('motivos de no importación: códigos, nunca texto del titular', () => {
    expect([...MIGRATION_TICKET_ATTACHMENT_SKIP_REASONS]).toEqual([
      'ARCHIVO_AUSENTE',
      'TIPO_NO_PERMITIDO',
      'TAMANO_EXCEDIDO',
      'NOMBRE_INVALIDO',
      'EXCEDE_MAXIMO_POR_COMENTARIO',
      'COMENTARIO_NO_IMPORTADO',
    ]);
  });

  it('el bloque de adjuntos admite conteos por motivo y rechaza motivos o campos desconocidos', () => {
    const report = {
      importados: 8,
      existentes: 0,
      noImportados: { ARCHIVO_AUSENTE: 1, TAMANO_EXCEDIDO: 1 },
    };
    expect(MigrationTicketAttachmentsReportSchema.safeParse(report).success).toBe(true);
    expect(
      MigrationTicketAttachmentsReportSchema.safeParse({
        ...report,
        noImportados: { VIRUS: 1 },
      }).success,
    ).toBe(false);
    expect(
      MigrationTicketAttachmentsReportSchema.safeParse({ ...report, nombres: ['acta.pdf'] })
        .success,
    ).toBe(false);
    expect(
      MigrationTicketAttachmentsReportSchema.safeParse({ ...report, importados: -1 }).success,
    ).toBe(false);
  });

  it('el informe de promoción trae adjuntosTickets y los informes previos leen ceros', () => {
    const legacy = MigrationPromotionReportSchema.parse(basePromotion);
    expect(legacy.adjuntosTickets).toEqual({ importados: 0, existentes: 0, noImportados: {} });

    const current = MigrationPromotionReportSchema.parse({
      ...basePromotion,
      adjuntosTickets: { importados: 10, existentes: 0, noImportados: {} },
    });
    expect(current.adjuntosTickets.importados).toBe(10);
  });

  it('la reversión informa los adjuntos retirados; los resultados previos leen 0', () => {
    const base = {
      id: uuid,
      status: 'REVERTIDO',
      retirados: { TICKET: 2 },
      etiquetasRetiradas: 0,
    };
    expect(MigrationRevertResultSchema.parse(base).adjuntosTicketsRetirados).toBe(0);
    expect(
      MigrationRevertResultSchema.parse({ ...base, adjuntosTicketsRetirados: 10 })
        .adjuntosTicketsRetirados,
    ).toBe(10);
  });
});
