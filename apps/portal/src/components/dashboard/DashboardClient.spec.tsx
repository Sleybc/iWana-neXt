import { render, screen, waitFor, within } from '@testing-library/react';
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
const queueCounts = jest.fn();
const cutoffAgenda = jest.fn();
const listProvisioningInbox = jest.fn();
const listReplenishmentSuggestions = jest.fn();

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
      listReplenishmentSuggestions: (...args: unknown[]) => listReplenishmentSuggestions(...args),
    },
    subscribersApi: {
      queueCounts: (...args: unknown[]) => queueCounts(...args),
    },
    billingCyclesApi: {
      cutoffAgenda: (...args: unknown[]) => cutoffAgenda(...args),
    },
    networkApi: {
      listProvisioningInbox: (...args: unknown[]) => listProvisioningInbox(...args),
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
  queueCounts.mockResolvedValue({
    active: 120,
    suspended: 0,
    contactPending: 0,
    fiscalIncomplete: 0,
    withoutLiveServices: 0,
  });
  cutoffAgenda.mockResolvedValue({ date: '2026-11-16', items: [], meta: { total: 0 } });
  listProvisioningInbox.mockResolvedValue({ data: [], meta: { total: 0 } });
  listReplenishmentSuggestions.mockResolvedValue([]);
}

describe('DashboardClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDashboardSessionCacheForTests();
    __resetAuditFeedCacheForTests();
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

  // ── Dirección «Pulso y atención» (spec 2026-11-16) ────────────────────────────────────────

  const attentionRows = () => screen.getAllByRole('link', { name: /^(En riesgo|Atención): / });

  function setRole(role: UserRole) {
    useAuthMock.mockReturnValue({
      user: { id: 'u-1', role, tenantId: 't-1', displayName: 'Persona' },
      isLoading: false,
    });
  }

  it('B0–B3 ADMIN: identidad, pulso en una superficie, cola de atención y áreas', async () => {
    render(<DashboardClient />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Demo ISP' })).toBeInTheDocument();

    const pulse = await screen.findByRole('region', { name: 'Indicadores núcleo' });
    await waitFor(() => expect(within(pulse).getAllByRole('link')).toHaveLength(5));
    expect(
      within(pulse)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      'Suscriptores activos',
      'Casos abiertos',
      'Visitas de hoy',
      'Solicitudes por programar',
      'Oportunidades en seguimiento',
    ]);
    // Una sola superficie: la sombra vive en la franja, no en cada celda.
    expect(pulse.className).toMatch(/shadow-iwana-soft/);
    for (const cell of within(pulse).getAllByRole('link')) {
      expect(cell.className).not.toMatch(/shadow-iwana/);
    }
    // Anatomía de celda: señal, frase y mini visual con datos de la misma fuente.
    const cases = within(pulse).getByRole('link', { name: 'Casos abiertos' });
    expect(within(cases).getByText('1 fuera de tiempo')).toBeInTheDocument();
    expect(within(cases).getByText('0 resueltos hoy')).toBeInTheDocument();
    expect(
      within(cases).getByRole('img', { name: /^Casos abiertos por prioridad: Alta 2/ }),
    ).toBeInTheDocument();
    expect(
      within(pulse).getByRole('img', { name: 'Base de suscriptores: Activos 120' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Requiere tu atención' })).toBeInTheDocument();
    const areas = screen.getByRole('region', { name: 'Por área' });
    expect(
      within(areas)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual([
      'Mesa de ayuda',
      'Programación',
      'Oportunidades',
      'Suscriptores',
      'Aprovisionamiento',
      'Inventario',
    ]);

    expect(screen.queryByRole('region', { name: 'Estado de la empresa' })).not.toBeInTheDocument();
    expect(screen.queryByText('Foco de hoy')).not.toBeInTheDocument();
    expect(screen.queryByText('Salud de la operación')).not.toBeInTheDocument();
  });

  it('el pulso navega con filtros de URL (C-6)', async () => {
    render(<DashboardClient />);

    expect(await screen.findByRole('link', { name: 'Suscriptores activos' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers?queue=active',
    );
    expect(screen.getByRole('link', { name: 'Casos abiertos' })).toHaveAttribute(
      'href',
      '/dashboard/assurance?status=OPEN',
    );
    expect(screen.getByRole('link', { name: 'Visitas de hoy' }).getAttribute('href')).toMatch(
      /^\/dashboard\/scheduling\/agenda\?view=day&fromDate=\d{4}-\d{2}-\d{2}$/,
    );
    expect(screen.getByRole('link', { name: 'Oportunidades en seguimiento' })).toHaveAttribute(
      'href',
      '/dashboard/crm/expedientes?view=open',
    );
  });

  it('cola de atención: En riesgo primero, seis visibles y el resto bajo «Ver los restantes»', async () => {
    cutoffAgenda.mockResolvedValue({ date: '2026-11-16', items: [], meta: { total: 5 } });
    const user = userEvent.setup();
    render(<DashboardClient />);

    await screen.findByRole('link', { name: /1 caso superó su tiempo de atención/ });
    const rows = attentionRows();
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'En riesgo: 1 caso superó su tiempo de atención. Mesa de ayuda',
      'En riesgo: 1 visita vencida sin cerrar. Programación',
      'En riesgo: 1 solicitud de visita con atención vencida. Programación',
      'En riesgo: 4 ofertas en riesgo. Comercial',
      'Atención: 2 casos en riesgo de incumplir. Mesa de ayuda',
      'Atención: 5 servicios entran a corte hoy. Suscriptores',
    ]);
    expect(rows[0]).toHaveAttribute('href', '/dashboard/assurance?slaBreachStatus=AT_RISK');

    await user.click(screen.getByRole('button', { name: 'Ver los 2 restantes' }));
    expect(attentionRows()).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('cola vacía con todas las fuentes al día: «Todo al día», sin cero ni fila', async () => {
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
    assuranceGetSummary.mockResolvedValue({
      openCount: 0,
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
      offersAtRiskCount: 0,
      missingCurrentPriceCount: 0,
      catalogActiveCount: 1,
      catalogSellableActiveCount: 1,
      attentionItems: [],
    });
    render(<DashboardClient />);

    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^(En riesgo|Atención): / })).not.toBeInTheDocument();
  });

  it('contiene fallos parciales: un contrato caído no borra el resto ni finge «todo al día»', async () => {
    wfmGetSummary.mockRejectedValue(new Error('caída'));
    render(<DashboardClient />);

    expect(await screen.findByRole('link', { name: 'Casos abiertos' })).toHaveTextContent('5');
    expect(screen.getByText('No pudimos revisar todas las áreas.')).toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
    expect(attentionRows().map((row) => row.getAttribute('aria-label'))).toEqual([
      'En riesgo: 1 caso superó su tiempo de atención. Mesa de ayuda',
      'En riesgo: 4 ofertas en riesgo. Comercial',
      'Atención: 2 casos en riesgo de incumplir. Mesa de ayuda',
      'Atención: 2 planes sin precio vigente. Comercial',
    ]);
    // El pulso de campo no finge cero.
    expect(screen.queryByRole('link', { name: 'Visitas de hoy' })).not.toBeInTheDocument();
  });

  it('fuentes nuevas: corte de hoy con página mínima y las tres colas de aprovisionamiento', async () => {
    listProvisioningInbox.mockImplementation(({ queue }: { queue: string }) =>
      Promise.resolve({ data: [], meta: { total: queue === 'FAILED' ? 2 : 1 } }),
    );
    listReplenishmentSuggestions.mockResolvedValue([{ id: 'r-1' }, { id: 'r-2' }, { id: 'r-3' }]);
    wfmGetSummary.mockRejectedValue(new Error('caída'));
    assuranceGetSummary.mockRejectedValue(new Error('caída'));
    commercialGetSummary.mockRejectedValue(new Error('caída'));
    render(<DashboardClient />);

    expect(
      await screen.findByRole('link', { name: /2 servicios quedaron sin aprovisionar/ }),
    ).toHaveAttribute('href', '/dashboard/network/provisioning?queue=FAILED');
    expect(
      screen.getByRole('link', { name: /1 instalación cerrada sin aprovisionar/ }),
    ).toHaveAttribute('href', '/dashboard/network/provisioning?queue=CLOSED_UNPROVISIONED');
    expect(screen.getByRole('link', { name: /3 productos por reponer/ })).toHaveAttribute(
      'href',
      '/dashboard/inventory',
    );

    expect(cutoffAgenda).toHaveBeenCalledWith(
      { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), limit: 1 },
      'demo-isp',
    );
    expect(listProvisioningInbox.mock.calls.map(([params]) => params)).toEqual([
      { queue: 'IN_EXECUTION', limit: 1 },
      { queue: 'FAILED', limit: 1 },
      { queue: 'CLOSED_UNPROVISIONED', limit: 1 },
    ]);

    const areas = screen.getByRole('region', { name: 'Por área' });
    expect(within(areas).getByRole('link', { name: 'Abrir Aprovisionamiento' })).toHaveAttribute(
      'href',
      '/dashboard/network/provisioning?queue=FAILED',
    );
  });

  it('SUPPORT no pide suscriptores, aprovisionamiento, reposición ni comercial (techo de autorización)', async () => {
    setRole(UserRole.SUPPORT);
    render(<DashboardClient />);

    await screen.findByRole('link', { name: 'Casos abiertos' });
    expect(cutoffAgenda).toHaveBeenCalledTimes(1);
    expect(queueCounts).not.toHaveBeenCalled();
    expect(listProvisioningInbox).not.toHaveBeenCalled();
    expect(listReplenishmentSuggestions).not.toHaveBeenCalled();
    expect(commercialGetSummary).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();

    const areas = screen.getByRole('region', { name: 'Por área' });
    expect(
      within(areas)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Mesa de ayuda', 'Programación']);
  });

  it('ACCOUNTANT: pulso de dos celdas, solo sus señales y atención comercial filtrada a precio', async () => {
    setRole(UserRole.ACCOUNTANT);
    queueCounts.mockResolvedValue({
      active: 120,
      suspended: 0,
      contactPending: 0,
      fiscalIncomplete: 7,
      withoutLiveServices: 0,
    });
    commercialGetSummary.mockResolvedValue({
      offersAtRiskCount: 4,
      missingCurrentPriceCount: 2,
      catalogActiveCount: 3,
      catalogSellableActiveCount: 1,
      attentionItems: [
        { id: 'a', name: 'Plan hogar', reason: 'missing_current_price', destinoTab: 'plans' },
        { id: 'b', name: 'Promo de temporada', reason: 'expiring_soon', destinoTab: 'promotions' },
      ],
    });
    render(<DashboardClient />);

    const pulse = await screen.findByRole('region', { name: 'Indicadores núcleo' });
    await waitFor(() => expect(within(pulse).getAllByRole('link')).toHaveLength(2));
    expect(pulse.className).toMatch(/xl:grid-cols-2/);

    expect(attentionRows().map((row) => row.getAttribute('aria-label'))).toEqual([
      'Atención: 2 planes sin precio vigente. Comercial',
      'Atención: 7 suscriptores con datos fiscales incompletos. Suscriptores',
    ]);
    expect(screen.getByText('Plan hogar')).toBeInTheDocument();
    expect(screen.queryByText('Promo de temporada')).not.toBeInTheDocument();
    expect(wfmGetSummary).not.toHaveBeenCalled();
    expect(assuranceGetSummary).not.toHaveBeenCalled();
    const areas = screen.getByRole('region', { name: 'Por área' });
    expect(
      within(areas)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Suscriptores']);
    expect(within(areas).getByRole('link', { name: 'Abrir Suscriptores' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers?queue=fiscalIncomplete',
    );
  });

  it('SALES · C-R6: Ofertas en riesgo no usa lima y enfoca el bloque comercial', async () => {
    setRole(UserRole.SALES);
    const user = userEvent.setup();
    render(<DashboardClient />);

    const offers = await screen.findByRole('button', { name: 'Ofertas en riesgo' });
    expect(offers.className).not.toMatch(/iwana-secondary/);

    await user.click(offers);
    expect(screen.getByRole('heading', { name: 'Atención comercial' })).toHaveFocus();
    expect(
      screen.getByRole('status', { name: 'Atención comercial. Revisa las ofertas en riesgo.' }),
    ).toBeInTheDocument();
  });

  it('Por área: Mesa de ayuda apila por prioridad y Oportunidades lista solo etapas abiertas', async () => {
    render(<DashboardClient />);

    const areas = await screen.findByRole('region', { name: 'Por área' });
    const stack = await within(areas).findByRole('img', {
      name: /^Casos abiertos por prioridad: /,
    });
    expect(stack.getAttribute('aria-label')).toMatch(/Alta 2/);
    // Urgencia en escalas de error y advertencia, nunca lima.
    expect(stack.innerHTML).not.toMatch(/iwana-secondary/);

    expect(within(areas).getByText('en seguimiento por etapa')).toBeInTheDocument();
    expect(within(areas).queryByText(/Descartado/i)).not.toBeInTheDocument();
    expect(within(areas).getByRole('link', { name: 'Abrir Mesa de ayuda' })).toHaveAttribute(
      'href',
      '/dashboard/assurance?slaBreachStatus=AT_RISK',
    );
    // Mesa de ayuda (caso fuera de tiempo) y Programación (visita vencida).
    expect(within(areas).getAllByText('En riesgo')).toHaveLength(2);
  });

  it('área sin acceso muestra el mensaje de negocio, no un cero, y permite reintentar', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    inventoryDashboard.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    const user = userEvent.setup();
    render(<DashboardClient />);

    const areas = await screen.findByRole('region', { name: 'Por área' });
    expect(await within(areas).findByText('No tienes acceso a este resumen.')).toBeInTheDocument();
    expect(within(areas).queryByText(/valor estimado/)).not.toBeInTheDocument();

    await user.click(within(areas).getByRole('button', { name: 'Reintentar' }));
    expect(await within(areas).findByText(/valor estimado/)).toBeInTheDocument();
    expect(inventoryDashboard).toHaveBeenCalledTimes(2);
  });

  it('una fuente sin permiso no cuenta como fallo de la cola de atención', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    setRole(UserRole.NOC);
    listProvisioningInbox.mockRejectedValue(new ApiError(403, 'Forbidden'));
    render(<DashboardClient />);

    await screen.findByRole('link', { name: /1 caso superó su tiempo de atención/ });
    expect(screen.queryByText('No pudimos revisar todas las áreas.')).not.toBeInTheDocument();
  });

  it('el inicio sigue usable cuando el resumen de programación no trae bandeja pendiente', async () => {
    wfmGetSummary.mockResolvedValue({
      todayCount: 3,
      overdueCount: 0,
      upcomingCount: 0,
      activeCount: 0,
      enRouteCount: 0,
      atRiskCount: 0,
      alerts: [],
      technicianLoad: [],
    });
    render(<DashboardClient />);

    expect(await screen.findByRole('link', { name: 'Visitas de hoy' })).toHaveTextContent('3');
    expect(screen.queryByRole('link', { name: /solicitud/ })).not.toBeInTheDocument();
  });
});
