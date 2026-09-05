import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';

/**
 * Aserción de cabecera de tenant, portada de
 * portal-settings-federated-shell.spec.ts:105-114: el cliente siempre
 * transporta el slug resuelto en X-Tenant-Slug.
 */
async function assertTenantHeader(route: import('@playwright/test').Route) {
  const headers = await route.request().allHeaders();
  expect(headers['x-tenant-slug']).toBe(MOCK_TENANT_SLUG);
}
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'hash-admin-test',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-test-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

async function setAuthSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_ACCESS_TOKEN, tenantSlug: MOCK_TENANT_SLUG });
}

async function setupTaxMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();
    const method = route.request().method();
    const url = new URL(requestUrl);
    const pathname = url.pathname;

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'ISP Demo',
            showTenantName: true,
            logoLightUrl: null,
            logoDarkUrl: null,
            sealLightUrl: null,
            sealDarkUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            loginBackgroundLightUrl: null,
            loginBackgroundDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'hash-admin-test',
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

    if (pathname.match(/\/users\/[^/]+$/) && method === 'GET') {
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
            mfaEnabled: true,
            emailVerified: true,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-test',
            name: 'ISP Prueba Colombia',
            slug: MOCK_TENANT_SLUG,
            showTenantName: true,
            sealLightUrl: null,
            sealDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenant: {
              id: 'tenant-uuid-test',
              name: 'ISP Prueba Colombia',
              slug: MOCK_TENANT_SLUG,
              status: 'ACTIVE',
              contactEmail: 'contacto@test-isp.co',
              legalName: null,
              nit: null,
              city: 'Medellin',
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
              pendingAlerts: 0,
              auditEventsLast7d: 4,
            },
            alerts: [],
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
      return;
    }

    if (pathname.endsWith('/taxation/definitions') && method === 'GET') {
      await assertTenantHeader(route);
      expect(method).toBe('GET');
      expect(route.request().url()).toContain('/taxation/definitions');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'tax-def-iva-19',
              code: 'IVA_19',
              name: 'IVA general',
              category: 'VAT',
              jurisdictionLevel: 'NATIONAL',
              baseRate: 19,
              treatment: 'STANDARD',
              context: 'BOTH',
              isActive: true,
              isSystemPreset: true,
              notes: null,
            },
          ],
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/tax-rules') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'tax-rule-1',
              taxType: 'IVA',
              ratePercentage: 19,
              customerSegment: 'RESIDENTIAL',
              stratumFrom: 1,
              stratumTo: 6,
            },
          ],
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/tax-rule-applications') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'tax-app-1',
              taxRuleId: 'tax-rule-1',
              taxDefinitionId: 'tax-def-iva-19',
              treatment: 'STANDARD',
              rateOverride: null,
              priority: 10,
              isActive: true,
            },
          ],
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/tax/simulate') && method === 'POST') {
      await assertTenantHeader(route);
      expect(method).toBe('POST');
      expect(route.request().url()).toContain('/commercial/tax/simulate');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            applications: [
              {
                taxDefinitionId: 'tax-def-iva-19',
                treatment: 'STANDARD',
                effectiveRate: 19,
                ruleId: 'tax-rule-1',
                priorityMatched: 10,
              },
            ],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

async function openTaxationSection(page: Page) {
  await page.goto('/dashboard/commercial');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Impuestos', exact: true }).click();
}

test.describe('Portal tributario — simulador', () => {
  test.beforeEach(async ({ page }) => {
    await setupTaxMocks(page);
    await setAuthSession(page);
  });

  test('simulador tributario muestra resultado para segmento RESIDENTIAL', async ({ page }) => {
    await openTaxationSection(page);
    await page.getByRole('button', { name: 'Simulador', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Simulador' })).toBeVisible();
    await page.getByRole('button', { name: 'Simular' }).click();

    await expect(page.getByText(/Resultado —/i)).toBeVisible();
    await expect(page.getByText('Regla ganadora', { exact: true })).toBeVisible();
    await expect(page.getByText(/IVA general \(IVA_19\)/i)).toBeVisible();
  });

  test('catálogo de impuestos muestra presets SYSTEM', async ({ page }) => {
    await openTaxationSection(page);

    await expect(page.getByRole('button', { name: 'Impuestos', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('IVA general')).toBeVisible();
    await expect(page.getByText('IVA_19')).toBeVisible();
  });

  test('reglas de aplicación carga sin error', async ({ page }) => {
    await openTaxationSection(page);
    await page.getByRole('button', { name: 'Aplicación de impuestos', exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Aplicación de impuestos', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText(/iva · 19% · estratos 1–6 · residential/i)).toBeVisible();
    await expect(page.getByText('IVA general (IVA_19)')).toBeVisible();
  });
});
