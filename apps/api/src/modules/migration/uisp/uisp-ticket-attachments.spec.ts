import {
  addTicketAttachmentCount,
  emptyTicketAttachmentsReport,
  findTicketAttachmentFile,
  isSafeTicketAttachmentFilename,
  sumTicketAttachmentReports,
  ticketAttachmentFolder,
  ticketAttachmentPlan,
} from './uisp-ticket-attachments';

const ref = (id: unknown, filename: unknown, mimeType: unknown = 'image/png') => ({
  id,
  filename,
  mimeType,
  size: 10,
});

describe('uisp-ticket-attachments (spec MOD09 adjuntos §2.3)', () => {
  describe('ticketAttachmentPlan', () => {
    it('alinea los adjuntos con los comentarios importados, incluidos los que solo traen adjuntos (D4)', () => {
      const plan = ticketAttachmentPlan({
        activity: [
          { comment: { body: 'Uno', attachments: [ref(11, 'foto.png'), ref(12, 'acta.pdf')] } },
          { comment: { body: '   ', attachments: [ref(13, 'solo-adjunto.jpg')] } },
          { comment: { body: 'Sin adjuntos' } },
          { status: 2 },
          { comment: { body: 'Dos', attachments: [ref('14', 'video.mp4', 'video/mp4')] } },
        ],
      });
      expect(plan.byComment).toHaveLength(4);
      expect(plan.byComment[0]!.refs).toEqual([
        {
          uispId: '11',
          externalId: 'uisp:ticket_attachment:11',
          filename: 'foto.png',
          declaredContentType: 'image/png',
        },
        {
          uispId: '12',
          externalId: 'uisp:ticket_attachment:12',
          filename: 'acta.pdf',
          declaredContentType: 'image/png',
        },
      ]);
      expect(plan.byComment[1]!.refs.map((item) => item.externalId)).toEqual([
        'uisp:ticket_attachment:13',
      ]);
      expect(plan.byComment[2]!.refs).toEqual([]);
      expect(plan.byComment[3]!.refs.map((item) => item.externalId)).toEqual([
        'uisp:ticket_attachment:14',
      ]);
      expect(plan.orphaned).toBe(0);
    });

    it('marca NOMBRE_INVALIDO las referencias sin id válido o con nombre que sale de la carpeta', () => {
      const plan = ticketAttachmentPlan({
        activity: [
          {
            comment: {
              body: 'Raros',
              attachments: [
                ref(null, 'sin-id.png'),
                ref('1; DROP', 'id-raro.png'),
                ref(21, '../../client.json'),
                ref(22, 'carpeta/foto.png'),
                ref(23, 'c:\\foto.png'),
                ref(24, '..'),
                ref(25, 'nul\u0000.png'),
                ref(26, '   '),
                ref(27, 42),
                ref(28, 'x'.repeat(256)),
                ref(29, 'válido ñ.png', null),
                'no-es-objeto',
              ],
            },
          },
        ],
      });
      const [comment] = plan.byComment;
      expect(comment!.invalid).toBe(11);
      expect(comment!.refs).toEqual([
        {
          uispId: '29',
          externalId: 'uisp:ticket_attachment:29',
          filename: 'válido ñ.png',
          declaredContentType: null,
        },
      ]);
    });

    it('sin actividad o con carga inválida no hay adjuntos', () => {
      expect(ticketAttachmentPlan(null)).toEqual({ byComment: [], orphaned: 0 });
      expect(ticketAttachmentPlan({ activity: 'x' })).toEqual({ byComment: [], orphaned: 0 });
      expect(
        ticketAttachmentPlan({ activity: [{ comment: { body: 'a', attachments: 'x' } }] }),
      ).toEqual({ byComment: [{ refs: [], invalid: 0 }], orphaned: 0 });
    });
  });

  describe('isSafeTicketAttachmentFilename', () => {
    it.each([
      ['foto.png', true],
      ['informe final (1).pdf', true],
      ['.oculto', true],
      ['..', false],
      ['.', false],
      ['a/b.png', false],
      ['a\\b.png', false],
      ['a\u0007.png', false],
      ['', false],
    ])('%j → %s', (name, expected) => {
      expect(isSafeTicketAttachmentFilename(name)).toBe(expected);
    });
  });

  describe('ticketAttachmentFolder y findTicketAttachmentFile', () => {
    const png = Buffer.from('png');
    const entries = new Map<string, Buffer>([
      ['client.json', Buffer.from('{}')],
      ['tickets/9001/foto.png', png],
      ['tickets/9001/Cafe\u0301.pdf', Buffer.from('nfd')],
      ['tickets/9002/otra.png', Buffer.from('otro ticket')],
    ]);

    it('solo acepta ids de ticket seguros', () => {
      expect(ticketAttachmentFolder('9001')).toBe('tickets/9001/');
      expect(ticketAttachmentFolder('..')).toBeNull();
      expect(ticketAttachmentFolder('9001/../x')).toBeNull();
      expect(ticketAttachmentFolder('')).toBeNull();
    });

    it('busca el archivo exacto dentro de la carpeta del ticket', () => {
      expect(findTicketAttachmentFile(entries, '9001', 'foto.png')).toBe(png);
      expect(findTicketAttachmentFile(entries, '9001', 'otra.png')).toBeNull();
      expect(findTicketAttachmentFile(entries, '9001', 'ausente.png')).toBeNull();
    });

    it('tolera la forma Unicode (NFC/NFD) del nombre', () => {
      expect(findTicketAttachmentFile(entries, '9001', 'Café.pdf')?.toString()).toBe('nfd');
    });

    it('nunca sale de la carpeta del ticket ni acepta ids inseguros', () => {
      expect(findTicketAttachmentFile(entries, '9001', '../../client.json')).toBeNull();
      expect(findTicketAttachmentFile(entries, '9001', '../9002/otra.png')).toBeNull();
      expect(findTicketAttachmentFile(entries, '..', 'client.json')).toBeNull();
    });
  });

  describe('conteos del informe', () => {
    it('suma por motivo y entre tickets sin perder los existentes', () => {
      const a = emptyTicketAttachmentsReport();
      addTicketAttachmentCount(a, { status: 'CREATED' });
      addTicketAttachmentCount(a, { status: 'EXISTING' });
      addTicketAttachmentCount(a, { status: 'SKIPPED', reason: 'ARCHIVO_AUSENTE' });
      addTicketAttachmentCount(a, { status: 'SKIPPED', reason: 'ARCHIVO_AUSENTE' });
      const b = emptyTicketAttachmentsReport();
      addTicketAttachmentCount(b, { status: 'SKIPPED', reason: 'TIPO_NO_PERMITIDO' }, 3);
      addTicketAttachmentCount(b, { status: 'CREATED' }, 0);

      const total = emptyTicketAttachmentsReport();
      sumTicketAttachmentReports(total, a);
      sumTicketAttachmentReports(total, b);
      sumTicketAttachmentReports(total, { importados: 'x', noImportados: { OTRO: 9 } });
      sumTicketAttachmentReports(total, null);
      expect(total).toEqual({
        importados: 1,
        existentes: 1,
        noImportados: { ARCHIVO_AUSENTE: 2, TIPO_NO_PERMITIDO: 3 },
      });
    });
  });
});
