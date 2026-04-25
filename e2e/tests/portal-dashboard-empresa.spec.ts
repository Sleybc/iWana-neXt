/**
 * E2E — Dashboard empresarial del tenant autenticado.
 *
 * Valida los criterios de aceptación del sprint MOD02-DASHBOARD-EMPRESA:
 *   CA-01: /dashboard no muestra contenido de suscriptor (Plan Hogar, velocidad, factura).
 *   CA-02: el portal consume contratos self-service (/tenants/me/summary) y no /tenants/:id.
 *   CA-03: la navegación visible no produce rutas rotas ni 404.
 *   CA-04: el dashboard renderiza datos reales, vacíos controlados o null explícito.
 *   CA-05: la actividad reciente solo se muestra al ADMIN.
 *   CA-06: existe evidencia E2E del flujo login → dashboard empresa.
 *
 * Todos los endpoints HTTP son mockeados con page.route() — no requiere backend levantado.
 * Sin datos PII reales — solo ficticios de prueba (security rule: zero-trust PII).
 *
 * BT-DE-14 — HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §7.2
 */

import { expect, test } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures de datos de prueba — ficticios, sin PII real
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TENANT_SLUG = 'test-isp';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'aabbccdd11223344',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-test-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const mockTenantSummary = {
  tenant: {
    id: 'tenant-uuid-test',
    name: 'ISP Prueba Colombia',
    slug: 'test-isp',
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
    features: { billing: false, mfa_required_all: false },
  },
  metrics: {
    configuredUsers: 5,
    mfaCoverage: null,
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

const mockAuditLogs = [
  {
    id: 'audit-uuid-1',
    tenantId: 'tenant-uuid-test',
    userId: 'user-uuid-admin-test',
    action: 'LOGIN',
    entityType: 'User',
    entityId: 'user-uuid-admin-test',
    oldValue: null,
    newValue: null,
    ipAddress: null,
    userAgent: null,
    requestId: null,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Setup de mocks — intercepta todas las llamadas a la API
// ─────────────────────────────────────────────────────────────────────────────

async function setupDashboardMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Login tenant
    if (url.includes('/auth/login') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: MOCK_ACCESS_TOKEN } }),
      });
      return;
    }

    // Perfil de sesión
    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'aabbccdd11223344',
            role: 'ADMIN',
            tenantId: 'tenant-uuid-test',
            schemaName: 'tenant_test_isp',
            jti: 'jti-test-1',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    // Perfil del usuario autenticado (usado por AuthProvider para displayName)
    if (url.match(/\/users\/[^/]+$/) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-uuid-admin-test',
            email: 'admin@test-isp.co',
            role: 'ADMIN',
            status: 'ACTIVE',
            firstName: 'Ana',
            lastName: 'Prueba',
            phone: null,
            jobTitle: 'Administradora',
            avatarUrl: null,
            mfaEnabled: true,
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        }),
      });
      return;
    }

    // Summary del dashboard — contrato self-service
    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockTenantSummary }),
      });
      return;
    }

    // Audit logs — actividad reciente
    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockAuditLogs }),
      });
      return;
    }

    // Logout
    if (url.includes('/auth/logout') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // Cualquier otro request pasa
    await route.continue();
  });
}

/** Establece el estado de sesión en localStorage para simular usuario ya autenticado */
async function setAuthSession(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ token, slug }: { token: string; slug: string }) => {
      localStorage.setItem('iwana.portal.access-token', token);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: MOCK_ACCESS_TOKEN, slug: MOCK_TENANT_SLUG },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard empresarial — flujo login → dashboard', () => {
  test('CA-06: el flujo login → dashboard lleva al panel empresarial', async ({ page }) => {
    await setupDashboardMocks(page);
    await page.goto('/auth/login');

    // Completar formulario de login con slug del tenant
    await page.getByPlaceholder('ejemplo: isp-demo').fill(MOCK_TENANT_SLUG);
    await page.getByLabel(/correo/i).fill('admin@test-isp.co');
    await page.getByRole('textbox', { name: /^contraseña/i }).fill('PasswordSegura123!');
    await page.getByRole('button', { name: /ingresar/i }).click();

    // Verificar que redirigió al dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('CA-01: el dashboard no muestra contenido de suscriptor', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verificar que NO están los textos de suscriptor
    await expect(page.getByText(/plan hogar/i)).not.toBeVisible();
    await expect(page.getByText(/suscriptor iwana/i)).not.toBeVisible();
    await expect(page.getByText(/próxima factura/i)).not.toBeVisible();
    await expect(page.getByText(/velocidad de conexión/i)).not.toBeVisible();
  });

  test('CA-02: el portal no llama a /tenants/:id de plataforma para datos del tenant', async ({
    page,
  }) => {
    const platformEndpointCalled: string[] = [];

    await page.route('**/api/v1/tenants/*', (route) => {
      const url = route.request().url();
      // Capturar si se llama a /tenants/<uuid> (endpoint de plataforma)
      if (/\/tenants\/[0-9a-f-]{36}/.test(url) && !url.includes('/tenants/me')) {
        platformEndpointCalled.push(url);
      }
      void route.continue();
    });

    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Ninguna llamada a /tenants/:uuid de plataforma debe haberse hecho
    expect(platformEndpointCalled).toHaveLength(0);
  });

  test('CA-04: el dashboard muestra el nombre de la empresa del summary', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // El nombre de empresa del mock debe aparecer
    await expect(
      page.getByRole('heading', { name: 'Bienvenido, ISP Prueba Colombia' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('CA-04: el dashboard muestra métricas reales sin datos inventados', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Usuarios activos: 5 (dato real del mock)
    await expect(page.getByText('5', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    // Audit events: 23
    await expect(page.getByText('23', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('CA-03: la navegación del sidebar no produce 404 desde las rutas habilitadas', async ({
    page,
  }) => {
    const notFoundPages: string[] = [];

    // Capturar respuestas 404 del navegador
    page.on('response', (response) => {
      const isDocumentRequest = response.request().resourceType() === 'document';
      const isPortalPage = response.url().includes('3002') && !response.url().includes('/api/');

      if (response.status() === 404 && isDocumentRequest && isPortalPage) {
        notFoundPages.push(response.url());
      }
    });

    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navegar a /dashboard/settings — ruta activa de configuración empresarial
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // No debe haber 404 de páginas del portal (excluimos assets estáticos)
    const portalPageNotFound = notFoundPages.filter(
      (u) => !u.includes('_next') && !u.includes('.ico') && !u.includes('favicon'),
    );
    expect(portalPageNotFound).toHaveLength(0);
  });

  test('CA-05: la actividad reciente se muestra al ADMIN', async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // El panel de actividad reciente debe existir para ADMIN
    await expect(page.getByText(/actividad reciente/i)).toBeVisible({ timeout: 10_000 });
  });
});
