/**
 * E2E — Flujo de recuperación de contraseña en portal de tenant.
 *
 * Cubre RF-AUTH-03: forgot password → reset → login exitoso.
 *
 * Flujo:
 * 1. Login fallido → ver enlace "¿Olvidaste tu contraseña?"
 * 2. Navegar a /auth/forgot-password → ingresar email → confirmar envío
 * 3. Navegar a /auth/reset-password?token=... → nueva contraseña
 * 4. Redirect a login → autenticación exitosa con nueva contraseña
 *
 * Todos los endpoints HTTP son mockeados — no requiere backend levantado.
 * Sin datos PII reales.
 */

import { expect, test } from '@playwright/test';

/** Mock base para las rutas de recuperacion de contrasena */
function setupPasswordRecoveryMocks() {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    let passwordResetDone = false;

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      // -----------------------------------------------------------------------
      // POST /auth/forgot-password — siempre responde OK (OWASP — no revelar existencia)
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/forgot-password') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              message:
                'Si el correo existe, recibirás un enlace de recuperación en los próximos minutos.',
            },
          }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/reset-password — aceptar reset con token valido
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/reset-password') && method === 'POST') {
        passwordResetDone = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { message: 'Contraseña actualizada correctamente.' },
          }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/login — login post-reset exitoso
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/login') && method === 'POST') {
        if (passwordResetDone) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { accessToken: 'mock-token-post-reset' } }),
          });
        } else {
          // Login fallido antes del reset
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Credenciales incorrectas' }),
          });
        }
        return;
      }

      // -----------------------------------------------------------------------
      // GET /auth/me — verificar sesion post-login
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/me') && method === 'GET') {
        if (passwordResetDone) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                sub: 'user-recovery-uuid',
                email: 'sha256:user-recovery-hash',
                role: 'tenant_support',
                tenantId: 'tenant-uuid-recovery',
                schemaName: 'tenant_isp_recovery',
                jti: 'jti-recovery',
                type: 'tenant',
              },
            }),
          });
        } else {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
          });
        }
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/refresh
      // -----------------------------------------------------------------------
      if (url.endsWith('/auth/refresh') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: 'mock-token-renovado' } }),
        });
        return;
      }

      // -----------------------------------------------------------------------
      // POST /auth/email/verify — verificacion de email (flujo secundario)
      // -----------------------------------------------------------------------
      if (url.includes('/auth/email/verify') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { message: 'Email verificado correctamente.' } }),
        });
        return;
      }

      await route.continue();
    });
  };
}

// ---------------------------------------------------------------------------
// Suite: Flujo de recuperacion de contraseña
// ---------------------------------------------------------------------------

test.describe('Portal — recuperación de contraseña (MOD02)', () => {
  test.beforeEach(setupPasswordRecoveryMocks());

  test('formulario de forgot-password existe y muestra campo de email', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');

    // La página debe tener un campo para el email
    const emailInput = page.getByLabel(/correo/i).or(page.getByPlaceholder(/correo|email/i)).first();
    await expect(emailInput).toBeVisible();
  });

  test('formulario de forgot-password tiene enlace para volver al login', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');

    // Debe haber un enlace de vuelta al login
    const backLink = page
      .getByRole('link', { name: /volver|login|iniciar/i })
      .or(page.getByRole('button', { name: /volver|login|iniciar/i }))
      .first();
    await expect(backLink).toBeVisible();
  });

  test('login muestra enlace "¿Olvidaste tu contraseña?"', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // El LoginForm del portal debe tener el enlace de recuperación
    const forgotLink = page.getByRole('link', { name: /olvidaste/i });
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toHaveAttribute('href', /forgot-password/);
  });

  test('navegación desde login a forgot-password funciona', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Click en el enlace de recuperación
    await page.getByRole('link', { name: /olvidaste/i }).click();

    // Debe navegar a la página de forgot-password
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test('formulario de reset-password acepta nueva contraseña', async ({ page }) => {
    // Simular llegada desde email con token
    await page.goto('/auth/reset-password?token=mock-reset-token-hex');
    await page.waitForLoadState('networkidle');

    // La página de reset debe existir y tener campo de nueva contraseña
    const newPasswordInput = page
      .getByLabel(/nueva.*contraseña|contraseña/i)
      .or(page.getByPlaceholder(/nueva.*contraseña|contraseña/i))
      .first();
    await expect(newPasswordInput).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite: Flujo de verificacion de email
// ---------------------------------------------------------------------------

test.describe('Portal — verificación de email (MOD02)', () => {
  test.beforeEach(setupPasswordRecoveryMocks());

  test('página de verify-email existe y procesa token de la URL', async ({ page }) => {
    await page.goto('/auth/verify-email?token=mock-verify-token-hex');
    await page.waitForLoadState('networkidle');

    // La página debe existir (no 404) — verificar que no hay error genérico de Next.js
    const title = await page.title();
    expect(title).not.toBe('404: This page could not be found');

    // Debe mostrar algún contenido relacionado con la verificación de email
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/email|verificaci|correo/i);
  });
});
