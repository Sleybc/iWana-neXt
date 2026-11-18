/**
 * P2 (ola 5) — bandeja, paso 2: colas de servidor, conteos y búsqueda en la URL.
 * Spec: docs/specs/2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md §3 J–K (CA-10 a CA-12, lado portal).
 * Contrato: @iwana/shared ticket-inbox.contract.ts (workQueue, search, byWorkQueue).
 */
import type { ChangeEvent } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@iwana/shared';
import { AssuranceClient } from './AssuranceClient';
import { assuranceApi } from '@/lib/api-client';
import type { ListAssuranceTicketsParams } from '@/lib/api-client';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
// Referencias estables (guarda jest-context-mocks-stable): un objeto nuevo por render
// relanza la carga en bucle.
const mockRouter = { push: mockRouterPush, replace: mockRouterReplace };
const mockHasPermission = jest.fn().mockReturnValue(true);
let searchParamsMock = new URLSearchParams();
const mockAuth = {
  user: { id: 'user-1', role: UserRole.ADMIN, tenantId: 'tenant-1' },
  isLoading: false,
};
const mockPermissions = { hasPermission: mockHasPermission };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));

// El detalle tiene su propia suite (qa1/qa2 del drawer); aquí solo importa que la bandeja lo abra.
jest.mock('./AssuranceTicketDrawer', () => ({
  AssuranceTicketDrawer: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Detalle del ticket" /> : null,
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createAssuranceVisitRequestAndRoute: jest.fn(),
}));

jest.mock('@/lib/api-client', () => {
  const { EMPTY_LIST_META } = jest.requireActual(
    '@/lib/list-meta',
  ) as typeof import('@/lib/list-meta');
  class MockApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError: MockApiError,
    assuranceApi: {
      tickets: {
        list: jest.fn(),
        get: jest.fn(),
        listComments: jest.fn().mockResolvedValue([]),
        listTimeline: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        assign: jest.fn(),
        requestFieldService: jest.fn(),
      },
      dashboard: { getSummary: jest.fn() },
      slaPolicies: { list: jest.fn().mockResolvedValue([]) },
    },
    usersApi: {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
      }),
    },
    subscribersApi: { list: jest.fn().mockResolvedValue({ data: [], total: 0 }) },
    wfmApi: { visitRequests: { create: jest.fn() } },
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
      <div>
        {label && <label htmlFor={id}>{label}</label>}
        <select id={id} value={value} onChange={onChange}>
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

const listTicketsMock = jest.mocked(assuranceApi.tickets.list);
const summaryMock = jest.mocked(assuranceApi.dashboard.getSummary);

const NOW_ISO = '2026-11-18T12:00:00.000Z';
const ticketWithDeadline = {
  id: 'ticket-21',
  ticketNumber: 'TK-021',
  subject: 'Intermitencia en la fibra',
  requesterType: 'INTERNAL_USER',
  requesterRefId: null,
  status: TicketStatus.IN_PROGRESS,
  priority: TicketPriority.HIGH,
  type: 'CUSTOMER_INCIDENT',
  queueName: 'NOC',
  assignedUserId: 'user-1',
  slaBreachStatus: SlaBreachStatus.OK,
  slaPolicyId: 'policy-1',
  slaResolveByAt: '2026-11-18T15:00:00.000Z',
  updatedAt: NOW_ISO,
};
const unassignedTicket = {
  id: 'ticket-22',
  ticketNumber: 'TK-022',
  subject: 'Sin navegación',
  status: TicketStatus.OPEN,
  priority: TicketPriority.NORMAL,
  type: 'CUSTOMER_INCIDENT',
  queueName: 'SUPPORT_L1',
  assignedUserId: null,
  slaBreachStatus: SlaBreachStatus.OK,
  slaPolicyId: null,
  updatedAt: NOW_ISO,
};

function pageOf(data: unknown[]) {
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
      totalPages: data.length ? 1 : 0,
      hasMore: false,
      nextCursor: null,
      capabilities: { randomAccess: true, sortableFields: [] },
    },
  } as never;
}

function lastListCall(): ListAssuranceTicketsParams {
  const calls = listTicketsMock.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as ListAssuranceTicketsParams;
}

function lastReplaceHref(): string {
  return String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? '');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date(NOW_ISO),
    doNotFake: [
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'nextTick',
      'setImmediate',
      'clearTimeout',
      'clearInterval',
    ],
  });
  searchParamsMock = new URLSearchParams();
  mockAuth.user.role = UserRole.ADMIN;
  listTicketsMock.mockResolvedValue(pageOf([ticketWithDeadline, unassignedTicket]));
  summaryMock.mockResolvedValue({
    openCount: 1,
    inProgressCount: 2,
    atRiskCount: 7,
    fieldServicePendingCount: 8,
    assignedCount: 3,
    resolvedTodayCount: 4,
    breachedCount: 5,
    byPriority: {},
    byType: {},
    byQueue: {},
    byWorkQueue: {
      mine: 11,
      dueSoon: 12,
      waitingCustomer: 13,
      fieldService: 14,
      unassigned: 15,
      breached: 16,
      all: 17,
    },
  } as never);
});

afterEach(() => {
  jest.useRealTimers();
  document.documentElement.classList.remove('dark');
});

afterAll(() => {
  mockAuth.user.role = UserRole.ADMIN;
  mockHasPermission.mockReturnValue(true);
});

describe('P2 · J colas de servidor', () => {
  it('muestra las siete colas, con Sin asignar y Vencidos', async () => {
    render(<AssuranceClient />);
    const group = await screen.findByRole('group', { name: 'Colas de trabajo' });
    const names = within(group)
      .getAllByRole('button')
      .map((chip) => chip.textContent?.replace(/\d+$/, '').trim());
    expect(names).toEqual([
      'Míos',
      'Por vencer',
      'Vencidos',
      'Sin asignar',
      'Espera del cliente',
      'Visita técnica',
      'Todos',
    ]);
  });

  it('cada cola muestra el conteo de byWorkQueue', async () => {
    render(<AssuranceClient />);
    const group = await screen.findByRole('group', { name: 'Colas de trabajo' });
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: /^Vencidos/ })).toHaveTextContent('16'),
    );
    expect(within(group).getByRole('button', { name: /^Míos/ })).toHaveTextContent('11');
    expect(within(group).getByRole('button', { name: /^Sin asignar/ })).toHaveTextContent('15');
    expect(within(group).getByRole('button', { name: /^Espera del cliente/ })).toHaveTextContent(
      '13',
    );
    expect(within(group).getByRole('button', { name: /^Todos/ })).toHaveTextContent('17');
  });

  it('«Míos» pide workQueue=mine y no envía assignedUserId', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ workQueue: 'mine' })),
    );
    expect(lastListCall().assignedUserId).toBeUndefined();
  });

  it('D1: «Todos» por defecto pide workQueue=all', async () => {
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ workQueue: 'all' })),
    );
  });

  it.each([
    ['unassigned', /^Sin asignar/],
    ['breached', /^Vencidos/],
    ['dueSoon', /^Por vencer/],
  ])('elegir la cola %s la escribe en la URL', async (queue, name) => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name }));
    expect(lastReplaceHref()).toContain(`queue=${queue}`);
  });

  it('?queue=breached marca «Vencidos» y la pide al servidor con los filtros sueltos', async () => {
    searchParamsMock = new URLSearchParams({ queue: 'breached', priority: 'HIGH' });
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Vencidos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(lastListCall()).toEqual(
      expect.objectContaining({ workQueue: 'breached', priority: 'HIGH' }),
    );
  });

  it('CA-4: un enlace entrante sin cola no envía workQueue', async () => {
    searchParamsMock = new URLSearchParams({ status: 'OPEN' });
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' })),
    );
    expect(lastListCall().workQueue).toBeUndefined();
  });

  it('una cola desconocida en la URL no llega al servidor', async () => {
    searchParamsMock = new URLSearchParams({ queue: 'otra' });
    render(<AssuranceClient />);
    await waitFor(() => expect(listTicketsMock).toHaveBeenCalled());
    expect(lastListCall().workQueue).toBe('all');
  });
});

describe('P2 · K búsqueda de servidor', () => {
  it('escribe la búsqueda en la URL tras una pausa', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<AssuranceClient />);
    await user.type(await screen.findByLabelText('Buscar tickets'), 'fibra');
    await waitFor(() => expect(lastReplaceHref()).toContain('search=fibra'));
  });

  it('?search= llega al servidor y rellena el campo', async () => {
    searchParamsMock = new URLSearchParams({ search: 'fibra' });
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'fibra' })),
    );
    expect(await screen.findByLabelText('Buscar tickets')).toHaveValue('fibra');
  });

  it('una búsqueda de menos de 2 caracteres no se envía (el API respondería 400)', async () => {
    searchParamsMock = new URLSearchParams({ search: ' a ' });
    render(<AssuranceClient />);
    await waitFor(() => expect(listTicketsMock).toHaveBeenCalled());
    expect(lastListCall().search).toBeUndefined();
  });

  it('ya no filtra la página en memoria: muestra lo que devuelve el servidor', async () => {
    searchParamsMock = new URLSearchParams({ search: 'zzz' });
    render(<AssuranceClient />);
    expect(await screen.findByText('TK-021')).toBeInTheDocument();
  });

  it('con permiso de clientes ofrece buscar por cliente', async () => {
    render(<AssuranceClient />);
    expect(await screen.findByLabelText('Buscar tickets')).toHaveAttribute(
      'placeholder',
      'Buscar por número, asunto o cliente…',
    );
  });

  it('sin crm.subscribers.read solo ofrece número y asunto, sin error', async () => {
    mockHasPermission.mockImplementation(
      (key: string) => key !== AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    );
    render(<AssuranceClient />);
    expect(await screen.findByLabelText('Buscar tickets')).toHaveAttribute(
      'placeholder',
      'Buscar por número o asunto…',
    );
    expect(screen.queryByText('No fue posible cargar la vista')).not.toBeInTheDocument();
    mockHasPermission.mockReturnValue(true);
  });
});
