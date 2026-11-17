import { fireEvent, render, screen, within } from '@testing-library/react';
import { SlaBreachStatus, TicketPriority, TicketStatus, TicketType } from '@iwana/shared';
import { TicketListItem, type TicketListItemTicket } from './TicketListItem';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');

function item(overrides: Partial<TicketListItemTicket> = {}): TicketListItemTicket {
  return {
    id: 't-1',
    ticketNumber: 'TK-2026-0001',
    subject: 'Sin conexión en la sede',
    status: TicketStatus.OPEN,
    priority: TicketPriority.HIGH,
    type: TicketType.CUSTOMER_INCIDENT,
    slaBreachStatus: SlaBreachStatus.OK,
    createdAt: '2026-11-12T10:00:00.000Z',
    ...overrides,
  };
}

function renderItem(props: Partial<Parameters<typeof TicketListItem>[0]> = {}) {
  const onOpen = jest.fn();
  render(
    <ul>
      <TicketListItem
        ticket={item()}
        assigneeLabel="Numa Patrón"
        slaDeadline={null}
        now={NOW}
        onOpen={onOpen}
        {...props}
      />
    </ul>,
  );
  return { onOpen, row: screen.getByRole('button') };
}

describe('TicketListItem (spec §4, dictamen §5.4)', () => {
  it('es un único botón con el nombre accesible de §4', () => {
    const { row } = renderItem({ ticket: item({ attachmentCount: 2 }) });
    expect(row).toHaveAccessibleName(
      'Abrir ticket TK-2026-0001: Sin conexión en la sede, Abierto, prioridad alta, con 2 adjuntos',
    );
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
  });

  it('pinta número, asunto, estado, prioridad, tipo, responsable y fecha de apertura', () => {
    const { row } = renderItem();
    expect(within(row).getByText('TK-2026-0001')).toBeInTheDocument();
    expect(within(row).getByText('Sin conexión en la sede')).toBeInTheDocument();
    expect(within(row).getByText('Abierto')).toBeInTheDocument();
    expect(within(row).getByText('Alta')).toBeInTheDocument();
    expect(within(row).getByText('Incidente de cliente')).toBeInTheDocument();
    expect(within(row).getByText('Numa Patrón')).toBeInTheDocument();
    expect(within(row).getByText(/^Abierto \d/)).toBeInTheDocument();
    expect(row).not.toHaveTextContent('Sin responsable');
  });

  it('plazo pendiente: «Vence …»; vencido: texto y nombre accesible, no solo color', () => {
    const { row } = renderItem({ slaDeadline: Date.parse('2026-11-18T14:00:00.000Z') });
    expect(within(row).getByText(/^Vence /)).toBeInTheDocument();
    expect(row).not.toHaveAccessibleName(/vencido/);
  });

  it('vencido hace dos horas se dice en la fila y en el nombre', () => {
    const { row } = renderItem({
      ticket: item({ slaBreachStatus: SlaBreachStatus.RESOLUTION_BREACHED }),
      slaDeadline: NOW - 2 * 60 * 60 * 1000,
    });
    expect(within(row).getByText('Vencido hace 2 h')).toBeInTheDocument();
    expect(row).toHaveAccessibleName(/, vencido$/);
  });

  it('el plazo pasado sin estado vencido no se dice vencido: manda slaBreachStatus (P3)', () => {
    const { row } = renderItem({ slaDeadline: NOW - 60 * 60 * 1000 });
    expect(row).not.toHaveAccessibleName(/vencido/);
    expect(within(row).queryByText(/^Vencido/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/^Vence /)).not.toBeInTheDocument();
    expect(within(row).getByText(/^Plazo pasado el /)).toBeInTheDocument();
  });

  it('antecede el nombre del responsable con «Responsable» para lectores de pantalla', () => {
    const { row } = renderItem();
    expect(within(row).getByText('Responsable:')).toHaveClass('sr-only');
  });

  it('muestra el indicador de trabajo de campo con texto', () => {
    const { row } = renderItem({ fieldWork: { kind: 'visit', label: 'Visita solicitada' } });
    expect(within(row).getByText('Visita solicitada')).toBeInTheDocument();
  });

  it('clip de adjuntos solo con adjuntos', () => {
    const { row } = renderItem({ ticket: item({ attachmentCount: 3 }) });
    expect(within(row).getByTestId('ticket-attachment-clip')).toHaveTextContent('Con 3 adjuntos');
  });

  it('no muestra la descripción y abre con el botón como origen del foco', () => {
    const { row, onOpen } = renderItem();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(row);
  });
});
