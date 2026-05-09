import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScheduleEventStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { SchedulingClient } from './SchedulingClient';
import { ApiError, usersApi, wfmApi } from '@/lib/api-client';

const useAuthMock = jest.fn();

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
    wfmApi: {
      events: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        transitionStatus: jest.fn(),
        reschedule: jest.fn(),
        remove: jest.fn(),
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
  events: {
    list: jest.Mock;
    get: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    transitionStatus: jest.Mock;
    reschedule: jest.Mock;
    remove: jest.Mock;
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

describe('SchedulingClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      alerts: [],
      technicianLoad: [{ assignedUserId: 'tech-1', todayCount: 1 }],
    });
    wfmApiMock.technicians.listAvailability.mockResolvedValue([]);
    wfmApiMock.workOrders.list.mockResolvedValue([]);
    wfmApiMock.events.list.mockResolvedValue([]);
  });

  it('muestra estado de carga mientras resuelve la sesión del portal', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true });

    render(<SchedulingClient />);

    expect(screen.getByText('Programacion')).toBeInTheDocument();
    expect(screen.getByText(/Cargando agenda operativa/i)).toBeInTheDocument();
  });

  it('renderiza error bloqueante cuando falla la carga principal de eventos', async () => {
    wfmApiMock.events.list.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Servicio caído'));

    render(<SchedulingClient />);

    await waitFor(() => {
      expect(screen.getByText('No fue posible cargar la programación')).toBeInTheDocument();
    });

    expect(screen.getByText('Servicio caído')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar carga' })).toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay eventos en la lista del rango', async () => {
    render(<SchedulingClient />);

    await waitFor(() => {
      expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Sin eventos en el rango')).toBeInTheDocument();
  });

  it('no revienta cuando la carga de eventos retorna undefined y cae a lista vacía', async () => {
    wfmApiMock.events.list.mockResolvedValue(undefined);

    render(<SchedulingClient />);

    await waitFor(() => {
      expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Sin eventos en el rango')).toBeInTheDocument();
  });

  it('mapea tipo, estado y técnico al renderizar eventos cargados', async () => {
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Instalación GPON barrio norte')).toBeInTheDocument();
    expect((await screen.findAllByText('Instalación')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Programado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luisa Campos').length).toBeGreaterThan(0);
  });

  it('muestra command center por defecto para ADMIN y abre detalle desde una alerta', async () => {
    wfmApiMock.dashboard.getSummary.mockResolvedValue({
      todayCount: 1,
      overdueCount: 1,
      upcomingCount: 2,
      activeCount: 1,
      enRouteCount: 0,
      atRiskCount: 1,
      alerts: [
        {
          id: 'overdue-evt-1',
          type: 'OVERDUE_EVENT',
          severity: 'critical',
          title: 'Evento atrasado',
          description: 'Instalación GPON barrio norte',
          eventId: 'evt-1',
          assignedUserId: 'tech-1',
          scheduledStartAt: '2026-05-07T13:00:00.000Z',
        },
      ],
      technicianLoad: [
        {
          assignedUserId: 'tech-1',
          todayCount: 1,
          overdueCount: 1,
          totalScheduledMinutes: 420,
          utilizationPercent: 88,
          riskLevel: 'HIGH',
        },
      ],
    });
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);
    wfmApiMock.events.get.mockResolvedValue(buildEvent());

    render(<SchedulingClient />);

    expect(await screen.findByText('Command center')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir alerta Evento atrasado/i }));

    await waitFor(() => {
      expect(wfmApiMock.events.get).toHaveBeenCalledWith('evt-1');
    });
  });

  it('no solicita summary global ni muestra command center para TECHNICIAN', async () => {
    useAuthMock.mockReturnValue({
      user: buildAuthUser(UserRole.TECHNICIAN),
      isLoading: false,
    });
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient />);

    await waitFor(() => {
      expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
    });

    expect(wfmApiMock.dashboard.getSummary).not.toHaveBeenCalled();
    expect(wfmApiMock.technicians.listAvailability).not.toHaveBeenCalled();
    expect(screen.queryByText('Command center')).not.toBeInTheDocument();
  });
});
