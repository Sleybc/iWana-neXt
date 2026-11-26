import { expect, test } from '@playwright/test';
import { loginToDashboard, setupWebApiMocks } from './helpers/web-api-mocks';

const pageSize = 20;
const accounts = Array.from({ length: 22 }, (_, index) => ({
  id: `account-${index}`,
  firstName: index >= pageSize ? 'Cuenta objetivo' : 'Cuenta de prueba',
  lastName: String(index + 1),
  role: 'IWANA_SUPPORT',
  status: index === pageSize ? 'SUSPENDED' : 'ACTIVE',
  mfaEnabled: true,
  passwordResetRequired: false,
  lastLoginAt: null,
}));

test.beforeEach(setupWebApiMocks({ onUnhandledApiRoute: '404' }));

test('busca en todo el directorio, combina estados y vuelve a la primera página', async ({
  page,
}) => {
  await page.route('**/api/v1/platform-users?page=*', (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({
      json: {
        data: {
          total: accounts.length,
          pageSize,
          items: accounts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        },
      },
    });
  });
  const queries: Array<{ page: number; search?: string; status?: string }> = [];
  await page.route('**/api/v1/platform-users/search', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(new URL(route.request().url()).search).toBe('');
    const query = route.request().postDataJSON() as (typeof queries)[number];
    queries.push(query);
    const matches = accounts.filter(
      (account) =>
        (!query.search ||
          `${account.firstName} ${account.lastName}`
            .toLowerCase()
            .includes(query.search.toLowerCase())) &&
        (!query.status || account.status === query.status),
    );
    return route.fulfill({
      json: {
        data: {
          total: matches.length,
          pageSize,
          items: matches.slice((query.page - 1) * pageSize, query.page * pageSize),
        },
      },
    });
  });

  await loginToDashboard(page);
  await page.goto('/platform-users');
  const accountsList = page.getByRole('list', { name: 'Cuentas de plataforma' });
  await expect(accountsList.getByRole('button', { name: /Cuenta objetivo/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(accountsList.getByRole('button', { name: /Cuenta objetivo/ })).toHaveCount(2);

  const search = page.getByRole('searchbox', { name: 'Buscar por nombre' });
  await search.fill('  cuenta   objetivo  ');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: '2 cuentas de plataforma' })).toBeVisible();
  expect(queries.at(-1)).toEqual({ page: 1, search: 'cuenta objetivo' });

  const status = page.getByRole('combobox', { name: 'Filtrar por estado' });
  await status.click();
  await page.getByRole('option', { name: 'Suspendidas', exact: true }).click();
  await expect(accountsList.getByRole('button')).toHaveCount(1);
  await expect(accountsList.getByRole('button', { name: /Cuenta objetivo 21/ })).toBeVisible();
  expect(queries.at(-1)).toEqual({ page: 1, search: 'cuenta objetivo', status: 'SUSPENDED' });

  await search.fill('Sin coincidencia');
  await search.press('Enter');
  await expect(page.getByText('No encontramos cuentas con esos filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.getByRole('heading', { name: '22 cuentas de plataforma' })).toBeVisible();
  await expect(accountsList.getByRole('button')).toHaveCount(20);
  await expect(search).toHaveValue('');
  await expect(status).toHaveText('Todos los estados');

  await page.setViewportSize({ width: 320, height: 740 });
  await expect(search).toBeVisible();
  await expect(status).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
