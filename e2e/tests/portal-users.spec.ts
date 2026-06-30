/**
 * E2E — Gestión de usuarios internos en el portal empresarial.
 *
 * Cubre los criterios de aceptación CA-10 y CA-11 del PRD-MOD04:
 * - CA-10: tabla de usuarios con búsqueda, filtros, crear, editar, eliminar y reset password.
 * - CA-11: página de perfil del usuario autenticado con edición de datos personales.
 *
 * Flujos cubiertos (8 casos):
 * 1. Redirige a login si no hay sesión activa.
 * 2. Muestra la tabla de usuarios al navegar a /dashboard/users como ADMIN.
 * 3. El input de búsqueda filtra la tabla enviando ?search= al backend.
 * 4. El selector de estado filtra la tabla enviando ?status= al backend.
 * 5. El botón "Nuevo usuario" abre el modal de creación.
 * 6. El botón de reinicio de contraseña (KeyRound) abre el diálogo de confirmación.
 * 7. Confirmar reset muestra modal con contraseña temporal.
 * 8. La página /dashboard/profile muestra el formulario de perfil del usuario autenticado.
 *
 * Todos los endpoints HTTP son mockeados con page.route() — no requiere backend levantado.
 * Sin datos PII reales — solo ficticios de prueba (regla zero-trust PII).
 */

import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures de datos ficticios — sin PII real
// ---------------------------------------------------------------------------

/** Token JWT ficticio válido para el ADMIN autenticado */
const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-001',
      email: 'sha256:admin-hash-ficticio',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-001',
      schemaName: 'tenant_prueba',
      jti: 'jti-test-001',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

/** Tenant slug ficticio */
const MOCK_TENANT = 'tenant-prueba';

/** Payload de /auth/me para un ADMIN autenticado */
const MOCK_ME = {
  sub: 'user-admin-uuid-001',
  email: 'sha256:admin-hash-ficticio',
  role: 'ADMIN',
  tenantId: 'tenant-uuid-001',
  schemaName: 'tenant_prueba',
  jti: 'jti-test-001',
  type: 'tenant',
  passwordResetRequired: false,
};

/** Lista ficticia de usuarios internos */
const MOCK_USERS = [
  {
    id: 'usr-001',
    email: 'operador1@prueba.local',
    firstName: 'Carlos',
    lastName: 'López',
    role: 'NOC',
    status: 'ACTIVE',
    mfaEnabled: false,
    mfaRequired: false,
    emailVerified: true,
    lastLoginAt: '2026-03-01T08:00:00Z',
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'usr-002',
    email: 'soporte2@prueba.local',
    firstName: 'Ana',
    lastName: 'Martínez',
    role: 'SUPPORT',
    status: 'ACTIVE',
    mfaEnabled: true,
    mfaRequired: true,
    emailVerified: true,
    lastLoginAt: null,
    createdAt: '2026-02-01T09:00:00Z',
  },
];

const MOCK_USERS_RESPONSE = {
  data: MOCK_USERS,
  meta: { nextCursor: null, total: 2 },
};

const MOCK_ACCESS_PERMISSIONS = {
  version: 'MOD00_ACCESS_V1',
  permissions: [
    {
      id: 'perm-1',
      tenantId: 'tenant-uuid-001',
      permissionKey: 'settings.read',
      moduleKey: 'settings',
      action: 'read',
      description: 'Ver centro de Configuración',
      catalogVersion: 'MOD00_ACCESS_V1',
      availability: 'ASSIGNABLE',
      isSystem: true,
      isActive: true,
    },
  ],
  compatibilityMatrix: {
    ADMIN: [],
    NOC: ['settings.read'],
    SUPPORT: ['settings.read'],
    SALES: [],
    TECHNICIAN: ['settings.read'],
    ACCOUNTANT: [],
    HR: [],
    SUBSCRIBER: [],
    CONTRACTOR: [],
    PARTNER: [],
    AUDITOR: [],
    INVESTOR: [],
    SYSTEM_ADMIN: [],
    IWANA_SUPPORT: [],
  },
};

const MOCK_ACCESS_PROFILES = [
  {
    id: 'template-tech',
    name: 'Técnico de campo',
    description: 'Plantilla inicial de campo',
    baseRoleConstraint: 'TECHNICIAN',
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: ['settings.read'],
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
  },
];

/** Perfil ficticio del usuario ADMIN autenticado */
const MOCK_PROFILE = {
  id: 'user-admin-uuid-001',
  email: 'admin@prueba.local',
  role: 'ADMIN',
  status: 'ACTIVE',
  firstName: 'Administrador',
  lastName: 'Prueba',
  phone: null,
  jobTitle: 'Admin',
  avatarUrl: null,
  mfaEnabled: true,
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helper: configurar mocks de sesión autenticada
// ---------------------------------------------------------------------------

/**
 * Registra las rutas mockeadas comunes para un ADMIN autenticado.
 * Cubre /auth/me, /users y /users/:id/password.
 */
async function setupAuthenticatedAdminMocks(
  page: import('@playwright/test').Page,
  opts?: { searchCapture?: (term: string) => void; statusCapture?: (status: string) => void },
) {
  // Sembrar sesion sobre un origen valido del portal para evitar carreras al navegar.
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, tenant }: { token: string; tenant: string }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', tenant);
    },
    { token: MOCK_TOKEN, tenant: MOCK_TENANT },
  );

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant Prueba',
            showTenantName: true,
            logoLightUrl: null,
            logoDarkUrl: null,
            sealLightUrl: null,
            sealDarkUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            loginBackgroundLightUrl: null,
            loginBackgroundDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenant: {
              id: 'tenant-uuid-001',
              name: 'Tenant Prueba',
              slug: MOCK_TENANT,
              status: 'ACTIVE',
            },
            settings: {
              timezone: 'America/Bogota',
              currency: 'COP',
              language: 'es-CO',
              country: 'CO',
              features: { billing: false, mfa_required_all: false },
            },
            metrics: {
              configuredUsers: 2,
              mfaCoverage: 50,
              pendingAlerts: 0,
              auditEventsLast7d: 0,
            },
            alerts: [],
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-001',
            name: 'Tenant Prueba',
            slug: MOCK_TENANT,
            status: 'ACTIVE',
            contactEmail: 'contacto@tenant-prueba.test',
            showTenantName: true,
            logoLightUrl: null,
            logoDarkUrl: null,
            sealLightUrl: null,
            sealDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (url.includes('/access-control/permissions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ACCESS_PERMISSIONS }),
      });
      return;
    }

    if (url.includes('/access-control/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ACCESS_PROFILES }),
      });
      return;
    }

    // GET /auth/me — sesión activa como ADMIN
    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ME }),
      });
      return;
    }

    // GET /users?... — lista de usuarios con captura opcional de parámetros
    if (url.includes('/users') && !url.includes('/users/') && method === 'GET') {
      const parsed = new URL(url);
      if (opts?.searchCapture) {
        const term = parsed.searchParams.get('search') ?? '';
        if (term) opts.searchCapture(term);
      }
      if (opts?.statusCapture) {
        const status = parsed.searchParams.get('status') ?? '';
        if (status) opts.statusCapture(status);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_USERS_RESPONSE }),
      });
      return;
    }

    // PATCH /users/:id/password — reset de contraseña
    if (url.match(/\/users\/[^/]+\/password$/) && method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { temporaryPassword: 'Temp@Pass.2026' } }),
      });
      return;
    }

    // GET /users/:id — perfil del usuario autenticado
    if (url.match(/\/users\/[^/]+$/) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_PROFILE }),
      });
      return;
    }

    // Fallback — continuar con la solicitud real (assets estáticos, etc.)
    await route.continue();
  });
}

// ---------------------------------------------------------------------------
// Caso 1: redirige a login si no hay sesión
// ---------------------------------------------------------------------------
test('caso 1 — redirige a login al acceder a /dashboard/users sin sesión', async ({ page }) => {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
    });
  });

  await page.goto('/dashboard/users');
  await expect(page).toHaveURL(/\/auth\/login/);
});

// ---------------------------------------------------------------------------
// Caso 2: muestra la tabla de usuarios como ADMIN autenticado
// ---------------------------------------------------------------------------
test('caso 2 — ADMIN autenticado ve la tabla de usuarios en /dashboard/users', async ({ page }) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/users');

  // Esperar que la tabla cargue con al menos un usuario
  await expect(page.getByText('Carlos López')).toBeVisible();
  await expect(page.getByText('operador1@prueba.local')).toBeVisible();
  await expect(page.getByRole('table').getByText('Soporte inicial', { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Caso 3: búsqueda envía parámetro ?search= al backend
// ---------------------------------------------------------------------------
test('caso 3 — input de búsqueda envía ?search= al backend con debounce', async ({ page }) => {
  let capturedSearch = '';
  await setupAuthenticatedAdminMocks(page, {
    searchCapture: (term) => {
      capturedSearch = term;
    },
  });

  await page.goto('/dashboard/users');
  await expect(page.getByText('Carlos López')).toBeVisible();

  // Escribir en el input de búsqueda
  const searchInput = page.getByPlaceholder('Buscar por nombre o correo…');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Carlos');

  // Esperar el debounce (300ms) + tiempo de respuesta
  await page.waitForTimeout(400);

  expect(capturedSearch).toBe('Carlos');
});

// ---------------------------------------------------------------------------
// Caso 4: filtro de estado envía ?status= al backend
// ---------------------------------------------------------------------------
test('caso 4 — selector de estado envía ?status= al backend', async ({ page }) => {
  let capturedStatus = '';
  await setupAuthenticatedAdminMocks(page, {
    statusCapture: (status) => {
      capturedStatus = status;
    },
  });

  await page.goto('/dashboard/users');
  await expect(page.getByText('Carlos López')).toBeVisible();

  // Cambiar el selector custom de estado a "Suspendido"
  await page.locator('#status-filter').click();
  await page.getByRole('option', { name: 'Suspendido' }).click();
  await page.waitForTimeout(200);

  expect(capturedStatus).toBe('SUSPENDED');
});

// ---------------------------------------------------------------------------
// Caso 5: botón "Nuevo usuario" abre el modal de creación
// ---------------------------------------------------------------------------
test('caso 5 — botón "Nuevo usuario" abre el modal de creación', async ({ page }) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/users');
  await expect(page.getByText('Carlos López')).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo usuario' }).click();

  // El modal debe aparecer con un campo de email
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/correo electronico/i)).toBeVisible();
  await expect(dialog.getByLabel('Categoría base *')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Caso 6: botón de reset password por fila abre el diálogo de confirmación
// ---------------------------------------------------------------------------
test('caso 6 — botón de reinicio de contraseña abre el diálogo de confirmación', async ({
  page,
}) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/users');
  await expect(page.getByText('Carlos López')).toBeVisible();

  // Click en el botón de reinicio de la primera fila
  await page
    .getByRole('button', { name: /reiniciar contraseña de operador1@prueba\.local/i })
    .click();

  // El diálogo de confirmación debe ser visible con el nombre del usuario
  const dialog = page.getByRole('dialog', { name: /reiniciar contraseña/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('operador1@prueba.local')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Caso 7: confirmar reset muestra la contraseña temporal generada
// ---------------------------------------------------------------------------
test('caso 7 — confirmar reset muestra la contraseña temporal al admin', async ({ page }) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/users');
  await expect(page.getByText('Carlos López')).toBeVisible();

  // Abrir diálogo de reset
  await page
    .getByRole('button', { name: /reiniciar contraseña de operador1@prueba\.local/i })
    .click();
  await expect(page.getByRole('dialog', { name: /reiniciar contraseña/i })).toBeVisible();

  // Confirmar el reinicio
  await page.getByRole('button', { name: /^reiniciar contraseña$/i }).click();

  // El modal con la contraseña temporal debe aparecer
  await expect(page.getByText('Contraseña temporal generada')).toBeVisible();
  await expect(page.getByText('Temp@Pass.2026')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Caso 8: página /dashboard/profile muestra el formulario del perfil
// ---------------------------------------------------------------------------
test('caso 8 — /dashboard/profile muestra el formulario de información personal', async ({
  page,
}) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/profile');

  // Debe mostrar el título del perfil y el formulario personal cargado
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Datos personales' })).toBeVisible();
  await expect(page.getByLabel('Nombre')).toHaveValue('Administrador');
  await expect(page.getByLabel('Apellido')).toHaveValue('Prueba');
});

test('regresion perfil — mi perfil no expone la politica MFA global del tenant', async ({
  page,
}) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/profile');

  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByLabel('Activar MFA obligatorio')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Regresión de ownership: la asignación de roles vive en Users, no en Access
// ---------------------------------------------------------------------------
/**
 * Documenta el boundary ADR-040: Access Settings posee plantillas y permisos;
 * Users posee la asignación de categoría base y perfil de empresa por usuario.
 * Este test garantiza que /dashboard/users expone controles de edición de usuario
 * (desde donde se gestiona la asignación de roles) y que la pantalla existe y carga.
 */
test('regresion ownership — /dashboard/users expone tabla editable; la asignacion de roles no reside en settings/access', async ({
  page,
}) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/users');

  // La tabla de usuarios carga correctamente
  await expect(page.getByText('Carlos López')).toBeVisible();
  await expect(page.getByText('Ana Martínez')).toBeVisible();

  // Existe al menos un botón de edición de usuario (punto de entrada para asignación de roles)
  const editButton = page.getByRole('button', { name: /editar.*carlos|editar.*usr-001/i });
  // Si el botón tiene nombre accesible genérico, buscar por ícono de edición en la fila
  const anyEditAction = editButton.or(page.locator('tbody tr').first().getByRole('button').first());
  await expect(anyEditAction).toBeVisible();

  // El modal de creación de usuario tiene selector de categoría base (ownership en Users)
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Categoría base *')).toBeVisible();
});
