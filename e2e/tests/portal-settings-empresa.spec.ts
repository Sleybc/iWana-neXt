import { expect, test, type Page } from '@playwright/test';

const MOCK_TENANT_SLUG = 'test-isp';

function buildAccessToken(role: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'aabbccdd11223344',
      role,
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: `jti-${role.toLowerCase()}`,
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

async function setAuthSession(page: Page, role: string) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }) => {
      localStorage.setItem('iwana.portal.access-token', token);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildAccessToken(role), slug: MOCK_TENANT_SLUG },
  );
}

async function setupSettingsMocks(page: Page, role: 'ADMIN' | 'NOC' = 'ADMIN') {
  const requestLog = {
    profilePatches: [] as Array<Record<string, unknown>>,
    settingsPatches: [] as Array<Record<string, unknown>>,
    platformCalls: [] as string[],
    summaryRequests: 0,
  };

  const tenantProfile = {
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
    // Branding
    logoLightUrl: null as string | null,
    logoDarkUrl: null as string | null,
    sealLightUrl: null as string | null,
    sealDarkUrl: null as string | null,
    showTenantName: true,
  };

  const tenantSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    features: {
      billing: false,
      mfa_required_all: false,
    },
  };

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (/\/tenants\/[0-9a-f-]{36}/.test(url) && !url.includes('/tenants/me')) {
      requestLog.platformCalls.push(url);
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'aabbccdd11223344',
            role,
            tenantId: 'tenant-uuid-test',
            schemaName: 'tenant_test_isp',
            jti: `jti-${role.toLowerCase()}`,
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
            role,
            status: 'ACTIVE',
            firstName: 'Ana',
            lastName: 'Prueba',
            phone: '+573001234567',
            jobTitle: 'Operaciones',
            avatarUrl: null,
            mfaEnabled: tenantSettings.features.mfa_required_all,
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me/profile') && method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      requestLog.profilePatches.push(body);
      Object.assign(tenantProfile, body);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantProfile }),
      });
      return;
    }

    if (url.includes('/tenants/me/settings') && method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      requestLog.settingsPatches.push(body);

      if (body.timezone) tenantSettings.timezone = String(body.timezone);
      if (body.currency) tenantSettings.currency = String(body.currency);
      if (body.language) tenantSettings.language = String(body.language);
      if (body.country) tenantSettings.country = String(body.country);

      const features = body.features as Record<string, unknown> | undefined;
      if (features && typeof features.mfa_required_all === 'boolean') {
        tenantSettings.features.mfa_required_all = features.mfa_required_all;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantSettings }),
      });
      return;
    }

    if (url.includes('/tenants/me/branding') && method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      // Aplicar sólo los campos enviados al fixture mutable
      if ('sealLightUrl' in body) tenantProfile.sealLightUrl = body.sealLightUrl as string | null;
      if ('sealDarkUrl' in body) tenantProfile.sealDarkUrl = body.sealDarkUrl as string | null;
      if ('logoLightUrl' in body) tenantProfile.logoLightUrl = body.logoLightUrl as string | null;
      if ('logoDarkUrl' in body) tenantProfile.logoDarkUrl = body.logoDarkUrl as string | null;
      if ('showTenantName' in body) tenantProfile.showTenantName = Boolean(body.showTenantName);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantProfile }),
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
      requestLog.summaryRequests += 1;
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
              pendingAlerts: tenantSettings.features.mfa_required_all ? 0 : 1,
              auditEventsLast7d: 23,
            },
            alerts: tenantSettings.features.mfa_required_all
              ? []
              : [
                  {
                    id: 'mfa-not-required',
                    severity: 'warning',
                    title: 'MFA no obligatorio',
                    description: 'Se recomienda habilitar MFA obligatorio.',
                    href: '/dashboard/settings',
                  },
                ],
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

    await route.continue();
  });

  return { requestLog };
}

test.describe('Configuración empresarial del portal', () => {
  test('ADMIN puede editar perfil, settings y política MFA sin llamar endpoints de plataforma', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: 'Configuración empresarial' }),
    ).toBeVisible();
    await expect(page.getByLabel('Correo de contacto')).toHaveValue('contacto@test-isp.co');

    await page.getByLabel('Correo de contacto').fill('gestion@test-isp.co');
    await page.getByLabel('Razón social').fill('ISP Prueba SAS');
    await page.getByLabel('NIT').fill('900123456');
    await page.getByRole('button', { name: 'Guardar perfil empresarial' }).click();

    await expect(page.getByText('Perfil empresarial actualizado correctamente.')).toBeVisible();
    expect(requestLog.profilePatches).toHaveLength(1);
    expect(requestLog.profilePatches[0]).toEqual(
      expect.objectContaining({
        contactEmail: 'gestion@test-isp.co',
        legalName: 'ISP Prueba SAS',
        nit: '900123456',
      }),
    );
    expect(requestLog.profilePatches[0]).not.toHaveProperty('name');

    await page.getByLabel('Zona horaria').selectOption('America/Guayaquil');
    await page.getByLabel('Moneda').selectOption('USD');
    await page.getByLabel('País operativo').selectOption('EC');
    await page.getByRole('button', { name: 'Guardar configuración operativa' }).click();

    await expect(
      page.getByText('Configuración operativa actualizada correctamente.'),
    ).toBeVisible();
    expect(requestLog.settingsPatches[0]).toEqual(
      expect.objectContaining({
        timezone: 'America/Guayaquil',
        currency: 'USD',
        country: 'EC',
      }),
    );
    expect(requestLog.settingsPatches[0]).not.toHaveProperty('maxSubscribers');
    expect(requestLog.settingsPatches[0]).not.toHaveProperty('billing');

    const mfaToggle = page.getByLabel('Activar MFA obligatorio');
    await mfaToggle.scrollIntoViewIfNeeded();
    await mfaToggle.check({ force: true });
    await page.getByRole('button', { name: 'Guardar seguridad' }).click();

    await expect(page.getByText('Política de seguridad actualizada correctamente.')).toBeVisible();
    expect(requestLog.settingsPatches.at(-1)).toEqual(
      expect.objectContaining({
        features: { mfa_required_all: true },
      }),
    );
    expect(requestLog.platformCalls).toHaveLength(0);
    expect(requestLog.summaryRequests).toBe(1);
  });

  test('ADMIN puede guardar sello y desactivar nombre en sidebar', async ({ page }) => {
    await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // Desplazar hasta la sección de branding
    await page.getByRole('heading', { name: 'Logo y Sello' }).scrollIntoViewIfNeeded();

    // Llenar la URL del sello variante clara (primer campo con label "URL variante clara")
    await page.getByLabel('URL variante clara').nth(0).fill('https://cdn.test-isp.co/seal.svg');

    // Desactivar nombre en sidebar
    await page.getByRole('checkbox', { name: /mostrar nombre comercial/i }).uncheck();

    await page.getByRole('button', { name: 'Guardar logo y sello' }).click();

    await expect(page.getByText('Logo y sello actualizados correctamente.')).toBeVisible();
  });

  test('NOC ve la pantalla en modo solo lectura y no consume summary de ADMIN', async ({ page }) => {
    const { requestLog } = await setupSettingsMocks(page, 'NOC');
    await setAuthSession(page, 'NOC');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Vista solo lectura para tu rol')).toBeVisible();
    await expect(page.getByLabel('Correo de contacto')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar perfil empresarial' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Guardar configuración operativa' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar seguridad' })).toHaveCount(0);
    expect(requestLog.summaryRequests).toBe(0);
    expect(requestLog.platformCalls).toHaveLength(0);
  });
});