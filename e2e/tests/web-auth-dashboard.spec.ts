import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function setupWebApiMocks() {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    let isLoggedIn = false;

    // Mock central de API para mantener el flujo E2E estable sin dependencia del backend local.
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (url.endsWith('/auth/platform/login') && method === 'POST') {
        isLoggedIn = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              accessToken: 'mock-access-token',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/auth/me') && method === 'GET') {
        if (!isLoggedIn) {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              sub: '8f145de2-1111-4abc-9e08-3b768a194001',
              email: 'sha256:admin-hash',
              role: 'system_admin',
              tenantId: null,
              schemaName: null,
              jti: 'jti-123',
              type: 'platform',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/auth/logout') && method === 'POST') {
        isLoggedIn = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { message: 'Sesion cerrada correctamente.' } }),
        });
        return;
      }

      if (url.includes('/tenants') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'tenant-1',
                name: 'Demo ISP',
                slug: 'demo-isp',
                schemaName: 'tenant_demo_isp',
                status: 'PROVISIONING_FAILED',
                contactEmail: 'hash:contact-1',
                maxSubscribers: 500,
                settings: {},
                createdAt: '2026-03-12T09:00:00.000Z',
                updatedAt: '2026-03-13T10:00:00.000Z',
              },
              {
                id: 'tenant-2',
                name: 'Fibernet Colombia',
                slug: 'fibernet-col',
                schemaName: 'tenant_fibernet_col',
                status: 'ACTIVE',
                contactEmail: 'hash:contact-2',
                maxSubscribers: 1200,
                settings: {},
                createdAt: '2026-03-11T10:00:00.000Z',
                updatedAt: '2026-03-13T09:30:00.000Z',
              },
            ],
          }),
        });
        return;
      }

      if (url.endsWith('/auth/refresh') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'mock-access-token' } }),
        });
        return;
      }

      await route.continue();
    });
  };
}

test.describe('Web auth + dashboard flows', () => {
  test.beforeEach(setupWebApiMocks());

  test('login -> dashboard -> filtro por buscador -> logout', async ({ page }) => {
    await page.goto('/auth/login');
    // Esperar que el formulario de login sea visible antes de scanear
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en página de login
    const loginA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(loginA11y.violations).toEqual([]);

    await page.getByLabel('Correo Electrónico / Identidad').fill('admin@iwana.local');
    await page.getByPlaceholder('••••••••').fill('Password123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Tenants de la plataforma')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en dashboard admin
    const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(dashboardA11y.violations).toEqual([]);

    await expect(page.getByRole('cell', { name: 'Demo ISP' })).toBeVisible();

    await page.getByPlaceholder('Buscar o escribir un comando...').fill('fibernet');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/q=fibernet/);
    await expect(page.getByRole('cell', { name: 'Fibernet Colombia' })).toBeVisible();

    // Abrimos menú de usuario y cerramos sesión para validar la navegación de salida.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  });
});
