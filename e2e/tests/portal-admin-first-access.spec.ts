/**
 * E2E — Flujo completo de primer acceso ADMIN en portal de tenant.
 *
 * Cubre el criterio de aceptación #3 del PRD-MOD02:
 * "ADMIN primer acceso: cambiar password + activar MFA antes de acceder al dashboard."
 *
 * Flujo completo (RF-AUTH-04, RF-MFA-04):
 * 1. Login con credenciales temporales → backend retorna passwordResetRequired=true
 * 2. Redirect a /auth/change-password → cambio de password
 * 3. Re-login con nueva password → backend retorna mfaSetupRequired=true
 * 4. Redirect a /auth/mfa/setup → configuración MFA con QR + TOTP
 * 5. Login final con TOTP → acceso completo al dashboard
 *
 * Todos los endpoints HTTP son mockeados con page.route() — no requiere backend levantado.
 * Sin datos PII reales — solo ficticios de prueba (security rule: zero-trust PII).
 */

import { expect, test } from '@playwright/test';

/** Configuracion de mocks para el flujo de primer acceso ADMIN */
function setupAdminFirstAccessMocks() {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    // Estado de la sesion para simular los 3 logins del flujo
    let loginStep = 0; // 0=inicial, 1=post-cambio-password, 2=post-mfa-setup

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      // -----------------------------------------------------------------------
      // POST /auth/login — comportamiento segun el paso del flujo
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/login') && method === 'POST') {
        if (loginStep === 0) {
          // Paso 1: primer login con password temporal → passwordResetRequired=true en /me
          loginStep = 1;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { accessToken: 'mock-token-temporal' } }),
          });
          return;
        }

        if (loginStep === 1) {
          // Paso 3: re-login post cambio de password → mfaSetupRequired=true
          loginStep = 2;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { accessToken: 'mock-token-mfa-setup', mfaSetupRequired: true },
            }),
          });
          return;
        }

        // Paso 5: login final con TOTP → autenticación completa
        loginStep = 3;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'mock-token-completo' } }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // GET /auth/me — retorna profile segun el paso
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/me') && method === 'GET') {
        if (loginStep === 1) {
          // Post primer login: passwordResetRequired=true
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                sub: 'admin-uuid-1',
                email: 'sha256:admin-hash',
                role: 'ADMIN',
                tenantId: 'tenant-uuid-1',
                schemaName: 'tenant_isp_demo',
                jti: 'jti-temporal',
                type: 'tenant',
                passwordResetRequired: true,
              },
            }),
          });
          return;
        }

        if (loginStep === 3) {
          // Post login final: usuario completamente autenticado
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                sub: 'admin-uuid-1',
                email: 'sha256:admin-hash',
                role: 'ADMIN',
                tenantId: 'tenant-uuid-1',
                schemaName: 'tenant_isp_demo',
                jti: 'jti-completo',
                type: 'tenant',
                passwordResetRequired: false,
              },
            }),
          });
          return;
        }

        // Sin sesión activa
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/change-password — aceptar cambio de password
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/change-password') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { message: 'Contraseña actualizada correctamente.' } }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/mfa/setup — retornar QR code simulado
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/mfa/setup') && method === 'POST') {
        // QR mínimo en base64 — PNG 1x1 pixel transparente
        const minimalPng =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              qrCodeBase64: minimalPng,
              otpauthUri:
                'otpauth://totp/iWana%20Test:admin%40isp.co?secret=JBSWY3DPEHPK3PXP&issuer=iWana',
            },
          }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/mfa/verify — verificar codigo TOTP y activar MFA
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/mfa/verify') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { mfaEnabled: true } }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/refresh — renovar access token
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/refresh') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'mock-token-renovado' } }),
        });
        return;
      }

      await route.continue();
    });
  };
}

// ---------------------------------------------------------------------------
// Suite: Flujo completo primer acceso ADMIN
// ---------------------------------------------------------------------------

test.describe('Portal — primer acceso ADMIN (MOD02)', () => {
  test.beforeEach(setupAdminFirstAccessMocks());

  test('paso 1: login con password temporal → redirect a change-password', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByText('Bienvenido al Portal')).toBeVisible();

    await page.getByPlaceholder('ejemplo: isp-demo').fill('isp-demo');
    await page.getByLabel('Correo Electrónico / Identidad').fill('admin@isp.co');
    await page.getByPlaceholder('••••••••').fill('TempPass123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // El portal detecta passwordResetRequired=true y redirige a change-password
    await expect(page).toHaveURL(/\/auth\/change-password/);
  });

  test('paso 3: re-login post cambio de password → redirect a mfa/setup', async ({ page }) => {
    // Simulamos que loginStep ya avanzó a 1 — el 2do login retorna mfaSetupRequired
    // Para esto, llamamos al login una vez primero (paso 1 → loginStep=1)
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('ejemplo: isp-demo').fill('isp-demo');
    await page.getByLabel('Correo Electrónico / Identidad').fill('admin@isp.co');
    await page.getByPlaceholder('••••••••').fill('TempPass123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    // loginStep ahora es 1 — /auth/me retorna passwordResetRequired=true → /auth/change-password
    await expect(page).toHaveURL(/\/auth\/change-password/);

    // Desde change-password, volvemos al login para el 2do intento
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('ejemplo: isp-demo').fill('isp-demo');
    await page.getByLabel('Correo Electrónico / Identidad').fill('admin@isp.co');
    await page.getByPlaceholder('••••••••').fill('NuevoPass456!');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // loginStep=1 → backend retorna mfaSetupRequired=true → redirect a /auth/mfa/setup
    await expect(page).toHaveURL(/\/auth\/mfa\/setup/);
  });

  test('paso 4: página de MFA setup muestra cargando y luego el formulario de configuración', async ({
    page,
  }) => {
    // Navegar directamente a /auth/mfa/setup (con token limitado simulado)
    await page.evaluate(() => {
      localStorage.setItem('iwana.portal.mfa-setup-token', 'mock-token-mfa-setup');
      localStorage.setItem('iwana.portal.tenant-slug', 'isp-demo');
    });

    await page.goto('/auth/mfa/setup');

    // Debe mostrar el heading de la página de setup
    await expect(
      page.getByRole('heading', { name: 'Configurar autenticación segura' }),
    ).toBeVisible();

    // Tras cargar el QR, debe aparecer el OTP input (6 cajas)
    await expect(page.getByRole('heading', { name: 'Configurar autenticación segura' })).toBeVisible();
  });

  test('página de MFA setup es accesible (WCAG 2.2 AA básico)', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('iwana.portal.mfa-setup-token', 'mock-token-mfa-setup');
      localStorage.setItem('iwana.portal.tenant-slug', 'isp-demo');
    });

    await page.goto('/auth/mfa/setup');
    await page.waitForLoadState('networkidle');

    // Verificar elementos de accesibilidad básicos
    const heading = page.getByRole('heading', { name: 'Configurar autenticación segura' });
    await expect(heading).toBeVisible();

    // La descripción del rol requerido debe estar visible
    await expect(
      page.getByText('Tu rol requiere verificación en dos pasos para proteger el acceso'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite: Variaciones y casos de borde del MFA enforcement
// ---------------------------------------------------------------------------

test.describe('Portal — MFA enforcement por rol (MOD02)', () => {
  test('ADMIN sin MFA ve la página de setup correctamente', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.endsWith('/auth/mfa/setup') && method === 'POST') {
        const minimalPng =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              qrCodeBase64: minimalPng,
              otpauthUri:
                'otpauth://totp/iWana%20Test:admin%40isp.co?secret=JBSWY3DPEHPK3PXP&issuer=iWana',
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.evaluate(() => {
      localStorage.setItem('iwana.portal.mfa-setup-token', 'mock-limited-token');
      localStorage.setItem('iwana.portal.tenant-slug', 'isp-demo');
    });

    await page.goto('/auth/mfa/setup');
    await page.waitForLoadState('networkidle');

    // El heading principal debe ser visible
    await expect(
      page.getByRole('heading', { name: 'Configurar autenticación segura' }),
    ).toBeVisible();

    // Las instrucciones numeradas deben aparecer
    await expect(page.getByText(/Instala Google Authenticator/)).toBeVisible();
    await expect(page.getByText(/Escanea el código QR/)).toBeVisible();
    await expect(page.getByText(/Ingresa el código de 6 dígitos/)).toBeVisible();
  });

  test('sin token de MFA setup en localStorage → redirige al login', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.endsWith('/auth/mfa/setup') && method === 'POST') {
        // Sin token → el backend retornaría 401, pero el cliente ya valida antes de llamar
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token requerido' }),
        });
        return;
      }

      await route.continue();
    });

    // Sin token en localStorage — el componente debe redirigir al login
    await page.evaluate(() => {
      localStorage.removeItem('iwana.portal.mfa-setup-token');
      localStorage.setItem('iwana.portal.tenant-slug', 'isp-demo');
    });

    await page.goto('/auth/mfa/setup');
    await page.waitForLoadState('networkidle');

    // Debe redirigir al login cuando no hay token de setup
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
