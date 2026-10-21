import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TicketStatus, TicketPriority } from '@iwana/shared';
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

    const list = await screen.findByRole('list', { name: 'Tickets vinculados' });
    const labels = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Abrir ticket TK-1001: TK-1001',
      'Abrir ticket TK-1002: TK-1002',
      'Abrir ticket TK-1003: TK-1003',
      'Abrir ticket TK-1004: TK-1004',
    ]);
    expect(assuranceApi.tickets.list).toHaveBeenCalledWith({
      subscriberId: subscriber.id,
      limit: 100,
    });
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
});
