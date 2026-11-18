/**
 * QA1 (ola 3) — bandeja con colas de trabajo, paso 1.
 * Spec: docs/specs/2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md §5 (CA-3 a CA-9).
 * Complementa AssuranceClient.spec.tsx y AssuranceTicketsTable.spec.tsx en los huecos de la traza.
 * Lo que solo se mide en navegador (CA-2, CA-8 a 375 px real, contraste en oscuro) queda fuera.
 */
import type { ChangeEvent } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { SlaBreachStatus, TicketPriority, TicketStatus, UserRole } from '@iwana/shared';
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
const assignMock = jest.mocked(assuranceApi.tickets.assign);

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
const resolvedTicket = {
  ...unassignedTicket,
  id: 'ticket-23',
  ticketNumber: 'TK-023',
  subject: 'Caso resuelto',
  status: TicketStatus.RESOLVED,
  slaBreachStatus: SlaBreachStatus.OK,
  assignedUserId: 'user-1',
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

const AXE_WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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
  } as never);
});

afterEach(() => {
  jest.useRealTimers();
  document.documentElement.classList.remove('dark');
});

afterAll(() => {
  mockAuth.user.role = UserRole.ADMIN;
});

describe('QA1 · CA-3 la URL reproduce la cola al recargar o compartir', () => {
  it('?queue=mine&priority=HIGH reproduce «Míos» con su filtro, también para quien administra', async () => {
    searchParamsMock = new URLSearchParams({ queue: 'mine', priority: 'HIGH' });
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Míos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(lastListCall()).toEqual(
      // P2 (§3 J): «Míos» se pide como cola del servidor.
      expect.objectContaining({ workQueue: 'mine', priority: 'HIGH', order: 'urgency' }),
    );
  });

  it('?status=PENDING_CUSTOMER reproduce «Espera del cliente» sin acotar al responsable', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ status: 'PENDING_CUSTOMER' });
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Espera del cliente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(lastListCall()).toEqual(expect.objectContaining({ status: 'PENDING_CUSTOMER' }));
    // QA2: enlace entrante sin cola: no se envía `workQueue` (CA-4), aunque soporte tenga «Míos».
    expect(lastListCall().workQueue).toBeUndefined();
  });

  it('?queue=all reproduce «Todos» para soporte (sin filtro de responsable)', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ queue: 'all' });
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Todos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // QA2: `?queue=all` llega al servidor como la cola «Todos» (solo activos, D1).
    expect(lastListCall().workQueue).toBe('all');
  });

  // P2 (§3 J): la cola se escribe como `queue=fieldService` (antes, status=FIELD_SERVICE_REQUESTED).
  it('«Visita técnica» escribe su cola y quita la cola «Míos»', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ queue: 'mine' });
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name: /^Visita técnica/ }));
    const href = lastReplaceHref();
    expect(href).toContain('queue=fieldService');
    expect(href).not.toContain('queue=mine');
  });

  // Defecto QA1-D1 (BANDEJA-QA1.md §3): en la cola por defecto «Míos» (D2, sin `queue` en la
  // URL), elegir un filtro escribe `priority=…` sin `queue=mine`; al recargar o compartir el
  // enlace, `resolveInboxQueue` ve un filtro suelto y pasa a «Todos». La lista compartida no es
  // la misma (CA-3). `test.failing` pasa mientras el defecto exista y se pone rojo al arreglarlo:
  // entonces se cambia a `it`.
  it('QA1-D1: con «Míos» por defecto, elegir un filtro conserva la cola en la URL', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockAuth.user.role = UserRole.SUPPORT;
    render(<AssuranceClient />);
    await screen.findByRole('button', { name: /^Míos/ });
    await user.selectOptions(screen.getByLabelText('Prioridad'), TicketPriority.HIGH);
    const href = lastReplaceHref();
    expect(href).toContain('priority=HIGH');
    expect(href).toContain('queue=mine');
  });
});

describe('QA1 · CA-4 enlaces entrantes con la cola por defecto «Míos»', () => {
  it.each([
    ['priority', 'URGENT'],
    ['type', 'CUSTOMER_INCIDENT'],
    ['queueName', 'NOC'],
  ])('?%s=%s llega al listado sin acotarlo al responsable', async (key, value) => {
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ [key]: value });
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ [key]: value })),
    );
    // QA2: enlace entrante sin cola: no se envía `workQueue` (CA-4).
    expect(lastListCall().workQueue).toBeUndefined();
  });
});

describe('QA1 · CA-5 nunca «En tiempo» en la celda Vence', () => {
  it('con plazo vigente dice «Vence en …» y la fila no contiene «En tiempo» ni en texto oculto', async () => {
    render(<AssuranceClient />);
    const row = (await screen.findByText('TK-021')).closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Vence en 3 h');
    expect(row.textContent).not.toMatch(/En tiempo/);
  });

  it('sin política de plazo dice «Sin plazo»; un caso resuelto no muestra plazo', async () => {
    listTicketsMock.mockResolvedValue(pageOf([unassignedTicket, resolvedTicket]));
    render(<AssuranceClient />);
    const openRow = (await screen.findByText('TK-022')).closest('tr') as HTMLElement;
    expect(openRow).toHaveTextContent('Sin plazo');
    const resolvedRow = screen.getByText('TK-023').closest('tr') as HTMLElement;
    expect(resolvedRow).toHaveTextContent('—');
    expect(screen.getByRole('table', { name: 'Bandeja' }).textContent).not.toMatch(/En tiempo/);
  });
});

describe('QA1 · CA-6 «Asignarme» respeta la guarda', () => {
  it('soporte (canManage) ve «Asignarme» y la asignación usa su propio id', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ queue: 'all' });
    assignMock.mockResolvedValue({ ...unassignedTicket, assignedUserId: 'user-1' } as never);
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name: 'Asignarme TK-022' }));
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('ticket-22', { assignedUserId: 'user-1' });
  });

  it('si la API rechaza la asignación se avisa el error y no se anuncia éxito', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    assignMock.mockRejectedValue(new Error('rechazo'));
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name: 'Asignarme TK-022' }));
    expect(await screen.findByText('No fue posible asignarte el ticket')).toBeInTheDocument();
    expect(screen.queryByText(/quedó asignado a ti/)).not.toBeInTheDocument();
  });

  it('el contratista ve la bandeja pero no «Asignarme»', async () => {
    mockAuth.user.role = UserRole.CONTRACTOR;
    render(<AssuranceClient />);
    expect(await screen.findByText('TK-022')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asignarme/ })).not.toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe('QA1 · CA-7 sin textos de desarrollo (H11) en toda la pantalla', () => {
  it('ni la cabecera, ni la tabla, ni el resumen plegado contienen textos de H11 o «SLA»', async () => {
    const { container } = render(<AssuranceClient />);
    await screen.findByText('TK-021');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(
      /cuando el backend entregue el dato|entregados por el backend|\/api\/v1|empresa autenticada|Cola operativa de tickets|\bSLA\b/,
    );
    expect(screen.queryByText('Ver detalle')).not.toBeInTheDocument();
  });
});

describe('QA1 · CA-8 la tabla se lee como lista bajo md (estructura; el ancho real se mide en navegador)', () => {
  it('tabla, cuerpo y filas pasan a bloque bajo md y la cabecera queda solo para lectores', async () => {
    render(<AssuranceClient />);
    const table = await screen.findByRole('table', { name: 'Bandeja' });
    expect(table).toHaveClass('max-md:block');
    expect(table.className).not.toMatch(/min-w-\[/);
    expect(table.querySelector('thead')).toHaveClass('max-md:sr-only');
    expect(table.querySelector('tbody')).toHaveClass('max-md:block');
    const row = screen.getByText('TK-021').closest('tr') as HTMLElement;
    expect(row).toHaveClass('max-md:block');
  });
});

describe('QA1 · CA-9 teclado y axe (jsdom; contraste y oscuro quedan para navegador)', () => {
  it('las colas son botones con aria-pressed y se activan con Enter y Espacio', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<AssuranceClient />);
    const group = await screen.findByRole('group', { name: 'Colas de trabajo' });
    const chips = within(group).getAllByRole('button');
    // P2 (§3 J): siete colas (se suman Sin asignar y Vencidos).
    expect(chips).toHaveLength(7);
    chips.forEach((chip) => expect(chip).toHaveAttribute('aria-pressed'));

    chips[1]?.focus();
    await user.keyboard('{Enter}');
    expect(lastReplaceHref()).toContain('queue=dueSoon');
    chips[4]?.focus();
    await user.keyboard(' ');
    expect(lastReplaceHref()).toContain('queue=waitingCustomer');
  });

  it('los cinco filtros tienen nombre accesible y se operan con teclado', async () => {
    render(<AssuranceClient />);
    await screen.findByText('TK-021');
    for (const name of ['Prioridad', 'Tipo', 'Área', 'Estado', 'Plazo']) {
      expect(screen.getByLabelText(name).tagName).toBe('SELECT');
    }
  });

  it('el número del ticket abre el detalle con Enter (la fila clicable no deja al teclado sin control)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.mocked(assuranceApi.tickets.get).mockResolvedValue(ticketWithDeadline as never);
    render(<AssuranceClient />);
    const numberButton = await screen.findByRole('button', { name: 'TK-021' });
    numberButton.focus();
    await user.keyboard('{Enter}');
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('ticketId=ticket-21'),
      expect.anything(),
    );
  });

  it.each(['claro', 'oscuro'])(
    'axe WCAG 2.2 AA sin violaciones sobre la bandeja (tema %s, sin regla de contraste)',
    async (theme) => {
      if (theme === 'oscuro') document.documentElement.classList.add('dark');
      const { container } = render(<AssuranceClient />);
      await screen.findByText('TK-021');
      jest.useRealTimers();
      const results = await axe(container, {
        runOnly: { type: 'tag', values: AXE_WCAG_TAGS },
        // jsdom no calcula colores: el contraste se mide en navegador (orquestador).
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    },
  );
});
