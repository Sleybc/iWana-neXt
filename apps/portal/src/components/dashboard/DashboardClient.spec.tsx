import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@iwana/shared';
import {
  DashboardClient,
  __resetDashboardSessionCacheForTests,
  sortFieldAlertsBySeverity,
} from './DashboardClient';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { __resetAuditFeedCacheForTests } from '@/lib/audit-feed-cache';
import type { DashboardSummary } from '@/lib/api-client';
import type { WfmDashboardAlert } from '@/lib/api-client';

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
      Object.setPrototypeOf(this, MockApiError.prototype);
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

jest.mock('./RecentActivityPanel', () => ({
  RecentActivityPanel: ({
    entries,
    status,
    minimized,
  }: {
    entries?: unknown[] | null;
    status?: string;
    minimized?: boolean;
  }) => (
    <div data-testid="change-history" data-minimized={minimized ? 'true' : 'false'}>
      Historial de cambios · {status ?? 'idle'} · {entries?.length ?? 0}
    </div>
  ),
}));

jest.mock('./OnboardingAlerts', () => ({
  OnboardingAlerts: ({
    alerts,
    operationState,
  }: {
    alerts: Array<{ title: string }>;
    operationState?: string;
  }) =>
    operationState === 'active' ? null : (
      <div data-testid="next-configuration">
        {alerts.length === 0 ? 'Sin alertas' : alerts[0]?.title}
      </div>
    ),
}));

/**
 * Stub de ResizeObserver para el B2 adaptativo: captura el callback registrado
 * por el componente y permite dispararlo con alturas sintéticas.
 */
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  private readonly callback: ResizeObserverCallback;
  private disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }

  /** Dispara el callback del observador con una altura de contenido (px). */
  trigger(height: number): void {
    if (this.disconnected) return;
    const entry = { contentRect: { height } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

/** Fuerza el modo del B2 adaptativo: 200 px entra en banda, 600 px sale. */
function triggerDominantResize(height: number): void {
  act(() => {
    for (const instance of ResizeObserverStub.instances) {
      instance.trigger(height);
    }
  });
}

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
    byPriority: { HIGH: 2, NORMAL: 3 },
    byType: { PQR: 1, CUSTOMER_INCIDENT: 4 },
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
    __resetAuditFeedCacheForTests();
    ResizeObserverStub.instances.length = 0;
    global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
    useAuthMock.mockReturnValue({
      user: { id: 'u-1', role: UserRole.ADMIN, tenantId: 't-1', displayName: 'Admin' },
      isLoading: false,
    });
    mockAdminApis();
  });

  afterEach(() => {
    delete (global as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('elimina el gate binario y no muestra «Panel en preparación»', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-2', role: UserRole.TECHNICIAN, tenantId: 't-1', displayName: 'Técnico' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rol en expansión/i)).not.toBeInTheDocument();
    expect(getSummary).not.toHaveBeenCalled();
    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(getPublicBranding).toHaveBeenCalled();
  });

  it('muestra una salida segura cuando la sesión no trae un rol reconocible', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-unknown', role: 'ROLE_NOT_REGISTERED', tenantId: 't-1' },
      isLoading: false,
    });

    render(<DashboardClient />);

    expect(screen.getByText('No pudimos determinar tu perfil de acceso.')).toBeInTheDocument();
    expect(getPublicBranding).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('change-history')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver mi perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/profile',
    );
    expect(screen.queryByText(/Accesos rápidos/i)).not.toBeInTheDocument();
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

  it('SALES no pide WFM ni assurance', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-3', role: UserRole.SALES, tenantId: 't-1', displayName: 'Comercial' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });

    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(assuranceGetSummary).not.toHaveBeenCalled();
    expect(commercialGetSummary).toHaveBeenCalled();
    expect(crmPipelineSummary).toHaveBeenCalled();
    expect(within(document.body).queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
  });

  it('B0–B3: identidad, indicadores y ficha empresarial subordinada', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    expect(screen.getByLabelText('Indicadores núcleo')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Foco de hoy' })).toBeInTheDocument();
      expect(screen.getByText('Visitas del día frente a la carga')).toBeInTheDocument();
    });
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    expect(screen.getByText('Casos abiertos')).toBeInTheDocument();

    const companySection = screen.getByLabelText('Estado de la empresa');
    expect(companySection).toBeInTheDocument();
    expect(within(companySection).getByText(/Ver en configuración/i)).toBeInTheDocument();
    expect(within(companySection).getByRole('link', { name: /Ver mi perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/profile',
    );
    expect(within(companySection).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('U-B0bis: el H1 no contiene controles ni hay franja de acciones de página', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });

    const heading = screen.getByRole('heading', { level: 1, name: 'Demo ISP' });
    const titleBlock = heading.parentElement;
    expect(titleBlock).toBeTruthy();
    expect(within(titleBlock!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(titleBlock!).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.queryByRole('toolbar', { name: 'Acciones del inicio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Registrar suscriptor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actualizar$/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Más acciones del inicio' }),
    ).not.toBeInTheDocument();
  });

  it('NOC compone indicadores operativos sin paneles de preparación (D-3)', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-noc', role: UserRole.NOC, tenantId: 't-1', displayName: 'NOC' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Indicadores núcleo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Casos abiertos/i })).toBeInTheDocument();
    expect(screen.queryByText(/Panel en preparación/i)).not.toBeInTheDocument();
    expect(commercialGetSummary).not.toHaveBeenCalled();
  });

  it('AUDITOR pide audit (limit 8) y muestra historial minimizado (C-13)', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-aud', role: UserRole.AUDITOR, tenantId: 't-1', displayName: 'Auditor' },
      isLoading: false,
    });
    auditList.mockResolvedValue([
      {
        id: 'a-1',
        tenantId: 't-1',
        userId: 'u-1',
        actor: { id: 'u-1', type: 'tenant', displayName: 'Ana Operaciones' },
        action: 'UPDATE',
        entityType: 'User',
        entityId: 'u-1',
        oldValue: null,
        newValue: null,
        ipAddress: null,
        userAgent: null,
        requestId: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByTestId('change-history')).toHaveTextContent(/· 1$/);
    });

    expect(auditList).toHaveBeenCalledWith({ limit: 8 }, expect.any(String));
    expect(auditList).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('change-history')).toHaveAttribute('data-minimized', 'true');
    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(assuranceGetSummary).not.toHaveBeenCalled();
    expect(commercialGetSummary).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();
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

    const alerts = screen.getAllByRole('status');
    expect(alerts.some((alert) => !alert.className.match(/bg-\[linear-gradient/))).toBe(true);
    expect(alerts.some((alert) => alert.className.match(/dark:bg-red-950/))).toBe(true);
    expect(container.innerHTML).not.toMatch(/bg-\[linear-gradient/);
    expect(screen.getByRole('link', { name: /Casos abiertos/i })).toBeInTheDocument();
  });

  it('muestra permisos insuficientes en mesa de ayuda y permite reintentar', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    useAuthMock.mockReturnValue({
      user: { id: 'u-support', role: UserRole.SUPPORT, tenantId: 't-1', displayName: 'Soporte' },
      isLoading: false,
    });
    assuranceGetSummary.mockRejectedValue(new ApiError(403, 'forbidden'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos cargar el resumen de la mesa de ayuda/i),
      ).toBeInTheDocument();
    });

    assuranceGetSummary.mockResolvedValue({
      openCount: 5,
      assignedCount: 1,
      inProgressCount: 1,
      atRiskCount: 2,
      breachedCount: 1,
      resolvedTodayCount: 0,
      fieldServicePendingCount: 0,
      byPriority: { HIGH: 2, NORMAL: 3 },
      byType: { PQR: 1, CUSTOMER_INCIDENT: 4 },
    });
    const helpDeskPanel = screen
      .getByRole('heading', { name: 'Casos de la mesa de ayuda' })
      .closest('section');
    expect(helpDeskPanel).not.toBeNull();
    await user.click(
      within(helpDeskPanel as HTMLElement).getByRole('button', { name: /Reintentar/i }),
    );
    await waitFor(() => {
      expect(assuranceGetSummary).toHaveBeenCalledTimes(2);
    });
  });

  it('mapea expiración de sesión en un error operativo visible', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(401, 'expired'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos cargar el resumen de operaciones de campo/i),
      ).toBeInTheDocument();
    });
  });

  it('B1 ADMIN compone una sola grilla unificada sin eyebrows de dominio (U-D5)', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    const indicators = screen.getByLabelText('Indicadores núcleo');
    // Sin h2 de dominio dentro de B1.
    for (const label of ['Operaciones de campo', 'Mesa de ayuda', 'Comercial', 'Oportunidades']) {
      expect(within(indicators).queryByRole('heading', { name: label })).not.toBeInTheDocument();
    }

    // Una sola grilla unificada (hasta 4 por fila); nunca variante estirada ni por grupo.
    const unifiedGrids = indicators.querySelectorAll('.xl\\:grid-cols-4');
    expect(unifiedGrids).toHaveLength(1);
    const unifiedGrid = unifiedGrids[0] as HTMLElement;
    expect(unifiedGrid.className).toMatch(/grid-cols-1/);
    expect(unifiedGrid.className).toMatch(/sm:grid-cols-2/);
    expect(unifiedGrid.className).not.toMatch(/max-w-\[calc\(50%-0\.5rem\)\]/);

    // Las 7 tarjetas del rol viven en la misma grilla, en orden de composición plano.
    const cards = Array.from(unifiedGrid.querySelectorAll('a,button'));
    expect(cards).toHaveLength(7);
    expect(cards[0]?.textContent).toMatch(/Visitas de hoy/);
    expect(cards[6]?.textContent).toMatch(/Oportunidades en seguimiento/);

    const visits = screen.getByRole('link', { name: /Visitas de hoy/i });
    expect(within(visits).queryByText('Operaciones de campo')).not.toBeInTheDocument();
  });

  it('B1 ACCOUNTANT: rol con 1 KPI compone la tarjeta en columna 1/4 de la grilla unificada, sin variante estirada (U-D5-03)', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'u-accountant',
        role: UserRole.ACCOUNTANT,
        tenantId: 't-1',
        displayName: 'Contable',
      },
      isLoading: false,
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
      offersAtRiskCount: 0,
      catalogActiveCount: 1,
      catalogSellableActiveCount: 1,
      catalogIncompleteActiveCount: 0,
      missingCurrentPriceCount: 1,
      activeBundlesWithInactiveItemsCount: 0,
      taxRulesCoverageGapCount: 0,
      rulesGapCount: 0,
      activeOffersCount: 0,
      attentionItems: [],
      recentChanges: [],
    });

    render(<DashboardClient />);

    // El KPI real del rol es I-5 «Planes sin precio vigente» (registry U-D5).
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Planes sin precio vigente/i })).toBeInTheDocument();
    });

    const indicators = screen.getByLabelText('Indicadores núcleo');
    // Sin h2 de dominio dentro de B1.
    for (const label of ['Operaciones de campo', 'Mesa de ayuda', 'Comercial', 'Oportunidades']) {
      expect(within(indicators).queryByRole('heading', { name: label })).not.toBeInTheDocument();
    }

    // Una sola grilla unificada (hasta 4 por fila); nunca variante estirada ni por grupo.
    const unifiedGrids = indicators.querySelectorAll('.xl\\:grid-cols-4');
    expect(unifiedGrids).toHaveLength(1);
    const unifiedGrid = unifiedGrids[0] as HTMLElement;
    expect(unifiedGrid.className).toMatch(/grid-cols-1/);
    expect(unifiedGrid.className).toMatch(/sm:grid-cols-2/);
    expect(unifiedGrid.className).not.toMatch(/max-w-\[calc\(50%-0\.5rem\)\]/);

    // El rol con 1 KPI ocupa una columna 1/4: la tarjeta vive en la retícula
    // unificada y no se estira a ancho completo (misma aserción U-D3/I-7).
    const plans = screen.getByRole('link', { name: /Planes sin precio vigente/i });
    expect(plans.closest('.xl\\:grid-cols-4')).toBe(unifiedGrid);
    expect(plans.className).not.toMatch(/max-w-\[calc\(50%-0\.5rem\)\]/);
    const cards = Array.from(unifiedGrid.querySelectorAll('a,button'));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toMatch(/Planes sin precio vigente/);
  });

  it('promueve help-desk y comercial cuando KPI > 0 y Ver más cuenta el resto (C-8/C-11)', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/Casos de la mesa de ayuda/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Atención comercial/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver más · 1 resumen/i })).toBeInTheDocument();
    expect(screen.queryByText(/Estado del almacén/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver más · 1 resumen/i }));
    expect(screen.getByText(/Estado del almacén/i)).toBeInTheDocument();
  });

  it('destaca Ofertas en riesgo con color de atención, no lima', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ofertas en riesgo/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Ofertas en riesgo/i }));

    const highlight = screen.getByText(/Atención comercial. Revisa las ofertas en riesgo./i);
    expect(highlight).toHaveClass('text-amber-700');
    expect(highlight).not.toHaveClass('text-iwana-secondary-700');
  });

  it('filtra la atención comercial para ACCOUNTANT y conserva solo planes sin precio', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 'u-accountant',
        role: UserRole.ACCOUNTANT,
        tenantId: 't-1',
        displayName: 'Contable',
      },
      isLoading: false,
    });
    commercialGetSummary.mockResolvedValue({
      missingCurrentPriceCount: 1,
      offersAtRiskCount: 0,
      catalogActiveCount: 1,
      attentionItems: [
        {
          id: 'price-gap',
          entityType: 'plan',
          name: 'Plan sin precio',
          reason: 'missing_current_price',
          destinoTab: 'plans',
        },
        {
          id: 'expiring',
          entityType: 'promotion',
          name: 'Promoción próxima a vencer',
          reason: 'expiring_soon',
          destinoTab: 'promotions',
        },
      ],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Plan sin precio')).toBeInTheDocument();
    });
    expect(screen.queryByText('Promoción próxima a vencer')).not.toBeInTheDocument();
    const planLink = screen.getByRole('link', { name: /Plan sin precio/i });
    expect(planLink.className).toMatch(/focus-visible:ring/);
  });

  it('muestra error de empresa y permite reintentar el próximo paso', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    getSummary.mockRejectedValueOnce(new ApiError(500, ''));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos cargar el próximo paso de configuración/i),
      ).toBeInTheDocument();
    });

    await user.click(
      within(
        screen
          .getByText(/No pudimos cargar el próximo paso de configuración/i)
          .closest('section') ?? document.body,
      ).getByRole('button', { name: /Reintentar/i }),
    );
    await waitFor(() => {
      expect(
        screen.queryByText(/No pudimos cargar el próximo paso de configuración/i),
      ).not.toBeInTheDocument();
    });
    expect(getSummary).toHaveBeenCalledTimes(2);
  });

  it('unifica fetch de historial en una sola petición audit (C-7)', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByTestId('change-history')).toBeInTheDocument();
    });
    expect(auditList).toHaveBeenCalledTimes(1);
  });

  it('ordena los avisos de campo por severidad y conserva el orden entre empates', () => {
    const alerts: WfmDashboardAlert[] = [
      {
        id: 'info',
        type: 'DRAFT_STARTING_SOON',
        severity: 'info',
        title: 'Informativo',
        description: 'Detalle',
        eventId: null,
        assignedUserId: null,
        scheduledStartAt: null,
      },
      {
        id: 'critical',
        type: 'OVERDUE_EVENT',
        severity: 'critical',
        title: 'Crítico',
        description: 'Detalle',
        eventId: null,
        assignedUserId: null,
        scheduledStartAt: null,
      },
      {
        id: 'warning',
        type: 'HIGH_TECHNICIAN_LOAD',
        severity: 'warning',
        title: 'Atención',
        description: 'Detalle',
        eventId: null,
        assignedUserId: null,
        scheduledStartAt: null,
      },
    ];

    expect(sortFieldAlertsBySeverity(alerts).map((alert) => alert.severity)).toEqual([
      'critical',
      'warning',
      'info',
    ]);
  });

  it('mantiene skeleton en próximo paso mientras tenant-summary sigue cargando', async () => {
    let resolveSummary: (value: DashboardSummary) => void = () => undefined;
    getSummary.mockImplementationOnce(
      () =>
        new Promise<DashboardSummary>((resolve) => {
          resolveSummary = resolve;
        }),
    );

    render(<DashboardClient />);

    await waitFor(() => {
      expect(getSummary).toHaveBeenCalledTimes(1);
    });

    const nextConfiguration = screen
      .getByRole('heading', { name: 'Próximo paso de configuración' })
      .closest('section');
    expect(nextConfiguration).toHaveAttribute('aria-busy', 'true');

    resolveSummary(narrowedSummary);
    await waitFor(() => {
      expect(screen.queryByTestId('next-configuration')).not.toBeInTheDocument();
    });
  });

  it('abre bloques plegados con Ver más (cobertura B2b)', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ver más/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Ver más/i }));
    expect(screen.getByText(/Estado del almacén/i)).toBeInTheDocument();
  });

  function buildFieldAlerts(count: number) {
    const severities = ['critical', 'warning', 'info'] as const;
    return Array.from({ length: count }, (_, index) => ({
      id: `alert-${index + 1}`,
      type: index % 2 === 0 ? 'OVERDUE' : 'DRAFT_SOON',
      severity: severities[index % severities.length],
      title: `Aviso de campo ${index + 1}`,
      description: `Detalle del aviso ${index + 1}`,
      eventId: index === 0 ? 'evt-agenda-001' : null,
      assignedUserId: null,
      scheduledStartAt: null,
    }));
  }

  it('CA-DELTA-05: ADMIN muestra hasta 5 avisos de campo con severidad, sin mini-card y enlace a agenda', async () => {
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
      alerts: buildFieldAlerts(6),
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de campo 5')).toBeInTheDocument();
    });

    const fieldPanel = screen
      .getByRole('heading', { name: 'Atención de campo' })
      .closest('section') as HTMLElement;
    expect(within(fieldPanel).queryByText('Aviso de campo 6')).not.toBeInTheDocument();
    expect(within(fieldPanel).getAllByText('Crítico').length).toBeGreaterThan(0);
    expect(within(fieldPanel).getAllByText('Atención').length).toBeGreaterThan(0);
    expect(within(fieldPanel).getAllByText('Informativo').length).toBeGreaterThan(0);

    const alertLink = within(fieldPanel).getByRole('link', { name: /Aviso de campo 1/i });
    expect(alertLink).toHaveAttribute('href', '/dashboard/scheduling/agenda');
    expect(within(fieldPanel).getByRole('table', { name: 'Avisos de campo' })).toBeInTheDocument();
    expect(within(fieldPanel).getByText('Aviso')).toBeInTheDocument();
    expect(within(fieldPanel).getByText('Estado')).toBeInTheDocument();
    expect(alertLink.className).not.toMatch(/rounded-xl/);
    expect(alertLink.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(within(fieldPanel).queryByText(/OVERDUE|DRAFT_SOON/)).not.toBeInTheDocument();
  });

  it('CA-DELTA-05: SUPPORT limita Atención de campo a máximo 3 filas', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-support', role: UserRole.SUPPORT, tenantId: 't-1', displayName: 'Soporte' },
      isLoading: false,
    });
    wfmGetSummary.mockResolvedValue({
      todayCount: 2,
      overdueCount: 1,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 1,
        readyToScheduleCount: 1,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: buildFieldAlerts(5),
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de campo 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Aviso de campo 4')).toBeInTheDocument();
    expect(screen.queryByText('Aviso de campo 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Aviso de campo 5')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Aviso de campo 1/i })).toHaveAttribute(
      'href',
      '/dashboard/scheduling/agenda',
    );
  });

  it('CA-DELTA-03: HelpDeskBlock desglosa byPriority/byType con enlaces filtrados', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-support', role: UserRole.SUPPORT, tenantId: 't-1', displayName: 'Soporte' },
      isLoading: false,
    });
    assuranceGetSummary.mockResolvedValue({
      openCount: 5,
      assignedCount: 1,
      inProgressCount: 1,
      atRiskCount: 2,
      breachedCount: 1,
      resolvedTodayCount: 0,
      fieldServicePendingCount: 0,
      byPriority: { HIGH: 2, NORMAL: 3 },
      byType: { PQR: 1, CUSTOMER_INCIDENT: 4 },
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/5 casos abiertos · 2 en riesgo/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Por prioridad')).toBeInTheDocument();
    expect(screen.getByText('Por tipo')).toBeInTheDocument();

    const highPriority = screen.getByRole('link', { name: /Alta · 2/i });
    expect(highPriority).toHaveAttribute('href', '/dashboard/assurance?priority=HIGH');
    const normalPriority = screen.getByRole('link', { name: /Normal · 3/i });
    expect(normalPriority).toHaveAttribute('href', '/dashboard/assurance?priority=NORMAL');

    const pqr = screen.getByRole('link', { name: /PQR · 1/i });
    expect(pqr).toHaveAttribute('href', '/dashboard/assurance?type=PQR');
    const incident = screen.getByRole('link', { name: /Incidente de cliente · 4/i });
    expect(incident).toHaveAttribute('href', '/dashboard/assurance?type=CUSTOMER_INCIDENT');

    expect(screen.queryByText(/\bHIGH\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bCUSTOMER_INCIDENT\b/)).not.toBeInTheDocument();
  });

  it('CA-DELTA-04: PipelineBlock desglosa estados abiertos con vocabulario y enlace', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-sales', role: UserRole.SALES, tenantId: 't-1', displayName: 'Comercial' },
      isLoading: false,
    });
    crmPipelineSummary.mockResolvedValue({
      data: {
        NUEVO_POTENCIAL: 3,
        PRECALIFICADO: 2,
        EN_COTIZACION: 1,
        DESCARTADO: 4,
        CLIENTE_ACTIVO: 5,
      },
      total: 15,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/6 en seguimiento · 15 en total/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Precalificado')).toBeInTheDocument();
    expect(screen.getByText('En cotización')).toBeInTheDocument();
    expect(screen.queryByText('NUEVO_POTENCIAL')).not.toBeInTheDocument();
    expect(screen.queryByText('PRECALIFICADO')).not.toBeInTheDocument();
    expect(screen.queryByText('EN_COTIZACION')).not.toBeInTheDocument();
    expect(screen.queryByText('Descartado')).not.toBeInTheDocument();
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();

    const openLink = screen.getByRole('link', { name: /Ver oportunidades/i });
    expect(openLink).toHaveAttribute('href', '/dashboard/crm/expedientes?view=open');
  });

  it('C-R1: carga incompleta no anuncia dato desactualizado ni hora de lectura completa', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Reintentar/i }).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Sin lectura aún/i)).toBeInTheDocument();
    expect(document.querySelector('time')).toBeNull();
    expect(screen.queryByText(/Algunos datos no se actualizaron/i)).not.toBeInTheDocument();
  });

  it('C-R2: B1 en error de fuente reintenta en la tarjeta y recupera el valor sin foco artificial', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Reintentar/i }).length).toBeGreaterThan(0);
    });

    // Sin anuncio de grupo: el error se resuelve en cada tarjeta (U-D5).
    expect(screen.queryByText(/No pudimos actualizar las cifras de/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Visitas de hoy/i })).not.toBeInTheDocument();

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

    await user.click(screen.getAllByRole('button', { name: /Reintentar/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    // Sin foco artificial a un encabezado de dominio (los eyebrows ya no existen).
    expect(document.activeElement).not.toHaveAttribute('tabindex', '-1');
  });

  it('C-R5: home y campana comparten una sola lectura audit', async () => {
    render(
      <>
        <NotificationBell />
        <DashboardClient />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('change-history')).toBeInTheDocument();
    });
    expect(auditList).toHaveBeenCalledTimes(1);
  });

  it('C-R6: Ofertas en riesgo enfoca el bloque comercial y no hace scroll con reduced motion', async () => {
    const user = userEvent.setup();
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ofertas en riesgo/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Ofertas en riesgo/i }));

    const heading = screen.getByRole('heading', { name: 'Atención comercial' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    const announcement = screen.getByText(/Atención comercial. Revisa las ofertas en riesgo./i);
    expect(announcement).toHaveAttribute('role', 'status');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('C-R7: la hora de B0 usa mono tabular y time', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(document.querySelector('time')).not.toBeNull();
    });

    const time = document.querySelector('time');
    expect(time).toHaveClass('font-mono');
    expect(time).toHaveClass('tabular-nums');
    expect(time).toHaveAttribute('dateTime');
  });

  it('U-D / U-D3: KPI en cero sin delta no tinte de urgencia; I-7 no full-bleed; B2 no se estira; métrica vertical compact', async () => {
    wfmGetSummary.mockResolvedValue({
      todayCount: 3,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });
    assuranceGetSummary.mockResolvedValue({
      openCount: 5,
      assignedCount: 0,
      inProgressCount: 0,
      atRiskCount: 0,
      breachedCount: 0,
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
      offersAtRiskCount: 0,
      catalogActiveCount: 1,
      catalogSellableActiveCount: 1,
      catalogIncompleteActiveCount: 0,
      missingCurrentPriceCount: 0,
      activeBundlesWithInactiveItemsCount: 0,
      taxRulesCoverageGapCount: 0,
      rulesGapCount: 0,
      activeOffersCount: 0,
      attentionItems: [],
      recentChanges: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Solicitudes por programar/i })).toBeInTheDocument();
    });

    const pending = screen.getByRole('link', { name: /Solicitudes por programar/i });
    expect(pending.className).not.toMatch(/bg-amber/);
    expect(pending.className).not.toMatch(/bg-rose/);
    expect(pending.className).toMatch(/min-h-28/);
    expect(pending.className).toMatch(/flex-col/);
    expect(pending.className).not.toMatch(/min-h-14/);
    expect(pending.className).not.toMatch(/flex-row/);

    const atRisk = screen.getByRole('link', { name: /Casos en riesgo de incumplir/i });
    expect(atRisk.className).not.toMatch(/bg-rose/);
    expect(atRisk.className).not.toMatch(/bg-amber/);

    const plans = screen.getByRole('link', { name: /Planes sin precio vigente/i });
    expect(plans.className).not.toMatch(/bg-amber/);

    const offers = screen.getByRole('button', { name: /Ofertas en riesgo/i });
    expect(offers.className).not.toMatch(/bg-amber/);

    // Grilla unificada: I-7 dentro de la retícula, sin variante estirada ni eyebrow.
    const opportunities = screen.getByRole('link', { name: /Oportunidades en seguimiento/i });
    const unifiedGrid = opportunities.closest('.xl\\:grid-cols-4');
    expect(unifiedGrid?.className).not.toMatch(/max-w-\[calc\(50%-0\.5rem\)\]/);
    expect(unifiedGrid?.className).toMatch(/xl:grid-cols-4/);
    expect(screen.queryByRole('heading', { name: 'Oportunidades' })).not.toBeInTheDocument();

    // B2 adaptativo (Opción A): dominante bajo (al día) → modo banda.
    triggerDominantResize(200);
    expect(document.querySelector('.xl\\:grid-cols-12')).toBeNull();
    const supportGrid = document.querySelector('.md\\:grid-cols-2');
    expect(supportGrid?.className).toMatch(/md:grid-cols-2/);
    expect(document.querySelector('.xl\\:grid-cols-3')).toBeNull();

    const emptyTitle = screen.getByText('Sin avisos de campo');
    expect(emptyTitle.parentElement?.parentElement?.className).not.toMatch(/bg-iwana-surface-soft/);
    expect(emptyTitle.parentElement?.parentElement?.className).not.toMatch(/rounded-2xl/);
  });

  it('B2 adaptativo: columna dominante alta conserva la retícula spec 8/4 (Opción A)', async () => {
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
      alerts: buildFieldAlerts(6),
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Aviso de campo 5')).toBeInTheDocument();
    });

    // Entrada a banda con altura baja y salida con altura alta (histéresis).
    triggerDominantResize(200);
    expect(document.querySelector('.xl\\:grid-cols-12')).toBeNull();

    // Rango muerto 420-460: en banda, 430 no sale (sin parpadeo).
    triggerDominantResize(430);
    expect(document.querySelector('.xl\\:grid-cols-12')).toBeNull();

    triggerDominantResize(600);
    const b2 = document.querySelector('.xl\\:grid-cols-12');
    expect(b2?.className).toMatch(/items-start/);
    expect(b2?.querySelector('.xl\\:col-span-8')).not.toBeNull();
    expect(b2?.querySelector('.xl\\:col-span-4')).not.toBeNull();

    // Rango muerto: desde retícula, 450 no entra a banda (sin parpadeo).
    triggerDominantResize(450);
    expect(document.querySelector('.xl\\:grid-cols-12')).not.toBeNull();
  });

  it('B2 adaptativo: apoyo de 1 panel usa contenedor xl:max-w-2xl en banda (SUPPORT)', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-support', role: UserRole.SUPPORT, tenantId: 't-1', displayName: 'Soporte' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Casos de la mesa de ayuda' }),
      ).toBeInTheDocument();
    });

    triggerDominantResize(200);

    expect(document.querySelector('.xl\\:grid-cols-12')).toBeNull();
    expect(document.querySelector('.xl\\:grid-cols-3')).toBeNull();
    expect(document.querySelector('.md\\:grid-cols-2')).toBeNull();
    expect(document.querySelector('.xl\\:max-w-2xl')).not.toBeNull();
  });

  it('B2 adaptativo: sin apoyo, el dominante ocupa el ancho completo (NOC)', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-noc', role: UserRole.NOC, tenantId: 't-1', displayName: 'NOC' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    triggerDominantResize(200);

    expect(document.querySelector('.xl\\:grid-cols-12')).toBeNull();
    expect(document.querySelector('.xl\\:grid-cols-3')).toBeNull();
    expect(document.querySelector('.md\\:grid-cols-2')).toBeNull();
    expect(document.querySelector('.xl\\:max-w-2xl')).toBeNull();
    expect(document.querySelector('.xl\\:col-span-4')).toBeNull();
  });

  it('B1b: administradora ve el mapa de módulos con señal y Operaciones sin cifra', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Programación, En riesgo, 1/ })).toBeInTheDocument();
    });

    const band = screen.getByLabelText('Salud de la operación');
    expect(within(band).getByRole('link', { name: /Programación, En riesgo, 1/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/scheduling/agenda'),
    );
    expect(
      within(band).getByRole('link', { name: /Mesa de ayuda, En riesgo, 1/ }),
    ).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: /Comercial, En riesgo, 4/ })).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: 'Oportunidades, Al día' })).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: 'Inventario, Al día' })).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: 'Configuración, Al día' })).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: 'Operaciones, Sin dato' })).toHaveAttribute(
      'href',
      '/dashboard/operations',
    );
    expect(within(band).queryByText('10')).not.toBeInTheDocument();
  });

  it('B1b: técnico navega a la agenda sin pedir el resumen de campo', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-tech', role: UserRole.TECHNICIAN, tenantId: 't-1', displayName: 'Técnico' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Programación, Sin dato' })).toBeInTheDocument();
    });

    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Programación, Sin dato' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling/agenda',
    );
    expect(screen.queryByLabelText('Indicadores núcleo')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Foco de hoy' })).not.toBeInTheDocument();
  });

  it('B1b: vista base no monta la banda', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-hr', role: UserRole.HR, tenantId: 't-1', displayName: 'Talento' },
      isLoading: false,
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Salud de la operación')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Foco de hoy' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ver mi perfil/i })).toHaveAttribute(
        'href',
        '/dashboard/profile',
      );
    });

    expect(screen.queryByText(/Accesos rápidos/i)).not.toBeInTheDocument();
  });

  it('B1b: error de campo pinta Sin dato y no finge 0', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText('No pudimos cargar el estado de algunos módulos. Reintenta.'),
      ).toBeInTheDocument();
    });

    const band = screen.getByLabelText('Salud de la operación');
    expect(within(band).getAllByText('Sin dato').length).toBeGreaterThanOrEqual(1);
    expect(
      within(band).queryByRole('link', { name: /Programación, En riesgo/ }),
    ).not.toBeInTheDocument();
    expect(within(band).getAllByRole('button', { name: 'Reintentar' }).length).toBeGreaterThan(0);
    expect(screen.getByText('No pudimos cargar el foco de campo. Reintenta.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('Foco de hoy: ratio real y ProgressMeter; I-1 sin vencidas usa delta lima', async () => {
    wfmGetSummary.mockResolvedValue({
      todayCount: 3,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Visitas del día frente a la carga')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Foco de hoy' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Sin vencidas')).toBeInTheDocument();
    const focusPanel = screen.getByRole('heading', { name: 'Foco de hoy' }).closest('section');
    expect(
      within(focusPanel as HTMLElement).getByRole('link', { name: 'Ver la agenda de hoy' }),
    ).toHaveAttribute('href', '/dashboard/scheduling/agenda');
  });

  it('Foco de hoy: denominador 0 no pinta barra al 0 %', async () => {
    wfmGetSummary.mockResolvedValue({
      todayCount: 0,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      pendingInbox: {
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      },
      alerts: [],
      technicianLoad: [],
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Sin carga que medir')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Foco de hoy' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
