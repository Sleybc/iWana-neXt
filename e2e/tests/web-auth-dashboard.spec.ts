import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupWebApiMocks, submitPlatformLogin } from './helpers/web-api-mocks';

const SIGNAL_CHIP_LABELS = [
  'Activas',
  'En configuración',
  'Requieren atención',
  'Cambios esta semana',
] as const;

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

  test('login -> portada de señal -> buscador en /tenants -> logout', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const loginA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(loginA11y.violations).toEqual([]);

    await submitPlatformLogin(page);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const signal = page.getByRole('region', { name: 'Resumen operativo' });
    await expect(signal).toBeVisible();
    for (const label of SIGNAL_CHIP_LABELS) {
      await expect(signal.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(
      signal.getByText(/^(Activas|En configuración|Requieren atención|Cambios esta semana)$/),
    ).toHaveCount(4);

    await expect(page.getByRole('cell')).toHaveCount(0);
    await expect(page.getByText('Directorio de empresas')).toHaveCount(0);
    await expect(page.getByLabel('Buscar empresa')).toHaveCount(0);
    await expect(
      page.getByPlaceholder('Buscar por empresa, contacto o identificador...'),
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Ver todas las empresas' }).click();
    await expect(page).toHaveURL(/\/tenants/);
    await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Buscar empresa' }).fill('fibernet');
    await expect(page.getByRole('cell', { name: /Fibernet Colombia/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Demo ISP/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  });

  test('D-8: /dashboard post-login sin violaciones wcag2a+wcag2aa', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await submitPlatformLogin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Resumen operativo' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(dashboardA11y.violations).toEqual([]);
  });
});
