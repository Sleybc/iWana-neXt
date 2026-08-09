import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-wfm-demo';
const MOCK_TENANT_ID = 'tenant-wfm-demo';
const MOCK_SCHEMA_NAME = 'tenant_wfm_demo';
const MOCK_USER_ID = 'user-admin-wfm';
const MOCK_PUBLIC_BRANDING = {
  displayName: 'ISP WFM Demo',
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

function buildAccessToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: MOCK_USER_ID,
      email: 'hash-admin-wfm',
      role: 'ADMIN',
      tenantId: MOCK_TENANT_ID,
      schemaName: MOCK_SCHEMA_NAME,
      jti: 'jti-admin-wfm',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

async function setAdminSession(page: Page) {
  await seedPortalSession(page, { token: buildAccessToken(), tenantSlug: MOCK_TENANT_SLUG });
}

async function setupFieldOperationsMocks(page: Page) {
  const requestLog = {
    legacyOperatingSiteRequests: 0,
  };

  const assertTenantHeader = async (
    route: Parameters<Page['route']>[1] extends infer T
      ? T extends (route: infer R, ...args: never[]) => unknown
        ? R
        : never
      : never,
  ) => {
    const headers = await route.request().allHeaders();
    expect(headers['x-tenant-slug']).toBe(MOCK_TENANT_SLUG);
  };

  await page.route('**/api/v1/auth/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sub: MOCK_USER_ID,
          email: 'hash-admin-wfm',
          role: 'ADMIN',
          tenantId: MOCK_TENANT_ID,
          schemaName: MOCK_SCHEMA_NAME,
          type: 'tenant',
          passwordResetRequired: false,
        },
      }),
    });
  });

  await page.route('**/api/v1/tenants/public-branding*', async (route) => {
    const slug = new URL(route.request().url()).searchParams.get('slug');

    await route.fulfill({
      status: slug === MOCK_TENANT_SLUG ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(
        slug === MOCK_TENANT_SLUG
          ? { data: MOCK_PUBLIC_BRANDING }
          : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
      ),
    });
  });

  await page.route(`**/api/v1/users/${MOCK_USER_ID}`, async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: MOCK_USER_ID,
          email: 'admin@isp-wfm-demo.test',
          role: 'ADMIN',
          status: 'ACTIVE',
          tenantId: MOCK_TENANT_ID,
          mfaEnabled: true,
          mfaRequired: false,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Ana',
          lastName: 'WFM',
          phone: null,
          jobTitle: 'Administración',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        },
      }),
    });
  });

  await page.route('**/api/v1/access-control/me/effective-permissions', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userId: MOCK_USER_ID,
          role: 'ADMIN',
          effectivePermissions: ['settings.read'],
          recoveryPermissions: [],
          profileSources: [],
        },
      }),
    });
  });

  await page.route('**/api/v1/access-control/users/*/effective-permissions', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userId: MOCK_USER_ID,
          role: 'ADMIN',
          effectivePermissions: ['settings.read'],
          recoveryPermissions: [],
          profileSources: [],
        },
      }),
    });
  });

  await page.route('**/api/v1/tenants/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: MOCK_TENANT_ID,
          name: 'ISP WFM Demo',
          slug: MOCK_TENANT_SLUG,
          status: 'ACTIVE',
          contactEmail: 'admin@isp-wfm-demo.test',
          legalName: 'ISP WFM Demo S.A.S.',
          nit: '900123456',
          nitDv: '1',
          city: 'Bogotá',
          department: 'Cundinamarca',
          countryCode: 'CO',
          phone: '+573001112233',
          website: null,
          createdAt: '2026-05-21T00:00:00.000Z',
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
        },
      }),
    });
  });

  await page.route('**/api/v1/tenants/me/settings', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          features: {
            billing: false,
            mfa_required_all: false,
          },
        },
      }),
    });
  });

  await page.route('**/api/v1/configuration/settings-sections', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            key: 'field_operations',
            label: 'Operación de campo',
            description: 'Expone la configuración WFM disponible desde el centro de settings.',
            ownerModule: 'MOD09 / WFM',
            status: 'AVAILABLE',
            route: '/dashboard/settings/field-operations',
            requiredPermissions: ['settings.read'],
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/audit-logs*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/users?*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          data: [
            {
              id: 'user-tech-1',
              email: 'tecnico@isp-wfm-demo.test',
              role: 'TECHNICIAN',
              status: 'ACTIVE',
              tenantId: MOCK_TENANT_ID,
              mfaEnabled: false,
              mfaRequired: false,
              emailVerified: true,
              passwordResetRequired: false,
              lastLoginAt: null,
              createdAt: '2026-05-21T00:00:00.000Z',
              updatedAt: '2026-05-21T00:00:00.000Z',
              deletedAt: null,
              firstName: 'Tania',
              lastName: 'Técnica',
              phone: null,
              jobTitle: 'Técnico de campo',
              documentType: null,
              documentNumber: null,
              avatarUrl: null,
            },
          ],
          meta: { nextCursor: null, total: 1 },
        },
      }),
    });
  });

  await page.route('**/api/v1/wfm/operating-sites', async (route) => {
    requestLog.legacyOperatingSiteRequests += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Legacy operating-sites endpoint should not be called' }),
    });
  });

  await page.route('**/api/v1/wfm/business-hours/company', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/wfm/dispatch-sites/*/business-hours', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/wfm/holiday-blackouts', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/wfm/dispatch-sites', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'org-site-1',
          name: 'Sede norte',
          code: 'NOR',
          capabilities: ['TECH_DISPATCH'],
          isActive: true,
          operatingSiteId: 'site-1',
        },
        {
          id: 'org-site-2',
          name: 'Sede sur',
          code: 'SUR',
          capabilities: ['TECH_DISPATCH'],
          isActive: true,
          operatingSiteId: 'site-2',
        },
      ]),
    });
  });

  return { requestLog };
}

test.describe('Portal settings field operations', () => {
  test('ADMIN navega a operación de campo y ve la landing que dirige al Calendario operativo', async ({
    page,
  }) => {
    const { requestLog } = await setupFieldOperationsMocks(page);
    await setAdminSession(page);

    await page.goto('/dashboard/settings');

    await expect(page.getByRole('heading', { name: 'Configuración empresarial' })).toBeVisible();

    await page.getByRole('link', { name: 'Operación de campo' }).click();

    await expect(page).toHaveURL(/\/dashboard\/settings\/field-operations$/);
    await expect(page.getByRole('heading', { name: 'Operaciones de campo' })).toBeVisible();
    await expect(page.getByText('Horarios y jornadas')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ir a Calendario operativo y jornadas →' }),
    ).toBeVisible();
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });
});
