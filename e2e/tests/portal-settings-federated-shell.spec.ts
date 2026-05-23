import { expect, test, type Page } from '@playwright/test';

const MOCK_TENANT_SLUG = 'isp-shell-demo';
const MOCK_TENANT_ID = 'tenant-shell-demo';
const MOCK_SCHEMA_NAME = 'tenant_shell_demo';
const MOCK_USER_ID = 'user-admin-shell';
const MOCK_PUBLIC_BRANDING = {
  displayName: 'ISP Shell Demo',
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
      email: 'hash-admin-shell',
      role: 'ADMIN',
      tenantId: MOCK_TENANT_ID,
      schemaName: MOCK_SCHEMA_NAME,
      jti: 'jti-admin-shell',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

async function setAdminSession(page: Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }) => {
      localStorage.setItem('iwana.portal.access-token', token);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildAccessToken(), slug: MOCK_TENANT_SLUG },
  );
}

async function setupSettingsShellMocks(page: Page) {
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
          email: 'hash-admin-shell',
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
          email: 'admin@isp-shell-demo.test',
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
          firstName: 'Sara',
          lastName: 'Shell',
          phone: null,
          jobTitle: 'Administración',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
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
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: MOCK_TENANT_ID,
          name: 'ISP Shell Demo',
          slug: MOCK_TENANT_SLUG,
          status: 'ACTIVE',
          contactEmail: 'admin@isp-shell-demo.test',
          legalName: 'ISP Shell Demo S.A.S.',
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
          fiberInstallationThresholdMeters: 100,
          features: {
            billing: false,
            mfa_required_all: true,
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
            key: 'organization',
            label: 'Perfil empresarial y organización',
            description:
              'Concentra perfil empresarial, configuración operativa base, sedes y horario institucional del tenant.',
            ownerModule: 'MOD00 / Organización',
            status: 'AVAILABLE',
            route: '/dashboard/settings/organization',
            requiredPermissions: ['settings.read', 'organization.sites.read'],
          },
          {
            key: 'access',
            label: 'Usuarios y acceso',
            description: 'Consulta perfiles, permisos y gobierno básico de acceso tenant-aware.',
            ownerModule: 'MOD00 / Access control',
            status: 'AVAILABLE',
            route: '/dashboard/settings/access',
            requiredPermissions: ['settings.read', 'access.permissions.read'],
          },
          {
            key: 'security',
            label: 'Seguridad',
            description:
              'Consolida políticas visibles del tenant sin mover ownership de Auth ni Users.',
            ownerModule: 'Auth / Users',
            status: 'AVAILABLE',
            route: '/dashboard/settings/security',
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'branding',
            label: 'Marca',
            description: 'Gestiona identidad visual y activos corporativos del tenant autenticado.',
            ownerModule: 'Tenant / Branding',
            status: 'AVAILABLE',
            route: '/dashboard/settings/branding',
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'field_operations',
            label: 'Operación de campo',
            description: 'Expone la configuración WFM disponible desde el centro de settings.',
            ownerModule: 'MOD09 / WFM',
            status: 'AVAILABLE',
            route: '/dashboard/settings/field-operations',
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'commercial',
            label: 'Comercial',
            description: 'El owner existe, pero el contrato aún no está expuesto.',
            ownerModule: 'MOD06 / Comercial',
            status: 'NOT_CONFIGURED',
            route: null,
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'billing',
            label: 'Billing',
            description: 'Queda reservado para el owner futuro.',
            ownerModule: 'Billing futuro',
            status: 'COMING_SOON',
            route: null,
            requiredPermissions: ['settings.read'],
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/audit-logs?*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [], total: 0 } }),
    });
  });

  await page.route('**/api/v1/organization/sites', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'site-1',
            name: 'Sede centro',
            code: 'CENTRO',
            capabilities: ['ADMIN_OFFICE'],
            isActive: true,
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/organization/sites/site-1', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'site-1',
          name: 'Sede centro',
          code: 'CENTRO',
          type: 'BRANCH',
          isActive: true,
          capabilities: ['ADMIN_OFFICE'],
          responsibilities: [],
          assignments: [],
          businessHours: [],
        },
      }),
    });
  });

  await page.route('**/api/v1/access-control/permissions', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          version: 'MOD00_ACCESS_V1',
          permissions: [],
          compatibilityMatrix: {
            ADMIN: ['settings.read'],
            NOC: ['settings.read'],
            SUPPORT: ['settings.read'],
            SALES: ['settings.read'],
            TECHNICIAN: ['settings.read'],
            ACCOUNTANT: ['settings.read'],
            HR: ['settings.read'],
            SUBSCRIBER: [],
            CONTRACTOR: ['settings.read'],
            PARTNER: [],
            AUDITOR: ['settings.read'],
            INVESTOR: [],
            SYSTEM_ADMIN: [],
            IWANA_SUPPORT: [],
          },
        },
      }),
    });
  });

  await page.route('**/api/v1/access-control/profiles', async (route) => {
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
          data: [],
          meta: { nextCursor: null, total: 0 },
        },
      }),
    });
  });

  await page.route('**/api/v1/wfm/dispatch-sites', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/api/v1/wfm/holiday-blackouts', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  return { requestLog };
}

test.describe('Portal settings federated shell', () => {
  test('ADMIN ve el shell federado, distingue estados reales y abre rutas disponibles', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsShellMocks(page);
    await setAdminSession(page);

    await page.goto('/dashboard/settings');

    await expect(page.getByRole('heading', { name: 'Configuración empresarial' })).toBeVisible();
    const shellPanel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Secciones de configuración' }) });

    await expect(
      shellPanel.getByRole('heading', { name: 'Secciones de configuración' }),
    ).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Organización/i })).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Usuarios y acceso/i })).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Seguridad/i })).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Marca/i })).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Operación de campo/i })).toBeVisible();
    await expect(shellPanel.getByText('No configurado', { exact: true })).toBeVisible();
    await expect(shellPanel.getByText('Próximamente', { exact: true })).toBeVisible();
    await expect(shellPanel.getByText('Comercial', { exact: true })).toBeVisible();
    await expect(shellPanel.getByText('Billing', { exact: true })).toBeVisible();
    await expect(shellPanel.getByRole('link', { name: /Comercial/i })).toHaveCount(0);
    await expect(shellPanel.getByRole('link', { name: /Billing/i })).toHaveCount(0);
    await expect(shellPanel.getByRole('button')).toHaveCount(0);

    await shellPanel.getByRole('link', { name: /Organización/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/organization$/);
    await expect(
      page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
    ).toBeVisible();

    await page.goto('/dashboard/settings');
    await shellPanel.getByRole('link', { name: /Usuarios y acceso/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/access$/);
    await expect(page.getByRole('heading', { name: 'Usuarios y acceso' })).toBeVisible();

    await page.goto('/dashboard/settings');
    await shellPanel.getByRole('link', { name: /Operación de campo/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/field-operations$/);
    await expect(page.getByRole('heading', { name: 'Operación de campo' })).toBeVisible();
    await expect(page.getByText('Excepciones por técnico')).toHaveCount(0);

    await page.goto('/dashboard/settings');
    await shellPanel.getByRole('link', { name: /Seguridad/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/security$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Seguridad' })).toBeVisible();

    await page.goto('/dashboard/settings');
    await shellPanel.getByRole('link', { name: /Marca/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/branding$/);
    await expect(page.getByRole('heading', { name: 'Marca' })).toBeVisible();
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });
});
