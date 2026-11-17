/**
 * Inventario de la v1.0 (docs/specs/2026-10-20-mod05-pestana-soporte-ux-spec.md §2–§5)
 * que el rediseño (docs/specs/2026-11-17-mod05-pestana-soporte-rediseno-ux.md) debe conservar.
 * Red de seguridad W0 / CA-1: asevera solo comportamiento que la spec nueva mantiene.
 * No asevera textos que la spec nueva cambia o elimina («Cerrados», descripción del panel,
 * «Sin responsable», «Sin vencimiento registrado», «Asunto operativo», título del diálogo,
 * vacío de visitas): están anotados como «cambio aprobado» en el informe W0.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  ScheduleEventStatus,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type {
  AssuranceTicket,
  SubscriberRecord,
  WfmScheduleEvent,
  WfmVisitRequest,
} from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import { SubscriberSupportTab } from './SubscriberSupportTab';

const mockPermissions = { current: new Set<AccessPermissionKey>() };

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
    return () => (router ??= { push: jest.fn() });
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

function ticket(
  overrides: Partial<AssuranceTicket> & Pick<AssuranceTicket, 'id'>,
): AssuranceTicket {
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

const openLate = ticket({
  id: 't-open-late',
  ticketNumber: 'TK-2026-0701',
  subject: 'Intermitencia sintética',
  slaResolveByAt: '2099-01-10T10:00:00.000Z',
  attachmentCount: 3,
} as Partial<AssuranceTicket> & { id: string });
const openSoon = ticket({
  id: 't-open-soon',
  ticketNumber: 'TK-2026-0702',
  subject: 'Caída sintética',
  slaResolveByAt: '2099-01-01T10:00:00.000Z',
});
const resolved = ticket({
  id: 't-resolved',
  ticketNumber: 'TK-2026-0703',
  subject: 'Resuelto sintético',
  status: TicketStatus.RESOLVED,
  resolvedAt: '2026-10-21T10:00:00.000Z',
});

function visitRequest(): WfmVisitRequest {
  return {
    tenantId: 'tenant-a',
    id: 'vr-1',
    status: VisitRequestStatus.PENDING,
    originContext: WorkOrderSourceContext.CRM,
    workType: WfmWorkType.SUPPORT,
    requestedWindowStartAt: null,
    address: 'Carrera 1',
    expedienteId: 'exp-1',
    subscriberId: subscriber.id,
    ticketId: null,
    contractId: null,
    scheduleEventId: null,
    scheduledAt: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  } as unknown as WfmVisitRequest;
}

function event(overrides: Partial<WfmScheduleEvent> = {}): WfmScheduleEvent {
  return {
    id: 'ev-1',
    tenantId: 'tenant-a',
    type: WfmWorkType.TECHNICAL_VISIT,
    status: ScheduleEventStatus.SCHEDULED,
    scheduledStartAt: '2099-02-01T14:00:00.000Z',
    address: 'Carrera 2',
    expedienteId: null,
    contractId: 'c-1',
    subscriberId: subscriber.id,
    ticketId: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    ...overrides,
  } as unknown as WfmScheduleEvent;
}

function ticketButtons(): HTMLElement[] {
  return within(screen.getByRole('list', { name: /tickets/i })).getAllByRole('button', {
    name: /^Abrir ticket /,
  });
}

describe('SubscriberSupportTab — inventario v1.0 que el rediseño conserva', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Los filtros viven en la URL (spec 2026-11-17 §5.3): cada prueba parte sin ellos.
    window.history.replaceState(null, '', '/');
    mockPermissions.current = new Set(ALL);
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [resolved, openLate, openSoon],
    });
    (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
      [openLate, openSoon, resolved].find((item) => item.id === id),
    );
    (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue([]);
    (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({ items: [visitRequest()] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({
      data: [event(), event({ id: 'ev-ticket', ticketId: 't-open-late' })],
    });
  });

  // §2 Datos y orden de Tickets
  it('§2 consulta por suscriptor y muestra por defecto los abiertos, el plazo más próximo primero', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));
    expect(assuranceApi.tickets.list).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: subscriber.id }),
    );
    const [first, second] = ticketButtons();
    expect(first).toHaveAccessibleName(/^Abrir ticket TK-2026-0702: Caída sintética/);
    // Nombre ampliado por la spec 2026-11-17 §4 (estado y prioridad); se conserva el prefijo v1.0.
    expect(second).toHaveAccessibleName(
      'Abrir ticket TK-2026-0701: Intermitencia sintética, Abierto, prioridad normal, con 3 adjuntos',
    );
    expect(screen.queryByText('Resuelto sintético')).not.toBeInTheDocument();
  });

  it('§2 la fila conserva número, asunto, estado, prioridad y fecha de apertura', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));
    const row = ticketButtons()[1]!;

    expect(within(row).getByText('TK-2026-0701')).toBeInTheDocument();
    expect(within(row).getByText('Intermitencia sintética')).toBeInTheDocument();
    expect(within(row).getByText('Abierto')).toBeInTheDocument();
    expect(within(row).getByText(/Abierto (el )?\d/)).toBeInTheDocument();
    expect(within(row).getByTestId('ticket-attachment-clip')).toBeInTheDocument();
  });

  it('§2 filtros con nombre accesible: Abiertos y Todos; Resuelto no cuenta como abierto (D1)', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));

    const group = screen.getByRole('group', { name: 'Filtrar tickets' });
    expect(within(group).getByRole('button', { name: /^Abiertos \(2\)$/ })).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: /^Todos \(3\)$/ }));
    expect(ticketButtons()).toHaveLength(3);
    expect(screen.getByText('Resuelto sintético')).toBeInTheDocument();
  });

  it('§2 abrir una fila carga el detalle del ticket sin salir de la pestaña', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));

    await user.click(ticketButtons()[0]!);
    expect(assuranceApi.tickets.get).toHaveBeenCalledWith('t-open-soon');
    expect(await screen.findByRole('heading', { name: 'TK-2026-0702' })).toBeInTheDocument();
  });

  // §3 Visitas
  it('§3 lista solo visitas propias (no las de un ticket) y abre el detalle de solo lectura', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByRole('heading', { name: 'Visitas' })).toBeInTheDocument();
    const visits = await screen.findAllByRole('button', { name: /^Ver detalle de visita: / });
    expect(visits).toHaveLength(2);
    expect(wfmApi.visitRequests.list).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: subscriber.id }),
    );
    expect(screen.getByText(/Oportunidad/)).toBeInTheDocument();
    expect(screen.getByText(/Contrato/)).toBeInTheDocument();

    await user.click(visits[0]!);
    const detail = await screen.findByRole('dialog', { name: 'Detalle de la visita' });
    expect(within(detail).getByRole('link', { name: 'Abrir en Agendamiento' })).toHaveAttribute(
      'href',
    );
  });

  // §4 Permisos y estados independientes
  it('§4 sin lectura de tickets ni de visitas: avisos por sección y sin consultas', async () => {
    mockPermissions.current = new Set([AccessPermissionKey.ASSURANCE_TICKETS_MANAGE]);
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByText('No tienes acceso a los tickets')).toBeInTheDocument();
    expect(screen.getByText('No tienes acceso a las visitas')).toBeInTheDocument();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
  });

  it('§4 el error de tickets no rompe Visitas y «Reintentar» vuelve a consultar', async () => {
    const user = userEvent.setup();
    (assuranceApi.tickets.list as jest.Mock)
      .mockRejectedValueOnce(new Error('caído'))
      .mockResolvedValueOnce({ data: [openSoon] });
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByText('No fue posible cargar los tickets')).toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: /^Ver detalle de visita: / })).toHaveLength(
      2,
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(ticketButtons()).toHaveLength(1));
  });

  it('§4 el error de visitas no rompe Tickets', async () => {
    (wfmApi.visitRequests.list as jest.Mock).mockRejectedValue(new Error('caído'));
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByText('No fue posible cargar las visitas')).toBeInTheDocument();
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));
  });

  it('§4 vacío de tickets conserva su mensaje', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(await screen.findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
  });

  it('§4 suscriptor con datos bloqueados: la pestaña no pinta nada ni consulta', () => {
    const { container } = render(
      <SubscriberSupportTab subscriber={{ ...subscriber, privacyRestricted: true }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
    expect(wfmApi.events.list).not.toHaveBeenCalled();
  });

  // §5 Crear ticket desde la ficha
  it('§5 «Crear ticket» solo con permiso de gestión', async () => {
    mockPermissions.current = new Set([AccessPermissionKey.ASSURANCE_TICKETS_READ]);
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Crear ticket' })).not.toBeInTheDocument();
  });

  it('§5 crear ticket abre un diálogo vinculado al suscriptor y crea con su id', async () => {
    const user = userEvent.setup();
    (assuranceApi.tickets.create as jest.Mock).mockResolvedValue(
      ticket({ id: 't-new', ticketNumber: 'TK-2026-0704', subject: 'Nuevo sintético' }),
    );
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(ticketButtons()).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Crear ticket' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/Ada Sintética/).length).toBeGreaterThan(0);
    await user.type(within(dialog).getByLabelText(/^Asunto/), 'Nuevo sintético');
    await user.click(within(dialog).getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() =>
      expect(assuranceApi.tickets.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Nuevo sintético', requesterRefId: subscriber.id }),
      ),
    );
    expect(await screen.findByText(/Ticket creado/)).toBeInTheDocument();
    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
  });
});
