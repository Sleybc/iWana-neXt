import { expect, test, type Page } from '@playwright/test';
import { loginToDashboard, setupWebApiMocks } from './helpers/web-api-mocks';

// Plan 2026-11-25 (T2, T3, T7): Identidad con borrador sin guardar, pestañas con activación
// manual y mensaje de éxito de Mi cuenta, contra la API simulada de la consola.

test.beforeEach(setupWebApiMocks({ onUnhandledApiRoute: '404' }));

const SAVED_LOGO = '/brand/iwiso6.png';
const DRAFT_LOGO = '/brand/favicon-gecko.svg';

async function openIdentity(page: Page) {
  await loginToDashboard(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Identidad de la consola' })).toBeVisible();
  await expect(page.getByLabel('Producto', { exact: false }).first()).toHaveValue('iWana neXt');
}

/** Abre «Opciones avanzadas» del logo si está cerrado (al volver, Next.js puede conservar el DOM). */
async function openLogoAdvanced(page: Page) {
  const details = page.locator('details').first();
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await details.getByText('Opciones avanzadas de la imagen').click();
  }
}

async function draftLogo(page: Page) {
  await openLogoAdvanced(page);
  const logoUrl = page.getByRole('textbox', { name: 'Logo', exact: true });
  await expect(logoUrl).toHaveValue(SAVED_LOGO);
  await logoUrl.fill(DRAFT_LOGO);
  await expect(page.getByRole('img', { name: 'Logo de plataforma' })).toHaveAttribute(
    'src',
    DRAFT_LOGO,
  );
  return logoUrl;
}

const identityTab = (page: Page) => page.getByRole('tab', { name: /^Identidad/ });
const leaveDialog = (page: Page) => page.getByRole('dialog', { name: '¿Salir sin guardar?' });
const sidebarCompanies = (page: Page) =>
  page.getByRole('navigation').getByRole('link', { name: 'Empresas', exact: true }).first();

test('el borrador de imagen avisa al salir, se conserva al seguir y se descarta al salir', async ({
  page,
}) => {
  await openIdentity(page);
  const logoUrl = await draftLogo(page);
  await expect(identityTab(page)).toHaveAccessibleName('Identidad (cambios sin guardar)');

  // Cambiar de pestaña no pregunta y conserva el borrador.
  await page.getByRole('tab', { name: 'Seguridad' }).click();
  await expect(page).toHaveURL(/[?&]seccion=seguridad(?:&|$)/);
  await expect(leaveDialog(page)).toBeHidden();
  await identityTab(page).click();
  await expect(page).toHaveURL(/[?&]seccion=identidad(?:&|$)/);
  await expect(identityTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(logoUrl).toBeVisible();
  await expect(logoUrl).toHaveValue(DRAFT_LOGO);

  // Enlace interno: «Seguir editando» (y Esc) se quedan con el borrador.
  await sidebarCompanies(page).click();
  await expect(leaveDialog(page)).toBeVisible();
  await expect(leaveDialog(page).getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(leaveDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings/);
  await expect(logoUrl).toHaveValue(DRAFT_LOGO);

  // Atrás del navegador también pregunta y deja la página donde está.
  await page.goBack();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(logoUrl).toHaveValue(DRAFT_LOGO);

  // «Salir sin guardar» navega; al volver, la imagen guardada se restablece.
  await sidebarCompanies(page).click();
  await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/tenants/);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings/);
  await openLogoAdvanced(page);
  await expect(page.getByRole('textbox', { name: 'Logo', exact: true })).toHaveValue(SAVED_LOGO);
  await expect(identityTab(page)).toHaveAccessibleName('Identidad');
});

test('tras guardar no hay aviso al salir', async ({ page }) => {
  await openIdentity(page);
  await draftLogo(page);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Identidad guardada.')).toBeVisible();
  await expect(identityTab(page)).toHaveAccessibleName('Identidad');

  await sidebarCompanies(page).click();
  await expect(page).toHaveURL(/\/tenants/);
  await expect(leaveDialog(page)).toBeHidden();
});

async function mockGlobalSearch(page: Page) {
  await page.route('**/api/v1/search/global?**', (route) =>
    route.fulfill({
      json: {
        data: {
          query: 'empresas',
          tookMs: 1,
          groups: [
            {
              type: 'modules',
              label: 'Secciones',
              total: 1,
              items: [
                {
                  id: 'tenants',
                  type: 'module',
                  title: 'Empresas',
                  subtitle: 'Directorio de empresas',
                  meta: 'Ruta rápida',
                  route: '/tenants',
                  highlights: [],
                },
              ],
            },
          ],
        },
      },
    }),
  );
}

async function searchAndOpenFirst(page: Page) {
  const search = page.getByRole('combobox', { name: 'Buscar en la plataforma' });
  await search.click();
  await search.fill('empresas');
  await expect(page.getByRole('option', { name: /Empresas/ }).first()).toBeVisible();
  await search.press('Enter');
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
}

test('buscador global y «Cerrar sesión» piden confirmación con cambios en Identidad', async ({
  page,
}) => {
  await mockGlobalSearch(page);
  await openIdentity(page);
  const logoUrl = await draftLogo(page);

  // Buscador: «Seguir editando» se queda con el borrador.
  await searchAndOpenFirst(page);
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(logoUrl).toHaveValue(DRAFT_LOGO);

  // Cerrar sesión: «Seguir editando» no cierra la sesión.
  await logout(page);
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(logoUrl).toHaveValue(DRAFT_LOGO);

  // Buscador: «Salir sin guardar» completa la navegación al resultado.
  await searchAndOpenFirst(page);
  await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/tenants/);
});

test('«Salir sin guardar» desde «Cerrar sesión» termina la sesión', async ({ page }) => {
  await openIdentity(page);
  await draftLogo(page);
  await logout(page);
  await leaveDialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('sin cambios, buscador y «Cerrar sesión» no preguntan', async ({ page }) => {
  await mockGlobalSearch(page);
  await openIdentity(page);
  await searchAndOpenFirst(page);
  await expect(page).toHaveURL(/\/tenants/);
  await expect(leaveDialog(page)).toBeHidden();
  await logout(page);
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(leaveDialog(page)).toBeHidden();
});

test('las flechas mueven el foco entre secciones y Enter cambia la URL', async ({ page }) => {
  await openIdentity(page);
  await identityTab(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Seguridad' })).toBeFocused();
  await expect(identityTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page).not.toHaveURL(/seccion=/);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]seccion=seguridad(?:&|$)/);
  await expect(page.getByRole('tab', { name: 'Seguridad' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('Mi cuenta anuncia el perfil guardado en una región de estado', async ({ page }) => {
  await loginToDashboard(page);
  await page.goto('/profile');
  const firstName = page.getByLabel('Nombres');
  await expect(firstName).toHaveValue('Admin');
  await firstName.fill('Administradora');
  await page.getByRole('button', { name: 'Guardar cambios' }).first().click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Perfil actualizado correctamente.' }),
  ).toBeVisible();
});
