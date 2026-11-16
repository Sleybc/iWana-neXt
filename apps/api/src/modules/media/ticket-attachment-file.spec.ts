import {
  TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  TICKET_ATTACHMENT_FILENAME_MAX_LENGTH,
  TICKET_ATTACHMENT_VIDEO_MAX_BYTES,
  TicketAttachmentFilenameSchema,
} from '@iwana/shared';
import {
  buildContentDisposition,
  inspectTicketAttachmentFile,
  sanitizeTicketAttachmentFilename,
} from './ticket-attachment-file';
import {
  syntheticFakeExecutable,
  syntheticMp4,
  syntheticPdf,
  syntheticPng,
} from './testing/synthetic-files';

/** Rellena hasta `size` sin cambiar la firma. */
function padded(head: Buffer, size: number): Buffer {
  return Buffer.concat([head, Buffer.alloc(size - head.length)]);
}

describe('inspectTicketAttachmentFile — tipo por firma y límite por tipo', () => {
  it('acepta PNG, PDF y MP4 por su firma real y devuelve el tipo detectado', () => {
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticPng(),
        declaredContentType: 'image/png',
        originalName: 'foto.png',
      }),
    ).toEqual({
      ok: true,
      contentType: 'image/png',
      sizeBytes: syntheticPng().length,
      filename: 'foto.png',
    });
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticPdf(),
        declaredContentType: 'application/pdf',
        originalName: 'acta.pdf',
      }),
    ).toMatchObject({ ok: true, contentType: 'application/pdf', filename: 'acta.pdf' });
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticMp4(),
        declaredContentType: 'video/mp4',
        originalName: 'visita.mp4',
      }),
    ).toMatchObject({ ok: true, contentType: 'video/mp4', filename: 'visita.mp4' });
  });

  it('usa la firma cuando el navegador declara un tipo genérico', () => {
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticPdf(),
        declaredContentType: 'application/octet-stream',
        originalName: 'acta',
      }),
    ).toMatchObject({ ok: true, contentType: 'application/pdf', filename: 'acta.pdf' });
  });

  it('rechaza bytes de texto o EXE aunque declaren image/png o la extensión .mp4', () => {
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticFakeExecutable(),
        declaredContentType: 'image/png',
        originalName: 'foto.png',
      }),
    ).toMatchObject({ ok: false, code: 'TIPO_NO_PERMITIDO' });
    expect(
      inspectTicketAttachmentFile({
        buffer: Buffer.from('solo texto plano, sin firma de video'),
        declaredContentType: 'video/mp4',
        originalName: 'video.mp4',
      }),
    ).toMatchObject({ ok: false, code: 'TIPO_NO_PERMITIDO' });
  });

  it('rechaza un tipo declarado concreto que contradice la firma', () => {
    expect(
      inspectTicketAttachmentFile({
        buffer: syntheticPng(),
        declaredContentType: 'application/pdf',
        originalName: 'foto.pdf',
      }),
    ).toMatchObject({ ok: false, code: 'FIRMA_NO_COINCIDE' });
  });

  it('rechaza el archivo vacío', () => {
    expect(
      inspectTicketAttachmentFile({ buffer: Buffer.alloc(0), originalName: 'x.png' }),
    ).toMatchObject({ ok: false, code: 'ARCHIVO_VACIO' });
  });

  it('aplica 25 MB a fotos y PDF y 100 MB a MP4', () => {
    expect(
      inspectTicketAttachmentFile({
        buffer: padded(syntheticPdf(), TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES),
        originalName: 'limite.pdf',
      }),
    ).toMatchObject({ ok: true });
    expect(
      inspectTicketAttachmentFile({
        buffer: padded(syntheticPng(), TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES + 1),
        originalName: 'grande.png',
      }),
    ).toMatchObject({
      ok: false,
      code: 'TAMANO_EXCEDIDO',
      message: expect.stringContaining('25 MB'),
    });
    expect(
      inspectTicketAttachmentFile({
        buffer: padded(syntheticMp4(), TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES + 1),
        originalName: 'video.mp4',
      }),
    ).toMatchObject({ ok: true, contentType: 'video/mp4' });
    expect(
      inspectTicketAttachmentFile({
        buffer: padded(syntheticMp4(), TICKET_ATTACHMENT_VIDEO_MAX_BYTES + 1),
        originalName: 'video.mp4',
      }),
    ).toMatchObject({
      ok: false,
      code: 'TAMANO_EXCEDIDO',
      message: expect.stringContaining('100 MB'),
    });
  });
});

describe('sanitizeTicketAttachmentFilename', () => {
  const valid = (name: string) => TicketAttachmentFilenameSchema.safeParse(name).success;

  it('quita rutas Windows y POSIX', () => {
    expect(sanitizeTicketAttachmentFilename('../../etc/passwd.png', 'image/png')).toBe(
      'passwd.png',
    );
    expect(sanitizeTicketAttachmentFilename('C:\\Users\\x\\acta.pdf', 'application/pdf')).toBe(
      'acta.pdf',
    );
  });

  it('quita control, CR/LF y caracteres bidireccionales', () => {
    const name = sanitizeTicketAttachmentFilename(
      'acta\r\nX-Header: 1\u0000.pdf',
      'application/pdf',
    );
    expect(name).toBe('actaX-Header: 1.pdf');
    expect(valid(name)).toBe(true);
    expect(sanitizeTicketAttachmentFilename('foto\u202Egnp.exe', 'image/png')).toBe(
      'fotognp.exe.png',
    );
  });

  it('añade la extensión real si falta o no coincide, y conserva la acorde', () => {
    expect(sanitizeTicketAttachmentFilename('informe.exe', 'application/pdf')).toBe(
      'informe.exe.pdf',
    );
    expect(sanitizeTicketAttachmentFilename('foto.JPEG', 'image/jpeg')).toBe('foto.JPEG');
    expect(sanitizeTicketAttachmentFilename('video', 'video/mp4')).toBe('video.mp4');
  });

  it('nunca queda vacío ni empieza por punto', () => {
    expect(sanitizeTicketAttachmentFilename('', 'image/png')).toBe('adjunto.png');
    expect(sanitizeTicketAttachmentFilename('/', 'image/gif')).toBe('adjunto.gif');
    expect(sanitizeTicketAttachmentFilename('...htaccess', 'application/pdf')).toBe('htaccess.pdf');
  });

  it('corta a 200 caracteres conservando la extensión y sin partir emojis', () => {
    const long = sanitizeTicketAttachmentFilename(`${'a'.repeat(300)}.pdf`, 'application/pdf');
    expect(long.length).toBe(TICKET_ATTACHMENT_FILENAME_MAX_LENGTH);
    expect(long.endsWith('.pdf')).toBe(true);
    const emoji = sanitizeTicketAttachmentFilename(`${'😀'.repeat(150)}.png`, 'image/png');
    expect(emoji.length).toBeLessThanOrEqual(TICKET_ATTACHMENT_FILENAME_MAX_LENGTH);
    expect(emoji.endsWith('.png')).toBe(true);
    expect(valid(emoji)).toBe(true);
  });
});

describe('buildContentDisposition', () => {
  it('emite filename ASCII de respaldo y filename* UTF-8 sin comillas ni saltos', () => {
    const header = buildContentDisposition('Acta "visita" ñandú.pdf', 'attachment');
    expect(header).toBe(
      `attachment; filename="Acta _visita_ nandu.pdf"; filename*=UTF-8''Acta%20%22visita%22%20%C3%B1and%C3%BA.pdf`,
    );
    expect(header).not.toMatch(/[\r\n]/u);
  });

  it('admite inline para abrir PDF y fotos en el navegador', () => {
    expect(buildContentDisposition('foto.png', 'inline')).toBe(
      `inline; filename="foto.png"; filename*=UTF-8''foto.png`,
    );
  });
});
