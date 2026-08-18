import type { ChangeEvent, ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TicketPriority, TicketStatus } from '@iwana/shared';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  return {
    ...actual,
    Select: ({
      id,
      label,
      value,
      onChange,
      options = [],
      placeholder,
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
      placeholder?: string;
    }) => (
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} aria-label={label} value={value} onChange={onChange}>
          <option value="">{placeholder ?? 'Selecciona'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ),
  };
});

const baseTicket = {
  id: 'ticket-1',
  ticketNumber: 'TK-001',
  subject: 'Sin servicio',
  status: TicketStatus.OPEN,
  priority: TicketPriority.NORMAL,
  type: 'INCIDENT',
  queueName: 'SUPPORT_L1',
  assignedUserId: null,
  slaBreachStatus: 'OK',
  requesterRefId: 'req-1',
  subjectRefId: 'subj-1',
  updatedAt: '2026-07-24T12:00:00.000Z',
} as unknown as AssuranceTicket;

const defaultFilters: ListAssuranceTicketsParams = { page: 1, limit: 20 };

function renderTable(overrides: Partial<ComponentProps<typeof AssuranceTicketsTable>> = {}) {
  const props = {
    tickets: [baseTicket],
    total: 1,
    isLoading: false,
    refreshing: false,
    randomAccess: true,
    page: 1,
    pageCount: 1,
    pageSize: 20,
    from: 1,
    to: 1,
    hasMore: false,
    filters: defaultFilters,
    searchValue: '',
    assigneeLabelById: new Map<string, string>(),
    onFiltersChange: jest.fn(),
    onSearchChange: jest.fn(),
    onClearFilters: jest.fn(),
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
    onLoadMore: jest.fn(),
    onOpenTicket: jest.fn(),
    onOpenCreate: jest.fn(),
    canManage: true,
    ...overrides,
  };

  const view = render(<AssuranceTicketsTable {...props} />);
  return { props, ...view };
}

describe('AssuranceTicketsTable ADR-065', () => {
  it('CA-PAG-08: empty de primera vez con CTA Nuevo ticket', () => {
    const { props } = renderTable({
      tickets: [],
      total: 0,
    });

    expect(screen.getByText('Aún no hay tickets')).toBeInTheDocument();
    expect(
      screen.getByText(/crea el primer ticket para operar la mesa de ayuda/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo ticket' })[0]!);
    expect(props.onOpenCreate).toHaveBeenCalledTimes(1);
  });

  it('CA-PAG-08: empty de primera vez sin CTA de alta si no puede gestionar', () => {
    renderTable({
      tickets: [],
      total: 0,
      canManage: false,
    });

    expect(screen.getByText('Aún no hay tickets')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo ticket' })).not.toBeInTheDocument();
  });

  it('CA-PAG-08: empty con filtros activos y CTA Limpiar filtros', () => {
    const { props } = renderTable({
      tickets: [],
      total: 0,
      filters: { ...defaultFilters, status: TicketStatus.OPEN },
      searchValue: 'sin-match',
    });

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tickets')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('ADR-065: con randomAccess muestra pie numerado (sin Cargar más)', () => {
    renderTable({
      total: 45,
      page: 1,
      pageCount: 3,
      from: 1,
      to: 20,
      pageSize: 20,
      randomAccess: true,
      hasMore: true,
    });

    expect(screen.getAllByText(/Mostrando 1\u201320 de 45 tickets/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /paginación/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar en esta página')).toBeInTheDocument();
    expect(screen.getByLabelText('Filas por página')).toBeInTheDocument();
  });

  it('ADR-065: sin randomAccess conserva Cargar más', () => {
    const { props } = renderTable({
      total: 45,
      page: 1,
      pageCount: 3,
      from: 1,
      to: 20,
      randomAccess: false,
      hasMore: true,
    });

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });
});
