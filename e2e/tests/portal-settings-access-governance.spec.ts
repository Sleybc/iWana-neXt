import { expect, test, type Page } from '@playwright/test';

function createAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url');

  return `${header}.${payload}.signature`;
}

interface AccessGovernanceScenario {
  managedUsers?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  auditItems?: Array<Record<string, unknown>>;
  effectivePermissions?: Record<string, unknown>;
  permissionsSaveResponse?: { status: number; body: Record<string, unknown> };
}

async function bootstrapAccessGovernancePage(
  page: Page,
  baseURL: string | undefined,
  scenario: AccessGovernanceScenario = {},
) {
  const tenantSlug = 'isp-demo';
  const accessToken = createAccessToken();
  const adminUser = {
    id: 'user-admin',
    email: 'admin@isp-demo.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: true,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Ana',
    lastName: 'Admin',
    phone: null,
    jobTitle: 'Administrador',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
  const managedUsers = scenario.managedUsers ?? [
    {
      id: 'user-noc',
      email: 'noc@isp-demo.com',
      role: 'NOC',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      mfaEnabled: false,
      mfaRequired: false,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      deletedAt: null,
      firstName: 'Nora',
      lastName: 'Campos',
      phone: null,
      jobTitle: 'NOC',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ];
  const profiles = scenario.profiles ?? [
    {
      id: 'template-admin',
      name: 'Administrador general',
      description: 'Plantilla inicial para la administración general de la empresa.',
      baseRoleConstraint: 'ADMIN',
      scopeSiteId: null,
      isSystem: true,
      isActive: true,
      permissions: ['settings.read', 'access.profiles.manage'],
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    },
    {
      id: 'profile-1',
      name: 'Perfil noc lectura',
      description: 'Perfil inicial',
      baseRoleConstraint: 'NOC',
      scopeSiteId: null,
      isSystem: false,
      isActive: true,
      permissions: ['settings.read'],
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    },
  ];
  const permissionsCatalog = {
    version: 'MOD00_ACCESS_V1',
    permissions: [
      {
        id: 'perm-1',
        tenantId: 'tenant-1',
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
        id: 'perm-2',
        tenantId: 'tenant-1',
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
      TECHNICIAN: [],
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
  };
  const effectivePermissions = scenario.effectivePermissions ?? {
    userId: managedUsers[0]?.id,
    role: managedUsers[0]?.role,
    effectivePermissions: ['settings.read'],
    recoveryPermissions: [],
    profileSources: [
      {
        profileId: 'profile-1',
        profileName: 'Perfil noc lectura',
        permissions: ['settings.read'],
      },
    ],
  };
  const auditItems = scenario.auditItems ?? [
    {
      id: 'audit-1',
      tenantId: 'tenant-1',
      actorUserId: 'user-admin',
      action: 'UPDATE',
      entityType: 'access_profile_permissions',
      entityId: 'profile-1',
      oldValue: { permissions: [] },
      newValue: {
        permissions: ['settings.read'],
        permissionImpact: { added: ['settings.read'], removed: [] },
      },
      ipAddress: null,
      userAgent: null,
      createdAt: '2026-05-21T00:00:00.000Z',
    },
  ];

  await page.addInitScript(
    ({ token, slug }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: accessToken, slug: tenantSlug },
  );

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sub: 'user-admin',
          email: 'hash-admin',
          role: 'ADMIN',
          type: 'tenant',
          tenantId: 'tenant-1',
          schemaName: 'tenant_1',
          passwordResetRequired: false,
        },
      }),
    });
  });

  await page.route('**/api/v1/users/user-admin', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: adminUser }),
    });
  });

  await page.route('**/api/v1/tenants/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'tenant-1',
          name: 'ISP Demo',
          slug: tenantSlug,
          status: 'ACTIVE',
          contactEmail: 'admin@isp-demo.com',
          legalName: 'ISP Demo S.A.S.',
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'Colombia',
          fiberInstallationThresholdMeters: 100,
          features: { billing: false, mfa_required_all: true },
        },
      }),
    });
  });

  await page.route('**/api/v1/audit-logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: auditItems }),
    });
  });

  await page.route('**/api/v1/access-control/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: permissionsCatalog }),
    });
  });

  await page.route('**/api/v1/access-control/profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: profiles }),
    });
  });

  await page.route('**/api/v1/access-control/profiles/*/permissions', async (route) => {
    if (route.request().method() === 'PUT' && scenario.permissionsSaveResponse) {
      await route.fulfill({
        status: scenario.permissionsSaveResponse.status,
        contentType: 'application/json',
        body: JSON.stringify(scenario.permissionsSaveResponse.body),
      });
      return;
    }

    const profileId = route.request().url().split('/').slice(-2)[0];
    const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: profile }),
    });
  });

  await page.route('**/api/v1/access-control/users/*/effective-permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: effectivePermissions }),
    });
  });

  await page.route('**/api/v1/users?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          data: managedUsers,
          meta: { nextCursor: null, total: managedUsers.length },
        },
      }),
    });
  });

  await page.goto(`${baseURL}/dashboard/settings/access`);
  await expect(page.locator('h1').getByText('Perfiles de acceso')).toBeVisible();
}

test.describe('Portal access governance', () => {
  test('muestra plantillas, roles y evidencia auditada sin asignacion de usuarios', async ({
    page,
    baseURL,
  }) => {
    await bootstrapAccessGovernancePage(page, baseURL);

    await expect(page.getByRole('heading', { name: 'Plantillas iniciales' })).toBeVisible();
    await expect(page.getByText('Administrador general', { exact: true })).toBeVisible();

    // Las tarjetas de plantilla tienen botones de acción
    const usarComoBaseButtons = page.getByRole('button', { name: /Usar.*como base/i });
    await expect(usarComoBaseButtons.first()).toBeVisible();

    // No hay selector de usuario en esta pantalla (exact para no colisionar con "Menú de usuario" del header)
    await expect(page.getByLabel('Usuario', { exact: true })).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'Catálogo de accesos' })).toHaveCount(0);

    // El historial de cambios (evidencia) está presente
    await expect(page.getByText('Historial de cambios')).toBeVisible();
  });

  test('visibiliza el bloqueo por falta de permiso granular', async ({ page, baseURL }) => {
    await bootstrapAccessGovernancePage(page, baseURL, {
      permissionsSaveResponse: {
        status: 403,
        body: { message: 'Falta access.profiles.manage para actualizar el perfil.' },
      },
    });

    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(
      page.getByText('Falta access.profiles.manage para actualizar el perfil.'),
    ).toBeVisible();
  });

  test('visibiliza el anti-lockout cuando el ultimo camino ADMIN perderia manage', async ({
    page,
    baseURL,
  }) => {
    await bootstrapAccessGovernancePage(page, baseURL, {
      managedUsers: [
        {
          id: 'user-admin',
          email: 'admin@isp-demo.com',
          role: 'ADMIN',
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: true,
          mfaRequired: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Ana',
          lastName: 'Admin',
          phone: null,
          jobTitle: 'Administrador',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        },
      ],
      profiles: [
        {
          id: 'profile-admin',
          name: 'Perfil admin operativo',
          description: 'Perfil con manage',
          baseRoleConstraint: 'ADMIN',
          scopeSiteId: null,
          isSystem: false,
          isActive: true,
          permissions: ['access.profiles.manage'],
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
      ],
      effectivePermissions: {
        userId: 'user-admin',
        role: 'ADMIN',
        effectivePermissions: ['settings.read', 'access.profiles.manage'],
        recoveryPermissions: ['settings.read'],
        profileSources: [
          {
            profileId: 'profile-admin',
            profileName: 'Perfil admin operativo',
            permissions: ['access.profiles.manage'],
          },
        ],
      },
      permissionsSaveResponse: {
        status: 403,
        body: { message: 'LAST_ADMIN_ACCESS_LOCKOUT: el ultimo camino ADMIN perderia manage.' },
      },
    });

    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(
      page.getByText('LAST_ADMIN_ACCESS_LOCKOUT: el ultimo camino ADMIN perderia manage.'),
    ).toBeVisible();
  });
});
