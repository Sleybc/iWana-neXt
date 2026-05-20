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
      linkInstallationOperationalRefs: jest.fn(),
      transitionExpedienteStatus: jest.fn(),
    },
    assuranceApi: {
      tickets: {
        findOrCreateInstallation: jest.fn(),
        linkWorkOrder: jest.fn(),
      },
    },
    usersApi: {
      list: jest.fn(),
    },
    wfmApi: {
      visitRequests: {
        list: jest.fn(),
        filterOptions: jest.fn(),
        create: jest.fn(),
        updateContext: jest.fn(),
        recommend: jest.fn(),
        schedule: jest.fn(),
      },
      events: {
        list: jest.fn(),
      },
      technicians: {
        listAvailability: jest.fn(),
      },
    },
  };
});

const { crmApi, assuranceApi, usersApi, wfmApi } = jest.requireMock('@/lib/api-client') as {
  crmApi: {
    getExpediente: jest.Mock;
    linkInstallationOperationalRefs: jest.Mock;
    transitionExpedienteStatus: jest.Mock;
  };
  assuranceApi: {
    tickets: {
      findOrCreateInstallation: jest.Mock;
      linkWorkOrder: jest.Mock;
    };
  };
  usersApi: { list: jest.Mock };
  wfmApi: {
    visitRequests: {
      list: jest.Mock;
      filterOptions: jest.Mock;
      create: jest.Mock;
      updateContext: jest.Mock;
      recommend: jest.Mock;
      schedule: jest.Mock;
    };
    events: {
      list: jest.Mock;
    };
    technicians: {
      listAvailability: jest.Mock;
    };
  };
} & {
  crmApi: {
    getExpediente: jest.Mock;
    linkInstallationOperationalRefs: jest.Mock;
    transitionExpedienteStatus: jest.Mock;
  };
  assuranceApi: {
    tickets: {
      findOrCreateInstallation: jest.Mock;
      linkWorkOrder: jest.Mock;
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

async function selectVisitDuration(label = '2 h') {
  fireEvent.click(screen.getByRole('combobox', { name: 'Duración estimada' }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('PendingVisitRequestsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    replaceMock.mockReset();
    searchParamsMock = new URLSearchParams();
    useAuthMock.mockReturnValue({ user: buildAuthUser(), isLoading: false });
    usersApi.list.mockResolvedValue({
      data: [
        {
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
          jobTitle: 'Técnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        },
      ],
      meta: { nextCursor: null, total: 1 },
    });
    wfmApi.visitRequests.list.mockResolvedValue({
      items: [
        {
          id: 'vr-1',
          tenantId: 'tenant-1',
          status: VisitRequestStatus.READY_TO_SCHEDULE,
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'EXP-001',
          originLabel: 'Oportunidad EXP-001',
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.HIGH,
          title: 'Instalación GPON barrio norte',
          description: 'Cliente listo para ventana PM.',
          requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
          requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
          slaDueAt: '2026-06-02T23:59:59.000Z',
          address: 'Cra 10 # 10 - 10',
          municipality: 'Bogotá',
          sector: 'Chapinero',
          latitude: null,
          longitude: null,
          expedienteId: '550e8400-e29b-41d4-a716-446655440111',
          subscriberId: null,
          ticketId: null,
          contractId: null,
          scheduleEventId: null,
          workOrderId: null,
          requestedByUserId: 'user-1',
          scheduledByUserId: null,
          scheduledAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: '2026-05-31T10:00:00.000Z',
          updatedAt: '2026-05-31T10:00:00.000Z',
          deletedAt: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    wfmApi.visitRequests.filterOptions.mockResolvedValue({
      municipalities: [{ value: 'Bogotá', label: 'Bogotá', count: 1 }],
      sectors: [{ value: 'Chapinero', label: 'Chapinero', municipality: 'Bogotá', count: 1 }],
    });
    wfmApi.events.list.mockResolvedValue([]);
    wfmApi.technicians.listAvailability.mockResolvedValue([]);
    crmApi.getExpediente.mockResolvedValue({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440111',
        tenantId: 'tenant-1',
        status: 'LISTO_PARA_INSTALACION',
        previousStatus: null,
        statusChangedAt: '2026-05-31T10:00:00.000Z',
        discardReason: null,
        fullName: 'María Gómez',
        documentType: null,
        phonePrimaryEncrypted: null,
        emailPrimaryEncrypted: null,
        address: 'Cra 10 # 10 - 10',
        municipality: 'Bogotá',
        department: 'Cundinamarca',
        latitude: null,
        longitude: null,
        neighborhood: 'Chapinero',
        zoneType: 'Urbano',
        source: 'CRM',
        acquisitionChannel: 'DIGITAL',
        interestedPlanId: null,
        completenessCommercial: 100,
        completenessLegal: 100,
        completenessTechnical: 100,
        completenessOperational: 80,
        completenessOverall: 88,
        pipelineProgress: 88,
        subscriberSummary: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-31T10:00:00.000Z',
      },
      completeness: {
        overall: 88,
        installationReadiness: { canTransition: true, missingFields: [], title: '', message: '' },
      },
      sectionCompleteness: [],
      installationReadiness: { canTransition: true, missingFields: [], title: '', message: '' },
      missingRequirements: [],
      pipelineRecommendation: { nextStatus: 'INSTALACION_AGENDADA', reason: '' },
    });
    assuranceApi.tickets.findOrCreateInstallation.mockResolvedValue({
      ticket: { id: 'TK-100' },
      created: true,
    });
    crmApi.linkInstallationOperationalRefs.mockResolvedValue({});
    crmApi.transitionExpedienteStatus.mockResolvedValue({});
    assuranceApi.tickets.linkWorkOrder.mockResolvedValue({});
    wfmApi.visitRequests.recommend.mockResolvedValue([
      {
        technicianId: 'tech-1',
        scheduledStartAt: '2026-06-01T14:00:00.000Z',
        scheduledEndAt: '2026-06-01T16:00:00.000Z',
        score: 91,
        labels: ['Recomendado'],
        scoreBreakdown: {
          distance: 30,
          municipality: 25,
          sector: 20,
          routeContinuity: 10,
          load: 4,
          earliest: 2,
        },
        distanceKm: 1.1,
        nearestEventId: null,
        totalScheduledMinutes: 120,
        eventCount: 1,
      },
    ]);
    wfmApi.visitRequests.create.mockResolvedValue({
      id: 'vr-crm-1',
      tenantId: 'tenant-1',
      status: VisitRequestStatus.NEEDS_CONTEXT,
      originContext: WorkOrderSourceContext.CRM,
      originRef: '550e8400-e29b-41d4-a716-446655440111',
      originLabel: 'Oportunidad EXP-550E8400',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación EXP-550E8400',
      description: 'Solicitud creada desde CRM para la oportunidad EXP-550E8400.',
      requestedWindowStartAt: null,
      requestedWindowEndAt: null,
      slaDueAt: null,
      address: 'Cra 10 # 10 - 10',
      municipality: 'Bogotá',
      sector: 'Chapinero',
      latitude: null,
      longitude: null,
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
      subscriberId: null,
      ticketId: 'TK-100',
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: 'user-1',
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z',
      deletedAt: null,
    });
    wfmApi.visitRequests.updateContext.mockResolvedValue({
      id: 'vr-1',
      tenantId: 'tenant-1',
      status: VisitRequestStatus.READY_TO_SCHEDULE,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'EXP-001',
      originLabel: 'Oportunidad EXP-001',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación GPON barrio norte',
      description: 'Cliente listo para ventana PM.',
      requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
      requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
      slaDueAt: '2026-06-02T23:59:59.000Z',
      address: 'Cra 10 # 10 - 10',
      municipality: 'Bogotá',
      sector: 'Chapinero',
      latitude: null,
      longitude: null,
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
      subscriberId: null,
      ticketId: 'TK-100',
      contractId: null,
      scheduleEventId: null,
      workOrderId: null,
      requestedByUserId: 'user-1',
      scheduledByUserId: null,
      scheduledAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z',
      deletedAt: null,
    });
    wfmApi.visitRequests.schedule.mockResolvedValue({
      id: 'vr-1',
      tenantId: 'tenant-1',
      status: VisitRequestStatus.SCHEDULED,
      originContext: WorkOrderSourceContext.CRM,
      originRef: 'EXP-001',
      originLabel: 'Oportunidad EXP-001',
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.HIGH,
      title: 'Instalación GPON barrio norte',
      description: 'Cliente listo para ventana PM.',
      requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
      requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
      slaDueAt: '2026-06-02T23:59:59.000Z',
      address: 'Cra 10 # 10 - 10',
      municipality: 'Bogotá',
      sector: 'Chapinero',
      latitude: null,
      longitude: null,
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
      subscriberId: null,
      ticketId: 'TK-100',
      contractId: null,
      scheduleEventId: 'evt-1',
      workOrderId: 'wo-1',
      requestedByUserId: 'user-1',
      scheduledByUserId: 'user-1',
      scheduledAt: '2026-06-01T12:00:00.000Z',
      cancelledAt: null,
      cancelledByUserId: null,
      cancelReason: null,
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
      deletedAt: null,
    });
  });

  it('renderiza acceso restringido para TECHNICIAN', async () => {
    useAuthMock.mockReturnValue({ user: buildAuthUser(UserRole.TECHNICIAN), isLoading: false });

    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Vista no autorizada')).toBeInTheDocument();
  });

  it('carga la solicitud y calcula recomendaciones desde la bandeja', async () => {
    render(<PendingVisitRequestsView />);

    expect((await screen.findAllByText('Instalación GPON barrio norte')).length).toBeGreaterThan(0);

    const recommendButton = screen.getByRole('button', { name: 'Calcular recomendaciones' });
    expect(recommendButton).toBeDisabled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Duración estimada' }));
    fireEvent.click(await screen.findByRole('option', { name: '2 h' }));

    expect(recommendButton).toBeEnabled();

    fireEvent.click(recommendButton);

    await waitFor(() => {
      expect(wfmApi.visitRequests.recommend).toHaveBeenCalledWith(
        'vr-1',
        expect.objectContaining({
          durationMinutes: 120,
          candidateUserIds: ['tech-1'],
          searchHorizonDays: 7,
          municipality: 'Bogotá',
          sector: 'Chapinero',
        }),
      );
    });

    expect(wfmApi.visitRequests.updateContext).toHaveBeenCalled();

    expect(await screen.findByText('Score 91')).toBeInTheDocument();
    expect(screen.getAllByText('Luisa Campos').length).toBeGreaterThan(0);
  });

  it('carga filtros territoriales con conteos en la bandeja', async () => {
    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Bogotá (1)')).toBeInTheDocument();
    expect(wfmApi.visitRequests.filterOptions).toHaveBeenCalled();
  });

  it('materializa la solicitud CRM desde expedienteId en la URL y limpia el query', async () => {
    searchParamsMock = new URLSearchParams({
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    });

    render(<PendingVisitRequestsView />);

    await waitFor(() => {
      expect(crmApi.getExpediente).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440111');
    });

    expect(assuranceApi.tickets.findOrCreateInstallation).toHaveBeenCalledWith({
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
      expedienteFullName: 'María Gómez',
    });
    expect(wfmApi.visitRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originContext: WorkOrderSourceContext.CRM,
        expedienteId: '550e8400-e29b-41d4-a716-446655440111',
        municipality: 'Bogotá',
        sector: 'Chapinero',
        ticketId: 'TK-100',
      }),
    );
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/scheduling/pending-visits');
  });

  it('mantiene visible y seleccionada la solicitud CRM nueva aunque la recarga inmediata no la devuelva', async () => {
    searchParamsMock = new URLSearchParams({
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    });

    const staleInboxResponse = {
      items: [
        {
          id: 'vr-1',
          tenantId: 'tenant-1',
          status: VisitRequestStatus.READY_TO_SCHEDULE,
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'EXP-001',
          originLabel: 'Oportunidad EXP-001',
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.HIGH,
          title: 'Instalación GPON barrio norte',
          description: 'Cliente listo para ventana PM.',
          requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
          requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
          slaDueAt: '2026-06-02T23:59:59.000Z',
          address: 'Cra 10 # 10 - 10',
          municipality: 'Bogotá',
          sector: 'Chapinero',
          latitude: null,
          longitude: null,
          expedienteId: '550e8400-e29b-41d4-a716-446655440111',
          subscriberId: null,
          ticketId: null,
          contractId: null,
          scheduleEventId: null,
          workOrderId: null,
          requestedByUserId: 'user-1',
          scheduledByUserId: null,
          scheduledAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: '2026-05-31T10:00:00.000Z',
          updatedAt: '2026-05-31T10:00:00.000Z',
          deletedAt: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    };
    let resolveInitialInbox!: (value: typeof staleInboxResponse) => void;
    const initialInboxRequest = new Promise<typeof staleInboxResponse>((resolve) => {
      resolveInitialInbox = resolve;
    });

    wfmApi.visitRequests.list.mockReset();
    wfmApi.visitRequests.list
      .mockReturnValueOnce(initialInboxRequest)
      .mockResolvedValue(staleInboxResponse);

    render(<PendingVisitRequestsView />);

    expect((await screen.findAllByText('Instalación EXP-550E8400')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oportunidad EXP-550E8400').length).toBeGreaterThan(0);

    resolveInitialInbox(staleInboxResponse);

    await waitFor(() => {
      expect(screen.getAllByText('Instalación EXP-550E8400').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Oportunidad EXP-550E8400').length).toBeGreaterThan(0);
  });

  it('humaniza municipio y sector en el formulario de contexto cuando llegan en snake case', async () => {
    wfmApi.visitRequests.list.mockResolvedValueOnce({
      items: [
        {
          id: 'vr-raw-1',
          tenantId: 'tenant-1',
          status: VisitRequestStatus.NEEDS_CONTEXT,
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'EXP-RAW-1',
          originLabel: 'Oportunidad EXP-RAW-1',
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.NORMAL,
          title: 'Instalación 2A8C632D',
          description: 'Solicitud creada desde CRM.',
          requestedWindowStartAt: null,
          requestedWindowEndAt: null,
          slaDueAt: null,
          address: 'FCA LA CAROLINA',
          municipality: 'EL_COLEGIO',
          sector: 'VDA_LA_VIRGINIA',
          latitude: null,
          longitude: null,
          expedienteId: '550e8400-e29b-41d4-a716-446655440222',
          subscriberId: null,
          ticketId: 'TK-200',
          contractId: null,
          scheduleEventId: null,
          workOrderId: null,
          requestedByUserId: 'user-1',
          scheduledByUserId: null,
          scheduledAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: '2026-05-31T10:00:00.000Z',
          updatedAt: '2026-05-31T10:00:00.000Z',
          deletedAt: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    render(<PendingVisitRequestsView />);

    expect((await screen.findAllByText('Instalación 2A8C632D')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Contexto operativo y ventana/i }));

    expect(await screen.findByDisplayValue('El Colegio')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vda la Virginia')).toBeInTheDocument();
  });

  it('sincroniza CRM y Assurance cuando agenda una solicitud originada en CRM', async () => {
    render(<PendingVisitRequestsView />);

    expect((await screen.findAllByText('Instalación GPON barrio norte')).length).toBeGreaterThan(0);
    await selectVisitDuration();
    fireEvent.click(await screen.findByRole('button', { name: 'Calcular recomendaciones' }));

    expect(await screen.findByText('Score 91')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar franja seleccionada' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar agenda' }));

    await waitFor(() => {
      expect(assuranceApi.tickets.linkWorkOrder).toHaveBeenCalledWith('TK-100', {
        workOrderId: 'wo-1',
      });
    });

    expect(crmApi.linkInstallationOperationalRefs).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440111',
      {
        ticketId: 'TK-100',
        workOrderId: 'wo-1',
      },
    );
    expect(crmApi.transitionExpedienteStatus).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440111',
      {
        targetStatus: 'INSTALACION_AGENDADA',
        reason: 'Instalación agendada desde WFM',
      },
    );
    expect(wfmApi.visitRequests.schedule).toHaveBeenCalledWith('vr-1', {
      assignedUserId: 'tech-1',
      scheduledStartAt: '2026-06-01T14:00:00.000Z',
      scheduledEndAt: '2026-06-01T16:00:00.000Z',
      createWorkOrder: true,
      workOrderNotes: 'Cliente listo para ventana PM.',
    });
  });

  it('permite a SALES operar solo el flujo CRM asistido sin cargar la bandeja global', async () => {
    searchParamsMock = new URLSearchParams({
      expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    });
    useAuthMock.mockReturnValue({ user: buildAuthUser(UserRole.SALES), isLoading: false });

    render(<PendingVisitRequestsView />);

    await waitFor(() => {
      expect(crmApi.getExpediente).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440111');
    });

    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    expect(await screen.findByText('Modo CRM asistido')).toBeInTheDocument();
  });

  it('bloquea edición y recomendación cuando la solicitud está en estado terminal', async () => {
    wfmApi.visitRequests.list.mockResolvedValueOnce({
      items: [
        {
          id: 'vr-closed-1',
          tenantId: 'tenant-1',
          status: VisitRequestStatus.SCHEDULED,
          originContext: WorkOrderSourceContext.CRM,
          originRef: 'EXP-LOCK-1',
          originLabel: 'Oportunidad EXP-LOCK-1',
          workType: WfmWorkType.INSTALLATION,
          priority: WorkOrderPriority.NORMAL,
          title: 'Instalación ya agendada',
          description: 'No debe permitir nuevas recomendaciones.',
          requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
          requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
          slaDueAt: null,
          address: 'Cra 10 # 10 - 10',
          municipality: 'Bogotá',
          sector: 'Chapinero',
          latitude: null,
          longitude: null,
          expedienteId: '550e8400-e29b-41d4-a716-446655440999',
          subscriberId: null,
          ticketId: null,
          contractId: null,
          scheduleEventId: 'evt-closed-1',
          workOrderId: 'wo-closed-1',
          requestedByUserId: 'user-1',
          scheduledByUserId: 'user-1',
          scheduledAt: '2026-06-01T12:00:00.000Z',
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: '2026-05-31T10:00:00.000Z',
          updatedAt: '2026-06-01T12:00:00.000Z',
          deletedAt: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    render(<PendingVisitRequestsView />);

    expect(await screen.findByText('Solicitud cerrada para despacho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular recomendaciones' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Contexto operativo y ventana/i }));
    expect(screen.getByRole('button', { name: 'Guardar contexto' })).toBeDisabled();
  });
});
