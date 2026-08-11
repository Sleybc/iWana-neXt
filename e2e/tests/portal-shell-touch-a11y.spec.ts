/**
 * Paridad táctil del shell portal: hitboxes ≥ 44 px + capturas 375/1440.
 * SEGURIDAD: sesión mock (sin PII real ni credenciales productivas).
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'hash-admin-test',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-shell-touch-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-portal-shell-touch');

async function setupShellMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    const json = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await json({
        data: {
          displayName: 'ISP Prueba',
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
      });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await json({
        data: {
          sub: 'user-uuid-admin-test',
          email: 'hash-admin-test',
          role: 'ADMIN',
          tenantId: 'tenant-uuid-test',
          schemaName: 'tenant_test_isp',
          jti: 'jti-shell-touch-1',
          type: 'tenant',
        },
      });
      return;
    }

    if (pathname.match(/\/users\/[^/]+$/) && method === 'GET') {
      await json({
        data: {
          id: 'user-uuid-admin-test',
          email: 'admin@test-isp.co',
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          mfaEnabled: true,
          emailVerified: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await json({
        data: {
          id: 'tenant-uuid-test',
          name: 'ISP Prueba',
          slug: MOCK_TENANT_SLUG,
          showTenantName: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: pathname }),
    });
  });
}

async function measureBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'boundingBox disponible').toBeTruthy();
  return box!;
}

test.describe('Portal shell — touch targets + evidencia visual', () => {
  test.beforeEach(async ({ page }) => {
    await seedPortalSession(page, {
      token: MOCK_ACCESS_TOKEN,
      tenantSlug: MOCK_TENANT_SLUG,
    });
    await setupShellMocks(page);
  });

  test('hitboxes ≥ 44 px a 375 + capturas claro/oscuro', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();

    const openMenu = page.getByRole('button', { name: 'Abrir menú' });
    const openBox = await measureBox(openMenu);
    expect(openBox.width).toBeGreaterThanOrEqual(44);
    expect(openBox.height).toBeGreaterThanOrEqual(44);

    const home = page.getByRole('link', { name: 'Ir al dashboard' });
    const homeBox = await measureBox(home);
    expect(homeBox.height).toBeGreaterThanOrEqual(44);
    expect(homeBox.width).toBeGreaterThanOrEqual(44);

    const search = page.getByRole('button', { name: 'Buscar' });
    const searchBox = await measureBox(search);
    expect(searchBox.width).toBeGreaterThanOrEqual(44);
    expect(searchBox.height).toBeGreaterThanOrEqual(44);

    const theme = page.getByRole('button', { name: /Cambiar a tema/i });
    const themeBox = await measureBox(theme);
    expect(themeBox.width).toBeGreaterThanOrEqual(44);
    expect(themeBox.height).toBeGreaterThanOrEqual(44);

    const bell = page.getByRole('button', { name: 'Notificaciones' });
    const bellBox = await measureBox(bell);
    expect(bellBox.width).toBeGreaterThanOrEqual(44);
    expect(bellBox.height).toBeGreaterThanOrEqual(44);

    await openMenu.click();
    const sidebar = page.getByRole('complementary');
    const closeBtn = sidebar.getByRole('button', { name: 'Cerrar menú' });
    const closeBox = await measureBox(closeBtn);
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);

    const navLink = page
      .getByRole('navigation', { name: 'Menú principal' })
      .getByRole('link')
      .first();
    const navBox = await measureBox(navLink);
    expect(navBox.height).toBeGreaterThanOrEqual(44);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-light-sidebar-open.png'),
      fullPage: false,
    });

    await closeBtn.focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-light-focus-close.png'),
      fullPage: false,
    });

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-dark-sidebar-open.png'),
      fullPage: false,
    });

    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Colapsar menú lateral' })).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1440-light-shell.png'),
      fullPage: false,
    });

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'Menú de usuario' }).focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1440-dark-focus-user-menu.png'),
      fullPage: false,
    });
  });
});
