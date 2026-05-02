import { test, expect } from '@playwright/test';

test.describe('Portal Tenant Auth E2E', () => {
  // Configuración base para el entorno de pruebas del portal
  const PORTAL_URL = process.env.PORTAL_BASE_URL ?? 'http://localhost:3002';
  const TENANT_SLUG = 'isp-demo';

  test.beforeEach(async ({ page }) => {
    // Navegar directamente al login antes de cada prueba
    await page.goto(`${PORTAL_URL}/auth/login`);
  });

  test('debe permitir login exitoso y navegar al dashboard', async ({ page }) => {
    // Registrar mocks ANTES de interactuar — buena práctica Playwright
    await page.route('**/api/v1/auth/login', async (route) => {
      expect(route.request().headers()['x-tenant-slug']).toBe(TENANT_SLUG);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'fake-jwt-token',
          },
        }),
      });
    });

    // Mock del perfil autenticado, sin requerir cambios adicionales
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'usr-123',
            email: 'hash',
            role: 'ADMIN',
            type: 'tenant',
            tenantId: 'tnt-123',
            passwordResetRequired: false,
          },
        }),
      });
    });

    // Llenar formulario y enviar
    await page.getByLabel('Empresa').fill('  ISP-DEMO  ');
    await page.getByLabel('Correo electrónico').fill('admin@isp-demo.com');
    await page.locator('input[name="password"]').fill('Admin123*');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Verificación de redirección al dashboard (estado authenticated)
    await expect(page).toHaveURL(new RegExp('.*/dashboard'));
  });

  test('debe redirigir a verificacion MFA si la cuenta lo requiere (mfa_required)', async ({
    page,
  }) => {
    // Registrar mock ANTES de interactuar
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            mfaRequired: true,
          },
        }),
      });
    });

    await page.getByLabel('Empresa').fill(TENANT_SLUG);
    await page.getByLabel('Correo electrónico').fill('admin@isp-demo.com');
    await page.locator('input[name="password"]').fill('Admin123*');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Verificación de redirección a la verificación TOTP
    await expect(page).toHaveURL(new RegExp('.*/auth/mfa/verify'));
    await expect(page.getByText('Verificación en dos pasos')).toBeVisible();
  });

  test('debe redirigir a configurar MFA si es primer acceso de rol critico (mfa_setup_required)', async ({
    page,
  }) => {
    // Registrar mock ANTES de interactuar
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'limited-token',
            mfaSetupRequired: true,
          },
        }),
      });
    });

    await page.getByLabel('Empresa').fill(TENANT_SLUG);
    await page.getByLabel('Correo electrónico').fill('admin@isp-demo.com');
    await page.locator('input[name="password"]').fill('Admin123*');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Verificación de redirección al flujo setup MFA
    await expect(page).toHaveURL(new RegExp('.*/auth/mfa/setup'));
    await expect(page.getByText('Configurar autenticación segura')).toBeVisible();
  });

  test('debe redirigir a cambio de contraseña si backend lo exige (password_reset_required)', async ({
    page,
  }) => {
    // Registrar mocks ANTES de interactuar
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'fake-jwt-token',
          },
        }),
      });
    });

    // Mock perfil de usuario indicando requerimiento de cambio
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'usr-123',
            email: 'hash',
            role: 'ADMIN',
            type: 'tenant',
            tenantId: 'tnt-123',
            passwordResetRequired: true,
          },
        }),
      });
    });

    await page.getByLabel('Empresa').fill(TENANT_SLUG);
    await page.getByLabel('Correo electrónico').fill('admin@isp-demo.com');
    await page.locator('input[name="password"]').fill('Admin123*');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Verificación de navegación forzosa a cambio de contrasena
    await expect(page).toHaveURL(new RegExp('.*/auth/change-password'));
  });

  test('debe redirigir a cambio de contraseña tras completar MFA cuando sigue siendo primer ingreso', async ({
    page,
  }) => {
    let loginAttempts = 0;

    await page.route('**/api/v1/auth/login', async (route) => {
      loginAttempts += 1;

      if (loginAttempts === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              mfaRequired: true,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'fake-jwt-token',
          },
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'usr-123',
            email: 'hash',
            role: 'ADMIN',
            type: 'tenant',
            tenantId: 'tnt-123',
            passwordResetRequired: true,
          },
        }),
      });
    });

    await page.getByLabel('Empresa').fill(TENANT_SLUG);
    await page.getByLabel('Correo electrónico').fill('admin@isp-demo.com');
    await page.locator('input[name="password"]').fill('Admin123*');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(new RegExp('.*/auth/mfa/verify'));

    const otpInputs = page.locator('input[inputmode="numeric"]');
    await otpInputs.nth(0).fill('1');
    await otpInputs.nth(1).fill('2');
    await otpInputs.nth(2).fill('3');
    await otpInputs.nth(3).fill('4');
    await otpInputs.nth(4).fill('5');
    await otpInputs.nth(5).fill('6');

    await expect(page).toHaveURL(new RegExp('.*/auth/change-password'));
  });
});
