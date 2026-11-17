/**
 * P2a · Dirección propia del ticket — spec MOD10 2026-11-16 v1.1 §3 K y CA-11.
 * Bandeja con `?ticketId=` (abrir escribe la URL, recargar reabre, «Atrás» cierra, cerrar la quita
 * sin perder filtros), «Abrir en página» en el panel y página `/dashboard/assurance/tickets/[id]`.
 */
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
  UserRole,
} from '@iwana/shared';
import type { AssuranceTicket, InternalUser } from '@/lib/api-client';
import { ApiError, assuranceApi, usersApi } from '@/lib/api-client';
import { AssuranceClient } from './AssuranceClient';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketPageClient } from './AssuranceTicketPageClient';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockSearchParams = new URLSearchParams();
let mockParams: { id?: string } = {};
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN as UserRole, tenantId: 'tenant-1' } as {
    id: string;
    role: UserRole;
    tenantId: string;
  } | null,
  isLoading: false,
};
const mockPermissions = { hasPermission: () => true };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => mockSearchParams,
  useParams: () => mockParams,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));

jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createAssuranceVisitRequestAndRoute: jest.fn(),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client') as typeof import('@/lib/api-client');
  return {
    ...actual,
    assuranceApi: {
      tickets: {
        list: jest.fn(),
        get: jest.fn(),
        listComments: jest.fn(),
        listTimeline: jest.fn(),
        create: jest.fn(),
        submitComment: jest.fn(),
        transitionStatus: jest.fn(),
        assign: jest.fn(),
        requestFieldService: jest.fn(),
        linkWorkOrder: jest.fn(),
        getAttachmentLink: jest.fn(),
      },
      dashboard: { getSummary: jest.fn() },
      slaPolicies: { list: jest.fn() },
    },
    subscribersApi: { list: jest.fn() },
    usersApi: { list: jest.fn() },
  };
});

const TICKET_ID = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const AGENT = {
  id: 'user-agent',
  email: 'agente@example.test',
  firstName: 'Agente',
  lastName: 'Sintético',
  role: UserRole.SUPPORT,
} as InternalUser;

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0777',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.PORTAL,
    subject: 'Intermitencia sintética',
    description: 'Diagnóstico sintético.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: 'sub-1',
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: 'sub-1',
    assignedUserId: AGENT.id,
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
    createdByUserId: AGENT.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T11:15:00.000Z',
    ...overrides,
  };
}

function primeApi(ticket: AssuranceTicket = makeTicket()) {
  jest.mocked(assuranceApi.tickets.list).mockResolvedValue({
    data: [ticket],
    total: 1,
    page: 1,
    limit: 20,
    meta: {
      mode: 'page',
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasMore: false,
      nextCursor: null,
      capabilities: { randomAccess: true, sortableFields: [] },
    },
  } as never);
  jest.mocked(assuranceApi.tickets.get).mockResolvedValue(ticket);
  jest.mocked(assuranceApi.tickets.listComments).mockResolvedValue([]);
  jest.mocked(assuranceApi.tickets.listTimeline).mockResolvedValue([]);
  jest.mocked(assuranceApi.slaPolicies.list).mockResolvedValue([]);
  jest.mocked(assuranceApi.dashboard.getSummary).mockResolvedValue({
    openTickets: 1,
    breachedTickets: 0,
    fieldServiceTickets: 0,
    averageResolutionMinutes: 0,
  } as never);
  jest.mocked(usersApi.list).mockResolvedValue({
    data: [AGENT],
    meta: { nextCursor: null, total: 1 },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockParams = {};
  mockAuth.user = { id: 'user-session', role: UserRole.ADMIN, tenantId: 'tenant-1' };
  mockAuth.isLoading = false;
  Element.prototype.scrollIntoView = jest.fn();
});

describe('P2a · bandeja con ?ticketId= (CA-11)', () => {
  it('abrir un ticket escribe ?ticketId= en la URL conservando los filtros', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams('status=OPEN');
    primeApi();
    render(<AssuranceClient />);

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByRole('dialog', { name: 'TK-2026-0777' })).toBeInTheDocument();
    expect(mockRouter.push).toHaveBeenCalledWith(
      `/dashboard/assurance?status=OPEN&ticketId=${TICKET_ID}`,
      { scroll: false },
    );
  });

  it('montar la bandeja con ?ticketId= abre ese ticket (recargar lo reabre)', async () => {
    mockSearchParams = new URLSearchParams(`ticketId=${TICKET_ID}`);
    primeApi();
    render(<AssuranceClient />);

    const dialog = await screen.findByRole('dialog', { name: 'TK-2026-0777' });
    await waitFor(() => expect(assuranceApi.tickets.get).toHaveBeenCalledWith(TICKET_ID));
    expect(within(dialog).getByText('Diagnóstico sintético.')).toBeInTheDocument();
  });

  it('cerrar quita ?ticketId= sin añadir historial y conserva los filtros', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams(`status=OPEN&ticketId=${TICKET_ID}`);
    primeApi();
    render(<AssuranceClient />);

    const dialog = await screen.findByRole('dialog', { name: 'TK-2026-0777' });
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard/assurance?status=OPEN', {
      scroll: false,
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('«Atrás» (el parámetro desaparece de la URL) cierra el panel', async () => {
    mockSearchParams = new URLSearchParams(`ticketId=${TICKET_ID}`);
    primeApi();
    const { rerender } = render(<AssuranceClient />);
    await screen.findByRole('dialog', { name: 'TK-2026-0777' });

    mockSearchParams = new URLSearchParams();
    rerender(<AssuranceClient />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('«Adelante» (el parámetro vuelve) reabre el panel', async () => {
    mockSearchParams = new URLSearchParams(`ticketId=${TICKET_ID}`);
    primeApi();
    const { rerender } = render(<AssuranceClient />);
    await screen.findByRole('dialog', { name: 'TK-2026-0777' });

    mockSearchParams = new URLSearchParams();
    rerender(<AssuranceClient />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    mockSearchParams = new URLSearchParams(`ticketId=${TICKET_ID}`);
    rerender(<AssuranceClient />);
    expect(await screen.findByRole('dialog', { name: 'TK-2026-0777' })).toBeInTheDocument();
  });
});

describe('P2a · «Abrir en página» en la cabecera del panel (§3 K)', () => {
  const noop = jest.fn(async () => undefined);
  const baseProps = {
    open: true,
    ticket: makeTicket(),
    comments: [],
    timeline: [],
    assignees: [AGENT],
    isLoading: false,
    error: null,
    actionFeedback: null,
    actionError: null,
    isCommentSubmitting: false,
    isTransitionSubmitting: false,
    isAssignmentSubmitting: false,
    isFieldServiceSubmitting: false,
    isLinkingWorkOrder: false,
    canManage: true,
    canOperate: true,
    onClose: jest.fn(),
    onAddComment: noop,
    onTransitionStatus: noop,
    onAssign: noop,
    onRequestFieldService: noop,
    onLinkWorkOrder: noop,
  };

  it('enlaza a la ruta propia del ticket', () => {
    render(<AssuranceTicketDrawer {...baseProps} />);
    const dialog = screen.getByRole('dialog', { name: 'TK-2026-0777' });
    expect(within(dialog).getByRole('link', { name: 'Abrir en página' })).toHaveAttribute(
      'href',
      `/dashboard/assurance/tickets/${TICKET_ID}`,
    );
  });

  it('no aparece mientras carga ni si el consumidor lo desactiva', () => {
    const { rerender } = render(<AssuranceTicketDrawer {...baseProps} ticket={null} isLoading />);
    expect(screen.queryByRole('link', { name: 'Abrir en página' })).toBeNull();
    rerender(<AssuranceTicketDrawer {...baseProps} showOpenInPage={false} />);
    expect(screen.queryByRole('link', { name: 'Abrir en página' })).toBeNull();
  });
});

describe('P2a · página /dashboard/assurance/tickets/[id] (§3 K, CA-11)', () => {
  it('con permiso: muestra el mismo contenido que el panel, sin «Abrir en página»', async () => {
    mockParams = { id: TICKET_ID };
    primeApi();
    render(<AssuranceTicketPageClient />);

    expect(await screen.findByRole('heading', { name: 'TK-2026-0777' })).toBeInTheDocument();
    const detail = screen.getByRole('region', { name: 'Detalle del ticket' });
    expect(await within(detail).findByText('Diagnóstico sintético.')).toBeInTheDocument();
    expect(within(detail).getByRole('combobox', { name: 'Responsable' })).toHaveTextContent(
      'Agente Sintético',
    );
    expect(within(detail).getByRole('tab', { name: 'Comentarios' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nuevo comentario' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir en página' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver a la mesa de ayuda' })).toHaveAttribute(
      'href',
      '/dashboard/assurance',
    );
    expect(assuranceApi.tickets.get).toHaveBeenCalledWith(TICKET_ID);
  });

  it('las acciones recargan el ticket y avisan igual que en la bandeja', async () => {
    const user = userEvent.setup();
    mockParams = { id: TICKET_ID };
    primeApi();
    jest.mocked(assuranceApi.tickets.assign).mockResolvedValue(makeTicket() as never);
    render(<AssuranceTicketPageClient />);
    const detail = await screen.findByRole('region', { name: 'Detalle del ticket' });
    await within(detail).findByText('Diagnóstico sintético.');

    await user.click(within(detail).getByRole('combobox', { name: 'Área' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Área' })).getByRole('option', {
        name: 'Soporte',
      }),
    );
    await user.click(within(detail).getByRole('button', { name: 'Guardar asignación' }));

    await waitFor(() =>
      expect(assuranceApi.tickets.assign).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ queueName: 'SUPPORT' }),
      ),
    );
    expect(await screen.findByText('Asignación actualizada.')).toBeInTheDocument();
    expect(assuranceApi.tickets.get).toHaveBeenCalledTimes(2);
  });

  it('rol sin acceso: aviso de acceso restringido y sin pedir el ticket', () => {
    mockParams = { id: TICKET_ID };
    mockAuth.user = { id: 'user-session', role: UserRole.SALES, tenantId: 'tenant-1' };
    primeApi();
    render(<AssuranceTicketPageClient />);

    expect(screen.getByText('Tu rol no tiene acceso a esta vista')).toBeInTheDocument();
    expect(assuranceApi.tickets.get).not.toHaveBeenCalled();
  });

  it('ticket inexistente (404): estado «no encontrado» con vuelta a la bandeja', async () => {
    mockParams = { id: 'no-existe' };
    primeApi();
    jest
      .mocked(assuranceApi.tickets.get)
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No encontrado'));
    render(<AssuranceTicketPageClient />);

    expect(
      await screen.findByText('Este ticket no existe o ya no está disponible.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Volver a la mesa de ayuda' })[0]).toHaveAttribute(
      'href',
      '/dashboard/assurance',
    );
  });

  it('error de carga distinto de 404: alerta de error dentro del detalle', async () => {
    mockParams = { id: TICKET_ID };
    primeApi();
    jest
      .mocked(assuranceApi.tickets.get)
      .mockRejectedValue(new ApiError(500, 'INTERNAL', 'Servicio caído'));
    render(<AssuranceTicketPageClient />);

    expect(await screen.findByText('No fue posible cargar el ticket')).toBeInTheDocument();
    expect(screen.getByText('Servicio caído')).toBeInTheDocument();
  });

  it('cargando: esqueleto, sin estado «no disponible»', () => {
    mockParams = { id: TICKET_ID };
    primeApi();
    jest.mocked(assuranceApi.tickets.get).mockReturnValue(new Promise(() => undefined));
    render(<AssuranceTicketPageClient />);

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Ticket no disponible')).toBeNull();
  });

  it('sesión aún cargando: esqueleto de página', () => {
    mockParams = { id: TICKET_ID };
    mockAuth.isLoading = true;
    render(<AssuranceTicketPageClient />);
    expect(screen.getByText('Cargando el caso…')).toBeInTheDocument();
    expect(assuranceApi.tickets.get).not.toHaveBeenCalled();
  });
});
