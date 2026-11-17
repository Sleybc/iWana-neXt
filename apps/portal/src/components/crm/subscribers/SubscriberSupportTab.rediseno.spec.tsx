/**
 * Rediseño de la pestaña Soporte (docs/specs/2026-11-17-mod05-pestana-soporte-rediseno-ux.md),
 * bloques T y V del plan: franja, filtros en URL, búsqueda local, responsable, estados de §7,
 * aviso descartable, foco al cerrar el detalle y Visitas compacta.
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
  WfmWorkType,
} from '@iwana/shared';
import type { AssuranceTicket, SubscriberRecord, WfmScheduleEvent } from '@/lib/api-client';
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

const READ = AccessPermissionKey.ASSURANCE_TICKETS_READ;
const MANAGE = AccessPermissionKey.ASSURANCE_TICKETS_MANAGE;
const VISITS = AccessPermissionKey.WFM_SCHEDULE_READ;

function ticket(
  overrides: Partial<AssuranceTicket> & Pick<AssuranceTicket, 'id'>,
): AssuranceTicket {
  return {
    tenantId: 'tenant-a',
    ticketNumber: `TK-${overrides.id}`,
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: `Asunto ${overrides.id}`,
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
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const critical = ticket({
  id: 'a',
  subject: 'Caída total',
  priority: TicketPriority.CRITICAL,
  assignedUserId: 'user-1',
  description: 'Sin servicio en la sede norte',
});
const overdue = ticket({
  id: 'b',
  subject: 'Lentitud',
  slaResolveByAt: '2026-01-01T10:00:00.000Z',
  slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED,
});
const low = ticket({ id: 'c', subject: 'Cambio de clave', priority: TicketPriority.LOW });
const closed = ticket({
  id: 'd',
  subject: 'Antiguo',
  status: TicketStatus.CLOSED,
  closedAt: '2026-11-01T10:00:00.000Z',
});

const numa = { id: 'user-1', firstName: 'Numa', lastName: 'Patrón', email: 'numa@example.invalid' };

function rows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Tickets vinculados' })).getAllByRole('button');
}

describe('SubscriberSupportTab — rediseño (spec 2026-11-17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/x?tab=soporte');
    mockPermissions.current = new Set([READ, MANAGE, VISITS]);
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [closed, low, overdue, critical],
    });
    (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
      [critical, overdue, low, closed].find((item) => item.id === id),
    );
    (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue([]);
    (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [numa], meta: { nextCursor: null } });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({ items: [] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('consulta la lista una vez al montar y los usuarios en paralelo (H15, CA-4)', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1);
    expect(usersApi.list).toHaveBeenCalledTimes(1);
    expect(rows()[1]).toHaveTextContent('Numa Patrón');
  });

  it('orden: vencido, luego prioridad; la descripción no va en la fila', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual([
      'Abrir ticket TK-b: Lentitud, Abierto, prioridad normal, vencido',
      'Abrir ticket TK-a: Caída total, Abierto, prioridad crítica',
      'Abrir ticket TK-c: Cambio de clave, Abierto, prioridad baja',
    ]);
    expect(screen.queryByText('Sin servicio en la sede norte')).not.toBeInTheDocument();
  });

  it('solo con lectura de tickets: no consulta usuarios y dice «Responsable no disponible»', async () => {
    mockPermissions.current = new Set([READ]);
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(usersApi.list).not.toHaveBeenCalled();
    expect(rows()[1]).toHaveTextContent('Responsable no disponible');
    expect(screen.queryByText(/Sin responsable/)).not.toBeInTheDocument();
  });

  it('con lectura de usuarios (sin gestión) resuelve el nombre al montar', async () => {
    mockPermissions.current = new Set([READ, AccessPermissionKey.USERS_READ]);
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows()[1]).toHaveTextContent('Numa Patrón');
  });

  it('franja: «Vencidos» se oculta sin políticas de plazo (D5)', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Ver 3 tickets abiertos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tickets vencidos/ })).not.toBeInTheDocument();
  });

  it('franja con políticas: «Vencidos» filtra, va a la URL y lleva el foco a la lista', async () => {
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([{ id: 'p-1' }]);
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    const figure = await screen.findByRole('button', { name: 'Ver 1 tickets vencidos' });
    await user.click(figure);
    expect(rows()).toHaveLength(1);
    expect(window.location.search).toContain('tickets=vencidos');
    expect(window.location.search).toContain('tab=soporte');
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Tickets vinculados' })).toHaveFocus(),
    );
  });

  it('chip «Resueltos y cerrados» y filtros de la URL al cargar (CA-7)', async () => {
    window.history.replaceState(
      null,
      '',
      '/dashboard/crm/subscribers/x?tab=soporte&tickets=todos&prioridad=LOW',
    );
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveAccessibleName(/^Abrir ticket TK-c:/);
    const group = screen.getByRole('group', { name: 'Filtrar tickets' });
    expect(
      within(group).getByRole('button', { name: 'Resueltos y cerrados (1)' }),
    ).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Todos (4)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('la búsqueda filtra en local, nunca va a la URL, y sin resultados ofrece limpiar', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));

    const search = screen.getByLabelText('Buscar tickets por número o asunto');
    await user.type(search, 'caída');
    expect(rows()).toHaveLength(1);
    await user.type(search, ' inexistente');
    expect(screen.getByText('Ningún ticket coincide')).toBeInTheDocument();
    expect(window.location.search).not.toMatch(/ca%C3%ADda|caída|inexistente/);
    expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(rows()).toHaveLength(3);
    expect(search).toHaveValue('');
  });

  it('sin plazo en ningún abierto muestra la línea única de §7', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [critical, low] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(
      await screen.findByText(
        'Estos tickets no tienen plazo de atención; se ordenan por prioridad.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sin vencimiento registrado/)).not.toBeInTheDocument();
  });

  it('abiertos en cero con un filtro explícito: «No hay tickets abiertos»', async () => {
    window.history.replaceState(null, '', '/x?tab=soporte&tickets=abiertos');
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [closed] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(await screen.findByText('No hay tickets abiertos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resueltos y cerrados (1)' })).toBeInTheDocument();
  });

  it('con más tickets que los cargados avisa del total (D4, sin enlace)', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [critical],
      meta: { total: 140 },
    });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(
      await screen.findByText('Se muestran 1 de 140 tickets, los más urgentes primero.'),
    ).toBeInTheDocument();
  });

  it('el aviso de éxito se anuncia en status, se puede cerrar y resalta el ticket nuevo (CA-8)', async () => {
    const created = ticket({ id: 'new', subject: 'Nuevo' });
    (assuranceApi.tickets.create as jest.Mock).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [closed, low, overdue, critical, created],
    });

    await user.click(screen.getByRole('button', { name: 'Crear ticket' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Asunto/), 'Nuevo');
    await user.click(within(dialog).getByRole('button', { name: 'Crear ticket' }));

    const status = await screen.findByText('Ticket creado y vinculado al suscriptor');
    expect(status.closest('[role="status"]')).not.toBeNull();
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(screen.getByRole('button', { name: /^Abrir ticket TK-new:/ })).toHaveClass(
      'bg-iwana-surface-soft',
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Ticket creado y vinculado al suscriptor')).not.toBeInTheDocument();
  });

  it('cerrar el detalle devuelve el foco a la fila que lo abrió (CA-11)', async () => {
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    const row = rows()[1]!;
    await user.click(row);
    await screen.findByRole('dialog', { name: 'TK-a' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('si la fila salió del filtro, foco al encabezado «Tickets» con anuncio (CA-11)', async () => {
    const resolvedA = {
      ...critical,
      status: TicketStatus.RESOLVED,
      resolvedAt: '2026-11-17T10:00:00.000Z',
    };
    (assuranceApi.tickets.submitComment as jest.Mock).mockResolvedValue({
      id: 'c-1',
      ticketId: 'a',
      body: 'Listo',
      isInternal: false,
      authorUserId: 'user-1',
      createdAt: '2026-11-17T10:00:00.000Z',
      attachments: [],
    });
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    await user.click(rows()[1]!);
    await screen.findByRole('dialog', { name: 'TK-a' });

    // Tras la acción, el ticket queda resuelto y sale del filtro «Abiertos».
    (assuranceApi.tickets.get as jest.Mock).mockResolvedValue(resolvedA);
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [closed, low, overdue, resolvedA],
    });
    await user.type(await screen.findByLabelText('Nuevo comentario'), 'Listo');
    await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));
    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Abrir ticket TK-a:/ })).not.toBeInTheDocument(),
    );

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tickets' })).toHaveFocus());
    expect(screen.getByText('El ticket TK-a pasó a resuelto')).toBeInTheDocument();
  });

  it('Visitas compacta: vacío de una línea y cifra «Visitas próximas» en la franja', async () => {
    const event = {
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
    } as unknown as WfmScheduleEvent;
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [event] });
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    const figure = await screen.findByRole('button', { name: 'Ver 1 visitas próximas' });
    await user.click(figure);
    expect(screen.getByRole('heading', { name: 'Visitas' })).toHaveFocus();
  });

  it('sin visitas, la sección es una línea', async () => {
    render(<SubscriberSupportTab subscriber={subscriber} />);
    expect(
      await screen.findByText(
        'Este suscriptor no tiene visitas propias. Las visitas de un ticket se ven en el ticket.',
      ),
    ).toBeInTheDocument();
  });
});
