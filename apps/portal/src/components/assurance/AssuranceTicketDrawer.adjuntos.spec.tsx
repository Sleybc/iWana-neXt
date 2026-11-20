import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
} from '@iwana/shared';
import type {
  AssuranceTicket,
  AssuranceTicketAttachment,
  AssuranceTicketComment,
} from '@/lib/api-client';
import { ApiError, assuranceApi } from '@/lib/api-client';
import {
  downloadTicketAttachment,
  openTicketAttachmentInNewTab,
} from './ticket-attachment-navigation';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';

jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  assuranceApi: { tickets: { getAttachmentLink: jest.fn() } },
}));

jest.mock('./ticket-attachment-navigation', () => ({
  openTicketAttachmentInNewTab: jest.fn(),
  downloadTicketAttachment: jest.fn(),
}));

const getAttachmentLink = assuranceApi.tickets.getAttachmentLink as jest.Mock;
const MIB = 1024 * 1024;
const TICKET_ID = '6f0f2c1e-3c43-4f1e-9a43-6c2d9b1f0a11';

function ticket(): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2001',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Sin servicio',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: null,
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: null,
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: 'user-1',
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  };
}

function attachment(
  overrides: Partial<AssuranceTicketAttachment> & Pick<AssuranceTicketAttachment, 'id'>,
): AssuranceTicketAttachment {
  return {
    filename: 'foto-router.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 2 * MIB,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function comment(
  id: string,
  attachments: AssuranceTicketAttachment[],
  overrides: Partial<AssuranceTicketComment> = {},
): AssuranceTicketComment {
  return {
    id,
    ticketId: TICKET_ID,
    tenantId: 'tenant-1',
    body: `Comentario ${id}`,
    isInternal: false,
    authorUserId: 'user-1',
    createdAt: '2026-11-16T11:00:00.000Z',
    attachments,
    ...overrides,
  };
}

function link(url: string) {
  return {
    url,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    filename: 'x',
    contentType: 'image/jpeg' as const,
  };
}

function renderDrawer({
  comments = [],
  onAddComment = jest.fn(async () => true),
  isCommentSubmitting = false,
}: {
  comments?: AssuranceTicketComment[];
  onAddComment?: jest.Mock;
  isCommentSubmitting?: boolean;
} = {}) {
  const noop = jest.fn(async () => undefined);
  render(
    <AssuranceTicketDrawer
      open
      ticket={ticket()}
      comments={comments}
      timeline={[]}
      assignees={[]}
      isLoading={false}
      error={null}
      actionFeedback={null}
      actionError={null}
      isCommentSubmitting={isCommentSubmitting}
      isTransitionSubmitting={false}
      isAssignmentSubmitting={false}
      isFieldServiceSubmitting={false}
      isLinkingWorkOrder={false}
      canManage
      canOperate
      onClose={jest.fn()}
      onAddComment={onAddComment}
      onTransitionStatus={noop}
      onAssign={noop}
      onRequestFieldService={noop}
      onLinkWorkOrder={noop}
    />,
  );
  return { onAddComment };
}

function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type, lastModified: size });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function commentArticle(body: string): HTMLElement {
  const article = screen.getByText(body).closest('article');
  if (!article) throw new Error(`Sin comentario «${body}»`);
  return article;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Nuevo comentario con archivos (criterio 1)', () => {
  it('valida antes de enviar: agrega los válidos, explica por archivo los rechazados y permite quitar', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderDrawer();

    // Ajuste CA-2 aprobado 2026-11-16: el redactor se expande al enfocarlo.
    await user.click(screen.getByLabelText('Nuevo comentario'));
    await user.upload(screen.getByLabelText('Adjuntar archivos'), [
      fakeFile('foto.jpg', 'image/jpeg', 2 * MIB),
      fakeFile('acta.pdf', 'application/pdf', MIB),
      fakeFile('visita.mp4', 'video/mp4', 60 * MIB),
      fakeFile('informe.exe', 'application/x-msdownload', 10),
      fakeFile('enorme.png', 'image/png', 30 * MIB),
    ]);

    const selected = screen.getByRole('list', { name: 'Archivos para adjuntar' });
    expect(within(selected).getAllByRole('listitem')).toHaveLength(3);
    const rejected = screen.getByRole('alert');
    expect(rejected).toHaveTextContent(
      '«informe.exe»: Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4.',
    );
    expect(rejected).toHaveTextContent(
      '«enorme.png»: Supera el tamaño máximo de 25 MB para su tipo.',
    );

    await user.click(screen.getByRole('button', { name: 'Quitar acta.pdf' }));
    expect(within(selected).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('envía texto, visibilidad y archivos juntos y limpia el formulario al guardar', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onAddComment } = renderDrawer();
    const photo = fakeFile('foto.jpg', 'image/jpeg', 2 * MIB);
    const pdf = fakeFile('acta.pdf', 'application/pdf', MIB);

    await user.type(screen.getByLabelText('Nuevo comentario'), 'Se cambió la ONU');
    await user.click(screen.getByRole('checkbox', { name: 'Interno' }));
    await user.upload(screen.getByLabelText('Adjuntar archivos'), [photo, pdf]);
    await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));

    expect(onAddComment).toHaveBeenCalledWith({
      body: 'Se cambió la ONU',
      isInternal: true,
      files: [photo, pdf],
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('list', { name: 'Archivos para adjuntar' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Nuevo comentario')).toHaveValue('');
  });

  it('sin archivos envía la lista vacía (endpoint JSON de siempre)', async () => {
    const user = userEvent.setup();
    const { onAddComment } = renderDrawer();
    await user.type(screen.getByLabelText('Nuevo comentario'), 'Solo texto');
    await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));
    expect(onAddComment).toHaveBeenCalledWith({ body: 'Solo texto', isInternal: false, files: [] });
  });

  it('si no se guardó, conserva el texto y los archivos para reintentar', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onAddComment = jest.fn(async () => false);
    renderDrawer({ onAddComment });

    await user.type(screen.getByLabelText('Nuevo comentario'), 'Reintento');
    await user.upload(screen.getByLabelText('Adjuntar archivos'), [
      fakeFile('foto.jpg', 'image/jpeg', MIB),
    ]);
    await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));

    expect(onAddComment).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Nuevo comentario')).toHaveValue('Reintento');
    expect(
      within(screen.getByRole('list', { name: 'Archivos para adjuntar' })).getAllByRole('listitem'),
    ).toHaveLength(1);
  });
});

describe('Adjuntos bajo cada comentario (criterio 2)', () => {
  it('en revisión y bloqueado: se ven con su estado y sin abrir ni descargar', () => {
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({
            id: 'a1',
            filename: 'revisando.pdf',
            contentType: 'application/pdf',
            status: 'IN_REVIEW',
          }),
          attachment({ id: 'a2', filename: 'sospechoso.jpg', status: 'BLOCKED' }),
        ]),
      ],
    });

    const article = commentArticle('Comentario c1');
    const items = within(article).getAllByTestId('ticket-attachment');
    expect(items[0]).toHaveAttribute('data-attachment-status', 'IN_REVIEW');
    expect(items[0]).toHaveTextContent('En revisión');
    expect(items[1]).toHaveAttribute('data-attachment-status', 'BLOCKED');
    expect(items[1]).toHaveTextContent('Archivo bloqueado');
    expect(
      within(article).queryByRole('button', { name: /Descargar|Abrir/ }),
    ).not.toBeInTheDocument();
    expect(getAttachmentLink).not.toHaveBeenCalled();
  });

  it('foto disponible: pide el enlace al mostrarse y pinta la miniatura con alt', async () => {
    getAttachmentLink.mockResolvedValue(link('https://archivos.example.test/foto?firma=1'));
    renderDrawer({ comments: [comment('c1', [attachment({ id: 'a1' })])] });

    const article = commentArticle('Comentario c1');
    const thumbnail = await within(article).findByAltText('Vista previa de foto-router.jpg');
    expect(thumbnail).toHaveAttribute('src', 'https://archivos.example.test/foto?firma=1');
    expect(thumbnail.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(thumbnail.closest('a')).toHaveAttribute('target', '_blank');
    expect(getAttachmentLink).toHaveBeenCalledWith(TICKET_ID, 'a1', 'inline');
    expect(within(article).getByText('Foto · 2 MB')).toBeInTheDocument();
  });

  it('PDF disponible: pide el enlace al hacer clic y lo abre en una pestaña nueva', async () => {
    const user = userEvent.setup();
    getAttachmentLink.mockResolvedValue(link('https://archivos.example.test/acta.pdf?firma=1'));
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({ id: 'a1', filename: 'acta.pdf', contentType: 'application/pdf' }),
        ]),
      ],
    });

    expect(getAttachmentLink).not.toHaveBeenCalled();
    await user.click(
      within(commentArticle('Comentario c1')).getByRole('button', { name: 'Abrir PDF: acta.pdf' }),
    );
    expect(getAttachmentLink).toHaveBeenCalledWith(TICKET_ID, 'a1', 'inline');
    expect(openTicketAttachmentInNewTab).toHaveBeenCalledWith(
      'https://archivos.example.test/acta.pdf?firma=1',
    );
  });

  it('video disponible: se reproduce en la página con el enlace firmado', async () => {
    const user = userEvent.setup();
    getAttachmentLink.mockResolvedValue(link('https://archivos.example.test/visita.mp4?firma=1'));
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({
            id: 'a1',
            filename: 'visita.mp4',
            contentType: 'video/mp4',
            sizeBytes: 40 * MIB,
          }),
        ]),
      ],
    });

    const article = commentArticle('Comentario c1');
    await user.click(within(article).getByRole('button', { name: 'Reproducir video: visita.mp4' }));
    const video = await within(article).findByLabelText('Video visita.mp4');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', 'https://archivos.example.test/visita.mp4?firma=1');
  });

  it('descargar pide el enlace con disposición de descarga', async () => {
    const user = userEvent.setup();
    getAttachmentLink.mockResolvedValue(link('https://archivos.example.test/acta.pdf?descarga=1'));
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({ id: 'a1', filename: 'acta.pdf', contentType: 'application/pdf' }),
        ]),
      ],
    });

    await user.click(
      within(commentArticle('Comentario c1')).getByRole('button', { name: 'Descargar acta.pdf' }),
    );
    expect(getAttachmentLink).toHaveBeenCalledWith(TICKET_ID, 'a1', 'attachment');
    expect(downloadTicketAttachment).toHaveBeenCalledWith(
      'https://archivos.example.test/acta.pdf?descarga=1',
    );
  });

  it('si la API responde que sigue en revisión, actualiza el estado y no abre', async () => {
    const user = userEvent.setup();
    getAttachmentLink.mockRejectedValue(
      new ApiError(409, 'TICKET_ATTACHMENT_IN_REVIEW', 'El archivo está en revisión.'),
    );
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({ id: 'a1', filename: 'acta.pdf', contentType: 'application/pdf' }),
        ]),
      ],
    });

    const article = commentArticle('Comentario c1');
    await user.click(within(article).getByRole('button', { name: 'Abrir PDF: acta.pdf' }));
    await waitFor(() =>
      expect(within(article).getByTestId('ticket-attachment')).toHaveAttribute(
        'data-attachment-status',
        'IN_REVIEW',
      ),
    );
    expect(openTicketAttachmentInNewTab).not.toHaveBeenCalled();
  });

  it('nunca usa un enlace que no sea http(s)', async () => {
    const user = userEvent.setup();
    getAttachmentLink.mockResolvedValue(link('javascript:alert(1)'));
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({ id: 'a1', filename: 'acta.pdf', contentType: 'application/pdf' }),
        ]),
      ],
    });

    const article = commentArticle('Comentario c1');
    await user.click(within(article).getByRole('button', { name: 'Abrir PDF: acta.pdf' }));
    expect(await within(article).findByRole('alert')).toHaveTextContent(
      'No pudimos abrir el archivo. Intenta de nuevo.',
    );
    expect(openTicketAttachmentInNewTab).not.toHaveBeenCalled();
  });
});

describe('Sección «Adjuntos (N)» del detalle (criterio 4)', () => {
  it('lista todos los adjuntos del caso, de todos los comentarios', () => {
    renderDrawer({
      comments: [
        comment('c1', [
          attachment({
            id: 'a1',
            filename: 'acta.pdf',
            contentType: 'application/pdf',
            status: 'IN_REVIEW',
          }),
        ]),
        comment('c2', []),
        comment('c3', [
          attachment({
            id: 'a2',
            filename: 'visita.mp4',
            contentType: 'video/mp4',
            status: 'BLOCKED',
          }),
          attachment({ id: 'a3', filename: 'otra.pdf', contentType: 'application/pdf' }),
        ]),
      ],
    });

    const section = screen.getByTestId('ticket-attachments-section');
    expect(within(section).getByRole('heading', { name: 'Adjuntos (3)' })).toBeInTheDocument();
    const list = within(section).getByRole('list', { name: 'Adjuntos del caso: 3 adjuntos' });
    expect(
      within(list)
        .getAllByTestId('ticket-attachment')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('acta.pdf'),
      expect.stringContaining('visita.mp4'),
      expect.stringContaining('otra.pdf'),
    ]);
    // El resumen no carga miniaturas: abrir se pide al hacer clic.
    expect(
      within(section).getByRole('button', { name: 'Abrir PDF: otra.pdf' }),
    ).toBeInTheDocument();
    expect(getAttachmentLink).not.toHaveBeenCalled();
  });

  // Spec 2026-11-20 §3 F y CA-6 (D2): sin adjuntos no hay bloque; ya no se anuncia «Adjuntos (0)».
  it('sin adjuntos no muestra el bloque de adjuntos (CA-6)', () => {
    renderDrawer({ comments: [comment('c1', [])] });
    expect(screen.queryByTestId('ticket-attachments-section')).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Adjuntos \(/ })).toBeNull();
  });
});
