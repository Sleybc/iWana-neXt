/**
 * Inventario W0 / CA-1 de la spec 2026-11-20 (Soporte en vista dividida).
 * Enumera lo que la pestaña Soporte ofrece hoy y que el rediseño debe conservar: colas,
 * filtros, los ocho datos de la fila, acciones del ticket y estados vacíos. Asevera por rol
 * y texto accesible, nunca por estructura DOM, para seguir siendo válida antes y después.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTicket, AssuranceTicketComment, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import {
  ASSURANCE_UNASSIGNED_LABEL,
  getAssuranceTicketTypeLabel,
} from '@/components/assurance/assurance-labels';
import { SubscriberSupportTab } from './SubscriberSupportTab';

const mockPermissions = { current: new Set<AccessPermissionKey>() };

// Referencias estables (useRouter, usePermissions): un objeto nuevo por render dispara efectos
// en bucle. La pestaña no usa useAuth hoy; si el rediseño lo introduce, se mockea igual.
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (permission: AccessPermissionKey) => mockPermissions.current.has(permission),
      });
  })(),
}));

jest.mock('next/navigation', () => ({
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: jest.fn(), replace: jest.fn() });
  })(),
}));

jest.mock('@/lib/api-client', () => ({
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
    },
    slaPolicies: { list: jest.fn() },
  },
  usersApi: { list: jest.fn() },
  wfmApi: {
    visitRequests: { list: jest.fn() },
    events: { list: jest.fn() },
  },
}));

const subscriber = {
  id: '8d4943a8-a7d8-4053-942f-a99a0dd16603',
  tenantId: 'tenant-a',
  personType: 'NATURAL',
  firstName: 'Ada',
  lastName: 'Sintética',
  businessName: null,
  city: 'Bogotá',
  privacyRestricted: false,
} as SubscriberRecord;

const ALL = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
  AccessPermissionKey.WFM_SCHEDULE_READ,
];

function ticket(overrides: Partial<AssuranceTicket> & { id: string }): AssuranceTicket {
  return {
    tenantId: 'tenant-a',
    ticketNumber: 'TK-2026-0001',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Asunto sintético',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: subscriber.id,
    subjectType: null,
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
    createdByUserId: 'user-a',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const withClip = ticket({
  id: 't-clip',
  ticketNumber: 'TK-2026-0801',
  subject: 'Intermitencia sintética',
  priority: TicketPriority.HIGH,
  slaResolveByAt: '2099-01-01T10:00:00.000Z',
  attachmentCount: 2,
} as Partial<AssuranceTicket> & { id: string });
const emptyDescription = ticket({
  id: 't-empty',
  ticketNumber: 'TK-2026-0802',
  subject: 'Sin relato sintético',
  type: TicketType.SERVICE_REQUEST,
  slaResolveByAt: '2099-01-05T10:00:00.000Z',
});
const closed = ticket({
  id: 't-closed',
  ticketNumber: 'TK-2026-0803',
  subject: 'Cerrado sintético',
  status: TicketStatus.CLOSED,
  closedAt: '2026-10-22T10:00:00.000Z',
});
const ALL_TICKETS = [withClip, emptyDescription, closed];

const comments = [
  {
    id: 'c-public',
    ticketId: 't-clip',
    tenantId: 'tenant-a',
    body: 'Comentario público sintético',
    isInternal: false,
    authorUserId: 'user-a',
    attachments: [],
    createdAt: '2026-10-20T11:00:00.000Z',
  },
  {
    id: 'c-internal',
    ticketId: 't-clip',
    tenantId: 'tenant-a',
    body: 'Nota interna sintética',
    isInternal: true,
    authorUserId: 'user-a',
    attachments: [],
    createdAt: '2026-10-20T12:00:00.000Z',
  },
] as unknown as AssuranceTicketComment[];

function rows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: /tickets/i })).getAllByRole('button', {
    name: /^Abrir ticket /,
  });
}

async function openTicket(user: ReturnType<typeof userEvent.setup>, number: string) {
  await waitFor(() => expect(rows().length).toBeGreaterThan(0));
  await user.click(rows().find((row) => row.getAttribute('aria-label')?.includes(number))!);
  expect(await screen.findByRole('heading', { name: number })).toBeInTheDocument();
}

describe('SubscriberSupportTab — inventario W0 (CA-1, vista dividida)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/');
    mockPermissions.current = new Set(ALL);
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: ALL_TICKETS });
    (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
      ALL_TICKETS.find((item) => item.id === id),
    );
    (assuranceApi.tickets.listComments as jest.Mock).mockImplementation(async (id: string) =>
      id === 't-clip' ? comments : [],
    );
    (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({ items: [] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('colas: Abiertos, Resueltos y cerrados y Todos con su conteo', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    const queues = screen.getByRole('group', { name: 'Filtrar tickets' });
    expect(within(queues).getByRole('button', { name: 'Abiertos (2)' })).toBeInTheDocument();
    await user.click(within(queues).getByRole('button', { name: 'Resueltos y cerrados (1)' }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Cerrado sintético')).toBeInTheDocument();
    await user.click(within(queues).getByRole('button', { name: 'Todos (3)' }));
    expect(rows()).toHaveLength(3);
  });

  it('filtros: prioridad, tipo y búsqueda por número o asunto', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    expect(screen.getByRole('combobox', { name: 'Prioridad' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar tickets por número o asunto'), '0802');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveAccessibleName(/TK-2026-0802/);
  });

  it('la fila muestra los ocho datos: número, asunto, estado, prioridad, tipo, responsable, adjuntos y fecha', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    const row = rows().find((item) => item.getAttribute('aria-label')?.includes('TK-2026-0801'))!;

    expect(within(row).getByText('TK-2026-0801')).toBeInTheDocument();
    expect(within(row).getByText('Intermitencia sintética')).toBeInTheDocument();
    expect(within(row).getByText('Abierto')).toBeInTheDocument();
    expect(row).toHaveAccessibleName(/prioridad alta/);
    expect(
      within(row).getByText(getAssuranceTicketTypeLabel(TicketType.CUSTOMER_INCIDENT)),
    ).toBeInTheDocument();
    expect(row).toHaveTextContent(`Responsable: ${ASSURANCE_UNASSIGNED_LABEL}`);
    expect(row).toHaveAccessibleName(/con 2 adjuntos/);
    expect(within(row).getByText(/^Abierto (el )?\d/)).toBeInTheDocument();
  });

  it('acciones del ticket: responder, asignar, cambiar área, solicitar visita, vincular orden y adjuntar', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await openTicket(user, 'TK-2026-0801');

    const reply = screen.getByRole('textbox', { name: 'Nuevo comentario' });
    expect(screen.getByRole('button', { name: 'Agregar comentario' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Responsable' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Área' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Solicitar visita' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vincular orden de trabajo' })).toBeInTheDocument();

    await user.click(reply);
    expect(await screen.findByText('Adjuntar archivos')).toBeInTheDocument();
  });

  it('el hilo distingue el comentario interno del público', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await openTicket(user, 'TK-2026-0801');

    expect(await screen.findByText('Comentario público sintético')).toBeInTheDocument();
    expect(screen.getByText('Nota interna sintética')).toBeInTheDocument();
  });

  it('vacíos del ticket: sin descripción y sin comentarios', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await openTicket(user, 'TK-2026-0802');

    expect(
      await screen.findByText('Sin descripción adicional registrada para este caso.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin comentarios registrados')).toBeInTheDocument();
  });

  it('vacío de la pestaña: el suscriptor no tiene tickets', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(await screen.findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
  });

  it('vacío de la cola: no hay tickets abiertos', async () => {
    const user = userEvent.setup();
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [closed] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Abiertos (0)' }));
    expect(await screen.findByText('No hay tickets abiertos.')).toBeInTheDocument();
  });

  it('vacío del filtro: ningún ticket coincide y «Limpiar filtros» lo restablece', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    await user.type(screen.getByLabelText('Buscar tickets por número o asunto'), 'zzzz');
    expect(await screen.findByText('Ningún ticket coincide')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it('sin permiso de lectura: aviso y sin consultas', async () => {
    mockPermissions.current = new Set([AccessPermissionKey.ASSURANCE_TICKETS_MANAGE]);
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(await screen.findByText('No tienes acceso a los tickets')).toBeInTheDocument();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
  });
});
