/**
 * Inventario de no regresión de la bandeja `/dashboard/assurance` (spec
 * 2026-11-18-mod10-bandeja-colas-de-trabajo-ux §5 CA-1, plan W0).
 *
 * Fija CAPACIDADES, no textos ni posiciones: cada dato del resumen sigue visible,
 * cada filtro de H5 llega a la URL/al listado, cada dato de fila de H4 sigue en la
 * fila, cada acción sigue disponible y los enlaces entrantes de H10 siguen filtrando.
 * Las etiquetas que la spec renombra (Cola operativa → Bandeja, SLA → Plazo de
 * atención, «Abiertos», «Ver detalle») no se fijan aquí.
 */
import type { ChangeEvent } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import { AssuranceClient } from './AssuranceClient';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import {
  formatAssuranceDateTime,
  getAssuranceQueueLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
} from './assurance-labels';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouter = { push: mockRouterPush, replace: mockRouterReplace };
const mockHasPermission = jest.fn().mockReturnValue(true);
const mockPermissions = { hasPermission: mockHasPermission };
const mockAuth = {
  user: { id: 'user-1', role: UserRole.ADMIN, tenantId: 'tenant-1' },
  isLoading: false,
};
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => searchParamsMock,
}));
jest.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));
jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createAssuranceVisitRequestAndRoute: jest.fn(),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    assuranceApi: {
      tickets: {
        list: jest.fn(),
        get: jest.fn().mockResolvedValue(null),
        listComments: jest.fn().mockResolvedValue([]),
        listTimeline: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      dashboard: { getSummary: jest.fn() },
      slaPolicies: { list: jest.fn().mockResolvedValue([]) },
    },
    usersApi: {
      list: jest.fn().mockResolvedValue({ data: [], meta: { nextCursor: null, total: 0 } }),
    },
  };
});

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
    }: {
      id?: string;
      label?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      options?: Array<{ value: string; label: string }>;
    }) => (
      <select id={id} aria-label={label} value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  };
});

const listMock = jest.mocked(assuranceApi.tickets.list);
const summaryMock = jest.mocked(assuranceApi.dashboard.getSummary);

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: 'tk-1',
    tenantId: 'tenant-1',
    ticketNumber: 'TK-9001',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.MANUAL,
    subject: 'Asunto de prueba sin datos personales',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: null,
    subjectType: null,
    subjectRefId: null,
    assignedUserId: 'u-7',
    queueName: TicketQueue.NOC,
    slaPolicyId: 'sla-1',
    slaFirstResponseAt: null,
    slaResolveByAt: '2026-11-20T15:00:00.000Z',
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.AT_RISK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: 'u-1',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T12:30:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

function listResponse(data: AssuranceTicket[]) {
  return {
    data,
    total: data.length,
    page: 1,
    limit: 20,
    meta: {
      mode: 'page',
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: data.length > 0 ? 1 : 0,
      hasMore: false,
      nextCursor: null,
      capabilities: { randomAccess: true, sortableFields: [] },
    },
  } as never;
}

type TableProps = Parameters<typeof AssuranceTicketsTable>[0];

function renderTable(overrides: Partial<TableProps> = {}) {
  const props: TableProps = {
    tickets: [makeTicket()],
    total: 45,
    isLoading: false,
    randomAccess: true,
    page: 1,
    pageCount: 3,
    pageSize: 20,
    from: 1,
    to: 20,
    hasMore: true,
    filters: {},
    searchValue: '',
    assigneeLabelById: new Map([['u-7', 'Técnica Prueba']]),
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
  render(<AssuranceTicketsTable {...props} />);
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParamsMock = new URLSearchParams();
  mockHasPermission.mockReturnValue(true);
  listMock.mockResolvedValue(listResponse([]));
  summaryMock.mockResolvedValue({
    openCount: 701,
    inProgressCount: 702,
    atRiskCount: 703,
    fieldServicePendingCount: 704,
    assignedCount: 705,
    resolvedTodayCount: 706,
    breachedCount: 707,
    byPriority: { [TicketPriority.CRITICAL]: 708 },
    byType: { [TicketType.CUSTOMER_INCIDENT]: 709 },
    // P2 (§3 J): las colas leen su conteo de `byWorkQueue` (mismos predicados que dueSoon =
    // atRiskCount, fieldService = fieldServicePendingCount y breached = breachedCount, CA-10).
    // QA2: `breached` = 707 como breachedCount; las aserciones se acotan a su región.
    byQueue: {},
    byWorkQueue: {
      mine: 0,
      dueSoon: 703,
      waitingCustomer: 0,
      fieldService: 704,
      unassigned: 0,
      breached: 707,
      all: 0,
    },
  } as never);
});

describe('Inventario CA-1 · indicadores del resumen (H2)', () => {
  // QA2 (test-change-reviewer): cada dato se busca en su región. Los campos del resumen viven en
  // el bloque plegable «Resumen de la mesa de ayuda»; desde P2, atRiskCount y
  // fieldServicePendingCount ya no se pintan: su cifra llega por las colas («Por vencer» y
  // «Visita técnica», `byWorkQueue`), y así se nombran.
  const summaryBlock = async () =>
    (await screen.findByText('Resumen de la mesa de ayuda')).closest('details') as HTMLElement;

  it.each([
    ['casos abiertos (openCount)', '701'],
    ['en progreso (inProgressCount)', '702'],
    ['casos asignados (assignedCount)', '705'],
    ['resueltos hoy (resolvedTodayCount)', '706'],
    ['plazos vencidos (breachedCount)', '707'],
    ['conteo por prioridad (byPriority)', '708'],
    ['conteo por tipo (byType)', '709'],
  ])('el resumen muestra el dato %s', async (_name, value) => {
    render(<AssuranceClient />);
    const block = await summaryBlock();
    expect(await within(block).findByText(new RegExp(`\\b${value}\\b`))).toBeInTheDocument();
  });

  it.each([
    ['Por vencer', 'byWorkQueue.dueSoon (= atRiskCount)', '703'],
    ['Visita técnica', 'byWorkQueue.fieldService (= fieldServicePendingCount)', '704'],
    ['Vencidos', 'byWorkQueue.breached (= breachedCount)', '707'],
  ])('la cola «%s» muestra %s', async (queue, _field, value) => {
    render(<AssuranceClient />);
    const queues = await screen.findByRole('group', { name: 'Colas de trabajo' });
    await waitFor(() =>
      expect(
        within(queues).getByRole('button', { name: new RegExp(`^${queue}`) }),
      ).toHaveTextContent(new RegExp(`${value}$`)),
    );
  });

  it('reserva el resumen a quien gestiona: un rol solo lector no lo pide', async () => {
    mockAuth.user.role = UserRole.TECHNICIAN;
    try {
      render(<AssuranceClient />);
      await waitFor(() => expect(listMock).toHaveBeenCalled());
      expect(summaryMock).not.toHaveBeenCalled();
    } finally {
      mockAuth.user.role = UserRole.ADMIN;
    }
  });
});

describe('Inventario CA-1 · enlaces entrantes (H10) y parámetros de URL', () => {
  it.each([
    ['status', TicketStatus.OPEN],
    ['slaBreachStatus', SlaBreachStatus.AT_RISK],
    ['priority', TicketPriority.HIGH],
    ['type', TicketType.CUSTOMER_INCIDENT],
    ['queueName', TicketQueue.NOC],
  ])('?%s=%s llega al listado del servidor', async (key, value) => {
    searchParamsMock = new URLSearchParams({ [key]: value });
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ [key]: value })),
    );
  });

  it('?ticketId= abre el detalle del ticket al entrar', async () => {
    searchParamsMock = new URLSearchParams({ ticketId: 'tk-77' });
    render(<AssuranceClient />);
    await waitFor(() => expect(assuranceApi.tickets.get).toHaveBeenCalledWith('tk-77'));
  });
});

describe('Inventario CA-1 · filtros (H5)', () => {
  it.each([
    ['Estado', 'status', TicketStatus.OPEN],
    ['Prioridad', 'priority', TicketPriority.CRITICAL],
    ['Tipo', 'type', TicketType.CUSTOMER_INCIDENT],
    ['Área', 'queueName', TicketQueue.NOC],
  ])('el filtro %s emite %s', async (label, key, value) => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.selectOptions(screen.getByLabelText(label), value);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ [key]: value } as Partial<ListAssuranceTicketsParams>),
    );
  });

  it('el filtro de plazo (slaBreachStatus) cuenta como filtro activo y se puede limpiar', async () => {
    const user = userEvent.setup();
    const props = renderTable({ filters: { slaBreachStatus: SlaBreachStatus.AT_RISK } });
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }));
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('sin filtros activos no ofrece limpiar', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: /limpiar filtros/i })).not.toBeInTheDocument();
  });

  it('la búsqueda emite el texto escrito', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.type(screen.getByRole('searchbox'), 'TK');
    expect(props.onSearchChange).toHaveBeenCalled();
  });
});

describe('Inventario CA-1 · datos de la fila (H4)', () => {
  const ticket = makeTicket();
  it.each([
    ['número', ticket.ticketNumber],
    ['asunto', ticket.subject],
    ['tipo', getAssuranceTicketTypeLabel(ticket.type)],
    ['estado', getAssuranceTicketStatusLabel(ticket.status)],
    ['prioridad', getAssuranceTicketPriorityLabel(ticket.priority)],
    ['área', getAssuranceQueueLabel(ticket.queueName)],
    ['responsable', 'Técnica Prueba'],
    ['estado de plazo', getAssuranceSlaStatusLabel(ticket.slaBreachStatus)],
    ['actualización', formatAssuranceDateTime(ticket.updatedAt)],
  ])('la fila muestra el %s', (_name, text) => {
    renderTable({ tickets: [ticket] });
    const row = screen.getByText(ticket.ticketNumber).closest('tr') as HTMLElement;
    expect(within(row).getByText(text, { exact: false })).toBeInTheDocument();
  });
});

describe('Inventario CA-1 · acciones', () => {
  it('abrir el ticket desde la fila', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.click(screen.getByRole('button', { name: 'TK-9001' }));
    expect(props.onOpenTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'tk-1' }));
  });

  it('«Nuevo ticket» existe con permiso de gestión', () => {
    const props = renderTable({ canManage: true });
    expect(screen.getByRole('button', { name: 'Nuevo ticket' })).toBeInTheDocument();
    expect(props.onOpenCreate).not.toHaveBeenCalled();
  });

  it('«Nuevo ticket» no aparece sin permiso de gestión', () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole('button', { name: 'Nuevo ticket' })).not.toBeInTheDocument();
  });

  it('paginación de servidor: cambiar de página', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('paginación de servidor: elegir tamaño de página', () => {
    renderTable();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
  });
});
