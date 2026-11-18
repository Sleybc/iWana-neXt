// P2 (spec 2026-11-18 §3 G–H, contrato ExecutionOrderDetail v1.8): cliente y
// enlaces en la cabecera de la consola. La regla de nulo la aplica el servidor:
// cada dato o enlace existe solo si su campo llega.
import { render, screen, within } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';

const SUBSCRIBER_ID = '6f1c2b3a-4d5e-4f60-8a71-92b3c4d5e6f7';
const TICKET_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const EVENT_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

function order(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  return {
    id: 'eo-p2',
    number: 'OTE-P2-001',
    version: 1,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: null,
    schedule: {
      eventId: EVENT_ID,
      window: { startAt: '2026-11-18T15:00:00', endAt: '2026-11-18T17:00:00' },
    },
    site: { id: 'site-1', label: 'Sitio de la orden', address: 'Dirección del sitio' },
    completion: { progress: 0, completed: 0, total: 0 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [],
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    subscriber: {
      id: SUBSCRIBER_ID,
      displayName: 'Titular Ficticio',
      serviceAddress: 'Calle 10 # 20 - 30',
      municipality: 'Municipio Ficticio',
    },
    sourceTicket: { id: TICKET_ID, number: 'TCK-20261118-001' },
    visit: { scheduleEventId: EVENT_ID },
    ...overrides,
  } as ExecutionOrderDetailResponse;
}

function renderConsole(value: ExecutionOrderDetailResponse) {
  render(<ExecutionOrderSummary order={value} variant="console" canOpen={false} hideProgress />);
  return screen.getByRole('region', { name: 'Resumen de la orden de trabajo' });
}

describe('Cabecera de la consola — cliente y enlaces (P2)', () => {
  it('con todos los campos: nombre enlazado a la ficha, dirección con municipio, ticket y visita', () => {
    const header = renderConsole(order());
    expect(within(header).getByRole('link', { name: 'Titular Ficticio' })).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${SUBSCRIBER_ID}`,
    );
    expect(within(header).getByText('Calle 10 # 20 - 30, Municipio Ficticio')).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Ticket TCK-20261118-001' })).toHaveAttribute(
      'href',
      `/dashboard/assurance/tickets/${TICKET_ID}`,
    );
    expect(within(header).getByRole('link', { name: 'Ver visita en la agenda' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling/agenda?view=day&fromDate=2026-11-18',
    );
    // El número de la orden no se repite en la cabecera (CA-6).
    expect(within(header).queryByText('OTE-P2-001')).toBeNull();
  });

  it('titular null: no hay nombre, dirección ni enlace a la ficha, y no se sustituye por el sitio', () => {
    const header = renderConsole(order({ subscriber: null }));
    expect(within(header).queryByText('Cliente')).toBeNull();
    expect(within(header).queryByText('Dirección')).toBeNull();
    expect(within(header).queryByText('Titular Ficticio')).toBeNull();
    expect(within(header).queryByText(/Calle 10/)).toBeNull();
    expect(within(header).queryByRole('link', { name: /Titular|ficha del suscriptor/ })).toBeNull();
    // El sitio sigue en su propio dato; nunca hace de cliente.
    expect(within(header).getByText('Sitio de la orden')).toBeInTheDocument();
    expect(within(header).getAllByText('Sitio de la orden')).toHaveLength(1);
  });

  it('sin ticket de origen no hay enlace al ticket', () => {
    const header = renderConsole(order({ sourceTicket: null }));
    expect(within(header).queryByRole('link', { name: /^Ticket / })).toBeNull();
    expect(
      within(header).getByRole('link', { name: 'Ver visita en la agenda' }),
    ).toBeInTheDocument();
  });

  it('sin visita no hay enlace a la agenda', () => {
    const header = renderConsole(order({ visit: null }));
    expect(within(header).queryByRole('link', { name: 'Ver visita en la agenda' })).toBeNull();
    expect(
      within(header).getByRole('link', { name: 'Ticket TCK-20261118-001' }),
    ).toBeInTheDocument();
  });

  it('campos ausentes (contrato anterior a v1.8): ninguno de los tres', () => {
    const { subscriber: _s, sourceTicket: _t, visit: _v, ...legacy } = order();
    const header = renderConsole(legacy as ExecutionOrderDetailResponse);
    expect(within(header).queryAllByRole('link')).toHaveLength(0);
    expect(within(header).queryByText('Cliente')).toBeNull();
  });

  it('nombre sin resolver: enlaza la ficha con texto propio; sin dirección no pinta la fila', () => {
    const header = renderConsole(
      order({
        subscriber: {
          id: SUBSCRIBER_ID,
          displayName: null,
          serviceAddress: null,
          municipality: null,
        },
      }),
    );
    expect(within(header).getByRole('link', { name: 'Ver ficha del suscriptor' })).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${SUBSCRIBER_ID}`,
    );
    expect(within(header).queryByText('Dirección')).toBeNull();
  });

  it('un identificador que no es UUID no enlaza', () => {
    const header = renderConsole(
      order({
        subscriber: {
          id: '../admin',
          displayName: 'Titular Ficticio',
          serviceAddress: null,
          municipality: null,
        },
        sourceTicket: { id: 'javascript:alert(1)', number: 'TCK-X' },
        visit: { scheduleEventId: 'no-uuid' },
      }),
    );
    expect(within(header).queryAllByRole('link')).toHaveLength(0);
    expect(within(header).getByText('Titular Ficticio')).toBeInTheDocument();
  });

  it('las variantes fuera de la consola no cambian', () => {
    render(<ExecutionOrderSummary order={order()} variant="full" canOpen={false} />);
    expect(screen.queryByText('Titular Ficticio')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
