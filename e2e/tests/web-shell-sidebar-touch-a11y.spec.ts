/**
 * Evidencia G6 residual: targets táctiles ≥44 px (getBoundingClientRect) +
 * capturas autenticadas 375/1440 claro/oscuro + anillo focus-visible.
 *
 * SEGURIDAD: sesión vía mocks E2E (sin PII real ni credenciales productivas).
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { setupWebApiMocks, submitPlatformLogin } from './helpers/web-api-mocks';

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-web-shell-sidebar-touch');

async function loginToDashboard(page: Page) {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await submitPlatformLogin(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
}

async function openMobileSidebar(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button', {
      name: 'Cerrar menu',
    }),
  ).toBeVisible();
}

async function measureBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'boundingBox disponible').toBeTruthy();
  return box!;
}

test.describe('Web shell sidebar — touch targets + evidencia visual', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: [
        {
          id: 'tenant-1',
          name: 'Demo ISP',
          slug: 'demo-isp',
          schemaName: 'tenant_demo_isp',
          status: 'ACTIVE',
          contactEmail: 'hash:contact-1',
          maxSubscribers: 500,
          settings: {},
          createdAt: '2026-03-12T09:00:00.000Z',
          updatedAt: '2026-03-13T10:00:00.000Z',
        },
      ],
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-T1: hitboxes ≥ 44×44 px a 375 + capturas claro/oscuro/focus', async ({ page }) => {
    await loginToDashboard(page);
    await openMobileSidebar(page);

    const sidebar = page.getByRole('complementary', { name: 'Navegación principal' });
    const closeBtn = sidebar.getByRole('button', { name: 'Cerrar menu' });
    const closeBox = await measureBox(closeBtn);
    expect(closeBox.width, 'cierre ancho').toBeGreaterThanOrEqual(44);
    expect(closeBox.height, 'cierre alto').toBeGreaterThanOrEqual(44);

    const asideBrand = sidebar.locator('a[href="/dashboard"]').first();
    const brandBox = await measureBox(asideBrand);
    expect(brandBox.height, 'marca alto').toBeGreaterThanOrEqual(44);

    const navLink = page
      .getByRole('navigation', { name: 'Menú principal' })
      .getByRole('link')
      .first();
    const navBox = await measureBox(navLink);
    expect(navBox.height, 'nav alto').toBeGreaterThanOrEqual(44);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-light-sidebar-open.png'),
      fullPage: false,
    });

    await closeBtn.focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-light-focus-close.png'),
      fullPage: false,
    });

    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-dark-sidebar-open.png'),
      fullPage: false,
    });

    await closeBtn.focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375-dark-focus-close.png'),
      fullPage: false,
    });

    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1440-light-shell.png'),
      fullPage: false,
    });

    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1440-dark-shell.png'),
      fullPage: false,
    });

    const userMenu = page.getByRole('button', { name: 'Menú de usuario' });
    await userMenu.focus();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1440-dark-focus-user-menu.png'),
      fullPage: false,
    });
  });
});
