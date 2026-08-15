import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const SETTINGS_SECTIONS = [
  {
    key: 'organization',
    label: 'Perfil empresarial y organización',
    description: 'Perfil empresarial, configuración operativa base y sedes.',
    ownerModule: 'MOD00 / Organización',
    status: 'AVAILABLE',
    route: '/dashboard/settings/organization',
    requiredPermissions: [],
  },
  {
    key: 'field_operations',
    label: 'Operación de campo',
    description: 'Configuración WFM disponible.',
    ownerModule: 'MOD09 / WFM',
    status: 'AVAILABLE',
    route: '/dashboard/settings/field-operations',
    requiredPermissions: [],
  },
  {
    key: 'access',
    label: 'Perfiles y autenticación',
    description: 'Administra perfiles de acceso y políticas de autenticación.',
    ownerModule: 'MOD00 / Access control',
    status: 'AVAILABLE',
    route: '/dashboard/settings/access',
    requiredPermissions: [],
  },
  {
    key: 'branding',
    label: 'Marca',
    description: 'Identidad visual del portal empresarial.',
    ownerModule: 'Tenant / Branding',
    status: 'AVAILABLE',
    route: '/dashboard/settings/branding',
    requiredPermissions: [],
  },
];
const MOCK_PUBLIC_BRANDING = {
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
};

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
  await seedPortalSession(page, { token: buildAccessToken(role), tenantSlug: MOCK_TENANT_SLUG });
}

async function setupSettingsMocks(page: Page, role: 'ADMIN' | 'NOC' = 'ADMIN') {
  const requestLog = {
    profilePatches: [] as Array<Record<string, unknown>>,
    settingsPatches: [] as Array<Record<string, unknown>>,
    platformCalls: [] as string[],
    summaryRequests: 0,
    legacyOperatingSiteRequests: 0,
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
    slug: 'isp-demo',
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

  const wfmCompanyWeek = [
    {
      weekday: 1,
      isOpen: true,
      startTime: '08:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
    {
      weekday: 2,
      isOpen: true,
      startTime: '08:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
    {
      weekday: 3,
      isOpen: true,
      startTime: '08:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
    {
      weekday: 4,
      isOpen: true,
      startTime: '08:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
    {
      weekday: 5,
      isOpen: true,
      startTime: '08:00',
      endTime: '18:00',
      slotMinutes: 60,
    },
    {
      weekday: 6,
      isOpen: false,
      startTime: null,
      endTime: null,
      slotMinutes: null,
    },
    {
      weekday: 0,
      isOpen: false,
      startTime: null,
      endTime: null,
      slotMinutes: null,
    },
  ];

  const activeUsers = [
    {
      id: 'user-uuid-admin-test',
      email: 'admin@isp-demo.co',
      role,
      status: 'ACTIVE',
      tenantId: 'tenant-uuid-test',
      mfaEnabled: tenantSettings.features.mfa_required_all,
      mfaRequired: false,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
      deletedAt: null,
      firstName: 'Ana',
      lastName: 'Prueba',
      phone: '+573001234567',
      jobTitle: 'Operaciones',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname;

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

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      const slug = new URL(url).searchParams.get('slug');
      await route.fulfill({
        status: slug === MOCK_TENANT_SLUG ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          slug === MOCK_TENANT_SLUG
            ? { data: MOCK_PUBLIC_BRANDING }
            : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
        ),
      });
      return;
    }

    if (pathname.endsWith('/users/user-uuid-admin-test') && method === 'GET') {
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

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: activeUsers,
            nextCursor: null,
          },
        }),
      });
      return;
    }

    if (url.includes('/access-control/me/effective-permissions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: 'user-uuid-admin-test',
            role,
            effectivePermissions: [
              'settings.read',
              'organization.sites.read',
              'access.permissions.read',
            ],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/access-control/permissions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            version: 'MOD00_ACCESS_V1',
            permissions: [
              {
                id: 'perm-settings-read',
                tenantId: 'tenant-uuid-test',
                permissionKey: 'settings.read',
                moduleKey: 'settings',
                action: 'read',
                description: 'Ver centro de Configuración',
                catalogVersion: 'MOD00_ACCESS_V1',
                availability: 'ASSIGNABLE',
                isSystem: true,
                isActive: true,
              },
              {
                id: 'perm-access-manage',
                tenantId: 'tenant-uuid-test',
                permissionKey: 'access.profiles.manage',
                moduleKey: 'access-control',
                action: 'manage',
                description: 'Administrar perfiles de acceso',
                catalogVersion: 'MOD00_ACCESS_V1',
                availability: 'ASSIGNABLE',
                isSystem: true,
                isActive: true,
              },
            ],
            compatibilityMatrix: {
              ADMIN: ['settings.read', 'access.profiles.manage'],
              NOC: ['settings.read'],
              SUPPORT: ['settings.read'],
              SALES: [],
              TECHNICIAN: ['settings.read'],
              ACCOUNTANT: [],
              HR: [],
              SUBSCRIBER: [],
              CONTRACTOR: [],
              PARTNER: [],
              AUDITOR: [],
              INVESTOR: [],
              SYSTEM_ADMIN: [],
              IWANA_SUPPORT: [],
            },
          },
        }),
      });
      return;
    }

    if (url.includes('/access-control/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'template-admin',
              name: 'Administrador general',
              description: 'Plantilla inicial para la administración general de la empresa.',
              baseRoleConstraint: 'ADMIN',
              scopeSiteId: null,
              isSystem: true,
              isActive: true,
              permissions: ['settings.read'],
              createdAt: '2026-05-21T00:00:00.000Z',
              updatedAt: '2026-05-21T00:00:00.000Z',
            },
          ],
        }),
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

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SETTINGS_SECTIONS }),
      });
      return;
    }

    if (pathname.endsWith('/organization/sites') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
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

    if (url.includes('/wfm/dispatch-sites') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.includes('/wfm/operating-sites') && method === 'GET') {
      requestLog.legacyOperatingSiteRequests += 1;
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Legacy operating-sites endpoint should not be called' }),
      });
      return;
    }

    if (url.includes('/wfm/business-hours/company') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wfmCompanyWeek),
      });
      return;
    }

    if (url.includes('/wfm/holiday-blackouts') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
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
                    title: 'Verificación en dos pasos no obligatoria',
                    description:
                      'Se recomienda activar la verificación en dos pasos obligatoria para todos los usuarios de la empresa.',
                    href: '/dashboard/settings',
                  },
                ],
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
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

  return { requestLog };
}

async function pickNativeSelectOption(page: Page, selectId: string, value: string) {
  const optionLabels: Record<string, Record<string, string>> = {
    timezone: {
      'America/Guayaquil': 'Ecuador (Guayaquil)',
    },
    currency: {
      USD: 'USD — Dólar estadounidense',
    },
    country: {
      EC: 'Ecuador',
    },
  };

  const combobox = page.locator(`#${selectId}`);
  await combobox.scrollIntoViewIfNeeded();
  await combobox.click();
  const listbox = page.locator(`#${selectId}-listbox`);
  await expect(listbox).toBeVisible();
  await listbox
    .getByRole('option', { name: optionLabels[selectId]?.[value] ?? value, exact: true })
    .click();
}

test.describe('Configuración empresarial del portal', () => {
  test('ADMIN puede editar perfil, settings y política MFA sin llamar endpoints de plataforma', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings/organization');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
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

    await pickNativeSelectOption(page, 'timezone', 'America/Guayaquil');
    await pickNativeSelectOption(page, 'currency', 'USD');
    await pickNativeSelectOption(page, 'country', 'EC');
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

    await page.goto('/dashboard/settings/access');
    await page.waitForLoadState('networkidle');
    const mfaToggle = page.getByLabel('Activar verificación en dos pasos obligatoria');
    await mfaToggle.scrollIntoViewIfNeeded();
    await mfaToggle.check({ force: true });
    await page.getByRole('button', { name: 'Guardar política' }).click();

    await expect(
      page.getByText('Política de verificación en dos pasos actualizada correctamente.'),
    ).toBeVisible();
    expect(requestLog.settingsPatches.at(-1)).toEqual(
      expect.objectContaining({
        features: { mfa_required_all: true },
      }),
    );
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
    expect(requestLog.platformCalls).toHaveLength(0);
    expect(requestLog.summaryRequests).toBe(0);
  });

  test('ADMIN puede guardar la politica MFA global desde Access', async ({ page }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings/access');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Perfiles de acceso/i })).toBeVisible();
    await expect(page.getByText('Políticas de autenticación')).toBeVisible();

    const mfaToggle = page.getByLabel('Activar verificación en dos pasos obligatoria');
    await mfaToggle.scrollIntoViewIfNeeded();
    await mfaToggle.check({ force: true });
    await page.getByRole('button', { name: 'Guardar política' }).click();

    await expect(
      page.getByText('Política de verificación en dos pasos actualizada correctamente.'),
    ).toBeVisible();
    expect(requestLog.settingsPatches.at(-1)).toEqual(
      expect.objectContaining({
        features: { mfa_required_all: true },
      }),
    );
  });

  test('La ruta legacy de Security redirige a Access y mantiene visible la politica MFA', async ({
    page,
  }) => {
    await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings/security');
    await expect(page).toHaveURL(/\/dashboard\/settings\/access(#.*)?$/);
    await expect(page.getByRole('heading', { name: /Perfiles de acceso/i })).toBeVisible();
    await expect(page.getByText('Políticas de autenticación')).toBeVisible();
  });

  test('ADMIN puede guardar sello y desactivar nombre en sidebar', async ({ page }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings/branding');
    await page.waitForLoadState('networkidle');

    await page.getByRole('heading', { name: 'Identidad visual' }).scrollIntoViewIfNeeded();
    await page
      .getByLabel('URL HTTPS para sello compacto · variante clara')
      .fill('https://cdn.test-isp.co/seal.png');

    await expect(page.getByRole('button', { name: 'Guardar marca' })).toBeEnabled();
    await page
      .getByRole('checkbox', {
        name: /mostrar nombre comercial junto al sello en el menú lateral/i,
      })
      .uncheck();

    await page.getByRole('button', { name: 'Guardar marca' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Marca actualizada' })).toBeVisible();
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });

  test('NOC ve la pantalla en modo solo lectura y no consume summary de ADMIN', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'NOC');
    await setAuthSession(page, 'NOC');

    await page.goto('/dashboard/settings/organization');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Tu rol tiene acceso solo lectura sobre esta sección.'),
    ).toBeVisible();
    await expect(page.getByLabel('Correo de contacto')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar perfil empresarial' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar configuración operativa' })).toHaveCount(
      0,
    );

    await page.goto('/dashboard/settings/field-operations');
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText('Consulta los horarios y cierres en el Calendario operativo.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Calendario operativo y jornadas/i }),
    ).toBeVisible();

    await page.goto('/dashboard/settings/security');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard\/settings\/access(#.*)?$/);
    await expect(page.getByText('Vista disponible para administradores')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar política' })).toHaveCount(0);
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
    expect(requestLog.summaryRequests).toBe(0);
    expect(requestLog.platformCalls).toHaveLength(0);
  });

  test('La raíz muestra solo el índice federado y no duplica tabs ni formularios', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');
    const shellPanel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Secciones de configuración' }) });

    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Perfil empresarial' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Configuración operativa' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Identidad visual' })).toHaveCount(0);

    await expect(shellPanel.getByRole('link', { name: /Organización/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/organization',
    );
    await expect(shellPanel.getByRole('link', { name: /Operación de campo/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/field-operations',
    );
    await expect(shellPanel.getByRole('link', { name: /Seguridad/i })).toHaveCount(0);
    await expect(shellPanel.getByRole('link', { name: /Marca/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/branding',
    );
    await expect(shellPanel.getByRole('link', { name: /Comercial/i })).toHaveCount(0);
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });

  test('Las tarjetas disponibles abren rutas dueñas con información existente', async ({
    page,
  }) => {
    const { requestLog } = await setupSettingsMocks(page, 'ADMIN');
    await setAuthSession(page, 'ADMIN');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: /Organización/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/organization$/);
    await expect(
      page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Preferencias regionales' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cobertura comercial' })).toHaveCount(0);

    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /Operación de campo/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/field-operations$/);
    await expect(page.getByRole('heading', { name: 'Operaciones de campo' })).toBeVisible();
    await expect(page.getByText('Excepciones por técnico')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Configuración operativa' })).toHaveCount(0);

    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /Perfiles y autenticación/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/access$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Perfiles de acceso/i }),
    ).toBeVisible();
    await expect(page.getByText('Políticas de autenticación')).toBeVisible();

    await page.goto('/dashboard/settings/security');
    await expect(page).toHaveURL(/\/dashboard\/settings\/access(#.*)?$/);
    await expect(page.getByText('Políticas de autenticación')).toBeVisible();

    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const marcaLink = page.getByRole('link', { name: /Marca/i });
    await marcaLink.scrollIntoViewIfNeeded();
    await marcaLink.click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/branding$/);
    await expect(page.getByRole('heading', { name: 'Marca', level: 1 })).toBeVisible();
    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });
});
