/**
 * E2E — Perfil propio en el portal empresarial (/dashboard/profile).
 *
 * Red secundaria de P-01 (la primaria es unitaria: aridad de `getMe`, ver
 * ProfileClient.spec.tsx PC-01/PC-02): si alguien exporta
 * NEXT_PUBLIC_TENANT_SLUG en su shell, tenant-resolution.ts:74-81
 * cortocircuita el input y la aserción de cabecera pasa en verde con el bug
 * presente. Se escribe igual, portando el helper existente.
 *
 * Casos (3):
 * 1. GET /users/me transporta X-Tenant-Slug con el slug del tenant.
 * 2. Editar el nombre envía PATCH /users/me y muestra confirmación.
 * 3. /dashboard/profile sin violaciones de accesibilidad (axe).
 *
 * Todos los endpoints HTTP son mockeados con page.route() — no requiere
 * backend levantado. Sin datos PII reales — solo ficticios (zero-trust PII).
 */

import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedPortalSession } from './helpers/portal-session';

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

/** Perfil ficticio del usuario autenticado */
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

/**
 * Aserción de cabecera de tenant, portada de
 * portal-settings-federated-shell.spec.ts:105-114: el cliente siempre
 * transporta el slug resuelto en X-Tenant-Slug.
 */
async function assertTenantHeader(route: Route) {
  const headers = await route.request().allHeaders();
  expect(headers['x-tenant-slug']).toBe(MOCK_TENANT);
}

/**
 * Registra las rutas mockeadas para un ADMIN autenticado en /dashboard/profile.
 * Cubre /auth/me, /users/me (GET+PATCH), /tenants/me/summary y branding.
 */
async function setupProfileMocks(
  page: Page,
  opts?: { patchCapture?: (body: Record<string, unknown>) => void },
) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: MOCK_TENANT });

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
      await assertTenantHeader(route);
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
              configuredUsers: 1,
              mfaCoverage: 100,
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
        body: JSON.stringify({
          data: { version: 'MOD00_ACCESS_V1', permissions: [], compatibilityMatrix: {} },
        }),
      });
      return;
    }

    if (url.includes('/access-control/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-admin-uuid-001',
            email: 'sha256:admin-hash-ficticio',
            role: 'ADMIN',
            tenantId: 'tenant-uuid-001',
            schemaName: 'tenant_prueba',
            jti: 'jti-test-001',
            type: 'tenant',
            passwordResetRequired: false,
          },
        }),
      });
      return;
    }

    // PATCH /users/me — guardado de datos personales
    if (url.includes('/users/me') && method === 'PATCH') {
      await assertTenantHeader(route);
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      opts?.patchCapture?.(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...MOCK_PROFILE,
            ...(typeof body.firstName === 'string' ? { firstName: body.firstName } : {}),
            ...(typeof body.lastName === 'string' ? { lastName: body.lastName } : {}),
            ...(typeof body.phone === 'string' ? { phone: body.phone } : {}),
            ...(typeof body.jobTitle === 'string' ? { jobTitle: body.jobTitle } : {}),
          },
        }),
      });
      return;
    }

    // GET /users/me — perfil del usuario autenticado
    if (url.includes('/users/me') && method === 'GET') {
      await assertTenantHeader(route);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_PROFILE }),
      });
      return;
    }

    // Fallback — marcar lo no mockeado en vez de pegarle al backend real
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

test('perfil e2e 1 — GET /users/me transporta la cabecera de tenant', async ({ page }) => {
  await setupProfileMocks(page);
  await page.goto('/dashboard/profile');

  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByLabel('Nombre')).toHaveValue('Administrador');
});

test('perfil e2e 2 — editar el nombre envía PATCH /users/me y confirma', async ({ page }) => {
  let patchBody: Record<string, unknown> = {};
  await setupProfileMocks(page, {
    patchCapture: (body) => {
      patchBody = body;
    },
  });
  await page.goto('/dashboard/profile');

  await expect(page.getByLabel('Nombre')).toHaveValue('Administrador');
  await page.getByLabel('Nombre').fill('Ada Augusta');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('Perfil actualizado correctamente.')).toBeVisible();
  expect(patchBody['firstName']).toBe('Ada Augusta');
});

test('perfil e2e 3 — /dashboard/profile sin violaciones de accesibilidad', async ({ page }) => {
  await setupProfileMocks(page);
  await page.goto('/dashboard/profile');

  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
