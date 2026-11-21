import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  buildTenantSummaryMock,
  DASHBOARD_TENANTS,
  loginToDashboard,
  setupWebApiMocks,
  submitPlatformLogin,
} from './helpers/web-api-mocks';

/** Q-1: WCAG 2.2 AA completo (CA-4). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

const SIGNAL_CHIP_LABELS = [
  'Activas',
  'En configuración',
  'Requieren atención',
  'Cambios esta semana',
] as const;

async function expectNoAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations).toEqual([]);
}

test.describe('Web auth + dashboard flows', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: DASHBOARD_TENANTS,
      onUnhandledApiRoute: '404',
    }),
  );

  test('login -> portada de señal -> buscador en /tenants -> logout', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expectNoAxeViolations(page);

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

  for (const viewport of [
    { name: '1280', width: 1280, height: 800 },
    { name: '375', width: 375, height: 812 },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`D-8 / CA-4: /dashboard sin violaciones WCAG 2.2 AA a ${viewport.name} px, tema ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript((value) => {
          try {
            window.localStorage.setItem('iwana-theme', value);
          } catch {
            /* sin almacenamiento: el tema queda por defecto y la aserción lo detecta */
          }
        }, theme);
        await page.emulateMedia({ colorScheme: theme });

        await loginToDashboard(page);
        await expect(page.getByRole('region', { name: 'Resumen operativo' })).toBeVisible();
        await page.waitForLoadState('networkidle');
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
        }

        await expectNoAxeViolations(page);
      });
    }
  }
});

test.describe('Web dashboard — cifras del resumen por estado (E-1)', () => {
  const SUMMARY_233 = buildTenantSummaryMock(DASHBOARD_TENANTS, {
    total: 233,
    byStatus: {
      PROVISIONING: 12,
      ACTIVE: 190,
      SUSPENDED: 9,
      INACTIVE: 7,
      MARKED_FOR_DELETION: 4,
      PROVISIONING_FAILED: 11,
    },
    updatedLast7Days: 37,
  });

  test.beforeEach(
    setupWebApiMocks({
      tenants: DASHBOARD_TENANTS,
      tenantSummary: SUMMARY_233,
      onUnhandledApiRoute: '404',
    }),
  );

  test('con 233 empresas los chips muestran el resumen y no el tope de 100 de la lista', async ({
    page,
  }) => {
    const listRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname, searchParams } = new URL(request.url());
      if (pathname.endsWith('/api/v1/tenants') && searchParams.get('limit') === '100') {
        listRequests.push(request.url());
      }
    });

    await loginToDashboard(page);
    const signal = page.getByRole('region', { name: 'Resumen operativo' });
    await expect(signal).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Requieren atención = PROVISIONING_FAILED + SUSPENDED + MARKED_FOR_DELETION.
    const expected: Record<(typeof SIGNAL_CHIP_LABELS)[number], string> = {
      Activas: '190',
      'En configuración': '12',
      'Requieren atención': '24',
      'Cambios esta semana': '37',
    };
    for (const label of SIGNAL_CHIP_LABELS) {
      const chip = signal.getByText(label, { exact: true }).locator('..');
      await expect(chip).toContainText(expected[label]);
    }
    await expect(page.getByText('233 empresas', { exact: true })).toBeVisible();
    expect(listRequests).toEqual([]);
  });
});
