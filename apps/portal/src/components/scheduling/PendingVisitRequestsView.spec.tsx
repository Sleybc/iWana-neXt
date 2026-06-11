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
    crmApi: {
      getExpediente: jest.fn(),
      listExpedientes: jest.fn(),
    },
    assuranceApi: {
      tickets: {
        findOrCreateInstallation: jest.fn(),
      },
    },
    wfmApi: {
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

const { crmApi, assuranceApi, wfmApi } = jest.requireMock('@/lib/api-client') as {
  crmApi: {
    getExpediente: jest.Mock;
    listExpedientes: jest.Mock;
  };
  assuranceApi: {
    tickets: {
      findOrCreateInstallation: jest.Mock;
    };
  };
  wfmApi: {
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
    wfmApi.visitRequests.list.mockResolvedValue({
      items: [buildVisitRequest()],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    wfmApi.visitRequests.filterOptions.mockResolvedValue({
      municipalities: [],
      sectors: [],
    });
    wfmApi.events.list.mockResolvedValue([]);
    crmApi.getExpediente.mockResolvedValue({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440111',
        fullName: 'María Gómez',
      },
    });
    crmApi.listExpedientes.mockResolvedValue({ data: [] });
  });

  it('muestra la bandeja con detalle lateral y no renderiza la matriz semanal', async () => {
    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Pendiente por agendar')).toBeInTheDocument();
    expect(await screen.findByText('Contexto operativo')).toBeInTheDocument();
    expect(screen.queryByText('Capacidad por técnico')).not.toBeInTheDocument();
    expect(screen.queryByText('Matriz semanal')).not.toBeInTheDocument();
    expect(screen.queryByText('Calcular recomendaciones')).not.toBeInTheDocument();
  });

  it('guarda el contexto ligero desde el panel lateral', async () => {
    wfmApi.visitRequests.updateContext.mockResolvedValue(buildVisitRequest());

    render(<PendingVisitRequestsView />);

    await screen.findByText('Pendiente por agendar');
    await waitFor(() => {
      expect(screen.getByLabelText('Dirección operativa', { selector: 'input' })).toHaveValue(
        'Cra 10 # 10 - 10',
      );
      expect(screen.getByLabelText('Municipio', { selector: 'input' })).toHaveValue('Bogotá');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contexto' }));

    await waitFor(() => {
      expect(wfmApi.visitRequests.updateContext).toHaveBeenCalledWith('vr-1', {
        address: 'Cra 10 # 10 - 10',
        municipality: 'Bogotá',
        sector: 'Chapinero',
        description: 'Cliente listo para ventana PM.',
        requestedWindowStartAt: '2026-06-01T14:00:00.000Z',
        requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
      });
    });
    expect(
      await screen.findByText(
        'La solicitud Instalación GPON barrio norte actualizó su contexto operativo.',
      ),
    ).toBeInTheDocument();
  });

  it('construye el handoff hacia scheduling con la solicitud fijada', async () => {
    render(<PendingVisitRequestsView />);

    const openInAgenda = await screen.findByRole('link', { name: 'Abrir en agenda' });
    expect(openInAgenda).toHaveAttribute(
      'href',
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-1&focusDate=2026-06-01',
    );
  });

  it('materializa una solicitud desde CRM cuando llega el expediente por query', async () => {
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

    await waitFor(() => {
      expect(wfmApi.visitRequests.create).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(
        'La solicitud Instalación GPON barrio norte quedó abierta en la bandeja.',
      ),
    ).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/scheduling/pending-visits');
  });
});
