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
    coverageNodePosts: 0,
    coverageNodePatches: 0,
    coverageNodeDeletes: 0,
    coverageZonePosts: 0,
    coverageZonePatches: 0,
    coverageZoneDeletes: 0,
    planPosts: 0,
    planPatches: 0,
    planDeletes: 0,
  };

  const coverageConfig = {
    nodes: [
      {
        id: 'node-1',
        name: 'Nodo Centro',
        latitude: 4.60971,
        longitude: -74.08175,
        isActive: true,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
      },
    ],
    zones: [
      {
        id: 'zone-1',
        name: 'Zona Norte',
        centerLatitude: 4.710989,
        centerLongitude: -74.07209,
        radiusKm: 12,
        isActive: true,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
      },
    ],
  };

  const planCatalog = [
    {
      id: 'plan-1',
      name: 'Internet Hogar 200',
      technology: 'FTTH',
      installationRule: 'ALWAYS',
      downloadSpeedMbps: 200,
      uploadSpeedMbps: 80,
      basePrice: 129900,
      installationFee: 90000,
      validFrom: null,
      validTo: null,
      isActive: true,
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T10:00:00.000Z',
    },
  ];

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

    if (url.includes('/tenants/me/coverage/check') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            available: true,
            reason: 'Cobertura disponible para validación comercial.',
            matches: [
              {
                id: 'node-1',
                name: 'Nodo Centro',
                type: 'NODE',
                available: true,
              },
            ],
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me/coverage/nodes') && method === 'POST') {
      requestLog.coverageNodePosts += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        name: string;
        latitude: number;
        longitude: number;
        isActive?: boolean;
      };

      coverageConfig.nodes.unshift({
        id: `node-${coverageConfig.nodes.length + 1}`,
        name: body.name,
        latitude: body.latitude,
        longitude: body.longitude,
        isActive: body.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (/\/tenants\/me\/coverage\/nodes\/[^/]+$/.test(url) && method === 'PATCH') {
      requestLog.coverageNodePatches += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      const nodeId = url.split('/').at(-1) ?? '';
      const target = coverageConfig.nodes.find((node) => node.id === nodeId);

      if (target) {
        Object.assign(target, body, { updatedAt: new Date().toISOString() });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (/\/tenants\/me\/coverage\/nodes\/[^/]+$/.test(url) && method === 'DELETE') {
      requestLog.coverageNodeDeletes += 1;
      const nodeId = url.split('/').at(-1) ?? '';
      const index = coverageConfig.nodes.findIndex((node) => node.id === nodeId);
      if (index >= 0) {
        coverageConfig.nodes.splice(index, 1);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (url.includes('/tenants/me/coverage/zones') && method === 'POST') {
      requestLog.coverageZonePosts += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        name: string;
        centerLatitude: number;
        centerLongitude: number;
        radiusKm: number;
        isActive?: boolean;
      };

      coverageConfig.zones.unshift({
        id: `zone-${coverageConfig.zones.length + 1}`,
        name: body.name,
        centerLatitude: body.centerLatitude,
        centerLongitude: body.centerLongitude,
        radiusKm: body.radiusKm,
        isActive: body.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (/\/tenants\/me\/coverage\/zones\/[^/]+$/.test(url) && method === 'PATCH') {
      requestLog.coverageZonePatches += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      const zoneId = url.split('/').at(-1) ?? '';
      const target = coverageConfig.zones.find((zone) => zone.id === zoneId);

      if (target) {
        Object.assign(target, body, { updatedAt: new Date().toISOString() });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (/\/tenants\/me\/coverage\/zones\/[^/]+$/.test(url) && method === 'DELETE') {
      requestLog.coverageZoneDeletes += 1;
      const zoneId = url.split('/').at(-1) ?? '';
      const index = coverageConfig.zones.findIndex((zone) => zone.id === zoneId);
      if (index >= 0) {
        coverageConfig.zones.splice(index, 1);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (url.includes('/tenants/me/coverage') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: coverageConfig }),
      });
      return;
    }

    if (url.includes('/tenants/me/plans') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: planCatalog }),
      });
      return;
    }

    if (url.includes('/tenants/me/plans') && method === 'POST') {
      requestLog.planPosts += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      planCatalog.unshift({
        id: `plan-${planCatalog.length + 1}`,
        name: String(body.name ?? 'Plan nuevo'),
        technology: String(body.technology ?? 'FTTH'),
        installationRule: String(body.installationRule ?? 'ALWAYS'),
        downloadSpeedMbps: Number(body.downloadSpeedMbps ?? 200),
        uploadSpeedMbps: Number(body.uploadSpeedMbps ?? 200),
        basePrice: Number(body.basePrice ?? 0),
        installationFee: Number(body.installationFee ?? 0),
        validFrom: null,
        validTo: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: planCatalog }),
      });
      return;
    }

    if (/\/tenants\/me\/plans\/[^/]+$/.test(url) && method === 'PATCH') {
      requestLog.planPatches += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      const planId = url.split('/').at(-1) ?? '';
      const target = planCatalog.find((plan) => plan.id === planId);
      if (target) {
        Object.assign(target, body, { updatedAt: new Date().toISOString() });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: planCatalog }),
      });
      return;
    }

    if (/\/tenants\/me\/plans\/[^/]+$/.test(url) && method === 'DELETE') {
      requestLog.planDeletes += 1;
      const planId = url.split('/').at(-1) ?? '';
      const index = planCatalog.findIndex((plan) => plan.id === planId);
      if (index >= 0) {
        planCatalog.splice(index, 1);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: planCatalog }),
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

async function pickCustomSelectOption(page: Page, selectId: string, optionLabel: string) {
  await page.locator(`#${selectId}`).locator('xpath=following-sibling::button').click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

test.describe('Configuración empresarial del portal', () => {
  test('ADMIN puede editar perfil, settings y política MFA sin llamar endpoints de plataforma', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Configuración empresarial' })).toBeVisible();
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

    await page.getByRole('tab', { name: 'Operación', exact: true }).click();
    await pickCustomSelectOption(page, 'timezone', 'America/Guayaquil');
    await pickCustomSelectOption(page, 'currency', 'USD');
    await pickCustomSelectOption(page, 'country', 'EC');
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

    await page.getByRole('tab', { name: 'Seguridad', exact: true }).click();
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
    expect(requestLog.summaryRequests).toBeGreaterThanOrEqual(1);
  });

  test('ADMIN puede guardar sello y desactivar nombre en sidebar', async ({ page }) => {
    await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: 'Marca', exact: true }).click();
    await page.getByRole('heading', { name: 'Logo y Sello' }).scrollIntoViewIfNeeded();

    // Llenar la URL del sello variante clara (primer campo con label "URL variante clara")
    await page.getByLabel('URL variante clara').nth(0).fill('https://cdn.test-isp.co/seal.svg');

    // Desactivar nombre en sidebar
    await page.getByRole('checkbox', { name: /mostrar nombre comercial/i }).uncheck();

    await page.getByRole('button', { name: 'Guardar branding' }).click();

    await expect(page.getByText('Logo, sello y favicon actualizados correctamente.')).toBeVisible();
  });

  test('NOC ve la pantalla en modo solo lectura y no consume summary de ADMIN', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'NOC');
    await setAuthSession(page, 'NOC');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Vista solo lectura para tu rol')).toBeVisible();
    await expect(page.getByLabel('Correo de contacto')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar perfil empresarial' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar configuración operativa' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Guardar seguridad' })).toHaveCount(0);
    expect(requestLog.summaryRequests).toBe(0);
    expect(requestLog.platformCalls).toHaveLength(0);
  });

  test('El módulo comercial vive en ruta dedicada y no en tabs de Settings', async ({ page }) => {
    await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Comercial', exact: true })).toHaveCount(0);

    await expect(page.getByRole('link', { name: 'Comercial' })).toHaveAttribute(
      'href',
      '/dashboard/commercial',
    );
  });

  test('Configuracion usa tabs accesibles y restablece datos al cambiar de seccion', async ({
    page,
  }) => {
    await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'General', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Operación', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Seguridad', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Marca', exact: true })).toBeVisible();

    await expect(page.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Perfil empresarial' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cobertura comercial' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'General', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Operación', exact: true })).toBeFocused();

    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Marca', exact: true })).toBeFocused();

    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'General', exact: true })).toBeFocused();

    await page.getByLabel('Correo de contacto').fill('draft-tabs@test-isp.co');
    await page.getByRole('tab', { name: 'Operación', exact: true }).click();

    await expect(page.getByRole('tab', { name: 'Operación', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'Operación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Configuración operativa' })).toBeVisible();

    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await expect(page.getByLabel('Correo de contacto')).toHaveValue('contacto@test-isp.co');
  });
});
