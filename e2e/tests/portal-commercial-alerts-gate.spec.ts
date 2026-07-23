/**
 * Gate navegador — MOD06 Fase F Tarea 7 paso 4 (+ H17 live=off).
 * No sustituye sesión humana con tenant real; valida UI real en Chromium con summary con 3 alertas.
 */
import { expect, test, type Page } from '@playwright/test';

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
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: MOCK_ACCESS_TOKEN, slug: MOCK_TENANT_SLUG },
  );
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

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      // API responde el DTO en raíz; el cliente usa returnFullResponse: true.
      await json(summaryWithThreeAlerts);
      return;
    }

    // Listados vacíos para tabs de trabajo
    if (
      method === 'GET' &&
      (pathname.includes('/commercial/') ||
        pathname.includes('/taxation/') ||
        pathname.endsWith('/commercial/catalog'))
    ) {
      await json({ data: [], meta: { total: 0 } });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Gate navegador — alertas comerciales sobre tabs (Fase F)', () => {
  test.beforeEach(async ({ page }) => {
    await setupGateMocks(page);
    await setAuthSession(page);
  });

  test('alertas visibles en Planes, Tributación y Compatibilidad; CTA aplica filtro; live=off; mobile usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/commercial');
    await page.waitForLoadState('networkidle');

    const alertsRegion = page.getByRole('region', { name: 'Alertas operativas' });
    await expect(alertsRegion).toBeVisible();
    await expect(page.getByText('Ofertas en riesgo')).toBeVisible();
    await expect(page.getByText('Catálogo incompleto')).toBeVisible();
    await expect(page.getByText('Huecos en reglas')).toBeVisible();

    // H17: live=off → no role=alert/status en las PortalAlert de la tira
    const stripAlerts = alertsRegion.locator('[role="alert"], [role="status"]');
    await expect(stripAlerts).toHaveCount(0);

    for (const tab of ['Planes', 'Compatibilidad', 'Tributación'] as const) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(alertsRegion).toBeVisible();
      await expect(page.getByText('Ofertas en riesgo')).toBeVisible();
    }

    await page.getByRole('button', { name: 'Ver ofertas' }).click();
    await expect(page).toHaveURL(/tab=(bundles|promotions)/);
    await expect(page).toHaveURL(/status=expiring/);

    // Mobile 375: tabs y contenido alcanzables con 3 alertas
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard/commercial?tab=plans');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('region', { name: 'Alertas operativas' })).toBeVisible();
    const plansTab = page.getByRole('tab', { name: 'Planes' });
    await expect(plansTab).toBeVisible();
    await plansTab.scrollIntoViewIfNeeded();
    const tabBox = await plansTab.boundingBox();
    expect(tabBox).not.toBeNull();
    // El tab no queda fuera de un scroll vertical absurdo (> 3 viewports desde top)
    expect(tabBox!.y).toBeLessThan(812 * 2.5);
  });
});
