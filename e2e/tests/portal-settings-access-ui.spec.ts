import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

function createAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url');

  return `${header}.${payload}.signature`;
}

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];
const themes = ['light', 'dark'] as const;

const tenantSlug = 'isp-demo';
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
  features: { billing: false, mfa_required_all: true },
};

const profiles: Array<Record<string, unknown>> = [
  {
    id: 'template-admin',
    name: 'Administrador general',
    description: 'Perfil sugerido para la administración general de la empresa.',
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

async function setupAccessUiMocks(page: Page) {
  const deleteIds: string[] = [];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname.replace(/\/$/u, '');

    if (url.includes('/auth/me') && method === 'GET') {
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
      return;
    }

    if (pathname.endsWith('/users/user-admin') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: adminUser }),
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

    if (url.includes('/tenants/me/settings') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantSettings }),
      });
      return;
    }

    if (url.includes('/tenants/public-branding') && method === 'GET') {
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

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              key: 'access',
              label: 'Perfiles y autenticación',
              description:
                'Administra perfiles de acceso, perfiles sugeridos y accesos por sección.',
              ownerModule: 'MOD00 / Access control',
              status: 'AVAILABLE',
              route: '/dashboard/settings/access',
              requiredPermissions: ['settings.read', 'access.permissions.read'],
            },
          ],
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
            userId: 'user-admin',
            role: 'ADMIN',
            effectivePermissions: [
              'settings.read',
              'access.permissions.read',
              'access.profiles.manage',
            ],
            recoveryPermissions: [],
            profileSources: [],
          },
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

    if (pathname.endsWith('/access-control/permissions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: permissionsCatalog }),
      });
      return;
    }

    if (pathname.endsWith('/access-control/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: profiles }),
      });
      return;
    }

    if (/\/access-control\/profiles\/[^/]+\/permissions$/u.test(pathname)) {
      const profileId = pathname.split('/').slice(-2)[0];
      const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: profile }),
      });
      return;
    }

    if (/\/access-control\/profiles\/[^/]+$/u.test(pathname) && method === 'DELETE') {
      const profileId = pathname.split('/').pop() ?? '';
      deleteIds.push(profileId);
      await route.fulfill({ status: 204, body: '' });
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

  return { deleteIds };
}

async function seedAdminSession(page: Page) {
  await seedPortalSession(page, { token: createAccessToken(), tenantSlug });
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('iwana-theme', value);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectThemeApplied(page: Page, theme: 'light' | 'dark') {
  if (theme === 'dark') {
    await expect(page.locator('html.dark')).toBeAttached();
  } else {
    await expect(page.locator('html.dark')).toHaveCount(0);
  }
}

async function openAccessSettings(page: Page) {
  await page.goto('/dashboard/settings/access');
  await expect(page.getByRole('heading', { level: 1, name: 'Perfiles de acceso' })).toBeVisible();
}

test.describe('Portal settings access UI', () => {
  test('coloca el CTA, copy y diálogo de eliminar según la spec de acceso', async ({ page }) => {
    const { deleteIds } = await setupAccessUiMocks(page);
    await seedAdminSession(page);
    await openAccessSettings(page);

    const pageTitle = page.getByRole('heading', { level: 1, name: 'Perfiles de acceso' });
    await expect(pageTitle).toBeVisible();

    const customProfilesPanel = page
      .getByRole('heading', { name: 'Perfiles personalizados' })
      .locator('xpath=ancestor::section[1]');
    await expect(customProfilesPanel.getByRole('button', { name: 'Crear perfil' })).toBeVisible();
    await expect(
      pageTitle
        .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
        .getByRole('button', { name: 'Crear perfil' }),
    ).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plantillas iniciales' })).toHaveCount(0);
    await expect(page.getByText('Usar como base')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Crear a partir de este perfil/ }).first(),
    ).toBeVisible();

    const mfaHeading = page.getByRole('heading', { name: 'Verificación en dos pasos global' });
    await mfaHeading.scrollIntoViewIfNeeded();
    await expect(mfaHeading).toBeVisible();

    const deleteButton = page
      .getByRole('button', { name: 'Eliminar perfil Perfil noc lectura' })
      .locator('visible=true')
      .first();
    await deleteButton.scrollIntoViewIfNeeded();
    await deleteButton.click();

    const deleteDialog = page.getByRole('dialog', { name: /¿Eliminar el perfil/ });
    await expect(deleteDialog).toBeVisible();
    expect(deleteIds).toHaveLength(0);
    await deleteDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(deleteDialog).toHaveCount(0);
    expect(deleteIds).toHaveLength(0);
  });

  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`cumple overflow, target 44px, axe y captura en ${viewport.name} ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        await setupAccessUiMocks(page);
        await seedAdminSession(page);
        await applyTheme(page, theme);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await openAccessSettings(page);
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('heading', { name: 'Perfiles personalizados' })).toBeVisible();
        await expectThemeApplied(page, theme);

        await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
        const createButton = page.getByRole('button', { name: 'Crear perfil' }).first();
        await createButton.scrollIntoViewIfNeeded();
        const createProfileBox = await createButton.boundingBox();
        expect(createProfileBox?.height).toBeGreaterThanOrEqual(44);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        if (results.violations.length > 0) {
          console.log(
            `[AXE:access-${viewport.name}-${theme}]`,
            JSON.stringify(
              results.violations.map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                description: violation.description,
                nodes: violation.nodes.map((node) => ({
                  target: node.target,
                  html: node.html,
                  failureSummary: node.failureSummary,
                })),
              })),
              null,
              2,
            ),
          );
        }
        expect(results.violations).toEqual([]);

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await expect(page).toHaveScreenshot(`access-${viewport.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
});
