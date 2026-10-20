/**
 * E2E — Federated Inventory maestros en /dashboard/settings/inventory
 * Cubre: ?tab=catalog|suppliers|locations&custody=mobile y redirect ?tab=stock
 * No rompe deep-links existentes de /dashboard/inventory
 */
import { expect, test } from '@playwright/test';
import { seedPortalSession as seedPortalSessionByCookie } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'tenant-inventory-demo';

/**
 * Aserción de cabecera de tenant, portada de
 * portal-settings-federated-shell.spec.ts:105-114: el cliente siempre
 * transporta el slug resuelto en X-Tenant-Slug.
 */
async function assertTenantHeader(route: import('@playwright/test').Route) {
  const headers = await route.request().allHeaders();
  expect(headers['x-tenant-slug']).toBe(MOCK_TENANT_SLUG);
}
const NOC_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function buildToken(role: 'NOC' | 'ADMIN' = 'NOC'): string {
  const sub = role === 'ADMIN' ? ADMIN_USER_ID : NOC_USER_ID;
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub,
        email: role === 'ADMIN' ? 'hash-admin' : 'hash-noc',
        role,
        tenantId: 'tenant-inventory-001',
        schemaName: 'tenant_inventory_001',
        jti: role === 'ADMIN' ? 'jti-admin' : 'jti-noc',
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ) +
    '.fakesig'
  );
}

async function seedPortalSession(
  page: import('@playwright/test').Page,
  role: 'NOC' | 'ADMIN' = 'NOC',
) {
  await seedPortalSessionByCookie(page, { token: buildToken(role), tenantSlug: MOCK_TENANT_SLUG });
}

async function mockInventoryApis(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sub: NOC_USER_ID,
          email: 'hash-noc',
          role: 'NOC',
          tenantId: 'tenant-inventory-001',
          schemaName: 'tenant_inventory_001',
          jti: 'jti-noc',
          type: 'tenant',
        },
      }),
    });
  });
  await page.route('**/api/v1/tenants/public-branding*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          displayName: 'ISP Inventario Demo',
          productName: 'iWana Empresa',
          surfaceName: 'Portal empresarial',
          metadataTitle: 'iWana Empresa',
          metadataDescription: 'Portal empresarial tenant-aware',
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
  });
  await page.route('**/api/v1/users/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: NOC_USER_ID,
          email: 'noc@inventory.example.test',
          role: 'NOC',
          status: 'ACTIVE',
          firstName: 'Monitoreo',
          lastName: 'Operativo',
          phone: null,
          jobTitle: 'Monitoreo operativo',
          avatarUrl: null,
          mfaEnabled: true,
          emailVerified: true,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    });
  });

  await page.route('**/api/v1/inventory/**', async (route) => {
    const url = route.request().url();
    if (
      url.includes('/inventory/replenishment/suggestions') &&
      route.request().method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }
    if (url.includes('/inventory/items') && route.request().method() === 'GET') {
      await assertTenantHeader(route);
      expect(route.request().method()).toBe('GET');
      expect(url).toContain('/inventory/items');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, nextCursor: null, page: 1, limit: 20 },
        }),
      });
      return;
    }
    if (url.includes('/inventory/categories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, nextCursor: null, page: 1, limit: 20 },
        }),
      });
      return;
    }
    if (url.includes('/inventory/stock')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, nextCursor: null, page: 1, limit: 20 },
        }),
      });
      return;
    }
    if (url.includes('/inventory/locations')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, nextCursor: null, page: 1, limit: 20 },
        }),
      });
      return;
    }
    if (url.includes('/inventory/dashboard')) {
      await assertTenantHeader(route);
      expect(url).toContain('/inventory/dashboard');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ itemsCount: 0, locationsCount: 0 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { total: 0 } }),
    });
  });
  await page.route('**/api/v1/purchasing/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { total: 0 } }),
    });
  });
  await page.route('**/api/v1/access-control/me/effective-permissions', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userId: NOC_USER_ID,
          role: 'NOC',
          effectivePermissions: [
            'inventory.stock.read',
            'inventory.stock.manage',
            'inventory.purchasing.read',
            'inventory.purchasing.manage',
            'settings.read',
          ],
          recoveryPermissions: [],
          profileSources: [],
        },
      }),
    });
  });
  await page.route('**/api/v1/configuration/settings-sections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          key: 'INVENTORY',
          label: 'Inventario',
          description: 'Maestros',
          ownerModule: 'Inventory',
          status: 'AVAILABLE',
          route: '/dashboard/settings/inventory?tab=catalog',
          requiredPermissions: ['inventory.stock.read'],
        },
      ]),
    });
  });
  await page.route('**/api/v1/configuration/settings-priority', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'NONE',
        item: null,
        evaluation: 'COMPLETE',
        unknownSources: [],
      }),
    });
  });
}

test.describe('SCM federado Settings — maestros', () => {
  test.beforeEach(async ({ page }) => {
    await seedPortalSession(page, 'NOC');
    await mockInventoryApis(page);
  });

  for (const tab of ['catalog', 'suppliers', 'locations'] as const) {
    test(`federado /dashboard/settings/inventory?tab=${tab} renderiza Inventario (maestro)`, async ({
      page,
    }) => {
      await page.goto(`/dashboard/settings/inventory?tab=${tab}`);
      await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible({
        timeout: 15000,
      });
      // Al menos un tab maestro debe estar visible
      await expect(
        page.getByRole('button', { name: /Catálogo|Proveedores|Bodegas/i }).first(),
      ).toBeVisible({ timeout: 10000 });
    });

    test(`federado /dashboard/settings/inventory?tab=${tab}&custody=mobile preserva query`, async ({
      page,
    }) => {
      await page.goto(`/dashboard/settings/inventory?tab=${tab}&custody=mobile`);
      await expect(page).toHaveURL(/tab=.*&custody=mobile|tab=.*custody=mobile/);
      await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible({
        timeout: 15000,
      });
    });
  }

  test('redirect /dashboard/settings/inventory?tab=stock -> /dashboard/inventory?tab=stock', async ({
    page,
  }) => {
    await page.goto('/dashboard/settings/inventory?tab=stock');
    await expect(page).toHaveURL(/\/dashboard\/inventory\?tab=stock/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible({ timeout: 15000 });
  });

  test('deep-link existente /dashboard/inventory?tab=catalog sigue funcionando (no roto)', async ({
    page,
  }) => {
    await page.goto('/dashboard/inventory?tab=catalog');
    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Catálogo/i })).toBeVisible({ timeout: 10000 });
  });
});
