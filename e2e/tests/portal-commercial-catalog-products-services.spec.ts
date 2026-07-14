import { expect, test } from '@playwright/test';

const MOCK_TENANT_SLUG = 'isp-demo';
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

type CatalogItem = {
  id: string;
  type: 'PRODUCT' | 'SERVICE';
  name: string;
  description: string | null;
  taxClassificationId: string | null;
  retentionApplicable: boolean;
  isActive: boolean;
  category?: string;
  isLoan?: boolean;
  requiresInventory?: boolean;
  chargeType?: 'ONE_TIME' | 'ON_DEMAND' | 'RECURRING';
  currentPrice?: string;
  installationFee?: string;
};

async function setAuthSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('ejemplo: isp-demo').fill(MOCK_TENANT_SLUG);
  await page.getByLabel(/correo electrónico/i).fill('admin@test-isp.co');
  await page.getByRole('textbox', { name: /^contraseña/i }).fill('PasswordSegura123!');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

async function setupCommercialMocks(page: import('@playwright/test').Page) {
  const products: CatalogItem[] = [
    {
      id: 'prod-router',
      type: 'PRODUCT',
      name: 'Router WiFi 6',
      description: 'Router principal para hogar',
      taxClassificationId: null,
      retentionApplicable: false,
      isActive: true,
      category: 'CPE',
      isLoan: true,
      requiresInventory: true,
    },
  ];

  const services: CatalogItem[] = [
    {
      id: 'srv-ip-publica',
      type: 'SERVICE',
      name: 'IP publica fija',
      description: 'Direccion IPv4 publica dedicada',
      taxClassificationId: null,
      retentionApplicable: false,
      isActive: true,
      chargeType: 'RECURRING',
      currentPrice: '25000.00',
      installationFee: '10000.00',
    },
  ];

  const capturedPriceUpdates: string[] = [];

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

    if (pathname.endsWith('/auth/login') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: MOCK_ACCESS_TOKEN } }),
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

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plansCount: 1,
          activePlansCount: 1,
          productsCount: 1,
          activeProductsCount: 1,
          servicesCount: 1,
          activeServicesCount: 1,
          bundlesCount: 0,
          activeBundlesCount: 0,
          promotionsCount: 0,
          activePromotionsCount: 0,
          compatibilityRulesCount: 0,
          activeCompatibilityRulesCount: 0,
          taxRulesCount: 0,
          activeTaxRulesCount: 0,
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      const type = url.searchParams.get('type');

      if (type === 'PLAN') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'plan-fibra-500',
                type: 'PLAN',
                name: 'Plan Fibra 500',
                description: 'Plan residencial de referencia',
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                technology: 'FTTH',
                installationRule: 'ON_DEMAND',
                downloadSpeedMbps: 500,
                uploadSpeedMbps: 500,
                currentPrice: '109900.00',
                installationFee: '0.00',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }

      if (type === 'PRODUCT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: products, meta: { total: products.length } }),
        });
        return;
      }

      if (type === 'SERVICE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: services, meta: { total: services.length } }),
        });
        return;
      }
    }

    if (pathname.endsWith('/commercial/catalog/services') && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        name: string;
        description?: string;
        chargeType: 'ONE_TIME' | 'ON_DEMAND' | 'RECURRING';
      };

      const createdId = 'srv-prioritario';

      services.push({
        id: createdId,
        type: 'SERVICE',
        name: body.name,
        description: body.description ?? null,
        taxClassificationId: null,
        retentionApplicable: false,
        isActive: true,
        chargeType: body.chargeType,
        currentPrice: '0.00',
        installationFee: '0.00',
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: createdId } }),
      });
      return;
    }

    if (pathname.match(/\/commercial\/catalog\/[^/]+\/prices$/) && method === 'POST') {
      const serviceId = pathname.split('/').at(-2);
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        basePrice: string;
        installationFee: string;
      };

      const target = services.find((service) => service.id === serviceId);
      if (target) {
        target.currentPrice = body.basePrice;
        target.installationFee = body.installationFee;
      }

      capturedPriceUpdates.push(serviceId ?? 'unknown');

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ok: true } }),
      });
      return;
    }

    await route.continue();
  });

  return {
    getCapturedPriceUpdates: () => capturedPriceUpdates,
  };
}

test.describe('Portal Comercial - Catalogo de productos y servicios', () => {
  test('permite navegar productos/servicios y crear servicio con precio vigente', async ({
    page,
  }) => {
    const mocks = await setupCommercialMocks(page);
    await setAuthSession(page);

    await page.goto('/dashboard/commercial');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Comercial' })).toBeVisible();

    await page.getByRole('tab', { name: 'Productos adicionales' }).click();
    await expect(page.getByRole('tab', { name: 'Productos adicionales' })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(page.getByText('Router WiFi 6')).toBeVisible();

    await page.getByRole('tab', { name: 'Servicios' }).click();
    await expect(page.getByRole('tab', { name: 'Servicios' })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(page.getByText('IP publica fija')).toBeVisible();
    await expect(page.getByText(/25\.000/)).toBeVisible();

    await page.getByRole('button', { name: 'Agregar servicio' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre').fill('Visita tecnica prioritaria');
    await dialog.getByRole('combobox', { name: 'Tipo de cobro' }).click();
    await page.getByRole('option', { name: 'Bajo demanda' }).click();
    await dialog.getByLabel('Precio base (COP)').fill('45000');
    await dialog.getByLabel('Cargo de instalacion (COP)').fill('5000');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Visita tecnica prioritaria')).toBeVisible();
    await expect(page.getByText(/45\.000/)).toBeVisible();
    expect(mocks.getCapturedPriceUpdates()).toContain('srv-prioritario');
  });
});
