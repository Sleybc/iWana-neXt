/**
 * Gate navegador — MOD06 Fase F Tarea 7 paso 4 (+ H17 live=off).
 * No sustituye sesión humana con tenant real; valida UI real en Chromium con summary con 3 alertas.
 */
import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-gate',
      email: 'hash-admin-gate',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-gate',
      schemaName: 'tenant_test_isp',
      jti: 'jti-gate-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const summaryWithThreeAlerts = {
  plansCount: 4,
  activePlansCount: 3,
  productsCount: 6,
  activeProductsCount: 5,
  servicesCount: 2,
  activeServicesCount: 2,
  bundlesCount: 2,
  activeBundlesCount: 2,
  promotionsCount: 3,
  activePromotionsCount: 2,
  compatibilityRulesCount: 4,
  activeCompatibilityRulesCount: 3,
  taxRulesCount: 5,
  activeTaxRulesCount: 4,
  offersExpiringSoonCount: 2,
  offersNearUseLimitCount: 1,
  offersAtRiskCount: 3,
  catalogActiveCount: 10,
  catalogSellableActiveCount: 8,
  catalogIncompleteActiveCount: 2,
  missingCurrentPriceCount: 2,
  activeBundlesWithInactiveItemsCount: 1,
  taxRulesCoverageGapCount: 2,
  rulesGapCount: 3,
  activeOffersCount: 4,
  attentionItems: [
    {
      id: 'p1',
      name: 'Promo A',
      entityType: 'promotion',
      reason: 'expiring_soon',
      destinoTab: 'promotions',
      validTo: null,
      usesRemaining: null,
    },
  ],
  recentChanges: [],
};

async function setAuthSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_ACCESS_TOKEN, tenantSlug: MOCK_TENANT_SLUG });
}

async function setupGateMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    const json = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      const slug = url.searchParams.get('slug');
      await json(
        slug === MOCK_TENANT_SLUG
          ? {
              data: {
                displayName: 'ISP Gate Comercial',
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
            }
          : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
        slug === MOCK_TENANT_SLUG ? 200 : 404,
      );
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await json({
        data: {
          sub: 'user-uuid-admin-gate',
          email: 'hash-admin-gate',
          role: 'ADMIN',
          tenantId: 'tenant-uuid-gate',
          schemaName: 'tenant_test_isp',
          jti: 'jti-gate-1',
          type: 'tenant',
        },
      });
      return;
    }

    if (pathname.match(/\/users\/[^/]+$/) && method === 'GET') {
      await json({
        data: {
          id: 'user-uuid-admin-gate',
          email: 'admin@isp-demo.co',
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Gate',
          mfaEnabled: true,
          emailVerified: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await json({
        data: {
          id: 'tenant-uuid-gate',
          name: 'ISP Gate Comercial',
          slug: MOCK_TENANT_SLUG,
          showTenantName: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      // API responde el DTO en raíz; el cliente usa returnFullResponse: true.
      await json(summaryWithThreeAlerts);
      return;
    }

    // Listados vacíos para tabs de trabajo (summary ya manejado arriba)
    if (
      method === 'GET' &&
      (pathname.includes('/commercial/') ||
        pathname.includes('/taxation/') ||
        pathname.endsWith('/commercial/catalog'))
    ) {
      await json({ data: [], meta: { total: 0 } });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

test.describe('Gate navegador — alertas comerciales sobre tabs (Fase F)', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateMocks(page);
    await setAuthSession(page);
  });

  test('alertas visibles en Planes, Impuestos y Reemplazos; CTA aplica filtro; live=off; mobile usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/commercial');
    await page.waitForLoadState('networkidle');

    const alertsRegion = page.getByRole('region', { name: 'Alertas operativas' });
    await expect(alertsRegion).toBeVisible();
    await expect(page.getByText('Ofertas en riesgo')).toBeVisible();
    await expect(page.getByText('Catálogo incompleto')).toBeVisible();
    await expect(page.getByText('Reglas incompletas')).toBeVisible();

    // H17: live=off → no role=alert/status en las PortalAlert de la tira
    const stripAlerts = alertsRegion.locator('[role="alert"], [role="status"]');
    await expect(stripAlerts).toHaveCount(0);

    for (const section of ['Planes', 'Reemplazos', 'Impuestos'] as const) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(alertsRegion).toBeVisible();
      await expect(page.getByText('Ofertas en riesgo')).toBeVisible();
    }

    await page.getByRole('button', { name: 'Ver ofertas' }).click();
    await expect(page).toHaveURL(/tab=(bundles|promotions)/);
    await expect(page).toHaveURL(/offerStatus=expiring|status=expiring/);

    // Mobile 375: selector de sección alcanzable con 3 alertas
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard/commercial?tab=plans');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('region', { name: 'Alertas operativas' })).toBeVisible();
    const sectionTrigger = page.getByRole('button', { name: /Sección: Planes/ });
    await expect(sectionTrigger).toBeVisible();
    await sectionTrigger.scrollIntoViewIfNeeded();
    const triggerBox = await sectionTrigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox!.y).toBeLessThan(812 * 2.5);
  });
});
