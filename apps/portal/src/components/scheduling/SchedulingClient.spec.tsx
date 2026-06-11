import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { SchedulingClient } from './SchedulingClient';
import { ApiError, usersApi, wfmApi } from '@/lib/api-client';

const useAuthMock = jest.fn();
const replaceMock = jest.fn();
const useOperatingWindowMock = jest.fn();
let searchParamsMock = new URLSearchParams();
let pathnameMock = '/dashboard/scheduling/agenda';

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

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
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
    details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    usersApi: {
      list: jest.fn(),
    },
    assuranceApi: {
      tickets: {
        findOrCreateInstallation: jest.fn(),
        linkWorkOrder: jest.fn(),
      },
    },
    crmApi: {
      getExpediente: jest.fn(),
      linkInstallationOperationalRefs: jest.fn(),
      transitionExpedienteStatus: jest.fn(),
    },
    wfmApi: {
      visitRequests: {
        list: jest.fn(),
        get: jest.fn(),
        updateContext: jest.fn(),
        recommend: jest.fn(),
        schedule: jest.fn(),
      },
      events: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        transitionStatus: jest.fn(),
        reschedule: jest.fn(),
        remove: jest.fn(),
      },
      recommendations: {
        create: jest.fn(),
      },
      workOrders: {
        list: jest.fn(),
        get: jest.fn(),
        transitionStatus: jest.fn(),
      },
      dashboard: {
        getSummary: jest.fn(),
      },
      technicians: {
        listAvailability: jest.fn(),
        createAvailability: jest.fn(),
      },
    },
  };
});

const usersApiMock = usersApi as unknown as {
  list: jest.Mock;
};

const wfmApiMock = wfmApi as unknown as {
  visitRequests: {
    list: jest.Mock;
    get: jest.Mock;
    updateContext: jest.Mock;
    recommend: jest.Mock;
    schedule: jest.Mock;
  };
  events: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    transitionStatus: jest.Mock;
    reschedule: jest.Mock;
    remove: jest.Mock;
  };
  recommendations: {
    create: jest.Mock;
  };
  workOrders: {
    list: jest.Mock;
    get: jest.Mock;
    transitionStatus: jest.Mock;
  };
  dashboard: {
    getSummary: jest.Mock;
  };
  technicians: {
    listAvailability: jest.Mock;
    createAvailability: jest.Mock;
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

function buildTechnician() {
  return {
    id: 'tech-1',
    email: 'tecnico@demo.co',
    role: UserRole.TECHNICIAN,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnica de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

function buildEvent() {
  return {
    id: 'evt-1',
    tenantId: 'tenant-1',
    workOrderId: null,
    type: WfmWorkType.INSTALLATION,
    status: ScheduleEventStatus.SCHEDULED,
    title: 'Instalación GPON barrio norte',
    description: 'Coordinar ventana con cliente.',
    scheduledStartAt: '2026-05-07T13:00:00.000Z',
    scheduledEndAt: '2026-05-07T15:00:00.000Z',
    assignedUserId: 'tech-1',
    assignedTeamId: null,
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: 'TK-001',
    contractId: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    deletedAt: null,
  };
}

function buildPendingVisitRequest() {
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
  };
}

describe('SchedulingClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    replaceMock.mockReset();
    searchParamsMock = new URLSearchParams();
    pathnameMock = '/dashboard/scheduling/agenda';
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
    useAuthMock.mockReturnValue({
      user: buildAuthUser(),
      isLoading: false,
    });
    usersApiMock.list.mockResolvedValue({
      data: [buildTechnician()],
      meta: { nextCursor: null, total: 1 },
    });
    wfmApiMock.dashboard.getSummary.mockResolvedValue({
      todayCount: 1,
      overdueCount: 0,
      upcomingCount: 3,
      activeCount: 1,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 1,
        readyToScheduleCount: 1,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 1,
      },
      alerts: [],
      technicianLoad: [{ assignedUserId: 'tech-1', todayCount: 1 }],
    });
    wfmApiMock.technicians.listAvailability.mockResolvedValue([]);
    wfmApiMock.workOrders.list.mockResolvedValue([]);
    wfmApiMock.events.list.mockResolvedValue([]);
    wfmApiMock.visitRequests.list.mockResolvedValue({
      items: [],
      meta: { total: 0, page: 1, limit: 5, totalPages: 1 },
    });
    wfmApiMock.visitRequests.get.mockResolvedValue(buildPendingVisitRequest());
    wfmApiMock.visitRequests.recommend.mockResolvedValue([]);
    wfmApiMock.recommendations.create.mockResolvedValue([]);
  });

  it('muestra estado de carga mientras resuelve la sesión del portal', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true });

    render(<SchedulingClient surface="agenda" />);

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText(/Cargando la agenda operativa/i)).toBeInTheDocument();
  });

  it('renderiza error bloqueante cuando falla la carga principal de eventos', async () => {
    wfmApiMock.events.list.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Servicio caído'));

    render(<SchedulingClient surface="agenda" />);

    await waitFor(() => {
      expect(screen.getByText('No fue posible cargar la programación')).toBeInTheDocument();
    });

    expect(screen.getByText('Servicio caído')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar carga' })).toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay eventos en la lista del rango', async () => {
    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Sin eventos en el rango')).toBeInTheDocument();
  });

  it('no muestra la sección de carga por técnico en la agenda principal', async () => {
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient surface="agenda" />);

    await waitFor(() => {
      expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Carga por técnico')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacidad técnica')).not.toBeInTheDocument();
  });

  it('mapea tipo, estado y técnico al renderizar eventos cargados', async () => {
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Instalación GPON barrio norte')).toBeInTheDocument();
    expect((await screen.findAllByText('Instalación')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Programado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luisa Campos').length).toBeGreaterThan(0);
  });

  it('abre una solicitud pendiente fijada desde query y conserva la vista diaria', async () => {
    searchParamsMock = new URLSearchParams({
      source: 'pending-visits',
      visitRequestId: 'vr-1',
      focusDate: '2026-06-01',
    });

    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByText('Solicitud fijada desde pendientes')).toBeInTheDocument();
    expect(await screen.findByText('Despacho de la solicitud')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /Prefiero agendar manualmente/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(wfmApiMock.visitRequests.get).toHaveBeenCalledWith('vr-1');
    });
  });

  it('renderiza el resumen operativo y no muestra calendario completo en dashboard', async () => {
    pathnameMock = '/dashboard/scheduling';
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);
    wfmApiMock.visitRequests.list.mockResolvedValue({
      items: [buildPendingVisitRequest()],
      meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
    });

    render(<SchedulingClient surface="dashboard" />);

    expect(await screen.findByText('Programación')).toBeInTheDocument();
    expect(await screen.findByText('Decisiones pendientes')).toBeInTheDocument();
    expect(screen.getByText('Trabajos en riesgo')).toBeInTheDocument();
    expect(screen.queryByText('Agenda del día')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lista' })).not.toBeInTheDocument();
  });

  it('redirige a TECHNICIAN desde el resumen hacia agenda', async () => {
    pathnameMock = '/dashboard/scheduling';
    useAuthMock.mockReturnValue({
      user: buildAuthUser(UserRole.TECHNICIAN),
      isLoading: false,
    });

    render(<SchedulingClient surface="dashboard" />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/scheduling/agenda');
    });
  });
});
