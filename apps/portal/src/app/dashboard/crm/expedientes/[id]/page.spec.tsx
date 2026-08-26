import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExpedienteDetailPage from './page';
import { crmApi, usersApi } from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { invalidateExpedienteTimelineCache } from '@/components/crm/expedientes/expediente-detail-cache';

const mockPush = jest.fn();
const mockBack = jest.fn();
let currentExpedienteId = 'exp-1';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: currentExpedienteId }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createCrmVisitRequestAndRoute: jest.fn(),
  resolveCrmInstallationFieldWork: jest.fn().mockResolvedValue({
    kind: 'none',
    visitRequestId: null,
    scheduleEventId: null,
    activeEventStatus: null,
    scheduledStartAt: null,
    assignedUserId: null,
    href: null,
  }),
}));

jest.mock('@/components/crm/expedientes/useCrmInstallationFieldWork', () => ({
  useCrmInstallationFieldWork: () => ({
    fieldWork: {
      kind: 'none',
      visitRequestId: null,
      scheduleEventId: null,
      activeEventStatus: null,
      scheduledStartAt: null,
      assignedUserId: null,
      href: null,
    },
    isLoading: false,
    error: null,
    load: jest.fn().mockResolvedValue({
      kind: 'none',
      visitRequestId: null,
      scheduleEventId: null,
      activeEventStatus: null,
      scheduledStartAt: null,
      assignedUserId: null,
      href: null,
    }),
  }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      displayName: 'Laura Comercial',
      firstName: 'Laura',
      lastName: 'Comercial',
      role: 'SALES',
      tenantId: 'tenant-1',
    },
  }),
}));

jest.mock('@/components/crm/expedientes/ExpedienteHeader', () => ({
  ExpedienteHeader: ({ fullName }: { fullName?: string }) => (
    <div>{fullName ?? 'Header expediente'}</div>
  ),
}));

jest.mock('@/components/crm/expedientes/expediente-detail-cache', () => ({
  ...jest.requireActual('@/components/crm/expedientes/expediente-detail-cache'),
  invalidateExpedienteTimelineCache: jest.fn(),
}));

jest.mock('@/components/crm/expedientes/ExpedienteConversionBanner', () => ({
  ExpedienteConversionBanner: () => <div>Banner conversión</div>,
}));

jest.mock('@/components/crm/expedientes/sections', () => {
  const actual = jest.requireActual('@/components/crm/expedientes/sections');
  return {
    ...actual,
    ExpedienteSections: () => <div>Contenido gestión</div>,
  };
});

jest.mock('@/components/crm/expedientes/sections/ExpedienteSections', () => ({
  ExpedienteSections: ({ onSaveSection }: { onSaveSection: (section: string) => void }) => (
    <div>
      <div>Contenido gestión</div>
      <button type="button" onClick={() => onSaveSection('contact')}>
        Guardar sección
      </button>
    </div>
  ),
}));

jest.mock('@/components/crm/expedientes/SeguimientoTab', () => ({
  SeguimientoTab: () => <div>Contenido seguimiento</div>,
}));

jest.mock('@/components/crm/expedientes/ExpedienteTabsContainer', () => {
  const React = require('react') as typeof import('react');

  return {
    ExpedienteTabsContainer: ({
      defaultTab,
      tabs,
      onTabChange,
    }: {
      defaultTab: string;
      tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
      onTabChange?: (tabId: string) => void | Promise<void>;
    }) => {
      const [activeTab, setActiveTab] = React.useState(defaultTab);
      const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

      return (
        <div>
          <div>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  void onTabChange?.(tab.id);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div>{currentTab?.content}</div>
        </div>
      );
    },
  };
});

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status = 400;
    code = 'VALIDATION_ERROR';
    details?: unknown;
  },
  crmApi: {
    getExpediente: jest.fn(),
    getExpedienteBootstrap: jest.fn(),
    getExpedienteTimelinePage: jest.fn(),
    getExpedienteTimeline: jest.fn(),
    getAttribution: jest.fn(),
    getAttributionHistory: jest.fn(),
    getResponsibility: jest.fn(),
    getResponsibilityHistory: jest.fn(),
    transitionExpedienteStatus: jest.fn(),
    updateExpedienteSection: jest.fn(),
    reactivateExpediente: jest.fn(),
  },
  commercialApi: {
    searchPlansForPicker: jest.fn(),
    searchAdditionalProductsForPicker: jest.fn(),
    searchAdditionalServicesForPicker: jest.fn(),
    getPlanById: jest.fn(),
    getCatalogItemById: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
    searchForPicker: jest.fn(),
  },
  mapPickerSearchResponse: ({
    data,
    total,
  }: {
    data: Array<{ id: string; label: string; sublabel?: string | null }>;
    total: number;
  }) => ({ items: data, total }),
}));

const crmApiMock = crmApi as unknown as {
  getExpediente: jest.Mock;
  getExpedienteBootstrap: jest.Mock;
  getExpedienteTimelinePage: jest.Mock;
  getExpedienteTimeline: jest.Mock;
  getAttribution: jest.Mock;
  getAttributionHistory: jest.Mock;
  getResponsibility: jest.Mock;
  getResponsibilityHistory: jest.Mock;
  transitionExpedienteStatus: jest.Mock;
  updateExpedienteSection: jest.Mock;
  reactivateExpediente: jest.Mock;
};

const usersApiMock = usersApi as unknown as {
  list: jest.Mock;
  searchForPicker: jest.Mock;
};

const createCrmVisitRequestAndRouteMock = jest.mocked(createCrmVisitRequestAndRoute);

function buildExpediente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    tenantId: 'tenant-1',
    status: 'NUEVO_POTENCIAL',
    previousStatus: null,
    assignedTo: null,
    dataConsentRevoked: false,
    statusChangedAt: '2026-06-01T10:00:00.000Z',
    discardReason: null,
    fullName: 'Juan Perez',
    documentType: 'CC',
    documentNumber: '123456789',
    personType: 'PERSONA_NATURAL',
    firstName: 'Juan',
    lastName: 'Perez',
    phonePrimaryEncrypted: null,
    phonePrimary: '3001234567',
    emailPrimaryEncrypted: null,
    emailPrimary: 'juan@example.com',
    address: 'Calle 1',
    municipality: 'EL_COLEGIO',
    department: 'CUNDINAMARCA',
    postalCode: '252601',
    stratum: 3,
    source: 'WEB',
    acquisitionChannel: 'WEB',
    sourceDetail: 'Formulario web',
    interestedPlanId: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    completenessCommercial: 40,
    completenessLegal: 30,
    completenessTechnical: 20,
    completenessOperational: 10,
    completenessOverall: 30,
    pipelineProgress: 30,
    subscriberSummary: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
    ...overrides,
  };
}

function buildExpedienteResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: buildExpediente(),
    completeness: {
      commercial: 40,
      legal: 30,
      technical: 20,
      operational: 10,
      overall: 30,
      sectionCompleteness: [
        {
          key: 'identification',
          label: 'Identificación',
          percentage: 100,
          completedFields: 4,
          totalFields: 4,
          missingFields: [],
        },
      ],
      installationReadiness: {
        status: 'NOT_READY',
        canTransition: false,
        title: 'No listo para instalación',
        message: 'Completa viabilidad técnica.',
      },
      missingRequirements: [
        {
          sectionKey: 'contact',
          sectionLabel: 'Contacto',
          fieldKey: 'phonePrimary',
          fieldLabel: 'Teléfono primario',
        },
      ],
    },
    pipelineRecommendation: {
      currentStatus: 'NUEVO_POTENCIAL',
      suggestedStatus: 'PRECALIFICADO',
      recommendationReason: 'Completa validación de contacto para avanzar.',
      blockingRequirements: [
        {
          sectionKey: 'contact',
          sectionLabel: 'Contacto',
          fieldKey: 'phonePrimary',
          fieldLabel: 'Teléfono primario',
        },
      ],
      informationalRequirements: [
        {
          sectionKey: 'technical_feasibility',
          sectionLabel: 'Viabilidad técnica',
          fieldKey: 'coverageResult',
          fieldLabel: 'Resultado cobertura',
        },
      ],
    },
    ...overrides,
  };
}

function buildExpedienteBootstrapResponse(
  overrides: Record<string, unknown> = {},
  expedienteOverrides: Record<string, unknown> = {},
) {
  const heavyResponse = buildExpedienteResponse();
  return {
    data: {
      expediente: {
        id: 'exp-1',
        status: 'NUEVO_POTENCIAL',
        previousStatus: null,
        statusChangedAt: '2026-06-01T10:00:00.000Z',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-02T10:00:00.000Z',
        fullName: 'Juan Perez',
        documentType: 'CC',
        personType: 'PERSONA_NATURAL',
        dataConsentRevoked: false,
        hasLocation: true,
        source: 'WEB',
        acquisitionChannel: 'WEB',
        interestedPlanId: null,
        additionalProductIds: [],
        additionalServiceIds: [],
        ...expedienteOverrides,
      },
      completeness: heavyResponse.completeness,
      pipelineRecommendation: heavyResponse.pipelineRecommendation,
      operationalMetadata: {
        createdBy: { userId: 'user-1', name: 'Laura Comercial' },
        lastEditedBy: { userId: 'user-1', name: 'Laura Comercial' },
        lastActivityAt: '2026-06-02T10:00:00.000Z',
      },
      currentAttribution: null,
      responsibility: null,
      subscriberSummary: null,
      ...overrides,
    },
  };
}

describe('ExpedienteDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentExpedienteId = 'exp-1';

    crmApiMock.getExpediente.mockResolvedValue(buildExpedienteResponse());
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(buildExpedienteBootstrapResponse());
    crmApiMock.getExpedienteTimeline.mockResolvedValue({
      data: {
        changes: [],
        activities: [],
        metadata: {
          createdBy: { userId: 'user-1', name: 'Laura Comercial' },
          lastEditedBy: { userId: 'user-1', name: 'Laura Comercial' },
          lastActivityAt: '2026-06-02T10:00:00.000Z',
        },
      },
    });
    crmApiMock.getAttribution.mockResolvedValue({ data: null });
    crmApiMock.getAttributionHistory.mockResolvedValue({ data: [] });
    crmApiMock.getResponsibility.mockResolvedValue({ data: null });
    crmApiMock.getResponsibilityHistory.mockResolvedValue({ data: [] });
    crmApiMock.transitionExpedienteStatus.mockResolvedValue({ data: {}, transitionWarning: null });
    jest.mocked(invalidateExpedienteTimelineCache).mockClear();

    usersApiMock.list.mockResolvedValue({
      data: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });
    usersApiMock.searchForPicker.mockResolvedValue({ data: [], total: 0 });
  });

  it('renderiza la acción recomendada con bloqueantes y recomendados', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument();
    });

    expect(screen.getByText(/Avanzar a Precalificado/i)).toBeInTheDocument();
    expect(screen.getByText(/Bloqueantes para avanzar: 1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Contacto: Teléfono primario/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recomendado para cerrar mejor: 1 pendiente/i)).toBeInTheDocument();
    expect(screen.getByText('Ubicación registrada')).toBeInTheDocument();
    expect(screen.getByText('La dirección exacta se consulta en Gestión.')).toBeInTheDocument();
    expect(screen.queryByText('Calle 1')).not.toBeInTheDocument();
  });

  it('define bootstrap como contrato inicial y no carga historiales al abrir el detalle', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument();
    });

    expect(crmApiMock.getExpedienteBootstrap).toHaveBeenCalledWith('exp-1');
    expect(crmApiMock.getExpedienteBootstrap).toHaveBeenCalledTimes(1);
    expect(crmApiMock.getExpediente).not.toHaveBeenCalled();
    expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
    expect(crmApiMock.getAttribution).not.toHaveBeenCalled();
    expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibility).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();
  });

  it('conserva dataConsentRevoked desde bootstrap sin cargar el detalle pesado', async () => {
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse({}, { dataConsentRevoked: true }),
    );

    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText('El consentimiento de tratamiento de datos fue revocado.'),
      ).toBeInTheDocument();
    });
    expect(crmApiMock.getExpediente).not.toHaveBeenCalled();
  });

  it('conserva el consentimiento del bootstrap cuando el detalle legacy no lo trae', async () => {
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse({}, { dataConsentRevoked: true }),
    );
    crmApiMock.getExpediente.mockResolvedValue(
      buildExpedienteResponse({
        data: buildExpediente({ dataConsentRevoked: undefined }),
      }),
    );

    render(<ExpedienteDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));

    await waitFor(() => expect(screen.getByText('Contenido gestión')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Vista general' }));
    expect(
      screen.getByText('El consentimiento de tratamiento de datos fue revocado.'),
    ).toBeInTheDocument();
  });

  it('abre Seguimiento usando el bootstrap sin solicitar el detalle legacy', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Seguimiento' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }));

    await waitFor(() => expect(screen.getByText('Contenido seguimiento')).toBeInTheDocument());
    expect(crmApiMock.getExpediente).not.toHaveBeenCalled();
    expect(crmApiMock.getExpedienteTimelinePage).not.toHaveBeenCalled();
    expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
    expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();
  });

  it('carga Gestión y Seguimiento bajo demanda una sola vez por pestaña', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vista general' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Seguimiento' })).toBeInTheDocument();
    });

    expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    await waitFor(() => {
      expect(screen.getByText('Contenido gestión')).toBeInTheDocument();
    });
    expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(1);
    expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
    expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }));
    await waitFor(() => {
      expect(screen.getByText('Contenido seguimiento')).toBeInTheDocument();
    });
    expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(1);
    expect(crmApiMock.getExpedienteTimelinePage).not.toHaveBeenCalled();
    expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
    expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }));
    expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(1);
    expect(crmApiMock.getExpedienteTimelinePage).not.toHaveBeenCalled();
    expect(crmApiMock.getExpedienteTimeline).not.toHaveBeenCalled();
    expect(crmApiMock.getAttributionHistory).not.toHaveBeenCalled();
    expect(crmApiMock.getResponsibilityHistory).not.toHaveBeenCalled();
  });

  it('muestra error de una pestaña y permite reintentar sin exponer el error técnico', async () => {
    crmApiMock.getExpediente
      .mockRejectedValueOnce(new Error('detalle interno no visible'))
      .mockResolvedValueOnce(buildExpedienteResponse());

    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));

    await waitFor(() => {
      expect(screen.getByText('No fue posible cargar esta sección')).toBeInTheDocument();
    });
    expect(screen.queryByText('detalle interno no visible')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(screen.getByText('Contenido gestión')).toBeInTheDocument();
    });
  });

  it('no confirma una actualización cuando falla la recarga del bootstrap', async () => {
    crmApiMock.getExpedienteBootstrap
      .mockResolvedValueOnce(buildExpedienteBootstrapResponse())
      .mockRejectedValueOnce(new Error('respuesta técnica no visible'));
    crmApiMock.transitionExpedienteStatus.mockResolvedValue({
      data: {},
      transitionWarning: null,
    });

    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aplicar sugerencia' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugerencia' }));

    await waitFor(() => {
      expect(
        screen.getByText('No fue posible actualizar la información de la oportunidad.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Transición aplicada correctamente.')).not.toBeInTheDocument();
  });

  it('descarta bootstrap obsoleto y limpia la vista al cambiar de expediente', async () => {
    const resolvers = new Map<
      string,
      (value: ReturnType<typeof buildExpedienteBootstrapResponse>) => void
    >();
    crmApiMock.getExpedienteBootstrap.mockImplementation(
      (expedienteId: string) =>
        new Promise((resolve) => {
          resolvers.set(expedienteId, resolve);
        }),
    );

    const { rerender } = render(<ExpedienteDetailPage />);
    currentExpedienteId = 'exp-2';
    rerender(<ExpedienteDetailPage />);

    await act(async () => {
      resolvers.get('exp-2')?.(
        buildExpedienteBootstrapResponse({}, { fullName: 'Oportunidad nueva' }),
      );
    });
    await waitFor(() => expect(screen.getByText('Oportunidad nueva')).toBeInTheDocument());

    await act(async () => {
      resolvers.get('exp-1')?.(
        buildExpedienteBootstrapResponse({}, { fullName: 'Oportunidad vieja' }),
      );
    });
    expect(screen.getByText('Oportunidad nueva')).toBeInTheDocument();
    expect(screen.queryByText('Oportunidad vieja')).not.toBeInTheDocument();
  });

  it('solo permite que la última recarga del mismo expediente escriba', async () => {
    const refreshResolvers: Array<
      (value: ReturnType<typeof buildExpedienteBootstrapResponse>) => void
    > = [];
    let bootstrapCalls = 0;
    crmApiMock.getExpedienteBootstrap.mockImplementation(() => {
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) {
        return Promise.resolve(buildExpedienteBootstrapResponse());
      }
      return new Promise((resolve) => refreshResolvers.push(resolve));
    });
    crmApiMock.transitionExpedienteStatus.mockResolvedValue({ data: {}, transitionWarning: null });

    render(<ExpedienteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aplicar sugerencia' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugerencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugerencia' }));
    await waitFor(() => expect(refreshResolvers).toHaveLength(2));

    await act(async () => {
      refreshResolvers[0]?.(buildExpedienteBootstrapResponse({}, { fullName: 'Respuesta vieja' }));
    });
    expect(screen.queryByText('Respuesta vieja')).not.toBeInTheDocument();

    await act(async () => {
      refreshResolvers[1]?.(buildExpedienteBootstrapResponse({}, { fullName: 'Respuesta nueva' }));
    });
    await waitFor(() => expect(screen.getByText('Respuesta nueva')).toBeInTheDocument());
  });

  it('invalida la carga de una pestaña al cambiar y permite reintentar al volver', async () => {
    let resolveGestion: ((value: ReturnType<typeof buildExpedienteResponse>) => void) | undefined;
    crmApiMock.getExpediente.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGestion = resolve;
        }),
    );

    render(<ExpedienteDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    await waitFor(() => expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }));
    await waitFor(() => expect(screen.getByText('Contenido seguimiento')).toBeInTheDocument());

    await act(async () => {
      resolveGestion?.(buildExpedienteResponse());
    });
    expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    await waitFor(() => expect(screen.getByText('Contenido gestión')).toBeInTheDocument());
    expect(crmApiMock.getExpediente).toHaveBeenCalledTimes(2);
  });

  it('aplica la sugerencia de transición', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aplicar sugerencia' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugerencia' }));

    await waitFor(() => {
      expect(crmApiMock.transitionExpedienteStatus).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({ targetStatus: 'PRECALIFICADO' }),
      );
    });
    expect(invalidateExpedienteTimelineCache).toHaveBeenCalledWith('tenant-id:tenant-1', 'exp-1');
  });

  it('invalida el timeline al guardar una sección desde Gestión', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    await waitFor(() => expect(screen.getByText('Contenido gestión')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Guardar sección' }));

    await waitFor(() => {
      expect(crmApiMock.updateExpedienteSection).toHaveBeenCalledWith(
        'exp-1',
        'contact',
        expect.objectContaining({
          altContactName: null,
          altContactPhone: null,
        }),
      );
    });
    expect(invalidateExpedienteTimelineCache).toHaveBeenCalledWith('tenant-id:tenant-1', 'exp-1');
  });

  it('invalida el timeline al reactivar una oportunidad descartada', async () => {
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse({}, { status: 'DESCARTADO' }),
    );
    crmApiMock.reactivateExpediente.mockResolvedValue({ data: {} });

    render(<ExpedienteDetailPage />);

    const reactivateButton = await screen.findByRole('button', {
      name: 'Reactivar oportunidad',
    });
    fireEvent.click(reactivateButton);

    await waitFor(() => {
      expect(crmApiMock.reactivateExpediente).toHaveBeenCalledWith('exp-1');
    });
    expect(invalidateExpedienteTimelineCache).toHaveBeenCalledWith('tenant-id:tenant-1', 'exp-1');
  });

  it('consolida readiness y acción recomendada sin card separado de coordinación', async () => {
    const readyWithPending = {
      ...buildExpedienteResponse().completeness,
      overall: 80,
      installationReadiness: {
        status: 'READY_WITH_PENDING' as const,
        canTransition: true,
        title: 'Puedes continuar a instalación con información pendiente',
        message: 'Completa los faltantes para evitar reprocesos.',
      },
      missingRequirements: [
        {
          sectionKey: 'contact',
          sectionLabel: 'Contacto',
          fieldKey: 'altContactName',
          fieldLabel: 'Nombre contacto alternativo',
        },
      ],
    };
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse(
        {
          completeness: readyWithPending,
          pipelineRecommendation: {
            ...buildExpedienteResponse().pipelineRecommendation!,
            suggestedStatus: null,
            informationalRequirements: [
              {
                sectionKey: 'documents',
                sectionLabel: 'Soportes documentales',
                fieldKey: 'idCopy',
                fieldLabel: 'Copia de documento de identidad',
              },
            ],
          },
        },
        { status: 'LISTO_PARA_INSTALACION' },
      ),
    );
    crmApiMock.getExpediente.mockResolvedValue(
      buildExpedienteResponse({
        data: buildExpediente({ status: 'LISTO_PARA_INSTALACION', pipelineProgress: 80 }),
        completeness: readyWithPending,
      }),
    );

    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Pendientes principales')).toBeInTheDocument();
      expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agendar ahora' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Coordinación de visita')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Coordinar visita de instalación' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a pendientes' })).toBeInTheDocument();
    expect(
      screen.getByText(/Recomendado para cerrar mejor: 1 pendiente\(s\)\. Revisa/i),
    ).toBeInTheDocument();
  });

  it('coordina una instalación desde Agendar ahora y abre la agenda', async () => {
    const readyCompleteness = {
      ...buildExpedienteResponse().completeness,
      overall: 80,
      installationReadiness: {
        status: 'READY_COMPLETE',
        canTransition: true,
        title: 'Listo para instalación',
        message: 'La instalación puede coordinarse.',
      },
      missingRequirements: [],
    };
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse(
        { completeness: readyCompleteness },
        { status: 'LISTO_PARA_INSTALACION' },
      ),
    );
    crmApiMock.getExpediente.mockResolvedValue(
      buildExpedienteResponse({
        data: buildExpediente({
          status: 'LISTO_PARA_INSTALACION',
          pipelineProgress: 80,
          latitude: 4.711,
          longitude: -74.0721,
        }),
        completeness: {
          ...buildExpedienteResponse().completeness,
          overall: 80,
          installationReadiness: {
            status: 'READY_COMPLETE',
            canTransition: true,
            title: 'Listo para instalación',
            message: 'La instalación puede coordinarse.',
          },
          missingRequirements: [],
        },
      }),
    );
    createCrmVisitRequestAndRouteMock.mockResolvedValue({
      visitRequest: { id: 'vr-001' } as never,
      href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    });

    render(<ExpedienteDetailPage />);

    const scheduleButton = await screen.findByRole('button', { name: 'Agendar ahora' });
    fireEvent.click(scheduleButton);

    await waitFor(() => {
      expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          expedienteId: 'exp-1',
          customerLabel: 'Juan Perez',
          municipality: 'EL_COLEGIO',
          address: 'Calle 1',
          latitude: 4.711,
          longitude: -74.0721,
          nextAction: 'schedule-now',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
      );
    });
  });

  it('deshabilita la coordinación en Acciones de estado cuando el expediente aún no está listo', async () => {
    render(<ExpedienteDetailPage />);

    const coordinateButton = await screen.findByRole('button', {
      name: 'Coordinar visita de instalación',
    });

    expect(coordinateButton).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Agendar ahora' })).not.toBeInTheDocument();
    expect(createCrmVisitRequestAndRouteMock).not.toHaveBeenCalled();
  });

  it('evita solicitudes duplicadas mientras la coordinación desde Acciones de estado está en curso', async () => {
    let resolveVisitRequest:
      | ((result: Awaited<ReturnType<typeof createCrmVisitRequestAndRoute>>) => void)
      | undefined;
    createCrmVisitRequestAndRouteMock.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof createCrmVisitRequestAndRoute>>>((resolve) => {
          resolveVisitRequest = resolve;
        }),
    );
    const readyCompleteness = {
      ...buildExpedienteResponse().completeness,
      overall: 80,
      installationReadiness: {
        status: 'READY_COMPLETE',
        canTransition: true,
        title: 'Listo para instalación',
        message: 'La instalación puede coordinarse.',
      },
      missingRequirements: [],
    };
    crmApiMock.getExpedienteBootstrap.mockResolvedValue(
      buildExpedienteBootstrapResponse(
        { completeness: readyCompleteness },
        { status: 'LISTO_PARA_INSTALACION' },
      ),
    );
    crmApiMock.getExpediente.mockResolvedValue(
      buildExpedienteResponse({
        data: buildExpediente({ status: 'LISTO_PARA_INSTALACION', pipelineProgress: 80 }),
        completeness: {
          ...buildExpedienteResponse().completeness,
          overall: 80,
          installationReadiness: {
            status: 'READY_COMPLETE',
            canTransition: true,
            title: 'Listo para instalación',
            message: 'La instalación puede coordinarse.',
          },
          missingRequirements: [],
        },
      }),
    );

    render(<ExpedienteDetailPage />);

    const coordinateButton = await screen.findByRole('button', {
      name: 'Coordinar visita de instalación',
    });
    fireEvent.click(coordinateButton);

    await waitFor(() => {
      expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledTimes(1);
    });
    expect(coordinateButton).toBeDisabled();

    fireEvent.click(coordinateButton);
    expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledTimes(1);

    resolveVisitRequest?.({
      visitRequest: { id: 'vr-001' } as never,
      href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
      );
    });
  });
});
