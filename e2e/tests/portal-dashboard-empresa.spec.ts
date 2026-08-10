/**
 * E2E — Dashboard empresarial del tenant autenticado (recomposición MOD02).
 *
 * Criterios Task 6 (D-1…D-7) + CA-V2 heredados:
 *   D-1  Axe claro/oscuro en estados loading/loaded/empty/error/updating/unavailable
 *   D-2  null honesto + contraste AA (axe + aserción de sustituto)
 *   D-3  Composición representativa ADMIN / NOC / SALES / TECHNICIAN
 *   D-4  Teclado móvil 375 px (drawer inert, foco, Escape)
 *   D-5  Primer viewport 375/768/1280 + capturas
 *   D-6  Selectores por rol/nombre accesible (sin cifras exactas)
 *   D-7  Firmas iWana (barra lima + sombra dual) en superficie del inicio
 *
 * Todos los endpoints HTTP se mockean con page.route() — no requiere API real.
 * Sin PII real — solo ficticios de prueba.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'informes',
  'evidencias',
  'portal-dashboard-recomposicion',
);

type TenantRole = 'ADMIN' | 'NOC' | 'SALES' | 'TECHNICIAN';

interface MockOptions {
  role?: TenantRole;
  /** Retiene /wfm/dashboard/summary hasta liberar (loading / updating). */
  holdWfm?: { wait: () => Promise<void> };
  /** Fuerza error en el resumen WFM (bloque dominante ADMIN/NOC). */
  failWfm?: boolean;
  /** todayCount null → dato no disponible. */
  nullVisits?: boolean;
  /** alerts vacíos + sin actividad. */
  emptyOperational?: boolean;
}

function buildAccessToken(role: TenantRole): string {
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub: `user-uuid-${role.toLowerCase()}-test`,
        email: 'aabbccdd11223344',
        role,
        tenantId: 'tenant-uuid-test',
        schemaName: 'tenant_test_isp',
        jti: `jti-test-${role}`,
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ) +
    '.fakesig'
  );
}

const mockTenantSummary = {
  tenant: {
    id: 'tenant-uuid-test',
    name: 'ISP Prueba Colombia',
    slug: 'isp-demo',
    status: 'ACTIVE',
    contactEmail: 'contacto@test-isp.co',
    legalName: null,
    nit: null,
    city: 'Medellín',
    department: 'Antioquia',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: '2026-01-15T00:00:00.000Z',
  },
  settings: {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 50,
    features: { billing: false, mfa_required_all: false },
  },
  metrics: {
    configuredUsers: 5,
    mfaCoverage: 1,
    pendingAlerts: 1,
    auditEventsLast7d: 23,
  },
  alerts: [
    {
      id: 'mfa-not-required',
      severity: 'warning',
      title: 'MFA no obligatorio',
      description: 'Se recomienda habilitar MFA obligatorio.',
      href: '/dashboard/settings',
    },
  ],
};

const mockTenantProfile = {
  id: 'tenant-uuid-test',
  name: 'ISP Prueba Colombia',
  slug: 'isp-demo',
  status: 'ACTIVE',
  contactEmail: 'contacto@test-isp.co',
  legalName: null,
  nit: null,
  city: 'Medellín',
  department: 'Antioquia',
  countryCode: 'CO',
  phone: null,
  website: null,
  createdAt: '2026-01-15T00:00:00.000Z',
  showTenantName: true,
  logoLightUrl: null,
  logoLightAssetId: null,
  logoDarkUrl: null,
  logoDarkAssetId: null,
  sealLightUrl: null,
  sealLightAssetId: null,
  sealDarkUrl: null,
  sealDarkAssetId: null,
  faviconLightUrl: null,
  faviconLightAssetId: null,
  faviconDarkUrl: null,
  faviconDarkAssetId: null,
  loginBackgroundLightUrl: null,
  loginBackgroundLightAssetId: null,
  loginBackgroundDarkUrl: null,
  loginBackgroundDarkAssetId: null,
  brandingProductName: null,
  brandingSurfaceName: null,
  brandingMetadataTitle: null,
  brandingMetadataDescription: null,
};

const mockPublicBranding = {
  displayName: 'ISP Prueba Colombia',
  showTenantName: true,
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  faviconLightUrl: null,
  faviconDarkUrl: null,
  loginBackgroundLightUrl: null,
  loginBackgroundDarkUrl: null,
};

const mockSettingsSections = [
  {
    key: 'organization',
    label: 'Perfil empresarial y organización',
    description: 'Perfil empresarial, configuración operativa base y sedes.',
    ownerModule: 'MOD00 / Organización',
    status: 'AVAILABLE',
    route: '/dashboard/settings/organization',
    requiredPermissions: [],
  },
  {
    key: 'access',
    label: 'Usuarios y acceso',
    description: 'Perfiles y permisos.',
    ownerModule: 'MOD00 / Access control',
    status: 'AVAILABLE',
    route: '/dashboard/settings/access',
    requiredPermissions: [],
  },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupDashboardMocks(page: Page, options: MockOptions = {}) {
  const role = options.role ?? 'ADMIN';

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': request.headers()['origin'] ?? '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type, X-Tenant-Slug, X-Requested-With',
        },
      });
      return;
    }

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await json(route, { data: mockPublicBranding });
      return;
    }

    if (url.includes('/auth/login') && method === 'POST') {
      await json(route, { data: { accessToken: buildAccessToken(role) } });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await json(route, {
        data: {
          sub: `user-uuid-${role.toLowerCase()}-test`,
          email: 'aabbccdd11223344',
          role,
          tenantId: 'tenant-uuid-test',
          schemaName: 'tenant_test_isp',
          jti: `jti-test-${role}`,
          type: 'tenant',
        },
      });
      return;
    }

    if (url.match(/\/users\/[^/]+$/) && method === 'GET') {
      await json(route, {
        data: {
          id: `user-uuid-${role.toLowerCase()}-test`,
          email: 'ops@test-isp.co',
          role,
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          phone: null,
          jobTitle: 'Operadora',
          avatarUrl: null,
          mfaEnabled: true,
          emailVerified: true,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      });
      return;
    }

    if (/\/access-control\/users\/[^/]+\/effective-permissions$/.test(url) && method === 'GET') {
      await json(route, {
        data: {
          userId: `user-uuid-${role.toLowerCase()}-test`,
          role,
          effectivePermissions: ['settings.read'],
          recoveryPermissions: [],
          profileSources: [],
        },
      });
      return;
    }

    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await json(route, { data: mockTenantSummary });
      return;
    }

    if (url.includes('/tenants/me/settings') && method === 'GET') {
      await json(route, {
        data: {
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          fiberInstallationThresholdMeters: 50,
          features: { billing: false, mfa_required_all: false },
        },
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await json(route, { data: mockTenantProfile });
      return;
    }

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await json(route, { data: mockSettingsSections });
      return;
    }

    if (url.includes('/wfm/dashboard/summary') && method === 'GET') {
      if (options.holdWfm) {
        await options.holdWfm.wait();
      }
      if (options.failWfm) {
        await json(route, { code: 'E2E_FORCED', message: 'wfm down' }, 500);
        return;
      }
      // returnFullResponse: true — el cliente espera el cuerpo plano tipado, no envelope.
      await json(route, {
        todayCount: options.nullVisits ? null : 3,
        overdueCount: 1,
        upcomingCount: 0,
        activeCount: 0,
        enRouteCount: 0,
        atRiskCount: 0,
        pendingInbox: {
          totalOpen: options.emptyOperational ? 0 : 2,
          readyToScheduleCount: options.nullVisits ? null : 2,
          needsContextCount: 0,
          overdueSlaCount: options.emptyOperational ? 0 : 1,
          highPriorityOpenCount: 0,
        },
        alerts: options.emptyOperational
          ? []
          : [
              {
                id: 'wfm-alert-1',
                type: 'OVERDUE',
                severity: 'warning',
                title: 'Visita en riesgo',
                description: 'Hay una visita con retraso operativo.',
                eventId: null,
                assignedUserId: null,
                scheduledStartAt: null,
              },
            ],
        technicianLoad: [],
      });
      return;
    }

    if (url.includes('/assurance/dashboard/summary') && method === 'GET') {
      await json(route, {
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
      return;
    }

    if (url.includes('/commercial/dashboard/summary') && method === 'GET') {
      await json(route, {
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
      return;
    }

    if (url.includes('/inventory/dashboard') && method === 'GET') {
      await json(route, {
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
      return;
    }

    if (url.includes('/crm/pipeline/summary') && method === 'GET') {
      await json(route, {
        data: { NUEVO_POTENCIAL: 3, DESCARTADO: 1, CLIENTE_ACTIVO: 2 },
        total: 6,
      });
      return;
    }

    if (url.includes('/audit-logs') && method === 'GET') {
      await json(route, {
        data: options.emptyOperational
          ? []
          : [
              {
                id: 'audit-uuid-1',
                tenantId: 'tenant-uuid-test',
                userId: `user-uuid-${role.toLowerCase()}-test`,
                action: 'LOGIN',
                entityType: 'User',
                entityId: `user-uuid-${role.toLowerCase()}-test`,
                oldValue: null,
                newValue: null,
                ipAddress: null,
                userAgent: null,
                requestId: null,
                createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              },
            ],
      });
      return;
    }

    if (url.includes('/auth/logout') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    await json(route, { code: 'E2E_UNMOCKED', message: url }, 404);
  });
}

async function setAuthSession(page: Page, role: TenantRole = 'ADMIN') {
  await seedPortalSession(page, {
    token: buildAccessToken(role),
    tenantSlug: MOCK_TENANT_SLUG,
  });
}

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

async function expectLoadedDashboard(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'ISP Prueba Colombia' })).toBeVisible({
    timeout: 15_000,
  });
}

async function runAxe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  // Residuales post-Task 6 cerrados por FE sobre contrato DS v1.1 (§1.7) + CTAs dark + sin opacity-80.
  const violations = result.violations;

  if (violations.length > 0) {
    console.log(
      `[AXE:${label}]`,
      violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    );
  }
  expect(violations, `axe ${label}`).toEqual([]);
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('iwana-theme', value);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectThemeApplied(page: Page, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    await expect(page.locator('html.dark')).toBeAttached({ timeout: 10_000 });
  } else {
    await expect(page.locator('html.dark')).toHaveCount(0);
  }
}

test.describe('Dashboard empresarial — baseline CA (selectores semánticos D-6)', () => {
  test('CA-06: el flujo login → dashboard lleva al panel empresarial', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'ADMIN' });
    await page.goto('/auth/login');

    await page.getByPlaceholder('ejemplo: isp-demo').fill(MOCK_TENANT_SLUG);
    await page.getByLabel(/correo/i).fill('admin@test-isp.co');
    await page.getByRole('textbox', { name: /^contraseña/i }).fill('PasswordSegura123!');
    await page.getByRole('button', { name: /ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('CA-01: el dashboard no muestra contenido de suscriptor', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);

    await expect(page.getByText(/plan hogar/i)).not.toBeVisible();
    await expect(page.getByText(/suscriptor iwana/i)).not.toBeVisible();
    await expect(page.getByText(/próxima factura/i)).not.toBeVisible();
    await expect(page.getByText(/velocidad de conexión/i)).not.toBeVisible();
  });

  test('CA-02: el portal no llama a /tenants/:id de plataforma', async ({ page }) => {
    const platformEndpointCalled: string[] = [];

    await page.route('**/api/v1/tenants/*', async (route) => {
      const url = route.request().url();
      if (/\/tenants\/[0-9a-f-]{36}/.test(url) && !url.includes('/tenants/me')) {
        platformEndpointCalled.push(url);
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'E2E_UNMOCKED', message: url }),
      });
    });

    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);

    expect(platformEndpointCalled).toHaveLength(0);
  });

  test('CA-04: muestra empresa e indicadores por nombre accesible (no por cifra)', async ({
    page,
  }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Registrar suscriptor/i })).toBeVisible();
    await expect(page.getByLabel('Indicadores núcleo')).toBeVisible();
    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
  });

  test('CA-03: navegación a configuración no produce 404 de documento', async ({ page }) => {
    const notFoundPages: string[] = [];

    page.on('response', (response) => {
      const isDocumentRequest = response.request().resourceType() === 'document';
      const isPortalPage = response.url().includes('3002') && !response.url().includes('/api/');
      if (response.status() === 404 && isDocumentRequest && isPortalPage) {
        notFoundPages.push(response.url());
      }
    });

    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    const portalPageNotFound = notFoundPages.filter(
      (u) => !u.includes('_next') && !u.includes('.ico') && !u.includes('favicon'),
    );
    expect(portalPageNotFound).toHaveLength(0);
  });

  test('CA-05: el historial de cambios se muestra al ADMIN', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);

    await expect(page.getByText(/historial de cambios/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('D-3 · Composición por roles representativos', () => {
  test('ADMIN: acción primaria + ≥2 indicadores + sin panel en preparación', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'ADMIN' });
    await setAuthSession(page, 'ADMIN');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Registrar suscriptor/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('NOC: programar visita e indicadores de campo/mesa', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'NOC' });
    await setAuthSession(page, 'NOC');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Programar visita/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Visitas de hoy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Casos abiertos/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('SALES: registrar suscriptor e indicadores comerciales', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'SALES' });
    await setAuthSession(page, 'SALES');
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    await expect(page.getByRole('link', { name: /Registrar suscriptor/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Planes sin precio vigente/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Oportunidades en seguimiento/i })).toBeVisible();
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
  });

  test('TECHNICIAN (rol base): agenda útil sin indicadores operativos ajenos', async ({ page }) => {
    await setupDashboardMocks(page, { role: 'TECHNICIAN' });
    await setAuthSession(page, 'TECHNICIAN');
    await gotoDashboard(page);

    await expect(page.getByRole('link', { name: /Ver mi agenda de hoy/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Panel en preparación/i)).toHaveCount(0);
    await expect(page.getByLabel('Indicadores núcleo')).toHaveCount(0);
  });
});

test.describe('D-1 / D-2 · Axe en temas y estados', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`estado cargado · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page);
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);
      await runAxe(page, `loaded-${theme}`);
    });

    test(`dato no disponible (null) · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { nullVisits: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);

      const visits = page.getByRole('link', { name: /Visitas de hoy/i });
      await expect(visits.getByText('Sin dato disponible')).toBeVisible();
      await expect(visits.getByText('0', { exact: true })).toHaveCount(0);
      await runAxe(page, `unavailable-${theme}`);
    });

    test(`vacío operativo · tema ${theme}`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { emptyOperational: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);
      await expect(page.getByText(/Sin avisos de campo/i)).toBeVisible();
      await runAxe(page, `empty-${theme}`);
    });

    test(`error de fuente · tema ${theme} + backgroundImage none`, async ({ page }) => {
      await applyTheme(page, theme);
      await setupDashboardMocks(page, { failWfm: true });
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);
      await expectThemeApplied(page, theme);

      const alert = page
        .getByRole('status')
        .filter({ hasText: /No pudimos cargar/i })
        .first();
      await expect(alert).toBeVisible();

      const backgroundImage = await alert.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(backgroundImage, `backgroundImage en error ${theme}`).toBe('none');

      await runAxe(page, `error-${theme}`);
    });
  }

  test('estado loading · tema claro (compuerta WFM)', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await applyTheme(page, 'light');
    await setupDashboardMocks(page, { holdWfm: { wait: () => gate } });
    await setAuthSession(page);
    await page.goto('/dashboard');

    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible({ timeout: 15_000 });

    try {
      await runAxe(page, 'loading-light');
    } finally {
      release();
    }

    await expectLoadedDashboard(page);
  });

  test('estado actualizando · tema oscuro', async ({ page }) => {
    const options: MockOptions = {};
    await applyTheme(page, 'dark');
    await setupDashboardMocks(page, options);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);
    await expectThemeApplied(page, 'dark');

    let release: () => void = () => undefined;
    options.holdWfm = {
      wait: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };

    await page.getByRole('button', { name: /Actualizar/i }).click();
    await expect(page.getByText(/Actualizando/i).first()).toBeVisible({ timeout: 10_000 });

    try {
      await runAxe(page, 'updating-dark');
    } finally {
      release();
    }

    await expect(page.getByText(/Actualizando/i)).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe('D-4 · Recorrido de teclado móvil 375 px', () => {
  test('drawer cerrado es inerte; Tab/Escape/retorno de foco', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toHaveAttribute('inert', '');

    const openMenu = page.getByRole('button', { name: 'Abrir menú' });
    await openMenu.focus();
    await page.keyboard.press('Tab');

    const focusedAfterTab = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inSidebar: Boolean(el?.closest('#sidebar')),
        label: el?.getAttribute('aria-label') ?? el?.textContent?.trim()?.slice(0, 80) ?? '',
      };
    });
    expect(focusedAfterTab.inSidebar).toBe(false);

    await openMenu.click();
    await expect(sidebar).not.toHaveAttribute('inert');
    const closeInDrawer = sidebar.getByRole('button', { name: 'Cerrar menú' });
    await expect(closeInDrawer).toBeFocused();

    await page.keyboard.press('Tab');
    const focusedInDrawer = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('#sidebar')),
    );
    expect(focusedInDrawer).toBe(true);

    await page.keyboard.press('Shift+Tab');
    await expect(closeInDrawer).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(openMenu).toBeFocused();
  });
});

test.describe('D-5 / D-7 · Primer viewport, responsive y firmas', () => {
  for (const width of [375, 768, 1280] as const) {
    test(`viewport ${width}px: acción operativa + ≥2 indicadores sin solape`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await setupDashboardMocks(page);
      await setAuthSession(page);
      await gotoDashboard(page);
      await expectLoadedDashboard(page);

      const primary = page.getByRole('link', { name: /Registrar suscriptor/i });
      await expect(primary).toBeVisible();

      const primaryBox = await primary.boundingBox();
      expect(primaryBox).not.toBeNull();
      expect(primaryBox!.y + primaryBox!.height).toBeLessThanOrEqual(width === 375 ? 812 : 900);

      const visits = page.getByRole('link', { name: /Visitas de hoy/i });
      const cases = page.getByRole('link', { name: /Casos abiertos/i });
      await expect(visits).toBeVisible();
      await expect(cases).toBeVisible();

      const a = await visits.boundingBox();
      const b = await cases.boundingBox();
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      const overlap =
        a!.x < b!.x + b!.width &&
        a!.x + a!.width > b!.x &&
        a!.y < b!.y + b!.height &&
        a!.y + a!.height > b!.y;
      // En 375 pueden apilarse (sin solape de cajas); en ≥768 no deben solaparse.
      if (width >= 768) {
        expect(overlap).toBe(false);
      } else {
        // Apilados: el segundo empieza debajo del primero.
        expect(b!.y).toBeGreaterThanOrEqual(a!.y);
      }

      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `viewport-${width}.png`),
        fullPage: false,
      });
    });
  }

  test('firmas iWana: barra lima activa + sombra soft en métrica (D-7)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await gotoDashboard(page);
    await expectLoadedDashboard(page);

    const inicio = page.locator('#sidebar').getByRole('link', { name: 'Inicio' });
    await expect(inicio).toHaveAttribute('aria-current', 'page');
    const limeBar = inicio.locator('span.absolute.left-0');
    await expect(limeBar).toBeAttached();

    const metric = page.getByRole('link', { name: /Visitas de hoy/i });
    const shadow = await metric.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'firmas-iwana-1280.png'),
      fullPage: false,
    });
  });
});
