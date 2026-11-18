import type { ChangeEvent } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketFieldDecision, TicketPriority, TicketStatus, UserRole } from '@iwana/shared';
import { AssuranceClient } from './AssuranceClient';
import { assuranceApi, wfmApi } from '@/lib/api-client';
import type { ListAssuranceTicketsParams } from '@/lib/api-client';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
// Referencias estables: los hooks reales (router, auth, permisos) devuelven la misma
// identidad entre renders. Un objeto nuevo por render entra en las dependencias de
// `useTableQueryState`/`loadPage` y relanza la carga en bucle (44 llamadas a
// `tickets.list` en una sola prueba; 3 con mocks estables). Esa carga extra es la
// que dejaba sin CPU al picker en CI (run 41805430065).
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
        list: jest.fn().mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          meta: {
            ...EMPTY_LIST_META,
            mode: 'page',
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
            hasMore: false,
            capabilities: { randomAccess: true, sortableFields: [] },
          },
        }),
        get: jest.fn(),
        listComments: jest.fn().mockResolvedValue([]),
        listTimeline: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        assign: jest.fn(),
        requestFieldService: jest.fn(),
      },
      dashboard: {
        getSummary: jest.fn().mockResolvedValue({
          openTickets: 0,
          breachedTickets: 0,
          fieldServiceTickets: 0,
          averageResolutionMinutes: 0,
        }),
      },
      slaPolicies: {
        list: jest.fn().mockResolvedValue([]),
      },
    },
    subscribersApi: {
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            commercialName: 'Acme Colombia',
            businessName: 'Acme Colombia SAS',
            firstName: null,
            lastName: null,
            city: 'Bogotá',
            email: null,
            documentNumber: null,
          },
        ],
        total: 1,
      }),
    },
    usersApi: {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
      }),
    },
    wfmApi: {
      visitRequests: {
        create: jest.fn(),
      },
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

const createTicketMock = jest.mocked(assuranceApi.tickets.create);
const listTicketsMock = jest.mocked(assuranceApi.tickets.list);
const getTicketMock = jest.mocked(assuranceApi.tickets.get);
const createAssuranceVisitRequestAndRouteMock = jest.mocked(createAssuranceVisitRequestAndRoute);

describe('AssuranceClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    searchParamsMock = new URLSearchParams();
    mockRouterPush.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    mockRouterReplace.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('creates a ticket and routes to pending visits when field service is requested later', async () => {
    const user = userEvent.setup();
    createTicketMock.mockResolvedValue({
      id: 'TK-001',
      ticketNumber: 'TK-001',
      subject: 'Sin servicio',
      priority: TicketPriority.NORMAL,
      fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
      description: null,
    } as never);
    createAssuranceVisitRequestAndRouteMock.mockResolvedValue({
      visitRequest: { id: 'vr-001' } as never,
      href: '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-001',
    });

    render(<AssuranceClient />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo ticket' }));
    await user.type(screen.getByRole('combobox', { name: 'Suscriptor' }), 'Acme');
    await user.click(await screen.findByRole('option', { name: 'Acme Colombia — Bogotá' }));
    await user.type(screen.getByLabelText('Asunto'), 'Sin servicio');
    await user.selectOptions(
      screen.getByLabelText('Visita técnica'),
      TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    );
    await user.selectOptions(screen.getByLabelText('Siguiente paso'), 'send-to-pending');
    await user.click(screen.getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-001',
      );
    });
  });

  it('does not offer WFM follow-up when the user lacks schedule management permission', async () => {
    const user = userEvent.setup();
    mockHasPermission.mockReturnValue(false);
    createTicketMock.mockResolvedValue({
      id: 'TK-002',
      ticketNumber: 'TK-002',
      subject: 'Sin servicio',
      priority: TicketPriority.NORMAL,
      fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
      description: null,
    } as never);

    render(<AssuranceClient />);

    await user.click(await screen.findByRole('button', { name: 'Nuevo ticket' }));
    await user.type(screen.getByRole('combobox', { name: 'Suscriptor' }), 'Acme');
    await user.click(await screen.findByRole('option', { name: 'Acme Colombia — Bogotá' }));
    await user.type(screen.getByLabelText('Asunto'), 'Sin servicio');
    await user.selectOptions(
      screen.getByLabelText('Visita técnica'),
      TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    );
    expect(screen.queryByLabelText('Siguiente paso')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear ticket' }));

    await waitFor(() => expect(createTicketMock).toHaveBeenCalled());
    expect(createAssuranceVisitRequestAndRouteMock).not.toHaveBeenCalled();
  });

  it('navigates to operations with assurance prefill when creating a linked task from the drawer', async () => {
    const user = userEvent.setup();
    listTicketsMock.mockResolvedValue({
      data: [
        {
          id: 'ticket-123',
          ticketNumber: 'TK-123',
          subject: 'Falla intermitente',
          status: TicketStatus.IN_PROGRESS,
          priority: TicketPriority.HIGH,
          type: 'INCIDENT',
          queueName: 'SUPPORT_L2',
          assignedUserId: null,
          slaBreachStatus: 'OK',
          requesterRefId: 'req-1',
          subjectRefId: 'subj-1',
          updatedAt: '2026-07-07T18:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
    getTicketMock.mockResolvedValue({
      id: 'ticket-123',
      ticketNumber: 'TK-123',
      subject: 'Falla intermitente',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
      type: 'INCIDENT',
      queueName: 'SUPPORT_L2',
      assignedUserId: null,
      slaBreachStatus: 'OK',
      requesterType: 'SUBSCRIBER',
      requesterRefId: 'req-1',
      subjectType: 'SERVICE',
      subjectRefId: 'subj-1',
      source: 'PORTAL',
      fieldDecision: TicketFieldDecision.NOT_REQUIRED,
      workOrderId: null,
      slaFirstResponseAt: null,
      slaResolveByAt: null,
      updatedAt: '2026-07-07T18:00:00.000Z',
      description: 'Ticket de prueba',
    } as never);

    render(<AssuranceClient />);

    // Bandeja §3 D: desaparece «Ver detalle»; el número (y la fila entera) abre el ticket.
    await user.click(await screen.findByRole('button', { name: 'TK-123' }));
    await user.click(await screen.findByRole('button', { name: 'Crear tarea vinculada' }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      // URL canónica desde F2 (spec 2026-09-13 §4.2): el despachador de la
      // raíz mantiene vivo el deep link legado con redirect 307.
      '/dashboard/operations/tasks/new?ticketId=ticket-123&fromAssurance=1',
    );
  });

  it('ADR-065: con total>20 muestra pie numerado y reemplaza la página (sin acumular)', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, index) => ({
      id: `ticket-${index + 1}`,
      ticketNumber: `TK-${String(index + 1).padStart(3, '0')}`,
      subject: `Asunto ${index + 1}`,
      status: TicketStatus.OPEN,
      priority: TicketPriority.NORMAL,
      type: 'INCIDENT',
      queueName: 'SUPPORT_L1',
      assignedUserId: null,
      slaBreachStatus: 'OK',
      requesterRefId: `req-${index + 1}`,
      subjectRefId: `subj-${index + 1}`,
      updatedAt: '2026-07-24T12:00:00.000Z',
    }));
    const page2 = [
      {
        id: 'ticket-21',
        ticketNumber: 'TK-021',
        subject: 'Asunto 21',
        status: TicketStatus.OPEN,
        priority: TicketPriority.NORMAL,
        type: 'INCIDENT',
        queueName: 'SUPPORT_L1',
        assignedUserId: null,
        slaBreachStatus: 'OK',
        requesterRefId: 'req-21',
        subjectRefId: 'subj-21',
        updatedAt: '2026-07-24T12:05:00.000Z',
      },
    ];

    listTicketsMock.mockImplementation(async (params?: ListAssuranceTicketsParams) => {
      const page = params?.page ?? 1;
      const data = page === 1 ? page1 : page2;
      const total = 21;
      return {
        data,
        total,
        page,
        limit: 20,
        meta: {
          nextCursor: null,
          total,
          totalIsEstimate: false,
          page,
          limit: 20,
          totalPages: 2,
          hasMore: page < 2,
          mode: 'page' as const,
          capabilities: { randomAccess: true, sortableFields: [] as string[] },
          sort: null,
        },
      } as never;
    });

    const { rerender } = render(<AssuranceClient />);

    expect(await screen.findByText('TK-001')).toBeInTheDocument();
    expect(screen.queryByText('TK-021')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Mostrando 1\u201320 de 21 tickets/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(<AssuranceClient />);

    await waitFor(() => {
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    });

    expect(await screen.findByText('TK-021')).toBeInTheDocument();
    expect(screen.queryByText('TK-001')).not.toBeInTheDocument();
  });

  it('hidrata slaBreachStatus=AT_RISK desde la dirección (CA-V2-05 / I-4)', async () => {
    searchParamsMock = new URLSearchParams({ slaBreachStatus: 'AT_RISK' });

    render(<AssuranceClient />);

    await waitFor(() => {
      expect(listTicketsMock).toHaveBeenCalledWith(
        expect.objectContaining({ slaBreachStatus: 'AT_RISK' }),
      );
    });
  });
});

describe('Bandeja paso 1 (spec 2026-11-18 §3 A, B, F, G, H, I)', () => {
  const summaryMock = jest.mocked(assuranceApi.dashboard.getSummary);
  const assignMock = jest.mocked(assuranceApi.tickets.assign);
  const unassignedTicket = {
    id: 'ticket-9',
    ticketNumber: 'TK-009',
    subject: 'Sin navegación',
    status: TicketStatus.OPEN,
    priority: TicketPriority.HIGH,
    type: 'CUSTOMER_INCIDENT',
    queueName: 'NOC',
    assignedUserId: null,
    slaBreachStatus: 'OK',
    slaPolicyId: null,
    updatedAt: '2026-11-18T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    mockAuth.user.role = UserRole.ADMIN;
    summaryMock.mockResolvedValue({
      openCount: 1,
      inProgressCount: 2,
      atRiskCount: 31,
      fieldServicePendingCount: 32,
      assignedCount: 3,
      resolvedTodayCount: 4,
      breachedCount: 5,
      byPriority: {},
      byType: {},
      // P2 (§3 J): las colas leen su conteo de `byWorkQueue`.
      byQueue: {},
      byWorkQueue: {
        mine: 21,
        dueSoon: 31,
        waitingCustomer: 22,
        fieldService: 32,
        unassigned: 23,
        breached: 24,
        all: 25,
      },
    } as never);
  });

  afterAll(() => {
    mockAuth.user.role = UserRole.ADMIN;
  });

  function lastListCall(): ListAssuranceTicketsParams {
    const calls = listTicketsMock.mock.calls;
    return (calls[calls.length - 1]?.[0] ?? {}) as ListAssuranceTicketsParams;
  }

  it('H: pide el listado con order=urgency por defecto', async () => {
    render(<AssuranceClient />);
    await waitFor(() => expect(listTicketsMock).toHaveBeenCalled());
    expect(lastListCall()).toEqual(expect.objectContaining({ order: 'urgency' }));
  });

  it('B/D2: quien administra entra en «Todos» sin filtro de responsable', async () => {
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Todos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // QA2 (test-change-reviewer): P2 ya no envía `assignedUserId`; lo que se comprueba es la cola.
    expect(lastListCall().workQueue).toBe('all');
  });

  it('D2: soporte entra en «Míos»: el listado pide sus tickets', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    render(<AssuranceClient />);
    await waitFor(() =>
      // P2 (§3 J): «Míos» es la cola del servidor, no un filtro por responsable.
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ workQueue: 'mine' })),
    );
    expect(await screen.findByRole('button', { name: /^Míos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('CA-4: ?status=OPEN sigue llegando a la misma lista aunque la cola por defecto sea «Míos»', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ status: 'OPEN' });
    render(<AssuranceClient />);
    await waitFor(() =>
      expect(listTicketsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' })),
    );
    // QA2: enlace entrante (H10/CA-4) sin cola: no se envía `workQueue`, aunque soporte tenga «Míos».
    expect(lastListCall().workQueue).toBeUndefined();
  });

  it('CA-4: ?slaBreachStatus=AT_RISK abre la cola equivalente «Por vencer»', async () => {
    mockAuth.user.role = UserRole.SUPPORT;
    searchParamsMock = new URLSearchParams({ slaBreachStatus: 'AT_RISK' });
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Por vencer/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // QA2: el enlace entrante marca «Por vencer» pero no reinterpreta la URL como cola (CA-4).
    expect(lastListCall()).toEqual(expect.objectContaining({ slaBreachStatus: 'AT_RISK' }));
    expect(lastListCall().workQueue).toBeUndefined();
  });

  // P2 (§3 J): cada cola escribe `queue` en la URL (antes, sus filtros de estado o plazo).
  it('CA-3: cada cola deja su cola en la URL', async () => {
    const user = userEvent.setup();
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name: /^Por vencer/ }));
    expect(String(mockRouterReplace.mock.calls.at(-1)?.[0])).toContain('queue=dueSoon');
    await user.click(screen.getByRole('button', { name: /^Espera del cliente/ }));
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0]);
    expect(href).toContain('queue=waitingCustomer');
    expect(href).not.toContain('slaBreachStatus');
    await user.click(screen.getByRole('button', { name: /^Míos/ }));
    expect(String(mockRouterReplace.mock.calls.at(-1)?.[0])).toContain('queue=mine');
  });

  // P2 (§3 J) levanta D3: Sin asignar y Vencidos existen y todas las colas tienen conteo.
  it('B/J: conteo en todas las colas, con Sin asignar y Vencidos', async () => {
    render(<AssuranceClient />);
    expect(await screen.findByRole('button', { name: /^Por vencer.*31/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Visita técnica.*32/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sin asignar.*23/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Vencidos.*24/ })).toBeInTheDocument();
  });

  it('F: el resumen queda plegado al pie y conserva sus datos', async () => {
    render(<AssuranceClient />);
    const summaryToggle = await screen.findByText('Resumen de la mesa de ayuda');
    const details = summaryToggle.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('Resueltos hoy');
    expect(details).toHaveTextContent('Plazo de atención vencido');
  });

  it('F: el resumen sigue reservado a quien hoy lo ve', async () => {
    mockAuth.user.role = UserRole.TECHNICIAN;
    render(<AssuranceClient />);
    await waitFor(() => expect(listTicketsMock).toHaveBeenCalled());
    expect(screen.queryByText('Resumen de la mesa de ayuda')).not.toBeInTheDocument();
  });

  it('A/CA-7: cabecera con el título y sin textos de desarrollo', async () => {
    render(<AssuranceClient />);
    expect(await screen.findByRole('heading', { name: 'Mesa de ayuda' })).toBeInTheDocument();
    expect(screen.queryByText(/empresa autenticada|backend|\/api\/v1|Cola operativa/)).toBeNull();
  });

  it('G/CA-6: «Asignarme» asigna a quien consulta y recarga la bandeja', async () => {
    const user = userEvent.setup();
    listTicketsMock.mockResolvedValue({
      data: [unassignedTicket],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
    assignMock.mockResolvedValue({ ...unassignedTicket, assignedUserId: 'user-1' } as never);
    render(<AssuranceClient />);
    const assignButton = await screen.findByRole('button', { name: 'Asignarme TK-009' });
    const callsBefore = listTicketsMock.mock.calls.length;
    await user.click(assignButton);
    expect(assignMock).toHaveBeenCalledWith('ticket-9', { assignedUserId: 'user-1' });
    expect(await screen.findByText(/TK-009 quedó asignado a ti/)).toBeInTheDocument();
    await waitFor(() => expect(listTicketsMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('G/D4: el técnico no ve «Asignarme»', async () => {
    mockAuth.user.role = UserRole.TECHNICIAN;
    listTicketsMock.mockResolvedValue({
      data: [unassignedTicket],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
    render(<AssuranceClient />);
    expect(await screen.findByText('TK-009')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asignarme/ })).not.toBeInTheDocument();
  });
});

describe('Bandeja P1 · correcciones tras QA1 (bandeja)', () => {
  const summaryMock = jest.mocked(assuranceApi.dashboard.getSummary);
  const assignMock = jest.mocked(assuranceApi.tickets.assign);
  const emptyPage = {
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    meta: {
      mode: 'page',
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasMore: false,
      nextCursor: null,
      capabilities: { randomAccess: true, sortableFields: [] },
    },
  };
  const tickets = [
    {
      id: 'ticket-31',
      ticketNumber: 'TK-031',
      subject: 'Caída del enlace',
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      type: 'CUSTOMER_INCIDENT',
      queueName: 'NOC',
      assignedUserId: null,
      slaBreachStatus: 'OK',
      slaPolicyId: null,
      requesterRefId: 'REF-ALFA',
      updatedAt: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'ticket-32',
      ticketNumber: 'TK-032',
      subject: 'Lentitud',
      status: TicketStatus.OPEN,
      priority: TicketPriority.NORMAL,
      type: 'CUSTOMER_INCIDENT',
      queueName: 'NOC',
      assignedUserId: null,
      slaBreachStatus: 'OK',
      slaPolicyId: null,
      requesterRefId: 'REF-BETA',
      updatedAt: '2026-11-18T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    mockAuth.user.role = UserRole.ADMIN;
    summaryMock.mockResolvedValue({
      openCount: 1,
      inProgressCount: 2,
      atRiskCount: 3,
      fieldServicePendingCount: 4,
      assignedCount: 5,
      resolvedTodayCount: 6,
      breachedCount: 7,
      byPriority: {},
      byType: {},
      byQueue: { NOC: 41 },
    } as never);
  });

  afterAll(() => {
    mockAuth.user.role = UserRole.ADMIN;
  });

  it('Corr. 2: soporte con «Míos» vacío ve un estado propio de la cola con salida a «Todos»', async () => {
    const user = userEvent.setup();
    mockAuth.user.role = UserRole.SUPPORT;
    listTicketsMock.mockResolvedValue(emptyPage as never);
    render(<AssuranceClient />);
    expect(await screen.findByText('No tienes tickets asignados')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tickets')).not.toBeInTheDocument();
    expect(screen.queryByText(/Crea el primer ticket/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver todos los tickets' }));
    expect(String(mockRouterReplace.mock.calls.at(-1)?.[0])).toContain('queue=all');
  });

  it('Corr. 5 (G): si la asignación falla se avisa el error y no se anuncia éxito', async () => {
    const user = userEvent.setup();
    listTicketsMock.mockResolvedValue({ ...emptyPage, data: tickets, total: 2 } as never);
    assignMock.mockRejectedValue(new Error('rechazo'));
    render(<AssuranceClient />);
    await user.click(await screen.findByRole('button', { name: 'Asignarme TK-031' }));
    expect(await screen.findByText('No fue posible asignarte el ticket')).toBeInTheDocument();
    expect(screen.queryByText(/quedó asignado a ti/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignarme TK-031' })).toBeEnabled();
  });

  // P2 (§3 K): la búsqueda ya no filtra la página en memoria; va a la URL y al servidor.
  it('Corr. 5 → K: la búsqueda por referencia va al servidor', async () => {
    const user = userEvent.setup();
    listTicketsMock.mockResolvedValue({ ...emptyPage, data: tickets, total: 2 } as never);
    render(<AssuranceClient />);
    await screen.findByText('TK-031');
    await user.type(screen.getByRole('searchbox'), 'ref-beta');
    await waitFor(() =>
      expect(String(mockRouterReplace.mock.calls.at(-1)?.[0])).toContain('search=ref-beta'),
    );
    expect(screen.getByText('TK-031')).toBeInTheDocument();
  });

  it('Corr. 5 (F): el resumen plegado muestra el conteo por área', async () => {
    render(<AssuranceClient />);
    const details = (await screen.findByText('Resumen de la mesa de ayuda')).closest(
      'details',
    ) as HTMLElement;
    expect(details).toHaveTextContent('Por área');
    expect(details).toHaveTextContent(/41/);
  });
});
