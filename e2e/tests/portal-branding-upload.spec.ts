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
const MOCK_TENANT_ID = 'tenant-uuid-test';
const MOCK_SCHEMA_NAME = 'tenant_test_isp';
const UPDATED_SEAL_URL = 'https://cdn.test-isp.co/branding/seal-light-uploaded.png';
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAABTklEQVR4nO3SMQEAIAzAMEA5zocMjiYKenSvO7PIOr8D+MsAcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAuAekhwN+LeoABQAAAABJRU5ErkJggg==',
  'base64',
);

function buildAccessToken(role: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'aabbccdd11223344',
      role,
      tenantId: MOCK_TENANT_ID,
      schemaName: MOCK_SCHEMA_NAME,
      jti: `jti-${role.toLowerCase()}`,
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

async function setAuthSession(page: Page): Promise<void> {
  await seedPortalSession(page, {
    token: buildAccessToken('ADMIN'),
    tenantSlug: MOCK_TENANT_SLUG,
  });
}

async function setupBrandingUploadMocks(page: Page): Promise<{
  uploadRequests: Array<{ usage: string; themeVariant: string; fileName: string }>;
}> {
  const uploadRequests: Array<{ usage: string; themeVariant: string; fileName: string }> = [];

  const tenantProfile = {
    id: MOCK_TENANT_ID,
    name: 'ISP Prueba Colombia',
    slug: MOCK_TENANT_SLUG,
    status: 'ACTIVE',
    contactEmail: 'contacto@test-isp.co',
    legalName: null,
    nit: null,
    nitDv: null,
    city: 'Medellin',
    department: 'Antioquia',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    logoLightUrl: null,
    logoLightAssetId: null,
    logoDarkUrl: null,
    logoDarkAssetId: null,
    sealLightUrl: null as string | null,
    sealLightAssetId: null as string | null,
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
    showTenantName: true,
  };

  const tenantSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 120,
    features: {
      billing: false,
      mfa_required_all: false,
    },
  };

  const settingsSections = [
    {
      key: 'branding',
      label: 'Marca',
      description: 'Gestiona identidad visual y activos corporativos del tenant autenticado.',
      ownerModule: 'Tenant / Branding',
      status: 'AVAILABLE',
      route: '/dashboard/settings/branding',
      requiredPermissions: ['settings.read'],
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      const slug = new URL(url).searchParams.get('slug');
      await route.fulfill({
        status: slug === MOCK_TENANT_SLUG ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          slug === MOCK_TENANT_SLUG
            ? {
                data: {
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
                },
              }
            : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
        ),
      });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'aabbccdd11223344',
            role: 'ADMIN',
            tenantId: MOCK_TENANT_ID,
            schemaName: MOCK_SCHEMA_NAME,
            jti: 'jti-admin',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (url.includes('/users/user-uuid-admin-test') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-uuid-admin-test',
            role: 'ADMIN',
            status: 'ACTIVE',
            firstName: 'Ana',
            lastName: 'Prueba',
            phone: '+573001234567',
            jobTitle: 'Operaciones',
            avatarUrl: null,
            mfaEnabled: false,
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (/\/access-control\/users\/[^/]+\/effective-permissions$/.test(url) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: 'user-uuid-admin-test',
            role: 'ADMIN',
            effectivePermissions: ['settings.read'],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: settingsSections }),
      });
      return;
    }

    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (url.includes('/tenants/me/settings') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantSettings }),
      });
      return;
    }

    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await assertTenantHeader(route);
      expect(method).toBe('GET');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenant: tenantProfile,
            settings: tenantSettings,
            metrics: {
              configuredUsers: 5,
              mfaCoverage: null,
              pendingAlerts: 1,
              auditEventsLast7d: 12,
            },
            alerts: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me/branding/assets') && method === 'POST') {
      await assertTenantHeader(route);
      expect(method).toBe('POST');
      expect(route.request().url()).toContain('/tenants/me/branding/assets');
      const postDataBuffer = route.request().postDataBuffer();
      const postData = postDataBuffer?.toString('utf8') ?? '';

      uploadRequests.push({
        usage: postData.includes('name="usage"\r\n\r\nseal') ? 'seal' : 'unknown',
        themeVariant: postData.includes('name="themeVariant"\r\n\r\nlight') ? 'light' : 'unknown',
        fileName: postData.match(/filename="([^"]+)"/)?.[1] ?? 'unknown',
      });

      tenantProfile.sealLightUrl = UPDATED_SEAL_URL;
      tenantProfile.sealLightAssetId = 'asset-seal-light-1';

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'asset-seal-light-1',
            usage: 'seal',
            themeVariant: 'light',
            mimeType: 'image/png',
            sizeBytes: VALID_PNG_BUFFER.byteLength,
            publicUrl: UPDATED_SEAL_URL,
            createdAt: '2026-04-30T12:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantProfile }),
      });
      return;
    }

    if (url.includes('/auth/logout') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });

  return { uploadRequests };
}

test.describe('Portal branding upload', () => {
  test('ADMIN sube sello light y el sidebar refleja el activo tras refrescar el perfil', async ({
    page,
  }) => {
    const { uploadRequests } = await setupBrandingUploadMocks(page);
    await setAuthSession(page);

    await page.goto('/dashboard/settings/branding');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Identidad visual' })).toBeVisible();

    await page.locator('#seal-light-file').setInputFiles({
      name: 'seal-light.png',
      mimeType: 'image/png',
      buffer: VALID_PNG_BUFFER,
    });

    await expect(page.getByAltText('Sello de ISP Prueba Colombia').first()).toHaveAttribute(
      'src',
      UPDATED_SEAL_URL,
    );

    await expect.poll(() => uploadRequests.length).toBe(1);
    expect(uploadRequests[0]).toEqual({
      usage: 'seal',
      themeVariant: 'light',
      fileName: 'seal-light.png',
    });
  });

  test('abre y cierra la confirmación de restaurar base con teclado', async ({ page }) => {
    await setupBrandingUploadMocks(page);
    await setAuthSession(page);

    await page.goto('/dashboard/settings/branding');
    await page.waitForLoadState('networkidle');

    const restoreButton = page.getByRole('button', { name: 'Restaurar marca base' }).first();
    await restoreButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Restaurar marca base' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('mantiene acciones de marca visibles en viewport móvil con tema oscuro', async ({
    page,
  }) => {
    await setupBrandingUploadMocks(page);
    await setAuthSession(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dashboard/settings/branding');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Identidad visual' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar marca' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurar marca base' }).first()).toBeVisible();
    await expect(page.locator('#seal-light-file')).toHaveCount(1);
    await expect(page.getByLabel('URL HTTPS para sello compacto · variante clara')).toBeVisible();
  });
});
