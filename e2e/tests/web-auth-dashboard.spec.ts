import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupWebApiMocks, submitPlatformLogin } from './helpers/web-api-mocks';

test.describe('Web auth + dashboard flows', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: [
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
      onUnhandledApiRoute: '404',
    }),
  );

  test('login -> dashboard -> filtro por buscador -> logout', async ({ page }) => {
    await page.goto('/auth/login');
    // Esperar que el formulario de login sea visible antes de scanear
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en página de login
    const loginA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(loginA11y.violations).toEqual([]);

    await submitPlatformLogin(page);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Tenants de la plataforma|Empresas de la plataforma/i)).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Validación WCAG 2.1 AA en dashboard admin
    const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(dashboardA11y.violations).toEqual([]);

    await expect(page.getByRole('cell', { name: 'Demo ISP' })).toBeVisible();

    await page.getByPlaceholder('Buscar por nombre o slug...').fill('fibernet');
    await expect(page.getByRole('cell', { name: 'Fibernet Colombia' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Demo ISP' })).toHaveCount(0);

    // Abrimos menú de usuario y cerramos sesión para validar la navegación de salida.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  });
});
