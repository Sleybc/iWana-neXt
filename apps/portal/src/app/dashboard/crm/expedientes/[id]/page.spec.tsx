import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExpedienteDetailPage from './page';
import { commercialApi, crmApi, usersApi } from '@/lib/api-client';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'exp-1' }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
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
    },
  }),
}));

jest.mock('@/components/crm/expedientes/ExpedienteHeader', () => ({
  ExpedienteHeader: () => <div>Header expediente</div>,
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

jest.mock('@/components/crm/expedientes/SeguimientoTab', () => ({
  SeguimientoTab: () => <div>Contenido seguimiento</div>,
}));

jest.mock('@/components/crm/expedientes/ExpedienteTabsContainer', () => {
  const React = require('react') as typeof import('react');

  return {
    ExpedienteTabsContainer: ({
      defaultTab,
      tabs,
    }: {
      defaultTab: string;
      tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
    }) => {
      const [activeTab, setActiveTab] = React.useState(defaultTab);
      const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

      return (
        <div>
          <div>
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
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
    getPlans: jest.fn(),
    getAdditionalProducts: jest.fn(),
    getAdditionalServices: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
  },
}));

const crmApiMock = crmApi as unknown as {
  getExpediente: jest.Mock;
  getExpedienteTimeline: jest.Mock;
  getAttribution: jest.Mock;
  getAttributionHistory: jest.Mock;
  getResponsibility: jest.Mock;
  getResponsibilityHistory: jest.Mock;
  transitionExpedienteStatus: jest.Mock;
  updateExpedienteSection: jest.Mock;
  reactivateExpediente: jest.Mock;
};

const commercialApiMock = commercialApi as unknown as {
  getPlans: jest.Mock;
  getAdditionalProducts: jest.Mock;
  getAdditionalServices: jest.Mock;
};

const usersApiMock = usersApi as unknown as {
  list: jest.Mock;
};

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

describe('ExpedienteDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    crmApiMock.getExpediente.mockResolvedValue(buildExpedienteResponse());
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

    commercialApiMock.getPlans.mockResolvedValue([]);
    commercialApiMock.getAdditionalProducts.mockResolvedValue([]);
    commercialApiMock.getAdditionalServices.mockResolvedValue([]);
    usersApiMock.list.mockResolvedValue({ data: [], meta: { nextCursor: null, total: 0 } });
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
  });

  it('permite cambiar entre tabs principales', async () => {
    render(<ExpedienteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vista general' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gestión' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Seguimiento' })).toBeInTheDocument();
    });

    expect(screen.getByText('Acción recomendada ahora')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gestión' }));
    expect(screen.getByText('Contenido gestión')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }));
    expect(screen.getByText('Contenido seguimiento')).toBeInTheDocument();
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
  });
});
