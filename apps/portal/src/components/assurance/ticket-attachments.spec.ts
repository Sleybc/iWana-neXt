import { ApiError } from '@/lib/api-client';
import {
  TICKET_ATTACHMENT_ACCEPT,
  addTicketAttachmentFiles,
  formatTicketAttachmentCount,
  formatTicketAttachmentSize,
  getTicketAttachmentKindLabel,
  getTicketAttachmentLinkFailure,
  getTicketCommentAttachmentError,
  isTicketAttachmentLinkFresh,
  toSafeTicketAttachmentUrl,
} from './ticket-attachments';

const MIB = 1024 * 1024;

/** Archivo sintético con el tamaño pedido sin reservar la memoria. */
function fakeFile(name: string, type: string, size: number, lastModified = 1): File {
  const file = new File(['x'], name, { type, lastModified });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('addTicketAttachmentFiles — validación previa en el navegador', () => {
  it('acepta foto, PDF y MP4 dentro de su límite', () => {
    const files = [
      fakeFile('foto.jpg', 'image/jpeg', 2 * MIB),
      fakeFile('informe.pdf', 'application/pdf', 25 * MIB),
      fakeFile('visita.mp4', 'video/mp4', 80 * MIB),
    ];
    const result = addTicketAttachmentFiles([], files);
    expect(result.issues).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      'foto.jpg',
      'informe.pdf',
      'visita.mp4',
    ]);
  });

  it('rechaza tipos no permitidos y nombra el archivo', () => {
    const result = addTicketAttachmentFiles(
      [],
      [fakeFile('informe.exe', 'application/x-msdownload', 10)],
    );
    expect(result.files).toEqual([]);
    expect(result.issues).toEqual([
      {
        filename: 'informe.exe',
        message: 'Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4.',
      },
    ]);
  });

  it('aplica el límite por tipo: 25 MB foto/PDF y 100 MB video', () => {
    const result = addTicketAttachmentFiles(
      [],
      [
        fakeFile('grande.png', 'image/png', 25 * MIB + 1),
        fakeFile('largo.mp4', 'video/mp4', 100 * MIB + 1),
      ],
    );
    expect(result.files).toEqual([]);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'Supera el tamaño máximo de 25 MB para su tipo.',
      'Supera el tamaño máximo de 100 MB para su tipo.',
    ]);
  });

  it('un video de 100 MB justos cabe solo', () => {
    const result = addTicketAttachmentFiles([], [fakeFile('largo.mp4', 'video/mp4', 100 * MIB)]);
    expect(result.issues).toEqual([]);
    expect(result.files).toHaveLength(1);
  });

  it('rechaza archivos vacíos', () => {
    const result = addTicketAttachmentFiles([], [fakeFile('vacio.pdf', 'application/pdf', 0)]);
    expect(result.issues[0]?.message).toBe('El archivo está vacío.');
  });

  it('admite como máximo 10 archivos por comentario', () => {
    const current = Array.from({ length: 9 }, (_, index) =>
      fakeFile(`foto-${index}.jpg`, 'image/jpeg', 1024, index),
    );
    const result = addTicketAttachmentFiles(current, [
      fakeFile('decima.jpg', 'image/jpeg', 1024, 100),
      fakeFile('once.jpg', 'image/jpeg', 1024, 101),
    ]);
    expect(result.files).toHaveLength(10);
    expect(result.issues).toEqual([
      { filename: 'once.jpg', message: 'Un comentario admite como máximo 10 archivos.' },
    ]);
  });

  it('no deja pasar de 110 MB en total', () => {
    const result = addTicketAttachmentFiles(
      [fakeFile('uno.mp4', 'video/mp4', 90 * MIB)],
      [fakeFile('dos.pdf', 'application/pdf', 21 * MIB)],
    );
    expect(result.files).toHaveLength(1);
    expect(result.issues[0]?.message).toBe(
      'Los archivos del comentario superarían 110 MB en total.',
    );
  });

  it('sin tipo del navegador decide por la extensión; ignora el mismo archivo repetido', () => {
    const pdf = fakeFile('acta.PDF', '', 1024);
    const result = addTicketAttachmentFiles(
      [pdf],
      [pdf, fakeFile('nota.mp4', 'application/octet-stream', 10)],
    );
    expect(result.issues).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual(['acta.PDF', 'nota.mp4']);
  });

  it('el accept del selector lista tipos y extensiones admitidos', () => {
    expect(TICKET_ATTACHMENT_ACCEPT).toContain('video/mp4');
    expect(TICKET_ATTACHMENT_ACCEPT).toContain('.pdf');
    expect(TICKET_ATTACHMENT_ACCEPT).not.toContain('.exe');
  });
});

describe('textos y formatos', () => {
  it('formatea tamaño, conteo y tipo en español', () => {
    expect(formatTicketAttachmentSize(512)).toBe('512 B');
    expect(formatTicketAttachmentSize(1536)).toBe('1,5 KB');
    expect(formatTicketAttachmentSize(25 * MIB)).toBe('25 MB');
    expect(formatTicketAttachmentCount(1)).toBe('1 adjunto');
    expect(formatTicketAttachmentCount(3)).toBe('3 adjuntos');
    expect(getTicketAttachmentKindLabel('image/png')).toBe('Foto');
    expect(getTicketAttachmentKindLabel('application/pdf')).toBe('PDF');
    expect(getTicketAttachmentKindLabel('video/mp4')).toBe('Video');
  });
});

describe('errores de la API', () => {
  it('muestra el mensaje del rechazo de un archivo y deja los demás al mensaje genérico', () => {
    const rejected = new ApiError(
      400,
      'TICKET_ATTACHMENT_REJECTED',
      '«informe.exe»: Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4. No se guardó el comentario ni sus archivos.',
    );
    expect(getTicketCommentAttachmentError(rejected)).toContain('«informe.exe»');
    expect(
      getTicketCommentAttachmentError(
        new ApiError(
          413,
          'TICKET_ATTACHMENTS_TOO_LARGE',
          'Los archivos del comentario superan 110 MB en total. No se guardó nada.',
        ),
      ),
    ).toContain('110 MB');
    expect(
      getTicketCommentAttachmentError(new ApiError(500, 'UNKNOWN', 'Error del servidor')),
    ).toBeNull();
    expect(getTicketCommentAttachmentError(new Error('red'))).toBeNull();
  });

  it('un 409 al pedir el enlace actualiza el estado; 404 y otros fallos son un error visible', () => {
    expect(
      getTicketAttachmentLinkFailure(new ApiError(409, 'TICKET_ATTACHMENT_IN_REVIEW', 'x')),
    ).toEqual({ kind: 'status', status: 'IN_REVIEW' });
    expect(
      getTicketAttachmentLinkFailure(new ApiError(409, 'TICKET_ATTACHMENT_BLOCKED', 'x')),
    ).toEqual({
      kind: 'status',
      status: 'BLOCKED',
    });
    expect(
      getTicketAttachmentLinkFailure(new ApiError(404, 'TICKET_ATTACHMENT_NOT_FOUND', 'x')),
    ).toEqual({
      kind: 'error',
      message: 'Este archivo ya no está disponible.',
    });
    expect(getTicketAttachmentLinkFailure(new Error('red'))).toEqual({
      kind: 'error',
      message: 'No pudimos abrir el archivo. Intenta de nuevo.',
    });
  });
});

describe('enlaces firmados', () => {
  it('solo reutiliza un enlace con más de 15 s de vida', () => {
    const now = Date.parse('2026-11-16T12:00:00.000Z');
    expect(isTicketAttachmentLinkFresh(null, now)).toBe(false);
    expect(isTicketAttachmentLinkFresh({ expiresAt: '2026-11-16T12:05:00.000Z' }, now)).toBe(true);
    expect(isTicketAttachmentLinkFresh({ expiresAt: '2026-11-16T12:00:10.000Z' }, now)).toBe(false);
  });

  it('acepta solo http(s)', () => {
    expect(toSafeTicketAttachmentUrl('https://archivos.example.test/a?firma=1')).toBe(
      'https://archivos.example.test/a?firma=1',
    );
    expect(toSafeTicketAttachmentUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeTicketAttachmentUrl('data:text/html,hola')).toBeNull();
    expect(toSafeTicketAttachmentUrl('no es url')).toBeNull();
  });
});
