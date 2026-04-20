import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function setupPortalApiMocks() {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    let isLoggedIn = false;

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (url.endsWith('/auth/login') && method === 'POST') {
        isLoggedIn = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'portal-mock-token' } }),
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
              sub: '2f145de2-aaaa-4abc-9e08-3b768a194777',
              email: 'sha256:subscriber-hash',
              role: 'ADMIN',
              tenantId: 'tenant-portal-1',
              schemaName: 'tenant_isp_demo',
              jti: 'portal-jti-1',
              type: 'tenant',
            },
          }),
        });
        return;
      }

      if (url.includes('/audit-logs') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'audit-1',
                tenantId: 'tenant-portal-1',
                userId: 'user-1',
                action: 'LOGIN',
                entityType: 'User',
                entityId: 'user-1',
                oldValue: null,
                newValue: { status: 'authenticated' },
                ipAddress: null,
                userAgent: null,
                requestId: 'req-1',
                createdAt: '2026-03-13T12:30:00.000Z',
              },
            ],
          }),
        });
        return;
      }

      if (url.includes('/dashboard/summary') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              tenantName: 'ISP Prueba Colombia',
              activeSubscribers: 42,
              pendingInstallations: 3,
              overdueInvoices: 1,
              uptimePercent: 99.5,
              alerts: [],
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

      if (url.endsWith('/auth/refresh') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'portal-mock-token' } }),
        });
        return;
      }

      await route.continue();
    });
  };
}

test.describe('Portal auth + notifications', () => {
  test.beforeEach(setupPortalApiMocks());

  test('login tenant -> dashboard -> notificaciones -> logout', async ({ page }) => {
    await page.goto('/auth/login');

    // Esperar que el formulario del portal sea visible antes de scanear
    await expect(page.getByText('Bienvenido al Portal')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en página de login del portal
    const loginA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(loginA11y.violations).toEqual([]);

    await page.getByPlaceholder('ejemplo: isp-demo').fill('isp-demo');
    await page.getByLabel('Correo Electrónico / Identidad').fill('suscriptor@iwana.local');
    await page.getByPlaceholder('••••••••').fill('Password123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Panel empresarial' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en dashboard del portal
    const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(dashboardA11y.violations).toEqual([]);

    // Check básico de navegación en dashboard autenticado.
    await expect(page.getByRole('heading', { name: 'Panel empresarial' })).toBeVisible();

    await page.getByRole('button', { name: 'Notificaciones' }).click();
    await expect(page.getByText('Notificaciones del portal')).toBeVisible();
    await expect(page.getByText('Inicio de sesión · Usuario')).toBeVisible();

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText('Bienvenido al Portal')).toBeVisible();
  });
});
