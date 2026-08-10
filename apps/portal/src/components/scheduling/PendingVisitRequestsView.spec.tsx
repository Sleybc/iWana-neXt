import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { PendingVisitRequestsView } from './PendingVisitRequestsView';

const useOperatingWindowMock = jest.fn();

jest.mock('./useOperatingWindow', () => ({
  useOperatingWindow: (...args: unknown[]) => useOperatingWindowMock(...args),
  getOperatingWindowMessage: (
    window: {
      status?: 'OPEN' | 'CLOSED';
      startTime?: string | null;
      endTime?: string | null;
      reason?: string | null;
    } | null,
  ) => {
    if (!window) {
      return null;
    }

    if (window.status === 'OPEN' && window.startTime && window.endTime) {
      return `Ventana operativa vigente: ${window.startTime} a ${window.endTime}.`;
    }

    return window.reason ?? null;
  },
}));

const useAuthMock = jest.fn();
const replaceMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/scheduling/pending-visits',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
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
        findOrCreateInstallation: jest.fn(),
      },
    },
    crmApi: {
      getExpediente: jest.fn(),
      listExpedientes: jest.fn(),
    },
    usersApi: {
      list: jest.fn(),
    },
    wfmApi: {
      eligibleAssignees: {
        list: jest.fn(),
      },
      visitRequests: {
        list: jest.fn(),
        filterOptions: jest.fn(),
        create: jest.fn(),
        updateContext: jest.fn(),
      },
      events: {
        list: jest.fn(),
      },
    },
  };
});

const { assuranceApi, crmApi, usersApi, wfmApi } = jest.requireMock('@/lib/api-client') as {
  assuranceApi: {
    tickets: {
      findOrCreateInstallation: jest.Mock;
    };
  };
  crmApi: {
    getExpediente: jest.Mock;
    listExpedientes: jest.Mock;
  };
  usersApi: {
    list: jest.Mock;
  };
  wfmApi: {
    eligibleAssignees: {
      list: jest.Mock;
    };
    visitRequests: {
      list: jest.Mock;
      filterOptions: jest.Mock;
      create: jest.Mock;
      updateContext: jest.Mock;
    };
    events: {
      list: jest.Mock;
    };
  };
};

function buildAuthUser(role = UserRole.ADMIN) {
  return {
    id: 'user-1',
    emailHash: 'ops@example.com',
    role,
    type: 'tenant' as const,
    tenantId: 'tenant-1',
    displayName: 'Operaciones',
    subtitle: 'Admin',
    firstName: 'Operaciones',
    lastName: 'Demo',
  };
}

function buildVisitRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-1',
    tenantId: 'tenant-1',
    status: VisitRequestStatus.READY_TO_SCHEDULE,
    originContext: WorkOrderSourceContext.CRM,
    originRef: 'EXP-001',
    originLabel: 'Oportunidad EXP-001',
    customerDisplayName: 'María Gómez',
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.HIGH,
    title: 'Instalación GPON barrio norte',
    description: 'Cliente listo para ventana PM.',
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    sector: 'Chapinero',
    latitude: null,
    longitude: null,
    requestedWindowStartAt: '2026-06-01T14:00:00.000Z',
    requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
    organizationSiteId: '77777777-7777-4777-8777-777777777777',
    expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    subscriberId: null,
    ticketId: 'TK-001',
    workOrderId: null,
    assignedEventId: null,
    scheduledStartAt: null,
    scheduledEndAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-05-30T12:00:00.000Z',
    updatedAt: '2026-05-30T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildEligibleAssignee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tech-1',
    email: 'tecnico@demo.co',
    role: UserRole.TECHNICIAN,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: '2026-05-31T10:00:00.000Z',
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnico GPON',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

describe('PendingVisitRequestsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    replaceMock.mockReset();
    searchParamsMock = new URLSearchParams();
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });
    useAuthMock.mockReturnValue({ user: buildAuthUser(), isLoading: false });
    usersApi.list.mockResolvedValue({
      data: [buildEligibleAssignee()],
      meta: { total: 1, nextCursor: null },
    });
    wfmApi.eligibleAssignees.list.mockResolvedValue([buildEligibleAssignee()]);
    wfmApi.visitRequests.list.mockResolvedValue({
      items: [buildVisitRequest()],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    wfmApi.visitRequests.filterOptions.mockResolvedValue({
      municipalities: [],
      sectors: [],
    });
    wfmApi.events.list.mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    crmApi.getExpediente.mockResolvedValue({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440111',
        fullName: 'María Gómez',
      },
    });
    crmApi.listExpedientes.mockResolvedValue({ data: [] });
  });

  it('usa asignables WFM y muestra la UI guiada por recomendaciones para roles con agenda', async () => {
    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Pendiente por agendar')).toBeInTheDocument();
    const dispatchButtons = await screen.findAllByRole('button', {
      name: 'Abrir despacho para María Gómez',
    });
    fireEvent.click(dispatchButtons[0]!);

    expect(await screen.findByText('Define duración y búsqueda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular recomendaciones' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abrir la agenda detallada' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-1&focusDate=2026-06-01',
    );

    await waitFor(() => {
      expect(wfmApi.eligibleAssignees.list).toHaveBeenCalledTimes(1);
    });
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it('oculta la agenda detallada para SALES y muestra una salida asistida desde CRM', async () => {
    useAuthMock.mockReturnValue({ user: buildAuthUser(UserRole.SALES), isLoading: false });
    searchParamsMock = new URLSearchParams({
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    });
    crmApi.getExpediente.mockResolvedValue({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440111',
        fullName: 'María Gómez',
        status: 'LISTO_PARA_INSTALACION',
        completenessOverall: 90,
        pipelineProgress: 90,
        address: 'Cra 10 # 10 - 10',
        municipality: 'Bogotá',
        neighborhood: 'Chapinero',
        zoneType: null,
        latitude: null,
        longitude: null,
        subscriberSummary: null,
        specialAccessNotes: null,
        technicalObservations: null,
      },
      completeness: {
        overall: 90,
        installationReadiness: {
          canTransition: true,
        },
      },
      installationReadiness: {
        canTransition: true,
      },
    });
    assuranceApi.tickets.findOrCreateInstallation.mockResolvedValue({
      ticket: { id: 'TK-009' },
    });
    wfmApi.visitRequests.create.mockResolvedValue(
      buildVisitRequest({
        id: 'vr-bootstrap',
        originRef: '550e8400-e29b-41d4-a716-446655440111',
        ticketId: 'TK-009',
      }),
    );

    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Modo CRM asistido')).toBeInTheDocument();
    expect(await screen.findByText('Define duración y búsqueda')).toBeInTheDocument();
    expect(
      screen.getByText(/Tu rol comercial no tiene acceso a la agenda detallada\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'abrir la agenda detallada' }),
    ).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/scheduling/pending-visits');
  });

  it('hidrata status=READY_TO_SCHEDULE desde la dirección (CA-V2-05 / I-2)', async () => {
    searchParamsMock = new URLSearchParams({ status: 'READY_TO_SCHEDULE' });

    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Pendiente por agendar')).toBeInTheDocument();
    await waitFor(() => {
      expect(wfmApi.visitRequests.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: VisitRequestStatus.READY_TO_SCHEDULE }),
      );
    });
  });
});
