import { fireEvent, render, screen, within } from '@testing-library/react';
import { SlaBreachStatus, TicketPriority, TicketStatus } from '@iwana/shared';
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

function ticket(overrides: Partial<AssuranceTicket> & { id: string }): AssuranceTicket {
  return {
    tenantId: 'tenant-a',
    ticketNumber: `TK-${overrides.id}`,
    type: 'CUSTOMER_INCIDENT',
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: 'PORTAL',
    subject: `Asunto ${overrides.id}`,
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
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const open = ticket({ id: '1', priority: TicketPriority.HIGH, subject: 'Sin servicio' });
const overdue = ticket({
  id: '2',
  slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED,
  subject: 'Lento',
});
const closed = ticket({ id: '3', status: TicketStatus.CLOSED, subject: 'Cambio de ONU' });

async function renderDense(
  tickets: AssuranceTicket[],
  props: Partial<Parameters<typeof SubscriberTicketsSection>[0]> = {},
) {
  (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: tickets });
  render(
    <SubscriberTicketsSection
      subscriber={subscriber}
      canRead
      refreshKey={0}
      onOpenTicket={jest.fn()}
      dense
      slaPoliciesConfigured
      upcomingVisits={2}
      onShowVisits={jest.fn()}
      actions={
        <button type="button" aria-label="Crear ticket">
          Crear
        </button>
      }
      {...props}
    />,
  );
  await screen.findByRole('group', { name: 'Filtrar tickets' });
}

describe('SubscriberTicketsSection — cabecera de la vista dividida (spec v1.3 bloque K)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('estado en tres opciones con rótulo corto, conteo y nombre accesible completo', async () => {
    await renderDense([open, overdue, closed]);

    const queues = screen.getByRole('group', { name: 'Filtrar tickets' });
    expect(within(queues).getAllByRole('button')).toHaveLength(3);
    expect(within(queues).getByRole('button', { name: 'Abiertos (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const closedChip = within(queues).getByRole('button', { name: 'Resueltos y cerrados (1)' });
    expect(closedChip).toHaveTextContent('Cerrados');
    expect(within(queues).getByRole('button', { name: 'Todos (3)' })).toBeInTheDocument();

    fireEvent.click(closedChip);
    expect(window.location.search).toContain('tickets=cerrados');
    expect(screen.getByText('Cambio de ONU')).toBeInTheDocument();
    expect(screen.queryByText('Sin servicio')).not.toBeInTheDocument();
  });

  it('no repite las cifras «Abiertos» ni «Visitas próximas» y muestra el total junto al título', async () => {
    await renderDense([open, overdue, closed]);

    expect(screen.queryByRole('group', { name: 'Resumen de tickets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /visitas próximas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tickets abiertos/ })).not.toBeInTheDocument();
    expect(screen.getByText('3 tickets en total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear ticket' })).toBeInTheDocument();
  });

  it('«vencidos» solo aparece cuando hay alguno y filtra la lista', async () => {
    await renderDense([open, overdue, closed]);

    const overdueChip = screen.getByRole('button', { name: 'Ver 1 ticket vencido' });
    fireEvent.click(overdueChip);
    expect(window.location.search).toContain('tickets=vencidos');
    expect(screen.getByText('Lento')).toBeInTheDocument();
    expect(screen.queryByText('Sin servicio')).not.toBeInTheDocument();
  });

  it('sin vencidos no hay chip de vencidos', async () => {
    await renderDense([open, closed]);

    expect(screen.queryByRole('button', { name: /vencido/ })).not.toBeInTheDocument();
  });

  it('la búsqueda se abre desde su icono, filtra y se cierra limpiando el texto', async () => {
    await renderDense([open, overdue, closed]);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tickets' }));
    const field = screen.getByRole('searchbox', { name: 'Buscar tickets por número o asunto' });
    expect(field).toHaveFocus();

    fireEvent.change(field, { target: { value: 'lento' } });
    expect(screen.getByText('Lento')).toBeInTheDocument();
    expect(screen.queryByText('Sin servicio')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la búsqueda' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('Sin servicio')).toBeInTheDocument();
  });

  it('prioridad y tipo viven en el menú de filtros, fuera de la cabecera', async () => {
    await renderDense([open, overdue, closed]);

    expect(screen.queryByRole('combobox', { name: 'Prioridad' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.getByRole('combobox', { name: 'Prioridad' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('el menú cuenta los filtros activos y cada uno se quita desde su chip', async () => {
    window.history.replaceState(null, '', `/?prioridad=${TicketPriority.HIGH}`);
    await renderDense([open, overdue, closed]);

    expect(screen.getByRole('button', { name: 'Filtros, 1 activo' })).toBeInTheDocument();
    expect(screen.getByText('Sin servicio')).toBeInTheDocument();
    expect(screen.queryByText('Lento')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Prioridad: Alta' }));
    expect(window.location.search).not.toContain('prioridad=');
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
    expect(screen.getByText('Lento')).toBeInTheDocument();
  });

  it('un filtro que llega por la URL se ve como chip activo sin abrir el menú', async () => {
    window.history.replaceState(null, '', `/?prioridad=${TicketPriority.HIGH}`);
    await renderDense([open, overdue, closed]);

    expect(
      screen.getByRole('button', { name: 'Quitar el filtro Prioridad: Alta' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Prioridad' })).not.toBeInTheDocument();
  });
});
