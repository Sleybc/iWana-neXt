import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { seedPortalSession } from './helpers/portal-session';

/**
 * Smoke de cierre (G6 / C3) de la remediación de Marca (MOD03 Branding).
 *
 * Cobertura:
 * - Light desktop: carga, título «Marca», grilla de activos, preview de
 *   navegación sin navy sólido (`bg-iwana-primary` = 0 en el preview).
 * - Error de validación de URL: role=alert visible, merge de aria-describedby
 *   (el id del mensaje de error queda asociado al input) y color de texto de
 *   error AA en light (rgb(220, 38, 38) = --color-iwana-error-700 #DC2626).
 * - Dark desktop: mismo estado de error sin violaciones de contraste.
 * - Mobile 390×844: control de carga operativo por teclado con el anillo del
 *   contrato (`interactiveFocusClassName`). Nota: `SettingsSubTabs` (P1-A11y-3)
 *   no tiene montaje productivo todavía en `/dashboard/settings/branding`; su
 *   contrato de foco queda cubierto por unit (`SettingsClient.spec.tsx`) y el
 *   anillo se verifica E2E sobre el label de carga que comparte el contrato.
 * - Modo consulta (NOC): PortalAlert info «Consulta sin edición» + inputs
 *   deshabilitados (P2-UX-1).
 * - AxeBuilder (wcag2a/wcag2aa) en 0 violaciones por vista.
 * - Capturas de evidencia en `.playwright-mcp/audit-branding-v1-1/`.
 *
 * Las rutas de API se mockean por completo (mismo patrón de
 * portal-branding-upload.spec.ts); la sesión se siembra por cookie httpOnly
 * con slug de tenant `iwana` (dev).
 */

const EVIDENCE_DIR = join(process.cwd(), '.playwright-mcp', 'audit-branding-v1-1');

const TENANT_SLUG = 'iwana';
const TENANT_ID = 'tenant-iwana-test';
const SCHEMA_NAME = 'tenant_iwana_test';
const USER_ID = 'user-admin-iwana';
const UPDATED_SEAL_URL = 'https://cdn.test-iwana.co/branding/seal-light-uploaded.png';

/** PNG real mínimo válido para el flujo de carga por teclado (mismo buffer que portal-branding-upload). */
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAABTklEQVR4nO3SMQEAIAzAMEA5zocMjiYKenSvO7PIOr8D+MsAcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAekhwN+LeoABQAAAABJRU5ErkJggg==',
  'base64',
);

function createAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url');

  return `${header}.${payload}.signature`;
}

interface BrandingSmokeMockOptions {
  role?: 'ADMIN' | 'NOC';
}

async function setupBrandingMocks(page: Page, options: BrandingSmokeMockOptions = {}) {
  const role = options.role ?? 'ADMIN';

  const tenantProfile: Record<string, string | boolean | null> = {
    id: TENANT_ID,
    name: 'ISP iWana Demo',
    slug: TENANT_SLUG,
    status: 'ACTIVE',
    contactEmail: 'contacto@demo-iwana.co',
    legalName: 'ISP iWana Demo S.A.S.',
    nit: '900999888',
    nitDv: '7',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: '+573001122334',
    website: null,
    createdAt: '2026-01-15T00:00:00.000Z',
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
    showTenantName: true,
  };

  const tenantSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 120,
    features: { billing: false, mfa_required_all: false },
  };

  const settingsSections = [
    {
      key: 'branding',
      label: 'Marca',
      description: 'Gestiona identidad visual y activos corporativos del tenant autenticado.',
      ownerModule: 'Tenant / Branding',
      status: 'AVAILABLE',
      route: '/dashboard/settings/branding',
      requiredPermissions: ['settings.read'],
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      const slug = new URL(url).searchParams.get('slug');
      await route.fulfill({
        status: slug === TENANT_SLUG ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          slug === TENANT_SLUG
            ? {
                data: {
                  displayName: 'ISP iWana Demo',
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
              }
            : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
        ),
      });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: USER_ID,
            email: 'aabbccdd11223344',
            role,
            tenantId: TENANT_ID,
            schemaName: SCHEMA_NAME,
            jti: `jti-${role.toLowerCase()}`,
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (url.includes(`/users/${USER_ID}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: USER_ID,
            role,
            status: 'ACTIVE',
            firstName: 'Ana',
            lastName: 'Prueba',
            phone: '+573001234567',
            jobTitle: 'Operaciones',
            avatarUrl: null,
            mfaEnabled: false,
            emailVerified: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (/\/access-control\/users\/[^/]+\/effective-permissions$/.test(url) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: USER_ID,
            role,
            effectivePermissions: ['settings.read'],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: settingsSections }),
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

    if (url.includes('/tenants/me/settings') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: tenantSettings }),
      });
      return;
    }

    if (url.includes('/tenants/me/summary') && method === 'GET') {
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
              pendingAlerts: 1,
              auditEventsLast7d: 12,
            },
            alerts: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me/branding/assets') && method === 'POST') {
      tenantProfile.sealLightUrl = UPDATED_SEAL_URL;
      tenantProfile.sealLightAssetId = 'asset-seal-light-1';

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'asset-seal-light-1',
            usage: 'seal',
            themeVariant: 'light',
            mimeType: 'image/png',
            sizeBytes: VALID_PNG_BUFFER.byteLength,
            publicUrl: UPDATED_SEAL_URL,
            createdAt: '2026-08-18T12:00:00.000Z',
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

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

async function seedAdminSession(page: Page) {
  await seedPortalSession(page, { token: createAccessToken(), tenantSlug: TENANT_SLUG });
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

async function openBranding(page: Page) {
  await page.goto('/dashboard/settings/branding');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1, name: 'Marca' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  if (results.violations.length > 0) {
    console.log(
      `[AXE:branding-${label}]`,
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
}

async function capture(page: Page, name: string, options?: { keepFocus?: boolean }): Promise<void> {
  if (!options?.keepFocus) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }
  await page.screenshot({
    path: join(EVIDENCE_DIR, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

async function submitInvalidSealUrl(page: Page): Promise<void> {
  const urlInput = page.locator('#sealLightUrl');
  await urlInput.fill('http://x');
  await page.getByRole('button', { name: 'Guardar marca' }).click();
  // El error vive en <p id="sealLightUrl-error" role="alert">. Next inyecta su
  // route announcer con role=alert, así que se apunta al id contractual del
  // mensaje (que además es la clave del merge de aria-describedby).
  await expect(page.locator('#sealLightUrl-error')).toBeVisible();
}

test.describe('Portal settings branding smoke (G6 a11y)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('light desktop: carga, grilla de activos y preview de navegación sin navy sólido', async ({
    page,
  }) => {
    await setupBrandingMocks(page);
    await seedAdminSession(page);
    await applyTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBranding(page);
    await expectThemeApplied(page, 'light');

    const grid = page.getByTestId('branding-assets-grid');
    await expect(grid).toBeVisible();
    for (const title of [
      'Sello compacto',
      'Logo horizontal',
      'Favicon',
      'Fondo del inicio de sesión',
    ]) {
      await expect(grid.getByRole('heading', { name: title })).toBeVisible();
    }

    // Copy congelado del estado de fuente (P2-UX-2).
    await expect(page.getByText('Fuente actual: Sin configurar').first()).toBeVisible();

    // P2-IDENT-1: sin navy sólido (bg-iwana-primary) en los previews.
    const previewSection = page
      .getByRole('heading', { name: 'Vista previa de navegación y pestaña' })
      .locator('xpath=ancestor::section[1]');
    await expect(previewSection.locator('[class*="bg-iwana-primary"]')).toHaveCount(0);

    // El pill de navegación usa la superficie vigente (blanco / dark-surface-2).
    const navCol = page
      .locator('div.flex.h-full.flex-col')
      .filter({ hasText: 'Vista previa de navegación' });
    await expect(navCol).toHaveCount(1);
    const pill = navCol.locator('div.min-h-12.w-fit');
    await expect(pill).toBeVisible();
    await expect(pill).not.toHaveClass(/bg-iwana-primary/);
    await expect(pill).toHaveClass(/bg-white/);

    await expectNoAxeViolations(page, 'light-desktop');
    await capture(page, 'branding-light-desktop');
  });

  test('light desktop: URL inválida expone role=alert, aria-describedby y color AA #DC2626', async ({
    page,
  }) => {
    await setupBrandingMocks(page);
    await seedAdminSession(page);
    await applyTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBranding(page);

    await submitInvalidSealUrl(page);

    // P1-A11y-2: merge de aria-describedby — el id del mensaje de error queda asociado al input.
    const urlInput = page.locator('#sealLightUrl');
    const alert = page.locator('#sealLightUrl-error');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText('La URL debe usar HTTPS.');

    const alertId = await alert.getAttribute('id');
    expect(alertId).toBeTruthy();
    const describedByIds = ((await urlInput.getAttribute('aria-describedby')) ?? '').split(/\s+/);
    expect(describedByIds).toContain(alertId);
    expect(describedByIds).toContain('sealLightUrl-error');
    await expect(urlInput).toHaveAttribute('aria-invalid', 'true');

    // P1-A11y-1: token de error AA en light (--color-iwana-error-700 = #DC2626).
    await expect(alert).toHaveCSS('color', 'rgb(220, 38, 38)');

    await expectNoAxeViolations(page, 'light-desktop-error');
    await capture(page, 'branding-error-light-desktop');
  });

  test('dark desktop: estado de error sin violaciones de contraste graves', async ({ page }) => {
    await setupBrandingMocks(page);
    await seedAdminSession(page);
    await applyTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBranding(page);
    await expectThemeApplied(page, 'dark');

    await submitInvalidSealUrl(page);
    await expect(page.locator('#sealLightUrl-error')).toContainText('La URL debe usar HTTPS.');

    await expectNoAxeViolations(page, 'dark-desktop-error');
    await capture(page, 'branding-error-dark-desktop');
  });

  test('mobile 390×844 light: control de carga operativo por teclado con anillo del contrato', async ({
    page,
  }) => {
    await setupBrandingMocks(page);
    await seedAdminSession(page);
    await applyTheme(page, 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    await openBranding(page);

    await expect(page.getByTestId('branding-assets-grid')).toBeVisible();

    // Axe sobre el estado limpio de la vista (sin foco): 0 violaciones.
    await expectNoAxeViolations(page, 'mobile-light');

    // El label de carga comparte el contrato de foco (interactiveFocusClassName)
    // que Task 3 aplicó a SettingsSubTabs (P1-A11y-3). SettingsSubTabs no tiene
    // montaje productivo todavía en esta ruta; su contrato queda cubierto por
    // unit (SettingsClient.spec.tsx) — ver nota del informe.
    const uploadLabel = page.locator('label[for="seal-light-file"]');
    await expect(uploadLabel).toHaveAttribute('tabindex', '0');
    await uploadLabel.focus();
    await expect(uploadLabel).toBeFocused();
    await expect(uploadLabel).toHaveClass(/focus-visible:ring-2/);
    await expect(uploadLabel).toHaveClass(/focus-visible:ring-iwana-primary/);
    await expect(uploadLabel).toHaveClass(/focus-visible:ring-offset-2/);
    await expect(uploadLabel).not.toHaveClass(/focus-visible:ring-iwana-secondary/);

    // Evidencia del estado enfocado: el overlay de la carga (bg-black/45 +
    // caption blanco 12 px) es un residual P2 conocido fuera del backlog de
    // este lote (2.99:1 < 4.5:1 en light) — captura reproducible sin blur.
    await capture(page, 'branding-mobile-light-focus-overlay', { keepFocus: true });

    // Operabilidad por teclado: Enter sobre el label abre el selector de archivo.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadLabel.press('Enter'),
    ]);
    await chooser.setFiles({
      name: 'seal-light.png',
      mimeType: 'image/png',
      buffer: VALID_PNG_BUFFER,
    });
    // El mensaje vive a la vez en el PortalAlert visible y en la región live
    // sr-only (que precede al alert en el DOM); `.last()` es la descripción
    // del alert visible de éxito.
    await expect(page.getByText('Marca actualizada', { exact: true })).toBeVisible();
    await expect(
      page.getByText('El activo se subió y asignó correctamente.', { exact: true }).last(),
    ).toBeVisible();

    await capture(page, 'branding-mobile-light');
  });

  test('mobile 390×844 dark: acciones de marca visibles sin violaciones de contraste', async ({
    page,
  }) => {
    await setupBrandingMocks(page);
    await seedAdminSession(page);
    await applyTheme(page, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await openBranding(page);
    await expectThemeApplied(page, 'dark');

    await expect(page.getByRole('button', { name: 'Guardar marca' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurar marca base' })).toBeVisible();
    await expect(page.locator('#seal-light-file')).toHaveCount(1);
    await expect(page.getByLabel('URL HTTPS para sello compacto · variante clara')).toBeVisible();

    await expectNoAxeViolations(page, 'mobile-dark');
    await capture(page, 'branding-mobile-dark');
  });

  test('light desktop NOC: modo consulta con PortalAlert info y controles deshabilitados', async ({
    page,
  }) => {
    await setupBrandingMocks(page, { role: 'NOC' });
    await seedAdminSession(page);
    await applyTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBranding(page);

    // P2-UX-1: aviso readonly con PortalAlert variant="info" y copy congelado.
    await expect(page.getByText('Consulta sin edición')).toBeVisible();
    await expect(page.locator('#sealLightUrl')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar marca' })).toHaveCount(0);
    await expect(page.locator('label[for="seal-light-file"]')).toHaveAttribute('tabindex', '-1');

    await expectNoAxeViolations(page, 'light-desktop-readonly');
    await capture(page, 'branding-readonly-light-desktop');
  });
});
