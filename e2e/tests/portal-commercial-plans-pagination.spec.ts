/**
 * E2E — MOD06 planes: paginación numerada (ADR-065) + selector local 5–100.
 *
 * Recorrido: página → tamaño → deep-link → no-regresión productos («Cargar más»).
 * HTTP mockeado — no requiere backend. Sin PII real.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-001',
      email: 'sha256:admin-hash-ficticio',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-001',
      schemaName: 'tenant_prueba',
      jti: 'jti-test-001',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_TENANT = 'tenant-prueba';

/**
 * Aserción de cabecera de tenant, portada de
 * portal-settings-federated-shell.spec.ts:105-114: el cliente siempre
 * transporta el slug resuelto en X-Tenant-Slug.
 */
async function assertTenantHeader(route: import('@playwright/test').Route) {
  const headers = await route.request().allHeaders();
  expect(headers['x-tenant-slug']).toBe(MOCK_TENANT);
}

const MOCK_ME = {
  sub: 'user-admin-uuid-001',
  email: 'sha256:admin-hash-ficticio',
  role: 'ADMIN',
  tenantId: 'tenant-uuid-001',
  schemaName: 'tenant_prueba',
  jti: 'jti-test-001',
  type: 'tenant',
  passwordResetRequired: false,
};

function buildPlan(id: string, name: string) {
  return {
    id,
    type: 'PLAN',
    name,
    description: null,
    taxClassificationId: null,
    retentionApplicable: false,
    isActive: true,
    technology: 'GPON',
    installationRule: 'ON_DEMAND',
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 300,
    currentPrice: '89900.00',
    installationFee: '0.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildProduct(id: string, name: string) {
  return {
    id,
    type: 'PRODUCT',
    name,
    description: null,
    taxClassificationId: null,
    retentionApplicable: false,
    isActive: true,
    category: 'CPE',
    isLoan: true,
    requiresInventory: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const PAGE1 = Array.from({ length: 20 }, (_, i) => buildPlan(`plan-p1-${i}`, `Plan Uno ${i}`));
const PAGE2 = Array.from({ length: 20 }, (_, i) => buildPlan(`plan-p2-${i}`, `Plan Dos ${i}`));
const PRODUCTS = Array.from({ length: 20 }, (_, i) =>
  buildProduct(`prod-${i}`, `Router de prueba ${i}`),
);

function h11Envelope(
  data: ReturnType<typeof buildPlan>[] | ReturnType<typeof buildProduct>[],
  meta: Record<string, unknown>,
) {
  return { data: { data, meta } };
}

function pageMeta(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] as string[] },
    sort: null,
  };
}

function visiblePagerCount(page: Page, text: string) {
  return page.locator('p:not([aria-live])').filter({ hasText: text });
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: MOCK_TENANT });
}

async function setupMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant Prueba',
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

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ME }),
      });
      return;
    }

    if (url.includes('/users/user-admin-uuid-001') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-admin-uuid-001',
            email: 'admin@tenant-prueba.co',
            role: 'ADMIN',
            status: 'ACTIVE',
            tenantId: 'tenant-uuid-001',
            mfaEnabled: true,
            mfaRequired: false,
            firstName: 'Ana',
            lastName: 'Prueba',
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-001',
            name: 'ISP Prueba',
            slug: MOCK_TENANT,
            showTenantName: true,
          },
        }),
      });
      return;
    }

    if (url.includes('/notifications') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plansCount: 45,
          activePlansCount: 45,
          productsCount: 20,
          activeProductsCount: 20,
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
          catalogActiveCount: 65,
          catalogSellableActiveCount: 65,
          catalogIncompleteActiveCount: 0,
          missingCurrentPriceCount: 0,
          activeBundlesWithInactiveItemsCount: 0,
          taxRulesCoverageGapCount: 0,
          rulesGapCount: 0,
          activeOffersCount: 0,
          attentionItems: [],
          recentChanges: [],
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      await assertTenantHeader(route);
      expect(method).toBe('GET');
      expect(route.request().url()).toContain('/commercial/catalog');
      const type = parsed.searchParams.get('type');
      const pageNum = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1;
      const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '20', 10) || 20;
      expect(Number.isInteger(pageNum)).toBe(true);
      expect(limit).toBeGreaterThan(0);
      const name = parsed.searchParams.get('name');

      if (type === 'PLAN') {
        const all = [
          ...PAGE1,
          ...PAGE2,
          ...Array.from({ length: 5 }, (_, i) => buildPlan(`plan-p3-${i}`, `Plan Tres ${i}`)),
        ];
        const filtered = name
          ? all.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()))
          : all;
        const total = filtered.length;
        const start = (pageNum - 1) * limit;
        const data = filtered.slice(start, start + limit);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(h11Envelope(data, pageMeta(pageNum, limit, total))),
        });
        return;
      }

      if (type === 'PRODUCT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: PRODUCTS,
            meta: { nextCursor: 'cursor-prod-2', total: 40 },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: url }),
    });
  });
}

test.describe('MOD06 — Planes paginación numerada', () => {
  test('recorrido página · tamaño · deep-link · productos siguen Cargar más', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/dashboard/commercial');
    await expect(page.getByRole('heading', { name: 'Planes' })).toBeVisible();
    await expect(page).not.toHaveURL(/tab=plans/);
    await expect(page.getByText('Plan Uno 0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 1–20 de 45 planes')).toBeVisible();

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).not.toHaveURL(/tab=plans/);
    await expect(page.getByText('Plan Dos 0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 21–40 de 45 planes')).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByText('Plan Uno 0')).toBeVisible();

    const pageSizeSelect = page.getByRole('combobox', { name: 'Filas por página' });
    await pageSizeSelect.click();
    await page.getByRole('option', { name: '50' }).click();
    await expect(page).toHaveURL(/size=50/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).not.toHaveURL(/pageSize=/);
    await expect(visiblePagerCount(page, '45 planes')).toBeVisible();

    const planListRequest = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/commercial/catalog') &&
        req.url().includes('type=PLAN') &&
        req.url().includes('page=2') &&
        req.url().includes('limit=10') &&
        req.url().includes('name=Dos'),
    );
    await page.goto('/dashboard/commercial?page=2&size=10&q=Dos');
    await planListRequest;
    await expect(page.getByText('Plan Dos 10')).toBeVisible();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/size=10/);
    await expect(page).toHaveURL(/q=Dos/);
    await expect(page).not.toHaveURL(/tab=plans/);

    await page.getByRole('button', { name: 'Productos' }).first().click();
    await expect(page).toHaveURL(/tab=products/);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /Paginación de planes/ })).toHaveCount(0);
  });
});
