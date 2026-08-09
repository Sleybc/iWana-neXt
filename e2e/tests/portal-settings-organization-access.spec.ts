import { expect, test } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

function createAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url');

  return `${header}.${payload}.signature`;
}

test.describe('Portal settings organization and access', () => {
  test('admin navega desde settings, crea sede con servicios y crea perfil de acceso', async ({
    page,
    baseURL,
  }) => {
    const tenantSlug = 'isp-demo';
    const accessToken = createAccessToken();
    let removedCapabilitiesRequests = 0;

    const tenantProfile = {
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
    };

    const tenantSettings = {
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'Colombia',
      fiberInstallationThresholdMeters: 100,
      features: {
        billing: false,
        mfa_required_all: true,
      },
    };

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

    const managedUser = {
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
    };

    const sites: Array<Record<string, unknown>> = [
      {
        id: 'site-1',
        name: 'Sede centro',
        code: 'CENTRO',
        capabilities: ['ADMIN_OFFICE'],
        isActive: true,
        siteType: 'OFFICE',
        address: 'Cra 10 # 10-10',
        municipality: 'Bogotá',
        department: 'Cundinamarca',
        country: 'CO',
        latitude: null,
        longitude: null,
        isPrimary: true,
        businessHours: [
          {
            weekday: 'MONDAY',
            isOpen: true,
            opensAt: '08:00:00',
            closesAt: '18:00:00',
          },
        ],
        assignments: [],
        responsibilities: [],
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ];

    const profiles: Array<Record<string, unknown>> = [
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
          permissionKey: 'organization.sites.read',
          moduleKey: 'organization',
          action: 'read',
          description: 'Ver sedes organizacionales',
          catalogVersion: 'MOD00_ACCESS_V1',
          availability: 'ASSIGNABLE',
          isSystem: true,
          isActive: true,
        },
        {
          id: 'perm-3',
          tenantId: 'tenant-1',
          permissionKey: 'access.permissions.read',
          moduleKey: 'access-control',
          action: 'read',
          description: 'Ver catálogo de permisos del tenant',
          catalogVersion: 'MOD00_ACCESS_V1',
          availability: 'ASSIGNABLE',
          isSystem: true,
          isActive: true,
        },
      ],
      compatibilityMatrix: {
        ADMIN: ['settings.read', 'organization.sites.read', 'access.permissions.read'],
        NOC: ['settings.read', 'organization.sites.read'],
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

    await seedPortalSession(page, { token: accessToken, tenantSlug });

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
      if (route.request().method() !== 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantProfile }),
      });
    });

    await page.route('**/api/v1/tenants/me/settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantSettings }),
      });
    });

    await page.route('**/api/v1/configuration/settings-sections', async (route) => {
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
          ],
        }),
      });
    });

    await page.route('**/api/v1/access-control/me/effective-permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: 'user-admin',
            role: 'ADMIN',
            effectivePermissions: [
              'settings.read',
              'organization.sites.read',
              'organization.sites.manage',
              'access.permissions.read',
              'access.profiles.manage',
            ],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
    });

    await page.route('**/api/v1/audit-logs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/organization/sites**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const pathname = url.pathname.replace(/\/$/, '');

      if (pathname.endsWith('/organization/sites') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: sites.map((site) => ({
              id: site.id,
              name: site.name,
              code: site.code,
              capabilities: site.capabilities,
              isActive: site.isActive,
            })),
            meta: {
              page: 1,
              limit: 20,
              total: sites.length,
              totalPages: 1,
              hasMore: false,
              nextCursor: null,
              mode: 'page',
              capabilities: { randomAccess: true, sortableFields: [] },
            },
          }),
        });
        return;
      }

      if (pathname.endsWith('/organization/sites') && method === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const nextSite = {
          id: 'site-2',
          name: body.name,
          code: body.code,
          capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
          isActive: true,
          siteType: body.siteType,
          address: body.address ?? null,
          municipality: body.municipality ?? null,
          department: body.department ?? null,
          country: 'CO',
          latitude: null,
          longitude: null,
          isPrimary: Boolean(body.isPrimary),
          businessHours: [],
          assignments: [],
          responsibilities: [],
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
        };

        sites.push(nextSite);

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: nextSite }),
        });
        return;
      }

      if (pathname.includes('/capabilities') && method !== 'GET') {
        removedCapabilitiesRequests += 1;
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not found' }),
        });
        return;
      }

      const siteId = pathname.split('/').pop();
      const site = sites.find((entry) => entry.id === siteId);
      await route.fulfill({
        status: site ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(site ? { data: site } : { message: 'Not found' }),
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
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: profiles }),
        });
        return;
      }

      const body = route.request().postDataJSON() as Record<string, unknown>;
      const nextProfile = {
        id: `profile-${profiles.length + 1}`,
        name: body.name,
        description: body.description ?? null,
        baseRoleConstraint: body.baseRoleConstraint,
        scopeSiteId: null,
        isSystem: false,
        isActive: true,
        permissions: [],
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      };

      profiles.push(nextProfile);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: nextProfile }),
      });
    });

    await page.route('**/api/v1/access-control/users/*/effective-permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: 'user-noc',
            role: 'NOC',
            effectivePermissions: ['settings.read'],
            recoveryPermissions: [],
            profileSources: [
              {
                profileId: 'profile-1',
                profileName: 'Perfil noc lectura',
                permissions: ['settings.read'],
              },
            ],
          },
        }),
      });
    });

    await page.route('**/api/v1/users?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: [managedUser],
            meta: { nextCursor: null, total: 1 },
          },
        }),
      });
    });

    await page.goto(`${baseURL}/dashboard/settings`);

    await expect(page.getByRole('heading', { name: 'Configuración empresarial' })).toBeVisible();

    await page.getByRole('link', { name: /Organización/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/organization$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('paragraph').filter({ hasText: 'Sede centro' })).toBeVisible();

    await page.getByRole('button', { name: 'Crear sede' }).click();
    const organizationDialog = page.getByRole('dialog');
    await expect(organizationDialog).toBeVisible();
    await organizationDialog
      .getByRole('textbox', { name: 'Nombre', exact: true })
      .fill('Sede norte');
    await organizationDialog.getByLabel('Código').fill('NORTE');
    await organizationDialog.getByLabel('Coordenadas').fill('4.7110, -74.0721');
    await organizationDialog.getByLabel('Nombre de contacto').fill('Ana Admin');
    await organizationDialog.getByLabel('Teléfono de contacto').fill('+573001112233');
    await organizationDialog.getByRole('tab', { name: 'Servicios' }).click();
    await organizationDialog.getByRole('checkbox', { name: 'Gestión administrativa' }).check();
    await organizationDialog.getByRole('button', { name: 'Crear sede' }).click();

    await expect(page.getByRole('paragraph').filter({ hasText: 'Sede norte' })).toBeVisible();
    await expect(
      page.locator('tr').filter({ hasText: 'Sede norte' }).getByText('Gestión administrativa'),
    ).toBeVisible();
    expect(removedCapabilitiesRequests).toBe(0);

    await page.goto(`${baseURL}/dashboard/settings`);
    await page.getByRole('link', { name: 'Usuarios y acceso' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/access$/);

    await page.getByRole('button', { name: 'Crear perfil' }).click();
    const creationSelector = page.getByRole('dialog');
    await expect(creationSelector).toBeVisible();
    await creationSelector.getByRole('button', { name: 'Empezar desde cero' }).click();

    const accessDialog = page.getByRole('dialog').filter({ hasText: 'Nombre' });
    await expect(accessDialog).toBeVisible();
    await accessDialog.getByLabel('Nombre').fill('Perfil soporte nocturno');
    await accessDialog.getByLabel('Descripción').fill('Perfil operativo de soporte');
    await accessDialog.getByRole('button', { name: 'Crear perfil' }).click();

    await expect(
      page
        .locator('table')
        .filter({ hasText: 'Perfil soporte nocturno' })
        .getByText('Perfil soporte nocturno'),
    ).toBeVisible();
  });
});
