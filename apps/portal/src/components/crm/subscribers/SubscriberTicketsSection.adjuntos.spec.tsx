import { render, screen, within } from '@testing-library/react';
import { TicketPriority, TicketStatus } from '@iwana/shared';
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

function ticket(id: string, ticketNumber: string, attachmentCount?: number): AssuranceTicket {
  return {
    id,
    ticketNumber,
    tenantId: 'tenant-a',
    type: 'CUSTOMER_INCIDENT',
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: 'PORTAL',
    subject: `Caso ${ticketNumber}`,
    description: null,
    requesterType: 'SUBSCRIBER',
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
    slaBreachStatus: 'OK',
    fieldDecision: 'NOT_REQUIRED',
    workOrderId: null,
    createdByUserId: 'user-a',
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    ...(attachmentCount === undefined ? {} : { attachmentCount }),
  } as AssuranceTicket;
}

describe('SubscriberTicketsSection — clip de adjuntos (criterio 4)', () => {
  it('marca con un clip y texto accesible solo los tickets con adjuntos', async () => {
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({
      data: [
        ticket('t1', 'TK-1', 3),
        ticket('t2', 'TK-2', 0),
        ticket('t3', 'TK-3'),
        ticket('t4', 'TK-4', 1),
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

    const withThree = await screen.findByRole('button', {
      name: 'Abrir ticket TK-1: Caso TK-1, con 3 adjuntos',
    });
    expect(within(withThree).getByTestId('ticket-attachment-clip')).toHaveTextContent(
      'Con 3 adjuntos',
    );
    expect(
      screen.getByRole('button', { name: 'Abrir ticket TK-4: Caso TK-4, con 1 adjunto' }),
    ).toBeInTheDocument();

    for (const name of ['Abrir ticket TK-2: Caso TK-2', 'Abrir ticket TK-3: Caso TK-3']) {
      const row = screen.getByRole('button', { name });
      expect(within(row).queryByTestId('ticket-attachment-clip')).not.toBeInTheDocument();
    }
    expect(screen.getAllByTestId('ticket-attachment-clip')).toHaveLength(2);
  });
});
