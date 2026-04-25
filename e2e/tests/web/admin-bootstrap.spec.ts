import { expect, test } from '@playwright/test';

function buildMockJwt(expirationSecondsFromNow = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expirationSecondsFromNow }),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.signature`;
}

function setupAdminBootstrapMocks() {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    let tenantStatus: 'PROVISIONING' | 'ACTIVE' = 'PROVISIONING';
    let platformMfaEnabled = false;
    let platformProfile = {
      id: 'platform-user-id',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
      mfaEnabled: false,
      firstName: 'Admin',
      lastName: 'Plataforma',
      phone: '+573001112233',
      timezone: 'America/Bogota',
      language: 'es-CO',
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let tenantSettings = {
      tenantId: 'tenant-1',
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'CO',
      maxSubscribers: 100,
      features: {
        billing: false,
        mfa_required_all: false,
      },
    };
    let users = [
      {
        id: 'user-1',
        role: 'NOC',
        status: 'PENDING_VERIFICATION',
        tenantId: 'tenant-1',
        mfaEnabled: false,
        emailVerified: false,
        passwordResetRequired: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (url.endsWith('/auth/platform/login') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: buildMockJwt() } }),
        });
        return;
      }

      if (url.endsWith('/auth/me') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              sub: 'platform-user-id',
              email: 'hash',
              role: 'SYSTEM_ADMIN',
              tenantId: null,
              schemaName: null,
              jti: 'jti-1',
              type: 'platform',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/platform-users/me') && method === 'GET') {
        platformProfile = {
          ...platformProfile,
          mfaEnabled: platformMfaEnabled,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: platformProfile,
          }),
        });
        return;
      }

      if (url.endsWith('/platform-users/me') && method === 'PATCH') {
        const payload = request.postDataJSON() as {
          firstName?: string;
          lastName?: string;
          phone?: string;
          timezone?: string;
          language?: string;
        };
        platformProfile = {
          ...platformProfile,
          ...payload,
          mfaEnabled: platformMfaEnabled,
          updatedAt: new Date().toISOString(),
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: platformProfile,
          }),
        });
        return;
      }

      if (url.endsWith('/auth/mfa/setup') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7Vj8AAAAASUVORK5CYII=',
              otpauthUri: 'otpauth://totp/iwana?secret=ABC123&issuer=iwana',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/auth/mfa/verify') && method === 'POST') {
        platformMfaEnabled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { mfaEnabled: true } }),
        });
        return;
      }

      if (url.endsWith('/auth/mfa/disable') && method === 'POST') {
        platformMfaEnabled = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { mfaEnabled: false } }),
        });
        return;
      }

      if (url.endsWith('/tenants') && method === 'POST') {
        tenantStatus = 'PROVISIONING';
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'tenant-1',
              name: 'Empresa Demo',
              slug: 'empresa-demo',
              schemaName: 'tenant_empresa_demo',
              status: 'PROVISIONING',
              contactEmail: 'ops@example.test',
              maxSubscribers: 100,
              settings: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }

      if (url.endsWith('/tenants/tenant-1') && method === 'GET') {
        tenantStatus = tenantStatus === 'PROVISIONING' ? 'ACTIVE' : 'ACTIVE';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'tenant-1',
              name: 'Empresa Demo',
              slug: 'empresa-demo',
              schemaName: 'tenant_empresa_demo',
              status: tenantStatus,
              contactEmail: 'ops@example.test',
              maxSubscribers: 100,
              settings: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }

      if (url.includes('/regenerate-admin-credentials') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              message: 'ok',
              adminEmail: 'admin@empresa-demo.test',
              temporaryPassword: 'TempPass123!',
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          }),
        });
        return;
      }

      if (url.endsWith('/tenants/tenant-1/settings') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: tenantSettings }),
        });
        return;
      }

      if (url.endsWith('/tenants/tenant-1/settings') && method === 'PATCH') {
        const payload = request.postDataJSON() as typeof tenantSettings;
        tenantSettings = {
          ...tenantSettings,
          ...payload,
          features: {
            ...tenantSettings.features,
            ...payload.features,
          },
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: tenantSettings }),
        });
        return;
      }

      if (url.includes('/tenants?limit=100&offset=0') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'tenant-1',
                name: 'Empresa Demo',
                slug: 'empresa-demo',
                schemaName: 'tenant_empresa_demo',
                status: 'ACTIVE',
                contactEmail: 'ops@example.test',
                maxSubscribers: 100,
                settings: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        });
        return;
      }

      if (/\/users(?:\?.*)?$/.test(url) && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              data: users,
              meta: {
                nextCursor: null,
                total: users.length,
              },
            },
          }),
        });
        return;
      }

      if (url.endsWith('/users') && method === 'POST') {
        const createdUser = {
          id: 'user-2',
          role: 'SUPPORT',
          status: 'PENDING_VERIFICATION',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          emailVerified: false,
          passwordResetRequired: true,
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        users = [createdUser, ...users];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              ...createdUser,
              role: 'SUPPORT',
              status: 'PENDING_VERIFICATION',
              temporaryPassword: 'TempUser123!',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/users/user-2') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: users.find((item) => item.id === 'user-2') ?? users[0],
          }),
        });
        return;
      }

      if (url.endsWith('/users/user-2') && method === 'PATCH') {
        const payload = request.postDataJSON() as { role?: string; status?: string };
        users = users.map((item) =>
          item.id === 'user-2'
            ? {
                ...item,
                role: payload.role ?? item.role,
                status: payload.status ?? item.status,
                updatedAt: new Date().toISOString(),
              }
            : item,
        );

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: users.find((item) => item.id === 'user-2'),
          }),
        });
        return;
      }

      if (url.endsWith('/users/user-2') && method === 'DELETE') {
        users = users.filter((item) => item.id !== 'user-2');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null }),
        });
        return;
      }

      await route.continue();
    });
  };
}

test.describe('Bootstrap operativo admin', () => {
  test.beforeEach(setupAdminBootstrapMocks());

  test('SYSTEM_ADMIN puede completar bootstrap operativo', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Correo Electrónico / Identidad').fill('admin@iwana.local');
    await page.getByPlaceholder('••••••••').fill('Password123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByLabel('Menú de usuario').click();
    await page.getByRole('menuitem', { name: 'Editar perfil' }).click();
    await expect(page.getByRole('heading', { name: /Mi perfil/i })).toBeVisible();
    await page.getByLabel('Nombres').fill('Admin');
    await page.getByLabel('Apellidos').fill('actualizado');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Perfil actualizado correctamente.')).toBeVisible();

    await page.getByLabel('Menú de usuario').click();
    await expect(page.getByText('Admin actualizado').first()).toBeVisible();
    await page.getByRole('menuitem', { name: 'Configuración' }).click();
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
    await page.getByRole('button', { name: 'Seguridad' }).click();
    await page.getByRole('button', { name: 'Configurar MFA' }).click();
    await expect(page.getByText('Escanea el QR en tu app Authenticator')).toBeVisible();
    await page.getByPlaceholder('Código TOTP de 6 dígitos').fill('123456');
    await page.getByRole('button', { name: 'Verificar MFA' }).click();
    await expect(page.getByText('MFA habilitado correctamente.')).toBeVisible();

    await page.getByRole('link', { name: 'Empresas' }).click();
    await page.getByRole('link', { name: 'Nueva empresa' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva empresa' })).toBeVisible();
    await page.locator('#tenant-name').fill('Empresa Demo');
    await page.locator('#tenant-slug').fill('empresa-demo');
    await page.locator('#tenant-contact-email').fill('ops@example.test');
    await page.locator('#tenant-max-subscribers').fill('100');
    await page.getByRole('button', { name: 'Crear empresa' }).click();
    await expect(page.getByText('Provisioning completado.')).toBeVisible();
    await page.getByRole('button', { name: 'Regenerar credenciales temporales' }).click();
    await expect(page.getByText('admin@empresa-demo.test')).toBeVisible();
    await expect(page.getByText('TempPass123!')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Configurar empresa' }).click();

    await expect(page).toHaveURL(/\/tenants\/tenant-1\/settings/);
    await page.getByPlaceholder('America/Bogota').fill('America/Lima');
    await page.getByPlaceholder('COP').fill('USD');
    await page.getByLabel('Requerir MFA a todos los usuarios').check();
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración operativa actualizada.')).toBeVisible();

    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    const createUserDialog = page.getByRole('dialog', { name: 'Crear usuario' });
    await createUserDialog.locator('#uc-email').fill('noc@empresa-demo.test');
    await createUserDialog.locator('#uc-role').selectOption('SUPPORT');
    await createUserDialog.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByText('Usuario creado exitosamente')).toBeVisible();
    await expect(page.getByLabel('Contraseña temporal')).toContainText('TempUser123!');
    await createUserDialog.getByRole('button', { name: 'Entendido, cerrar' }).click();
    await expect(page.getByRole('cell', { name: 'SUPPORT' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /user-2/ }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Gestionar' }).first().click();
    const manageUserDialog = page.getByRole('dialog', { name: 'Gestión de usuario' });
    await expect(manageUserDialog).toBeVisible();
    await manageUserDialog.locator('#um-role').selectOption('NOC');
    await manageUserDialog.locator('#um-status').selectOption('ACTIVE');
    await manageUserDialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Usuario actualizado correctamente.')).toBeVisible();
    await manageUserDialog.getByRole('button', { name: 'Eliminar usuario' }).click();
    await expect(page.getByRole('cell', { name: /user-2/ })).toHaveCount(0);
  });
});
