import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

jest.mock('./QuickActionsPanel', () => ({
  QuickActionsPanel: ({ role }: { role: string }) => (
    <div data-testid="quick-actions">Accesos rápidos · {role}</div>
  ),
}));

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

  it('abre el menú móvil y ejecuta la actualización desde su callback visible', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Más acciones del inicio' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Programar visita/i })).toHaveAttribute(
      'href',
      '/dashboard/scheduling?open=create',
    );

    await user.click(within(menu).getByRole('menuitem', { name: /Actualizar/i }));
    await waitFor(() => {
      expect(getSummary).toHaveBeenCalledTimes(2);
    });
  });

  it('C-R3: el menú B0 cierra con Escape y devuelve el foco al disparador', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    const trigger = screen.getByRole('button', { name: 'Más acciones del inicio' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
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
      expect(screen.getByTestId('change-history')).toBeInTheDocument();
    });

    expect(auditList).toHaveBeenCalledWith({ limit: 8 }, expect.any(String));
    expect(auditList).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('change-history')).toHaveAttribute('data-minimized', 'true');
    expect(screen.getByTestId('change-history')).toHaveTextContent(/· 1$/);
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

  it('B1 ADMIN expone 4 encabezados de dominio sin eyebrow de categoría (C-6)', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    });

    const indicators = screen.getByLabelText('Indicadores núcleo');
    for (const label of ['Operaciones de campo', 'Mesa de ayuda', 'Comercial', 'Oportunidades']) {
      const heading = within(indicators).getByText(label);
      expect(heading).toHaveClass('portal-eyebrow');
      expect(heading).not.toHaveClass('text-gray-700');
      expect(heading).not.toHaveClass('dark:text-gray-200');
    }

    const visits = screen.getByRole('link', { name: /Visitas de hoy/i });
    expect(within(visits).queryByText('Operaciones de campo')).not.toBeInTheDocument();
  });

  it('promueve help-desk y comercial cuando KPI > 0 y Ver más cuenta el resto (C-8/C-11)', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/Casos de la mesa de ayuda/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Atención comercial/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver más · 1 bloque/i })).toBeInTheDocument();
    expect(screen.queryByText(/Estado del almacén/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver más · 1 bloque/i }));
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

    await user.click(screen.getByRole('button', { name: /Reintentar/i }));
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

  it('acciones B0 incluyen anillo de foco (C-1)', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    const primary = screen.getByRole('link', { name: /Registrar suscriptor/i });
    expect(primary.className).toMatch(/focus-visible:/);
    const refresh = screen.getByRole('button', { name: /Actualizar/i });
    expect(refresh.className).toMatch(/focus-visible:/);
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

  it('C-R1: fallo parcial no avanza la hora de B0 y anuncia dato desactualizado', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    const lastRead = document.querySelector('time');
    expect(lastRead).not.toBeNull();
    const completeRead = lastRead!.getAttribute('dateTime');
    expect(completeRead).toBeTruthy();

    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    await user.click(screen.getByRole('button', { name: /^Actualizar$/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Algunos datos no se actualizaron. Revisa los avisos o pulsa Actualizar./i,
        ),
      ).toBeInTheDocument();
    });

    const afterPartial = document.querySelector('time');
    expect(afterPartial).not.toBeNull();
    expect(afterPartial).toHaveAttribute('dateTime', completeRead);
  });

  it('C-R1: error + dato previo muestra Reintentar en la métrica', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Visitas de hoy/i })).toBeInTheDocument();
    });

    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));
    await user.click(screen.getByRole('button', { name: /^Actualizar$/ }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Reintentar/i }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('link', { name: /Visitas de hoy/i })).not.toBeInTheDocument();
  });

  it('C-R2: el grupo B1 en error anuncia una vez y recupera el foco al encabezado', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    wfmGetSummary.mockRejectedValue(new ApiError(500, 'wfm down'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No pudimos actualizar las cifras de operaciones de campo/i),
      ).toBeInTheDocument();
    });

    const groupAlerts = screen.getAllByText(
      /No pudimos actualizar las cifras de operaciones de campo/i,
    );
    expect(groupAlerts).toHaveLength(1);
    expect(
      screen.getByText(
        /Las cifras anteriores siguen visibles. Reintenta en cada tarjeta con aviso./i,
      ),
    ).toBeInTheDocument();

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
      expect(
        screen.queryByText(/No pudimos actualizar las cifras de operaciones de campo/i),
      ).not.toBeInTheDocument();
    });

    expect(document.activeElement).toHaveTextContent('Operaciones de campo');
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
  });

  it('C-R4: token B0 sin inline-flex base y menú solo fuera de md', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Registrar suscriptor/i })).toBeInTheDocument();
    });

    const refresh = screen.getByRole('button', { name: /^Actualizar$/ });
    expect(refresh.className).toMatch(/\bhidden\b/);
    expect(refresh.className).toMatch(/md:inline-flex/);
    expect(refresh.className).not.toMatch(/inline-flex min-h-11/);

    const overflow = screen.getByRole('button', { name: 'Más acciones del inicio' });
    const overflowWrap = overflow.parentElement;
    expect(overflowWrap?.className).toMatch(/md:hidden/);
    expect(overflowWrap?.className).toMatch(/xl:flex/);

    expect(screen.queryByRole('link', { name: /^Programar visita$/ })).not.toBeInTheDocument();
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
});
