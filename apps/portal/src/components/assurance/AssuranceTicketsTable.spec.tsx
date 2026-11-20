import type { ChangeEvent, ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TicketPriority, TicketStatus } from '@iwana/shared';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import { getAssuranceTicketTypeLabel } from './assurance-labels';

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
  it('CA-PAG-08: empty de primera vez con CTA en el contenedor de la cola', () => {
    const { props } = renderTable({
      tickets: [],
      total: 0,
    });

    expect(screen.getByText('Aún no hay tickets')).toBeInTheDocument();
    expect(
      screen.getByText(/crea el primer ticket para operar la mesa de ayuda/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo ticket' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo ticket' }));
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
    // P2 (§3 K): el campo busca en el servidor, ya no filtra la página.
    expect(screen.getByLabelText('Buscar tickets')).toBeInTheDocument();
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

describe('Bandeja paso 1 · tabla (spec 2026-11-18 §3 D, E, G)', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');

  it('D: cinco columnas — Ticket, Estado, Responsable y área, Vence, Actualizado', () => {
    renderTable({ now });
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Ticket', 'Estado', 'Responsable y área', 'Vence', 'Actualizado']);
  });

  it('D: sin «Ver detalle»; el tipo va en la línea del ticket y la fila entera abre', () => {
    const { props } = renderTable({ now });
    expect(screen.queryByRole('button', { name: 'Ver detalle' })).not.toBeInTheDocument();
    const row = screen.getByText('TK-001').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent(getAssuranceTicketTypeLabel(baseTicket.type));
    fireEvent.click(screen.getByText('Sin servicio'));
    expect(props.onOpenTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'ticket-1' }));
  });

  it('D: el estado lleva el de su visita u orden si existe', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          status: TicketStatus.FIELD_SERVICE_REQUESTED,
          executionOrder: { id: 'eo-1', number: 'OE-7', status: 'SCHEDULED' },
        } as unknown as AssuranceTicket,
      ],
    });
    expect(screen.getByText(/Orden OE-7/)).toBeInTheDocument();
  });

  it('E: plazo futuro en tiempo relativo con la fecha exacta como title', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          slaPolicyId: 'sla-1',
          slaResolveByAt: '2026-11-18T15:00:00.000Z',
          slaBreachStatus: 'AT_RISK',
        } as unknown as AssuranceTicket,
      ],
    });
    const due = screen.getByText('Vence en 3 h');
    expect(due.closest('[title]')).toHaveAttribute('title', expect.stringContaining('2026'));
  });

  it('E: plazo pasado dice «Vencido hace …»', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          slaPolicyId: 'sla-1',
          slaResolveByAt: '2026-11-16T12:00:00.000Z',
          slaBreachStatus: 'RESOLUTION_BREACHED',
        } as unknown as AssuranceTicket,
      ],
    });
    expect(screen.getByText('Vencido hace 2 días')).toBeInTheDocument();
  });

  it('CA-5: sin política de plazo dice «Sin plazo», nunca «En tiempo»', () => {
    renderTable({
      now,
      tickets: [{ ...baseTicket, slaPolicyId: null, slaResolveByAt: null } as AssuranceTicket],
    });
    const row = screen.getByText('TK-001').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Sin plazo');
    expect(row).not.toHaveTextContent('En tiempo');
  });

  it('CA-6: «Asignarme» en un ticket sin responsable con permiso de asignación', () => {
    const onAssignToMe = jest.fn();
    renderTable({ now, canManage: true, onAssignToMe });
    fireEvent.click(screen.getByRole('button', { name: 'Asignarme TK-001' }));
    expect(onAssignToMe).toHaveBeenCalledWith(expect.objectContaining({ id: 'ticket-1' }));
    expect(screen.getByText('Sin servicio').closest('tr')).toBeTruthy();
  });

  it('CA-6: sin permiso de asignación no hay «Asignarme»', () => {
    renderTable({ now, canManage: false, onAssignToMe: jest.fn() });
    expect(screen.queryByRole('button', { name: /Asignarme/ })).not.toBeInTheDocument();
  });

  it('CA-6: un ticket con responsable no ofrece «Asignarme»', () => {
    renderTable({
      now,
      onAssignToMe: jest.fn(),
      tickets: [{ ...baseTicket, assignedUserId: 'u-1' } as AssuranceTicket],
    });
    expect(screen.queryByRole('button', { name: /Asignarme/ })).not.toBeInTheDocument();
  });

  it('C: el plazo gana control visible y emite slaBreachStatus', () => {
    const { props } = renderTable({ now });
    fireEvent.change(screen.getByLabelText('Plazo'), { target: { value: 'AT_RISK' } });
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ slaBreachStatus: 'AT_RISK' }),
    );
  });

  it('I: rótulos sin texto de desarrollo; la tabla se llama «Bandeja»', () => {
    renderTable({ now });
    expect(screen.getByRole('table', { name: 'Bandeja' })).toBeInTheDocument();
    expect(screen.queryByText(/empresa autenticada|backend|\/api\/v1|SLA/)).not.toBeInTheDocument();
  });
});

describe('Bandeja P1 · correcciones tras QA1', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');

  function rowOf(ticketNumber: string): HTMLElement {
    return screen.getByText(ticketNumber).closest('tr') as HTMLElement;
  }

  it('Corr. 3 (D): un ticket resuelto con plazo incumplido conserva el resultado del plazo', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          status: TicketStatus.RESOLVED,
          slaPolicyId: 'sla-1',
          slaBreachStatus: 'RESOLUTION_BREACHED',
          resolvedAt: '2026-11-17T10:00:00.000Z',
        } as unknown as AssuranceTicket,
      ],
    });
    expect(rowOf('TK-001')).toHaveTextContent('Resolución vencida');
  });

  it('Corr. 3 (D): un ticket resuelto a tiempo dice «Plazo cumplido», nunca «En tiempo»', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          status: TicketStatus.CLOSED,
          slaPolicyId: 'sla-1',
          slaBreachStatus: 'OK',
        } as unknown as AssuranceTicket,
      ],
    });
    expect(rowOf('TK-001')).toHaveTextContent('Plazo cumplido');
    expect(rowOf('TK-001')).not.toHaveTextContent('En tiempo');
  });

  it('Corr. 4 (E): con política y sin plazo pendiente no dice «Sin plazo» (esa frase es solo sin política)', () => {
    renderTable({
      now,
      tickets: [
        {
          ...baseTicket,
          slaPolicyId: 'sla-1',
          slaResolveByAt: null,
          slaFirstResponseAt: null,
        } as unknown as AssuranceTicket,
      ],
    });
    const row = rowOf('TK-001');
    expect(row).toHaveTextContent('Sin plazo pendiente');
    expect(row).not.toHaveTextContent('En tiempo');
  });

  it('Corr. 5 (G): «Asignarme» no abre el ticket', () => {
    const onAssignToMe = jest.fn();
    const { props } = renderTable({ now, onAssignToMe });
    fireEvent.click(screen.getByRole('button', { name: 'Asignarme TK-001' }));
    expect(onAssignToMe).toHaveBeenCalledTimes(1);
    expect(props.onOpenTicket).not.toHaveBeenCalled();
  });

  it('Corr. 2: una cola acotada al responsable y vacía no dice «Aún no hay tickets»', () => {
    renderTable({
      now,
      tickets: [],
      total: 0,
      filters: { ...defaultFilters, assignedUserId: 'u-1' },
    });
    expect(screen.queryByText('Aún no hay tickets')).not.toBeInTheDocument();
  });

  it('Corr. 2: el estado vacío propio de la cola reemplaza al de primera vez', () => {
    renderTable({
      now,
      tickets: [],
      total: 0,
      filters: { ...defaultFilters, assignedUserId: 'u-1' },
      queueEmptyState: <p>Vacío de la cola</p>,
    });
    expect(screen.getByText('Vacío de la cola')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tickets')).not.toBeInTheDocument();
  });

  it('Corr. 6 (CA-2): celdas compactas — sin padding vertical de 12 px en las filas', () => {
    renderTable({ now });
    rowOf('TK-001')
      .querySelectorAll('td')
      .forEach((cell) => expect(cell.className).not.toMatch(/(^|\s)py-3(\s|$)/));
  });
});

describe('Bandeja P2 · cliente en la fila y búsqueda (spec 2026-11-18 §3 K, L; CA-13)', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');

  function rowOf(ticketNumber: string): HTMLElement {
    const row = screen.getByRole('button', { name: ticketNumber }).closest('tr');
    if (!row) throw new Error(`sin fila para ${ticketNumber}`);
    return row;
  }

  it('L: muestra el nombre del cliente en la línea del asunto', () => {
    renderTable({
      now,
      tickets: [{ ...baseTicket, requesterDisplayName: 'Ana Pérez' } as AssuranceTicket],
    });
    const subjectLine = screen.getByTitle('Sin servicio').parentElement as HTMLElement;
    expect(subjectLine).toHaveTextContent('Ana Pérez');
    expect(rowOf('TK-001')).toHaveTextContent('Cliente: Ana Pérez');
  });

  it('CA-13: con nombre nulo no muestra nombre ni texto de reemplazo', () => {
    renderTable({
      now,
      tickets: [{ ...baseTicket, requesterDisplayName: null } as AssuranceTicket],
    });
    expect(rowOf('TK-001')).not.toHaveTextContent('Cliente');
    expect(rowOf('TK-001')).not.toHaveTextContent('No disponible');
  });

  it('L: el nombre se muestra como texto, sin interpretar HTML', () => {
    renderTable({
      now,
      tickets: [
        { ...baseTicket, requesterDisplayName: '<img src=x onerror=alert(1)>' } as AssuranceTicket,
      ],
    });
    expect(rowOf('TK-001').querySelector('img')).toBeNull();
    expect(rowOf('TK-001')).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  it('K: el campo busca en el servidor y nombra al cliente si se permite', () => {
    renderTable({ now, searchByClient: true });
    expect(screen.getByLabelText('Buscar tickets')).toHaveAttribute(
      'placeholder',
      'Buscar por número, asunto o cliente…',
    );
  });

  it('K: sin permiso de clientes el campo solo nombra número y asunto', () => {
    renderTable({ now, searchByClient: false });
    expect(screen.getByLabelText('Buscar tickets')).toHaveAttribute(
      'placeholder',
      'Buscar por número o asunto…',
    );
  });

  it('K: sin resultados de búsqueda lo dice sin hablar de «esta página»', () => {
    renderTable({ now, tickets: [], total: 0, searchValue: 'fibra' });
    expect(screen.getByText('Ningún ticket coincide con la búsqueda.')).toBeInTheDocument();
    expect(screen.queryByText(/esta página/)).not.toBeInTheDocument();
  });

  it('J: la cola «Míos» vacía no dice «Aún no hay tickets»', () => {
    renderTable({
      now,
      tickets: [],
      total: 0,
      filters: { ...defaultFilters, workQueue: 'mine' },
    });
    expect(screen.queryByText('Aún no hay tickets')).not.toBeInTheDocument();
  });
});

describe('AssuranceTicketsTable — ticket cerrado en solo lectura (spec 2026-11-20 §2, CA-4)', () => {
  const options = [{ value: 'user-1', label: 'Ana Pérez' }];

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    '%s: sin «Cambiar responsable» ni «Asignarme»; se ve el responsable como dato',
    (status) => {
      renderTable({
        tickets: [{ ...baseTicket, status }],
        canManage: true,
        onAssignToMe: jest.fn(),
        onReassign: jest.fn(),
        assigneeOptions: options,
      });
      expect(screen.queryByRole('button', { name: /Cambiar responsable/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Asignarme/ })).not.toBeInTheDocument();
      expect(screen.getAllByText('Sin asignar').length).toBeGreaterThan(0);
    },
  );

  it('RESOLVED conserva «Cambiar responsable» y «Asignarme»', () => {
    renderTable({
      tickets: [{ ...baseTicket, status: TicketStatus.RESOLVED }],
      canManage: true,
      onAssignToMe: jest.fn(),
      onReassign: jest.fn(),
      assigneeOptions: options,
    });
    expect(
      screen.getByRole('button', { name: /Cambiar responsable de TK-001/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignarme TK-001' })).toBeInTheDocument();
  });
});
