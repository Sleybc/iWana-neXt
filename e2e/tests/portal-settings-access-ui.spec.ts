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
  version: 'MOD00_ACCESS_V2',
  permissions: [
    {
      id: 'perm-1',
      tenantId: 'tenant-1',
      permissionKey: 'settings.read',
      moduleKey: 'settings',
      action: 'read',
      description: 'Ver centro de Configuración',
      catalogVersion: 'MOD00_ACCESS_V2',
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
      catalogVersion: 'MOD00_ACCESS_V2',
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

const extraSuggestedProfiles: Array<Record<string, unknown>> = [
  {
    id: 'template-noc',
    name: 'Monitoreo operativo',
    description: 'Perfil sugerido para consultar operación y sedes.',
    baseRoleConstraint: 'NOC',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: ['settings.read'],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-support',
    name: 'Soporte inicial',
    description: 'Perfil sugerido para atender casos de primer nivel.',
    baseRoleConstraint: 'SUPPORT',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: ['settings.read'],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-sales',
    name: 'Ventas',
    description: 'Perfil sugerido para gestión comercial y ventas.',
    baseRoleConstraint: 'SALES',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-tech',
    name: 'Técnico de campo',
    description: 'Perfil sugerido para agenda y ejecución de campo.',
    baseRoleConstraint: 'TECHNICIAN',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-accountant',
    name: 'Contabilidad',
    description: 'Perfil sugerido para gestión contable y facturación.',
    baseRoleConstraint: 'ACCOUNTANT',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-hr',
    name: 'Talento humano',
    description: 'Perfil sugerido para gestión de talento humano.',
    baseRoleConstraint: 'HR',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-contractor',
    name: 'Contratista',
    description: 'Perfil sugerido para trabajo contratado en campo.',
    baseRoleConstraint: 'CONTRACTOR',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-auditor',
    name: 'Auditor',
    description: 'Perfil sugerido para revisión de registros y accesos.',
    baseRoleConstraint: 'AUDITOR',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: ['settings.read'],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
];

async function setupAccessUiMocks(
  page: Page,
  options?: { includeCustomProfiles?: boolean; includeFullSuggestedCatalog?: boolean },
) {
  const deleteIds: string[] = [];
  const includeCustomProfiles = options?.includeCustomProfiles !== false;
  const systemProfiles = options?.includeFullSuggestedCatalog
    ? [...profiles.filter((profile) => profile.isSystem === true), ...extraSuggestedProfiles]
    : profiles.filter((profile) => profile.isSystem === true);
  const customProfiles = includeCustomProfiles
    ? profiles.filter((profile) => profile.isSystem !== true)
    : [];
  const mockedProfiles = [...systemProfiles, ...customProfiles];

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
        body: JSON.stringify({ data: mockedProfiles }),
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

    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Plantillas iniciales' })).toHaveCount(0);
    await expect(page.getByText('Usar como base')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Crear a partir de este perfil/ })).toHaveCount(
      0,
    );

    await customProfilesPanel.getByRole('button', { name: 'Crear perfil' }).click();
    const creationPeek = page.getByRole('dialog', { name: 'Perfiles sugeridos' });
    await expect(creationPeek).toBeVisible();
    await expect(
      creationPeek.getByRole('button', { name: 'Ver lo que permite Administrador general' }),
    ).toBeVisible();
    await expect(creationPeek.getByRole('button', { name: 'Empezar desde cero' })).toBeVisible();
    await expect(creationPeek.getByRole('button', { name: /Editar/ })).toHaveCount(0);
    await creationPeek.getByRole('button', { name: 'Cerrar' }).click();
    await expect(creationPeek).toHaveCount(0);

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

  test('con 0 perfiles personalizados el empty y Crear perfil caben en el primer viewport desktop', async ({
    page,
  }) => {
    await setupAccessUiMocks(page, { includeCustomProfiles: false });
    await seedAdminSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAccessSettings(page);

    await expect(page.getByText('Tus equipos ya usan los perfiles sugeridos')).toBeVisible();
    await expect(page.getByText('Aún no has creado perfiles personalizados')).toHaveCount(0);
    await expect(page.getByText(/Crear uno a partir del sugerido no mueve a nadie/)).toBeVisible();
    await expect(
      page.getByText(
        'Crear un perfil aquí no cambia a quién lo usa. Para que alguien deje el perfil sugerido, debes reemplazarlo en Usuarios.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Sin perfil seleccionado')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toHaveCount(0);
    await expect(page.getByText('Tus equipos ya usan los perfiles sugeridos')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Crear perfil' })).toBeInViewport();
  });

  test('al crear, el peek muestra 9 filas compactas en orden canónico, no 9 cards en página', async ({
    page,
  }) => {
    await setupAccessUiMocks(page, {
      includeCustomProfiles: false,
      includeFullSuggestedCatalog: true,
    });
    await seedAdminSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAccessSettings(page);

    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Crear a partir de este perfil/ })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Crear perfil' }).click();
    const peek = page.getByRole('dialog');
    await expect(peek.getByRole('heading', { name: 'Perfiles sugeridos' })).toBeVisible();
    const suggestedRows = peek.getByRole('button', { name: /Ver lo que permite / });
    await expect(suggestedRows).toHaveCount(9);
    await expect(suggestedRows.nth(0)).toHaveAccessibleName(
      'Ver lo que permite Administrador general',
    );
    await expect(suggestedRows.nth(3)).toHaveAccessibleName('Ver lo que permite Ventas');
    await expect(suggestedRows.nth(6)).toHaveAccessibleName('Ver lo que permite Talento humano');
    await expect(peek.getByRole('button', { name: 'Empezar desde cero' })).toBeVisible();

    const firstRowBox = await suggestedRows.first().boundingBox();
    expect(firstRowBox).toBeTruthy();
    expect(firstRowBox!.height).toBeGreaterThanOrEqual(44);

    await suggestedRows.first().click();
    await expect(peek.getByRole('heading', { name: 'Lo que permite este perfil' })).toBeVisible();
    await expect(peek.getByRole('button', { name: 'Usar este perfil' })).toBeVisible();
    await expect(peek.getByRole('button', { name: 'Volver a la lista' })).toBeVisible();
    await peek.getByRole('button', { name: 'Usar este perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Nuevo perfil en preparación')).toBeVisible();
    await expect(page.getByLabel('Nombre')).toBeVisible();
    await expect(page.getByLabel('Tipo de usuario permitido')).toBeVisible();
  });

  test('con una sola sugerencia no hay galería en página; el peek lista una fila', async ({
    page,
  }) => {
    await setupAccessUiMocks(page, { includeCustomProfiles: false });
    await seedAdminSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAccessSettings(page);

    await expect(page.getByRole('heading', { name: 'Perfiles sugeridos' })).toHaveCount(0);
    await expect(page.getByText('Administrador general')).toHaveCount(0);

    await page.getByRole('button', { name: 'Crear perfil' }).click();
    const peek = page.getByRole('dialog', { name: 'Perfiles sugeridos' });
    await expect(peek.getByRole('button', { name: /Ver lo que permite / })).toHaveCount(1);
    await expect(
      peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }),
    ).toBeVisible();
  });

  test('en mobile el pie MFA apila la ayuda encima del CTA sin solape', async ({ page }) => {
    await setupAccessUiMocks(page);
    await seedAdminSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openAccessSettings(page);
    // El cliente hace dos cargas en cascada (la segunda la dispara el cambio de
    // selectedProfileId) y vuelve a montar el árbol completo; esperar el silencio
    // de red evita que scrollIntoViewIfNeeded atrape el botón durante el remount.
    await page.waitForLoadState('networkidle');

    const mfaPanel = page
      .getByRole('heading', { name: 'Verificación en dos pasos global' })
      .locator('xpath=ancestor::section[1]');
    const hint = mfaPanel.getByText(
      'Este ajuste aplica a toda la empresa y solo puede cambiarlo un administrador.',
    );
    const savePolicy = mfaPanel.getByRole('button', { name: 'Guardar política' });
    await expect(savePolicy).toBeAttached();
    await savePolicy.scrollIntoViewIfNeeded();

    const panelBox = await mfaPanel.boundingBox();
    const hintBox = await hint.boundingBox();
    const saveBox = await savePolicy.boundingBox();

    expect(panelBox).toBeTruthy();
    expect(hintBox).toBeTruthy();
    expect(saveBox).toBeTruthy();
    expect(saveBox!.y).toBeGreaterThanOrEqual(hintBox!.y + hintBox!.height);
    expect(saveBox!.width).toBeGreaterThanOrEqual(panelBox!.width * 0.9);
  });

  test('en mobile el peek de creación tiene filas de 44px y footer alcanzable sin solape', async ({
    page,
  }) => {
    await setupAccessUiMocks(page, {
      includeCustomProfiles: false,
      includeFullSuggestedCatalog: true,
    });
    await seedAdminSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openAccessSettings(page);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Crear perfil' }).click();
    const peek = page.getByRole('dialog');
    await expect(peek.getByRole('heading', { name: 'Perfiles sugeridos' })).toBeVisible();

    const firstRow = peek.getByRole('button', { name: /Ver lo que permite / }).first();
    const rowBox = await firstRow.boundingBox();
    expect(rowBox).toBeTruthy();
    expect(rowBox!.height).toBeGreaterThanOrEqual(44);

    await firstRow.click();
    const useThisProfile = peek.getByRole('button', { name: 'Usar este perfil' });
    const backToList = peek.getByRole('button', { name: 'Volver a la lista' });
    await expect(useThisProfile).toBeVisible();
    await expect(backToList).toBeVisible();

    const useBox = await useThisProfile.boundingBox();
    const backBox = await backToList.boundingBox();
    expect(useBox).toBeTruthy();
    expect(backBox).toBeTruthy();
    expect(useBox!.y + useBox!.height).toBeLessThanOrEqual(backBox!.y + 1);
    expect(backBox!.y + backBox!.height).toBeLessThanOrEqual(844);
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
