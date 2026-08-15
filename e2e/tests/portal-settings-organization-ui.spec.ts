import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

/** Valor canónico de `OrganizationSiteCapability.ADMIN_OFFICE` en `@iwana/shared`. */
const OrganizationSiteCapability = {
  ADMIN_OFFICE: 'ADMIN_OFFICE',
} as const;

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
  country: 'CO',
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

function buildSite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'site-1',
    name: 'Sede centro',
    code: 'CENTRO',
    capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
    isActive: true,
    siteType: 'OFFICE',
    address: 'Cra 10 # 10-10',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    country: 'CO',
    latitude: 4.5837296,
    longitude: -74.4454695,
    contactName: 'Ana Admin',
    contactPhone: '+573001112233',
    isPrimary: true,
    businessHours: [],
    assignments: [],
    responsibilities: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    ...overrides,
  };
}

function toSiteSummary(site: Record<string, unknown>) {
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    siteType: site.siteType,
    address: site.address,
    municipality: site.municipality,
    department: site.department,
    capabilities: site.capabilities,
    isActive: site.isActive,
  };
}

interface OrganizationUiMockOptions {
  effectivePermissions?: string[];
  createStatus?: number;
  createErrorBody?: Record<string, unknown>;
}

async function setupOrganizationUiMocks(page: Page, options: OrganizationUiMockOptions = {}) {
  const sites: Array<Record<string, unknown>> = [buildSite()];
  const createBodies: Array<Record<string, unknown>> = [];
  const patchBodies: Array<Record<string, unknown>> = [];
  const deleteIds: string[] = [];
  const createStatus = options.createStatus ?? 201;
  const effectivePermissions = options.effectivePermissions ?? [
    'settings.read',
    'organization.sites.read',
    'organization.sites.manage',
    'access.permissions.read',
    'access.profiles.manage',
  ];

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
              label: 'Perfiles y autenticación',
              description: 'Administra perfiles de acceso y políticas de autenticación.',
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
            effectivePermissions,
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

    if (pathname.endsWith('/organization/sites') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: sites.map(toSiteSummary),
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
      createBodies.push(body);

      if (createStatus >= 400) {
        await route.fulfill({
          status: createStatus,
          contentType: 'application/json',
          body: JSON.stringify(
            options.createErrorBody ?? {
              message: 'relation tenant_42.organization_sites does not exist',
              sql: 'INSERT INTO tenant_42.organization_sites',
            },
          ),
        });
        return;
      }

      const nextSite = buildSite({
        id: `site-${sites.length + 1}`,
        name: body.name,
        code: body.code,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
        siteType: body.siteType,
        address: body.address ?? null,
        municipality: body.municipality ?? null,
        department: body.department ?? null,
        country: body.country ?? 'CO',
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone ?? null,
        isPrimary: Boolean(body.isPrimary),
        isActive: body.isActive !== false,
      });
      sites.push(nextSite);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: nextSite }),
      });
      return;
    }

    if (pathname.includes('/organization/sites/') && method === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      const siteId = pathname.split('/').pop();
      const target = sites.find((site) => site.id === siteId);
      if (!target) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Not found' }),
        });
        return;
      }

      Object.assign(target, body, { updatedAt: '2026-05-22T00:00:00.000Z' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: target }),
      });
      return;
    }

    if (pathname.includes('/organization/sites/') && method === 'DELETE') {
      const siteId = pathname.split('/').pop() ?? '';
      deleteIds.push(siteId);
      const index = sites.findIndex((site) => site.id === siteId);
      if (index >= 0) {
        sites.splice(index, 1);
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (pathname.includes('/organization/sites/') && method === 'GET') {
      const siteId = pathname.split('/').pop();
      const site = sites.find((entry) => entry.id === siteId);
      await route.fulfill({
        status: site ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(site ? { data: site } : { message: 'Not found' }),
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

  return { createBodies, patchBodies, deleteIds };
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

async function fillCreateSiteForm(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Sede norte');
  await dialog.getByLabel('Código').fill('NORTE');
  await dialog.getByLabel('Coordenadas').fill('4.7110, -74.0721');
  await dialog.getByLabel('Nombre de contacto').fill('Ana Admin');
  await dialog.getByLabel('Teléfono de contacto').fill('+573001112233');
  await expect(dialog.getByRole('combobox', { name: 'País' })).toHaveText(/Colombia/);
}

test.describe('Portal settings organization UI', () => {
  test('admin crea, edita y da de baja una sede desde el modal', async ({ page }) => {
    const { createBodies, patchBodies, deleteIds } = await setupOrganizationUiMocks(page);
    await seedAdminSession(page);

    await page.goto('/dashboard/settings/organization');
    await expect(
      page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Sede centro/i })).toBeVisible();

    await page.getByRole('button', { name: 'Crear sede' }).click();
    await fillCreateSiteForm(page);
    const createDialog = page.getByRole('dialog');
    await createDialog.getByRole('tab', { name: 'Servicios' }).click();
    await createDialog.getByRole('checkbox', { name: 'Gestión administrativa' }).check();
    await createDialog.getByRole('button', { name: 'Crear sede' }).click();

    await expect(page.getByRole('row', { name: /Sede norte/i })).toBeVisible();
    const createRequestBody = createBodies.at(-1);
    expect(createRequestBody).toEqual(
      expect.objectContaining({
        country: 'CO',
        capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
      }),
    );

    await page.getByRole('button', { name: /Editar sede Sede norte/i }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByRole('combobox', { name: 'País' })).toHaveText(/Colombia/);
    await editDialog.getByLabel('Dirección').fill('Cra 7 # 7-07');
    await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText('Sede actualizada correctamente.')).toBeVisible();
    expect(patchBodies.at(-1)).toEqual(
      expect.objectContaining({
        country: 'CO',
        address: 'Cra 7 # 7-07',
      }),
    );
    expect(deleteIds).toHaveLength(0);

    await page.getByRole('button', { name: /Dar de baja sede Sede norte/i }).click();
    const deactivateDialog = page.getByRole('dialog', { name: '¿Dar de baja «Sede norte»?' });
    await expect(deactivateDialog).toBeVisible();
    expect(deleteIds).toHaveLength(0);
    await deactivateDialog.getByRole('button', { name: 'Dar de baja' }).click();

    await expect(page.getByText('Sede dada de baja correctamente.')).toBeVisible();
    expect(deleteIds).toEqual(['site-2']);
    await expect(page.getByRole('row', { name: /Sede norte/i })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Sede centro/i })).toBeVisible();
  });

  test('solo lectura oculta acciones y el CTA de crear', async ({ page }) => {
    await setupOrganizationUiMocks(page, {
      effectivePermissions: ['settings.read', 'organization.sites.read'],
    });
    await seedAdminSession(page);

    await page.goto('/dashboard/settings/organization');
    await expect(
      page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Sede centro/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Acciones' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crear sede' })).toHaveCount(0);
    await expect(page.getByText('Puedes consultar las sedes, pero no modificarlas.')).toBeVisible();
  });

  test('un POST 500 conserva el diálogo, los valores y el copy controlado', async ({ page }) => {
    await setupOrganizationUiMocks(page, {
      createStatus: 500,
      createErrorBody: {
        message: 'relation tenant_42.organization_sites does not exist',
        sql: 'INSERT INTO tenant_42.organization_sites',
      },
    });
    await seedAdminSession(page);

    await page.goto('/dashboard/settings/organization');
    await page.getByRole('button', { name: 'Crear sede' }).click();
    await fillCreateSiteForm(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Crear sede' }).click();

    await expect(
      dialog.getByText('No pudimos crear la sede. Revisa la información e intenta nuevamente.'),
    ).toBeVisible();
    await expect(dialog.getByText(/tenant_42|organization_sites|INSERT INTO/i)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
      'Sede norte',
    );
  });

  test('enviar vacío desde Servicios vuelve a Información y enfoca Nombre', async ({ page }) => {
    await setupOrganizationUiMocks(page);
    await seedAdminSession(page);

    await page.goto('/dashboard/settings/organization');
    await page.getByRole('button', { name: 'Crear sede' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Servicios' }).click();
    await dialog.getByRole('button', { name: 'Crear sede' }).click();

    await expect(
      dialog.getByRole('tab', { name: 'Información de la sede', selected: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Nombre', exact: true })).toBeFocused();
    await expect(dialog.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`cumple overflow, target 44px, axe y captura en ${viewport.name} ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        await setupOrganizationUiMocks(page);
        await seedAdminSession(page);
        await applyTheme(page, theme);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await page.goto('/dashboard/settings/organization');
        await page.waitForLoadState('networkidle');
        await expect(
          page.getByRole('heading', { name: 'Perfil empresarial y organización' }),
        ).toBeVisible();
        await expect(page.getByRole('table')).toBeVisible();
        await expectThemeApplied(page, theme);

        await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
        const createButton = page.getByRole('button', { name: 'Crear sede' }).first();
        await createButton.scrollIntoViewIfNeeded();
        const createSiteBox = await createButton.boundingBox();
        expect(createSiteBox?.height).toBeGreaterThanOrEqual(44);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        if (results.violations.length > 0) {
          console.log(
            `[AXE:organization-${viewport.name}-${theme}]`,
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
        await expect(page).toHaveScreenshot(`organization-${viewport.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
});
