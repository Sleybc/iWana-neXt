import { randomUUID } from 'node:crypto';
import {
  TICKET_ATTACHMENT_CONTENT_TYPES,
  TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  TICKET_ATTACHMENT_FILENAME_MAX_LENGTH,
  TICKET_ATTACHMENT_IMAGE_CONTENT_TYPES,
  TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE,
  TICKET_ATTACHMENT_MEDIA_USAGE,
  TICKET_ATTACHMENT_STATUSES,
  TICKET_ATTACHMENT_VIDEO_MAX_BYTES,
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES,
  TicketCommentAttachmentSchema,
  TicketCommentAttachmentsSchema,
  TicketListAttachmentCountSchema,
  isTicketAttachmentContentType,
  ticketAttachmentMaxBytes,
  ticketAttachmentStatusFromMediaStatus,
} from './ticket-attachments.contract';
import * as shared from '../../index';

const MB = 1024 * 1024;

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    filename: 'acta-visita.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    status: 'AVAILABLE',
    ...overrides,
  };
}

describe('Contrato de adjuntos de tickets (spec MOD09 2026-11-16 §2.1, §2.2, §2.5)', () => {
  it('se exporta desde la raíz de @iwana/shared', () => {
    expect(shared.TICKET_ATTACHMENT_MEDIA_USAGE).toBe('ticket_attachment');
    expect(shared.TicketCommentAttachmentSchema).toBe(TicketCommentAttachmentSchema);
  });

  it('declara el uso de medios y los tipos admitidos', () => {
    expect(TICKET_ATTACHMENT_MEDIA_USAGE).toBe('ticket_attachment');
    expect([...TICKET_ATTACHMENT_IMAGE_CONTENT_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    expect([...TICKET_ATTACHMENT_CONTENT_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'video/mp4',
    ]);
  });

  it('fija los límites: 25 MB fotos y PDF, 100 MB MP4, 10 por comentario, nombre ≤ 200, 110 MB por petición', () => {
    expect(TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES).toBe(25 * MB);
    expect(TICKET_ATTACHMENT_VIDEO_MAX_BYTES).toBe(100 * MB);
    expect(TICKET_ATTACHMENTS_MAX_PER_COMMENT).toBe(10);
    expect(TICKET_ATTACHMENT_FILENAME_MAX_LENGTH).toBe(200);
    expect(TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES).toBe(110 * MB);
    for (const type of TICKET_ATTACHMENT_IMAGE_CONTENT_TYPES) {
      expect(TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE[type]).toBe(25 * MB);
    }
    expect(TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE['application/pdf']).toBe(25 * MB);
    expect(TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE['video/mp4']).toBe(100 * MB);
  });

  it('ticketAttachmentMaxBytes devuelve el límite por tipo y null para un tipo no admitido', () => {
    expect(ticketAttachmentMaxBytes('video/mp4')).toBe(100 * MB);
    expect(ticketAttachmentMaxBytes('image/png')).toBe(25 * MB);
    expect(ticketAttachmentMaxBytes('application/zip')).toBeNull();
    expect(ticketAttachmentMaxBytes('IMAGE/PNG')).toBeNull();
  });

  it('isTicketAttachmentContentType solo admite la lista exacta', () => {
    expect(isTicketAttachmentContentType('application/pdf')).toBe(true);
    expect(isTicketAttachmentContentType('video/quicktime')).toBe(false);
    expect(isTicketAttachmentContentType('application/vnd.ms-excel')).toBe(false);
  });

  describe('estado derivado del activo de medios', () => {
    it('declara tres estados visibles', () => {
      expect([...TICKET_ATTACHMENT_STATUSES]).toEqual(['IN_REVIEW', 'AVAILABLE', 'BLOCKED']);
    });

    it.each([
      ['QUARANTINED', 'IN_REVIEW'],
      ['AVAILABLE', 'AVAILABLE'],
      ['REJECTED', 'BLOCKED'],
      ['EXPIRED', 'BLOCKED'],
      ['DELETED', 'BLOCKED'],
      ['DESCONOCIDO', 'BLOCKED'],
      ['', 'BLOCKED'],
    ])('%s → %s (cerrado ante lo desconocido)', (mediaStatus, expected) => {
      expect(ticketAttachmentStatusFromMediaStatus(mediaStatus)).toBe(expected);
    });

    it('null o undefined (activo ausente) queda bloqueado', () => {
      expect(ticketAttachmentStatusFromMediaStatus(null)).toBe('BLOCKED');
      expect(ticketAttachmentStatusFromMediaStatus(undefined)).toBe('BLOCKED');
    });
  });

  describe('TicketCommentAttachmentSchema', () => {
    it('acepta un adjunto válido de cada tipo dentro de su límite', () => {
      for (const contentType of TICKET_ATTACHMENT_CONTENT_TYPES) {
        const sizeBytes = TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE[contentType];
        expect(
          TicketCommentAttachmentSchema.safeParse(attachment({ contentType, sizeBytes })).success,
        ).toBe(true);
      }
    });

    it.each([
      ['tipo no admitido', { contentType: 'application/zip' }],
      ['foto de más de 25 MB', { contentType: 'image/jpeg', sizeBytes: 25 * MB + 1 }],
      ['PDF de más de 25 MB', { contentType: 'application/pdf', sizeBytes: 25 * MB + 1 }],
      ['MP4 de más de 100 MB', { contentType: 'video/mp4', sizeBytes: 100 * MB + 1 }],
      ['tamaño cero', { sizeBytes: 0 }],
      ['tamaño decimal', { sizeBytes: 1.5 }],
      ['nombre vacío', { filename: '' }],
      ['nombre solo espacios', { filename: '   ' }],
      ['nombre de 201 caracteres', { filename: `${'a'.repeat(197)}.pdf` }],
      ['nombre con ruta', { filename: '../etc/passwd' }],
      ['nombre con barra invertida', { filename: 'c:\\temp\\a.pdf' }],
      ['nombre con salto de línea', { filename: 'a\r\nb.pdf' }],
      ['nombre con carácter de control', { filename: 'a\u0000.pdf' }],
      ['estado desconocido', { status: 'QUARANTINED' }],
      ['id no uuid', { id: 'abc' }],
      ['campo extra', { objectKey: 'tenant_x/ticket_attachment/1.pdf' }],
    ])('rechaza %s', (_name, overrides) => {
      expect(TicketCommentAttachmentSchema.safeParse(attachment(overrides)).success).toBe(false);
    });

    it('admite un nombre de exactamente 200 caracteres con acentos y espacios', () => {
      const filename = `${'á'.repeat(196)}.pdf`;
      expect(filename).toHaveLength(200);
      expect(TicketCommentAttachmentSchema.safeParse(attachment({ filename })).success).toBe(true);
      expect(
        TicketCommentAttachmentSchema.safeParse(attachment({ filename: 'Acta de visita 3.pdf' }))
          .success,
      ).toBe(true);
    });
  });

  describe('TicketCommentAttachmentsSchema', () => {
    it('por defecto es una lista vacía (comentarios sin adjuntos y respuestas previas)', () => {
      expect(TicketCommentAttachmentsSchema.parse(undefined)).toEqual([]);
    });

    it('admite hasta 10 y rechaza 11', () => {
      const ten = Array.from({ length: 10 }, () => attachment());
      expect(TicketCommentAttachmentsSchema.safeParse(ten).success).toBe(true);
      expect(TicketCommentAttachmentsSchema.safeParse([...ten, attachment()]).success).toBe(false);
    });
  });

  describe('TicketListAttachmentCountSchema', () => {
    it('por defecto es 0 y no admite negativos ni decimales', () => {
      expect(TicketListAttachmentCountSchema.parse(undefined)).toBe(0);
      expect(TicketListAttachmentCountSchema.parse(3)).toBe(3);
      expect(TicketListAttachmentCountSchema.safeParse(-1).success).toBe(false);
      expect(TicketListAttachmentCountSchema.safeParse(1.5).success).toBe(false);
    });
  });
});
