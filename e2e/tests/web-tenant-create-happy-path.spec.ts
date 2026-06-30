import { expect, test } from '@playwright/test';
import { loginAsPlatformAdmin } from './helpers/web-api-mocks';

const platformEmail = process.env['E2E_PLATFORM_EMAIL'];
const platformPassword = process.env['E2E_PLATFORM_PASSWORD'];

test.skip(
  !platformEmail || !platformPassword,
  'Configura E2E_PLATFORM_EMAIL y E2E_PLATFORM_PASSWORD para ejecutar contra infraestructura real.',
);

test.describe('Web tenant create happy path real', () => {
  test('SYSTEM_ADMIN crea empresa, espera provisioning y consulta acceso inicial', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const suffix = Date.now().toString(36);
    const tenantName = `Empresa E2E ${suffix}`;
    const tenantSlug = `empresa-e2e-${suffix}`.slice(0, 55);

    await loginAsPlatformAdmin(page, {
      email: platformEmail!,
      password: platformPassword!,
    });

    await page.getByRole('link', { name: 'Empresas' }).click();
    await page.getByRole('link', { name: 'Nueva empresa' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva empresa' })).toBeVisible();

    await page.getByLabel('Nombre comercial').fill(tenantName);
    await page.getByLabel('Identificador (slug)').fill(tenantSlug);
    await page.getByLabel('Email de contacto').fill(`ops+${suffix}@example.test`);

    await page.getByRole('button', { name: 'Crear empresa' }).click();

    await expect(page.getByText(new RegExp(`${tenantName}.*activa y lista`, 'i'))).toBeVisible({
      timeout: 120_000,
    });

    await page.getByRole('button', { name: 'Ver acceso inicial' }).click();
    const credentialsDialog = page.getByRole('dialog', {
      name: 'Acceso del administrador inicial',
    });

    await expect(credentialsDialog).toBeVisible();
    await expect(credentialsDialog.getByText('admin@iwana.co')).toBeVisible();
    await expect(credentialsDialog.getByText('Contraseña temporal:')).toBeVisible();
  });
});
