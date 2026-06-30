import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { SchedulingClient } from './SchedulingClient';
import { ApiError, tasksApi, wfmApi } from '@/lib/api-client';

const useAuthMock = jest.fn();
const replaceMock = jest.fn();
const useOperatingWindowMock = jest.fn();
let searchParamsMock = new URLSearchParams();
let pathnameMock = '/dashboard/scheduling/agenda';
const TECHNICIAN_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('./useOperatingWindow', () => ({
  useOperatingWindow: (...args: unknown[]) => useOperatingWindowMock(...args),
  useDailyDisplayOperatingWindow: () => ({
    operatingWindow: {
      status: 'OPEN',
      source: 'COMPANY_HOURS',
      startTime: '08:00',
      endTime: '18:00',
      reason: null,
    },
    isLoadingOperatingWindow: false,
    operatingWindowError: null,
  }),
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
    tasksApi: {
      create: jest.fn(),
      linkScheduleEvent: jest.fn(),
      linkWorkOrder: jest.fn(),
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
        moveToPending: jest.fn(),
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
      eligibleAssignees: {
        list: jest.fn(),
      },
      technicians: {
        listAvailability: jest.fn(),
        createAvailability: jest.fn(),
      },
    },
  };
});

const tasksApiMock = tasksApi as unknown as {
  create: jest.Mock;
  linkScheduleEvent: jest.Mock;
  linkWorkOrder: jest.Mock;
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
    moveToPending: jest.Mock;
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
  eligibleAssignees: {
    list: jest.Mock;
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
    id: TECHNICIAN_ID,
    email: 'tecnico@demo.co',
    role: UserRole.TECHNICIAN,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: true,
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
    assignedUserId: TECHNICIAN_ID,
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

function buildEventForVisibleDay(index: number, day = new Date()) {
  const scheduledStartAt = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    7 + (index % 10),
    (index % 2) * 30,
    0,
    0,
  );
  const scheduledEndAt = new Date(scheduledStartAt.getTime() + 45 * 60 * 1000);

  return {
    ...buildEvent(),
    id: `evt-${index}`,
    title: `Instalación ${index}`,
    scheduledStartAt: scheduledStartAt.toISOString(),
    scheduledEndAt: scheduledEndAt.toISOString(),
  };
}

function buildHighDensityVisibleDayEvents(count = 20) {
  return Array.from({ length: count }, (_value, index) => buildEventForVisibleDay(index + 1));
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
    wfmApiMock.eligibleAssignees.list.mockResolvedValue([buildTechnician()]);
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
      technicianLoad: [{ assignedUserId: TECHNICIAN_ID, todayCount: 1 }],
    });
    wfmApiMock.technicians.listAvailability.mockResolvedValue([]);
    wfmApiMock.workOrders.list.mockResolvedValue([]);
    wfmApiMock.events.list.mockResolvedValue([]);
    wfmApiMock.events.get.mockResolvedValue(buildEvent());
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

  it('arranca en día y separa vistas operativas de analíticas en el toolbar', async () => {
    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByRole('button', { name: 'Día' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const operationalViews = screen.getByRole('group', { name: 'Vistas operativas' });
    expect(within(operationalViews).getByRole('button', { name: 'Día' })).toBeInTheDocument();
    expect(within(operationalViews).getByRole('button', { name: 'Lista' })).toBeInTheDocument();

    const analyticalViews = screen.getByRole('group', { name: 'Vistas analíticas' });
    expect(within(analyticalViews).getByRole('button', { name: 'Semana' })).toBeInTheDocument();
    expect(within(analyticalViews).getByRole('button', { name: 'Mes' })).toBeInTheDocument();
  });

  it('recomienda lista cuando la jornada visible alcanza alta densidad', async () => {
    wfmApiMock.events.list.mockResolvedValue(buildHighDensityVisibleDayEvents());

    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByText('Jornada de alto volumen')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Para revisar todas las tareas del día, usa Lista. Vuelve a Día para despachar y ajustar la jornada visible.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Lista queda recomendada para revisar el volumen completo cuando esta jornada cruza alta densidad.',
      ),
    ).not.toBeInTheDocument();
  });

  it('mantiene la vista elegida manualmente aunque el día tenga alta densidad', async () => {
    wfmApiMock.events.list.mockResolvedValue(buildHighDensityVisibleDayEvents());

    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Semana' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('muestra lista como superficie recomendada cuando el usuario cambia desde una jornada densa', async () => {
    wfmApiMock.events.list.mockResolvedValue(buildHighDensityVisibleDayEvents());

    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Superficie recomendada activa')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Estás viendo la superficie recomendada para jornadas de alto volumen dentro del rango visible.',
      ),
    ).toBeInTheDocument();
  });

  it('mantiene disponible el CTA de tarea rápida sobre la jornada diaria', async () => {
    render(<SchedulingClient surface="agenda" />);

    expect(
      await screen.findByRole('button', { name: /Crear evento para Luisa Campos a las 07:00/i }),
    ).toBeInTheDocument();
  });

  it('abre el mismo wizard desde quick create con valores de franja precargados', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-23T06:00:00'));

    try {
      render(<SchedulingClient surface="agenda" />);

      fireEvent.click(
        await screen.findByRole('button', { name: /Crear evento para Luisa Campos a las 07:00/i }),
      );

      expect(await screen.findByText('Crear tarea con agenda sugerida')).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/Paso 1 de 3/)).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Responsable' })).toHaveTextContent(
        'Luisa Campos',
      );

      fireEvent.change(within(dialog).getByLabelText('Titulo'), {
        target: { value: 'Visita rapida centro' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));

      await waitFor(() => {
        expect(within(dialog).getByText(/Paso 2 de 3/)).toBeInTheDocument();
      });
      expect(within(dialog).getByText('Agenda - Tipo de Trabajo')).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Hora de llegada' })).toHaveTextContent(
        '07:00',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('abre la jornada diaria desde una celda del mes para conservar el contexto operativo', async () => {
    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mes' }));
    const [firstOpenDayButton] = await screen.findAllByRole('button', { name: /Abrir día/i });

    expect(firstOpenDayButton).toBeDefined();
    fireEvent.click(firstOpenDayButton as HTMLElement);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('no muestra la sección de carga por recurso en la agenda principal', async () => {
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient surface="agenda" />);

    await waitFor(() => {
      expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Carga por recurso')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacidad operativa')).not.toBeInTheDocument();
  });

  it('mapea tipo, estado y técnico al renderizar eventos cargados', async () => {
    wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Lista' }));

    expect(await screen.findByText('Instalación GPON barrio norte')).toBeInTheDocument();
    expect((await screen.findAllByText('Instalación')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Programado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luisa Campos').length).toBeGreaterThan(0);
    expect(wfmApiMock.eligibleAssignees.list.mock.calls.length).toBeGreaterThan(0);
  });

  it('mueve un evento a pendientes desde el detalle y refresca agenda y pendientes', async () => {
    const event = {
      ...buildEventForVisibleDay(1),
      title: 'Instalación GPON barrio norte',
    };
    wfmApiMock.events.list.mockResolvedValue([event]);
    wfmApiMock.events.get.mockResolvedValue(event);
    wfmApiMock.events.moveToPending.mockResolvedValue(buildPendingVisitRequest());
    wfmApiMock.visitRequests.list.mockResolvedValue({
      items: [buildPendingVisitRequest()],
      meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
    });

    render(<SchedulingClient surface="agenda" />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Evento Instalación GPON barrio norte de/i,
      }),
    );

    expect(await screen.findByText('Instalación GPON barrio norte')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mover a pendientes' }));

    expect(await screen.findByText('Mover a pendientes')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Motivo opcional'), {
      target: { value: 'Cliente pidió una nueva ventana.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar movimiento' }));

    await waitFor(() => {
      expect(wfmApiMock.events.moveToPending).toHaveBeenCalledWith('evt-1', {
        reason: 'Cliente pidió una nueva ventana.',
      });
    });

    await waitFor(() => {
      expect(wfmApiMock.events.list.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(wfmApiMock.visitRequests.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(
      await screen.findByText(
        'El evento volvió a pendientes para reprocesar su nueva ventana de atención.',
      ),
    ).toBeInTheDocument();
  });

  it('abre una solicitud pendiente fijada desde query y conserva la vista diaria', async () => {
    searchParamsMock = new URLSearchParams({
      source: 'pending-visits',
      visitRequestId: 'vr-1',
      focusDate: '2026-06-01',
    });

    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByText('Despacho de la solicitud')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar panel' })).toBeInTheDocument();
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
    expect(
      screen.getByText(
        'Dashboard inicial del módulo para ubicar prioridades, revisar presión operativa y decidir dónde entrar a trabajar.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Capacidad operativa')).toBeInTheDocument();
    expect(screen.getByText('Riesgos que requieren atención')).toBeInTheDocument();
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

  it('shows manual visit language instead of generic business capture', async () => {
    render(<SchedulingClient surface="agenda" />);

    expect(await screen.findByText('Crear solicitud manual')).toBeInTheDocument();
    expect(screen.queryByText('Agendar tarea')).not.toBeInTheDocument();
  });
});
