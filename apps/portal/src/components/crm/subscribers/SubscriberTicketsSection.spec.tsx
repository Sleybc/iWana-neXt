import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SlaBreachStatus, TicketStatus, TicketPriority } from '@iwana/shared';
import type { AssuranceTicket, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import { SubscriberTicketsSection } from './SubscriberTicketsSection';

jest.mock('@/lib/api-client', () => ({
  assuranceApi: { tickets: { list: jest.fn() } },
}));

const subscriber = {
  id: '8d4943a8-a7d8-4053-942f-a99a0dd16603',
  privacyRestricted: false,
} as SubscriberRecord;

function ticket(
  overrides: Partial<AssuranceTicket> &
    Pick<AssuranceTicket, 'id' | 'ticketNumber' | 'status' | 'slaResolveByAt'>,
): AssuranceTicket {
  return {
    tenantId: 'tenant-a',
    type: 'CUSTOMER_INCIDENT',
    priority: TicketPriority.NORMAL,
    source: 'PORTAL',
    subject: overrides.ticketNumber,
    description: null,
    requesterType: 'SUBSCRIBER',
    requesterRefId: subscriber.id,
    subjectType: null,
    subjectRefId: null,
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: 'OK',
    fieldDecision: 'NOT_REQUIRED',
    workOrderId: null,
    createdByUserId: 'user-a',
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const onOpenTicket = jest.fn();

describe('SubscriberTicketsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onOpenTicket.mockReset();
    window.history.replaceState(null, '', '/');
  });

  it('no consulta Assurance sin permiso de lectura', () => {
    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead={false}
        refreshKey={0}
        onOpenTicket={onOpenTicket}
      />,
    );

    expect(screen.getByText('No tienes acceso a los tickets')).toBeInTheDocument();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
  });

  it('ordena abiertos por SLA y después tickets resueltos recientes', async () => {
    const soon = ticket({
      id: 'ticket-soon',
      ticketNumber: 'TK-1001',
      status: TicketStatus.OPEN,
      slaResolveByAt: '2026-10-20T12:00:00.000Z',
    });
    const later = ticket({
      id: 'ticket-later',
      ticketNumber: 'TK-1002',
      status: TicketStatus.IN_PROGRESS,
      slaResolveByAt: '2026-10-21T12:00:00.000Z',
    });
    const resolved = ticket({
      id: 'ticket-resolved',
      ticketNumber: 'TK-1003',
      status: TicketStatus.RESOLVED,
      slaResolveByAt: null,
      closedAt: '2026-10-20T10:00:00.000Z',
    });
    const closed = ticket({
      id: 'ticket-closed',
      ticketNumber: 'TK-1004',
      status: TicketStatus.CLOSED,
      slaResolveByAt: null,
      closedAt: '2026-10-19T10:00:00.000Z',
    });
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [closed, later, resolved, soon],
    });

    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={onOpenTicket}
      />,
    );

    // Con tickets abiertos, la lista arranca filtrada en «Abiertos» (2026-11-16).
    let list = await screen.findByRole('list', { name: 'Tickets vinculados' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Abrir ticket TK-1001: TK-1001, Abierto, prioridad normal',
      'Abrir ticket TK-1002: TK-1002, En progreso, prioridad normal',
    ]);
    expect(screen.getByRole('button', { name: 'Abiertos (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Todos (4)' }));
    list = screen.getByRole('list', { name: 'Tickets vinculados' });
    const labels = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Abrir ticket TK-1001: TK-1001, Abierto, prioridad normal',
      'Abrir ticket TK-1002: TK-1002, En progreso, prioridad normal',
      'Abrir ticket TK-1003: TK-1003, Resuelto, prioridad normal',
      'Abrir ticket TK-1004: TK-1004, Cerrado, prioridad normal',
    ]);
    expect(assuranceApi.tickets.list).toHaveBeenCalledWith({
      subscriberId: subscriber.id,
      limit: 100,
      order: 'urgency',
    });
  });

  it('sin abiertos muestra todos; cada fila lleva apertura, responsable y resumen, sin SLA en cerrados', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [
        ticket({
          id: 'ticket-imported',
          ticketNumber: 'UISP-25790',
          subject: 'CAMBIO DE ONU',
          status: TicketStatus.CLOSED,
          slaResolveByAt: null,
          closedAt: '2026-08-03T10:00:00.000Z',
          createdAt: '2026-06-24T20:13:00.000Z',
          assignedUserId: 'user-1',
          description: 'El usuario solicita un cambio de ONU por intermitencia.',
        }),
      ],
    });

    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={onOpenTicket}
        users={[
          {
            id: 'user-1',
            firstName: 'Numa',
            lastName: 'Patrón',
            email: 'numa@example.invalid',
          } as never,
        ]}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Tickets vinculados' });
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Spec 2026-11-17 §4: «Abierto {fecha}» y el nombre sin prefijo. Spec 2026-11-20 §3 D: la
    // descripción ya va en la fila, en una línea truncada.
    expect(list).toHaveTextContent('Abierto 24/06/2026');
    expect(list).toHaveTextContent('Numa Patrón');
    expect(
      within(list).getByText('El usuario solicita un cambio de ONU por intermitencia.'),
    ).toHaveClass('line-clamp-1');
    expect(list).not.toHaveTextContent('Vence');
    expect(list).not.toHaveTextContent('SLA');
  });

  it('P2 §3 F: sin descripción, el relato es el extracto del primer comentario y se cuentan los comentarios', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [
        ticket({
          id: 'ticket-excerpt',
          ticketNumber: 'TK-2001',
          status: TicketStatus.OPEN,
          slaResolveByAt: null,
          subject: 'Lentitud',
          description: null,
          firstCommentExcerpt: 'El cliente llamó dos veces',
          commentCount: 2,
        }),
      ],
    });
    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={jest.fn()}
      />,
    );
    const list = await screen.findByRole('list', { name: 'Tickets vinculados' });
    expect(within(list).getByText('El cliente llamó dos veces')).toHaveClass('line-clamp-1');
    expect(within(list).getByText('Con 2 comentarios')).toBeInTheDocument();
  });

  it('plazo pasado sin estado vencido no se cuenta como vencido (P3: manda slaBreachStatus)', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [
        ticket({
          id: 'a',
          ticketNumber: 'TK-A',
          status: TicketStatus.OPEN,
          slaResolveByAt: '2026-01-01T00:00:00.000Z',
        }),
        ticket({
          id: 'b',
          ticketNumber: 'TK-B',
          status: TicketStatus.OPEN,
          slaResolveByAt: '2099-01-01T00:00:00.000Z',
          slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED,
        }),
      ],
    });
    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={onOpenTicket}
        slaPoliciesConfigured
      />,
    );
    expect(
      await screen.findByRole('button', { name: 'Ver 1 tickets vencidos' }),
    ).toBeInTheDocument();
  });

  it('paso 2: nombre del API sin usuarios, fecha de visita en la fila y total del servidor (CA-15, CA-16)', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [
        ticket({
          id: 'a',
          ticketNumber: 'TK-A',
          status: TicketStatus.FIELD_SERVICE_REQUESTED,
          slaResolveByAt: null,
          assignedUserId: 'user-1',
          assignedUserDisplayName: 'Numa Patrón',
          activeVisit: {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'SCHEDULED',
            windowKind: 'SCHEDULED',
            windowStartAt: new Date(2026, 10, 18, 8, 0).toISOString(),
            windowEndAt: new Date(2026, 10, 18, 12, 0).toISOString(),
            scheduleEventId: null,
          },
          executionOrder: null,
        } as never),
      ],
      meta: { total: 140 },
    });
    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={onOpenTicket}
      />,
    );
    const list = await screen.findByRole('list', { name: 'Tickets vinculados' });
    expect(list).toHaveTextContent('Numa Patrón');
    expect(list).toHaveTextContent('Visita 18 nov, 8:00–12:00');
    expect(list).not.toHaveTextContent('Visita solicitada');
    expect(
      screen.getByText('Se muestran 1 de 140 tickets, los más urgentes primero.'),
    ).toBeInTheDocument();
  });

  it('permite reintentar solo la consulta de tickets y presenta el vacío definitivo', async () => {
    (assuranceApi.tickets.list as jest.Mock)
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce({ data: [] });

    render(
      <SubscriberTicketsSection
        subscriber={subscriber}
        canRead
        refreshKey={0}
        onOpenTicket={onOpenTicket}
      />,
    );

    expect(await screen.findByText('No fue posible cargar los tickets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
  });
  it('consulta una sola vez por clave aunque StrictMode repita el efecto (CA-SO-04)', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [] });

    const { rerender } = render(
      <StrictMode>
        <SubscriberTicketsSection
          subscriber={subscriber}
          canRead
          refreshKey={0}
          onOpenTicket={onOpenTicket}
        />
      </StrictMode>,
    );

    expect(await screen.findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
    expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1);

    rerender(
      <StrictMode>
        <SubscriberTicketsSection
          subscriber={subscriber}
          canRead
          refreshKey={1}
          onOpenTicket={onOpenTicket}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
  });
});
