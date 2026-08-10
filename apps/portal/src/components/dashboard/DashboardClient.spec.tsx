import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@iwana/shared';
import { DashboardClient, __resetDashboardSessionCacheForTests } from './DashboardClient';
import type { DashboardSummary } from '@/lib/api-client';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/lib/tenant-resolution', () => ({
  resolveTenantSlug: () => ({ slug: 'demo-isp', source: 'env', isLocked: true }),
}));

const getPublicBranding = jest.fn();
const getSummary = jest.fn();
const getMe = jest.fn();
const getSettings = jest.fn();
const wfmGetSummary = jest.fn();
const assuranceGetSummary = jest.fn();
const commercialGetSummary = jest.fn();
const inventoryDashboard = jest.fn();
const crmPipelineSummary = jest.fn();
const auditList = jest.fn();

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    tenantSelfApi: {
      getPublicBranding: (...args: unknown[]) => getPublicBranding(...args),
      getMe: (...args: unknown[]) => getMe(...args),
      getSettings: (...args: unknown[]) => getSettings(...args),
    },
    dashboardApi: {
      getSummary: (...args: unknown[]) => getSummary(...args),
    },
    wfmApi: {
      dashboard: {
        getSummary: (...args: unknown[]) => wfmGetSummary(...args),
      },
    },
    assuranceApi: {
      dashboard: {
        getSummary: (...args: unknown[]) => assuranceGetSummary(...args),
      },
    },
    commercialApi: {
      getDashboardSummary: (...args: unknown[]) => commercialGetSummary(...args),
    },
    inventoryApi: {
      dashboard: (...args: unknown[]) => inventoryDashboard(...args),
    },
    crmApi: {
      getPipelineSummary: (...args: unknown[]) => crmPipelineSummary(...args),
    },
    auditApi: {
      list: (...args: unknown[]) => auditList(...args),
    },
  };
});

jest.mock('./QuickActionsPanel', () => ({
  QuickActionsPanel: ({ role }: { role: string }) => (
    <div data-testid="quick-actions">Accesos rápidos · {role}</div>
  ),
}));

jest.mock('./RecentActivityPanel', () => ({
  RecentActivityPanel: () => <div data-testid="change-history">Historial de cambios</div>,
}));

jest.mock('./OnboardingAlerts', () => ({
  OnboardingAlerts: ({ alerts }: { alerts: Array<{ title: string }> }) => (
    <div data-testid="next-configuration">
      {alerts.length === 0 ? 'Sin alertas' : alerts[0]?.title}
    </div>
  ),
}));

const narrowedSummary: DashboardSummary = {
  tenant: {
    id: 't-1',
    name: 'Demo ISP',
    slug: 'demo-isp',
    status: 'ACTIVE',
    contactEmail: 'ops@example.com',
    legalName: 'Demo ISP SAS',
    nit: '900123456',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  settings: {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 50,
    features: { billing: true, mfa_required_all: false },
  },
  metrics: {
    configuredUsers: 4,
    mfaCoverage: 1,
    pendingAlerts: 0,
    auditEventsLast7d: 2,
  },
  alerts: [],
};

function mockAdminApis() {
  getPublicBranding.mockResolvedValue({
    displayName: 'Demo ISP',
    productName: 'Portal',
    surfaceName: 'Portal',
    metadataTitle: 'Portal',
    metadataDescription: '',
    showTenantName: true,
    logoLightUrl: null,
    logoDarkUrl: null,
    sealLightUrl: null,
    sealDarkUrl: null,
    faviconLightUrl: null,
    faviconDarkUrl: null,
    loginBackgroundLightUrl: null,
    loginBackgroundDarkUrl: null,
  });
  getSummary.mockResolvedValue(narrowedSummary);
  getMe.mockResolvedValue(narrowedSummary.tenant);
  getSettings.mockResolvedValue(narrowedSummary.settings);
  wfmGetSummary.mockResolvedValue({
    todayCount: 3,
    overdueCount: 1,
    upcomingCount: 0,
    activeCount: 0,
    enRouteCount: 0,
    atRiskCount: 0,
    pendingInbox: {
      totalOpen: 2,
      readyToScheduleCount: 2,
      needsContextCount: 0,
      overdueSlaCount: 1,
      highPriorityOpenCount: 0,
    },
    alerts: [],
    technicianLoad: [],
  });
  assuranceGetSummary.mockResolvedValue({
    openCount: 5,
    assignedCount: 1,
    inProgressCount: 1,
    atRiskCount: 2,
    breachedCount: 1,
    resolvedTodayCount: 0,
    fieldServicePendingCount: 0,
    byPriority: {},
    byType: {},
  });
  commercialGetSummary.mockResolvedValue({
    plansCount: 1,
    activePlansCount: 1,
    productsCount: 0,
    activeProductsCount: 0,
    servicesCount: 0,
    activeServicesCount: 0,
    bundlesCount: 0,
    activeBundlesCount: 0,
    promotionsCount: 0,
    activePromotionsCount: 0,
    compatibilityRulesCount: 0,
    activeCompatibilityRulesCount: 0,
    taxRulesCount: 0,
    activeTaxRulesCount: 0,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 4,
    catalogActiveCount: 1,
    catalogSellableActiveCount: 1,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 2,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 0,
    attentionItems: [],
    recentChanges: [],
  });
  inventoryDashboard.mockResolvedValue({
    itemsCount: 1,
    locationsCount: 1,
    serializedAssetsCount: 0,
    balancesCount: 1,
    totalOnHand: 10,
    estimatedTotalValue: 1000,
    balancesByLocation: [],
    balancesByCategory: [],
    serializedAssetsByStatus: [],
    serializedAssetsByResponsibleType: [],
  });
  crmPipelineSummary.mockResolvedValue({
    data: { NUEVO_POTENCIAL: 3, DESCARTADO: 1, CLIENTE_ACTIVO: 2 },
    total: 6,
  });
  auditList.mockResolvedValue([]);
}

describe('DashboardClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDashboardSessionCacheForTests();
    useAuthMock.mockReturnValue({
      user: { id: 'u-1', role: UserRole.ADMIN, tenantId: 't-1', displayName: 'Admin' },
      isLoading: false,
    });
    mockAdminApis();
  });

  it('elimina el gate binario y no muestra «Panel en preparación»', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-2', role: UserRole.TECHNICIAN, tenantId: 't-1', displayName: 'Técnico' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Ver mi agenda de hoy/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rol en expansión/i)).not.toBeInTheDocument();
    expect(getSummary).not.toHaveBeenCalled();
    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(getPublicBranding).toHaveBeenCalled();
  });

  it('sincroniza A-3: summary estrecho sin campos de marca', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });

    const summary = await getSummary.mock.results[0]?.value;
    expect(summary.tenant).toEqual(narrowedSummary.tenant);
    expect(summary.tenant).not.toHaveProperty('logoLightUrl');
    expect(summary.tenant).not.toHaveProperty('nitDv');
    expect(summary.tenant).not.toHaveProperty('brandingProductName');
    expect(Object.keys(summary.tenant)).toHaveLength(13);
  });

  it('contiene fallos parciales: un contrato caído no borra el resto', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos cargar el resumen de operaciones de campo/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Casos abiertos')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
  });

  it('navega indicadores con filtros de URL (C-6)', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    });

    const visits = screen.getByRole('link', { name: /Visitas de hoy/i });
    expect(visits.getAttribute('href')).toMatch(/view=day/);
    expect(visits.getAttribute('href')).toMatch(/fromDate=/);

    const cases = screen.getByRole('link', { name: /Casos abiertos/i });
    expect(cases).toHaveAttribute('href', '/dashboard/assurance?status=OPEN');

    const plans = screen.getByRole('link', { name: /Planes sin precio vigente/i });
    expect(plans).toHaveAttribute('href', '/dashboard/commercial?tab=plans&missingPrice=1');
  });

  it('al remontar con caché de sesión no vuelve a pedir red (R-5)', async () => {
    const { unmount } = render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });
    expect(getSummary).toHaveBeenCalledTimes(1);

    unmount();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });
    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(wfmGetSummary).toHaveBeenCalledTimes(1);
  });

  it('recarga silenciosa conserva cifras y expone Actualizando', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    let resolveWfm: (value: unknown) => void = () => undefined;
    wfmGetSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWfm = resolve;
        }),
    );

    await user.click(screen.getByRole('button', { name: /Actualizar/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Actualizando/i).length).toBeGreaterThan(0);
    });
    expect(
      within(screen.getByRole('link', { name: /Visitas de hoy/i })).getByText('3'),
    ).toBeInTheDocument();

    resolveWfm({
      todayCount: 3,
      overdueCount: 1,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 2,
        readyToScheduleCount: 2,
        needsContextCount: 0,
        overdueSlaCount: 1,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });

    await waitFor(() => {
      expect(screen.queryByText(/Actualizando/i)).not.toBeInTheDocument();
    });
  });

  it('SALES no pide WFM ni assurance', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-3', role: UserRole.SALES, tenantId: 't-1', displayName: 'Comercial' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(assuranceGetSummary).not.toHaveBeenCalled();
    expect(commercialGetSummary).toHaveBeenCalled();
    expect(crmPipelineSummary).toHaveBeenCalled();
    expect(within(document.body).queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
  });

  it('B0–B3: acción primaria, indicadores y ficha empresarial subordinada', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    expect(screen.getByLabelText('Indicadores núcleo')).toBeInTheDocument();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    expect(screen.getByText('Casos abiertos')).toBeInTheDocument();

    const companySection = screen.getByLabelText('Estado de la empresa');
    expect(companySection).toBeInTheDocument();
    expect(within(companySection).getByText(/Ver en configuración/i)).toBeInTheDocument();
    expect(within(companySection).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('NOC compone acción operativa e indicadores sin paneles de preparación (D-3)', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-noc', role: UserRole.NOC, tenantId: 't-1', displayName: 'NOC' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Programar visita/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Indicadores núcleo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Casos abiertos/i })).toBeInTheDocument();
    expect(screen.queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
    expect(commercialGetSummary).not.toHaveBeenCalled();
  });

  it('métrica nula muestra sustituto AA y no cifra cero (D-2)', async () => {
    wfmGetSummary.mockResolvedValue({
      todayCount: null,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 0,
        readyToScheduleCount: null,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    const visits = screen.getByRole('link', { name: /Visitas de hoy/i });
    expect(within(visits).getByText('Sin dato disponible')).toBeInTheDocument();
    expect(within(visits).queryByText('0')).not.toBeInTheDocument();
    expect(within(visits).getByText('Sin dato disponible').className).toMatch(/text-gray-700/);
  });

  it('error de fuente anuncia PortalAlert sin gradiente lineal (D-1 backgroundImage)', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    const { container } = render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos cargar el resumen de operaciones de campo/i),
      ).toBeInTheDocument();
    });

    const alert = screen.getByRole('status');
    expect(alert.className).not.toMatch(/bg-\[linear-gradient/);
    expect(alert.className).toMatch(/dark:bg-red-950/);
    expect(container.innerHTML).not.toMatch(/bg-\[linear-gradient/);
    expect(screen.getByRole('link', { name: /Casos abiertos/i })).toBeInTheDocument();
  });

  it('abre bloques plegados con Ver más (cobertura B2b)', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ver más/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Ver más/i }));
    expect(screen.getByText(/Casos de la mesa de ayuda/i)).toBeInTheDocument();
    expect(screen.getByText(/Estado del almacén/i)).toBeInTheDocument();
  });
});
