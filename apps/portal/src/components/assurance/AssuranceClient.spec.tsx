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
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: UserRole.ADMIN, tenantId: 'tenant-1' },
    isLoading: false,
  }),
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
    await user.type(screen.getByLabelText('Asunto operativo'), 'Sin servicio');
    await user.selectOptions(
      screen.getByLabelText('Decisión de campo'),
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

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    await user.click(await screen.findByRole('tab', { name: 'Acciones' }));
    await user.click(await screen.findByRole('button', { name: 'Crear tarea vinculada' }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      '/dashboard/operations?ticketId=ticket-123&fromAssurance=1',
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
