/**
 * E2E — Recuperación de sesión del portal (frente D1 del plan
 * docs/plans/2026-09-09-fix-sesion-expirada-proveedores.md).
 *
 * Dos escenarios sobre el flujo REAL del navegador (api-client, AuthProvider,
 * SessionRecoveryModal y drawer de proveedores reales; la red se intercepta al
 * estilo de la suite portal):
 *
 * (a) Sesión transparente: el access token emitido por el login vive 20s
 *     (equivalente a arrancar el API con JWT_ACCESS_EXPIRATION=20s). La
 *     renovación proactiva (frente B) debe renovar la sesión sin que el usuario
 *     vea «Tu sesión expiró» ni el modal de recuperación, y la operación
 *     posterior (alta de proveedor) tiene éxito.
 *
 * (b) Recuperación en sitio: el refresh se bloquea con 401 y el primer guardado
 *     del proveedor responde 401 → aparece el modal «Vuelve a iniciar sesión»
 *     → re-login dentro del modal → el modal cierra SIN recargar la página →
 *     «Reintentar» repite el guardado con éxito y con el drawer intacto.
 *
 * Ambiente aislado: la config de la suite levanta su propio Next en
 * 127.0.0.1:3002 y TODO el API se simula con page.route — este spec no toca el
 * API dev (puerto 3000) ni la base de datos real. La variante con API real y
 * TTL corto por configuración queda documentada en
 * docs/informes/INFORME-SESION-REFRESH-PORTAL-v1.0.md.
 */

import { expect, test, type Page } from '@playwright/test';

const TENANT_SLUG = 'tenant-inventory-demo';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_EMAIL = 'admin@inventory.local';
/** TTL largo de sesión (segundos): equivale al default 15m del API. */
const LONG_TTL_SECONDS = 900;
/** TTL corto del escenario (a): menor que el margen proactivo (90s) a propósito. */
const SHORT_TTL_SECONDS = 20;

interface SessionRecoveryMockState {
  /** TTL (segundos) del access token emitido por el login simulado. */
  loginTokenTtlSeconds: number;
  loginCount: number;
  refreshCount: number;
  /** Cuando true, POST /auth/refresh responde 401 (refresh irrecuperable). */
  refreshBlocked: boolean;
  /** Guardados de proveedor que responderán 401 antes de tener éxito. */
  supplierCreateFailuresLeft: number;
  supplierCreateCount: number;
  suppliers: Array<Record<string, unknown>>;
}

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

/**
 * JWT sintético con la forma del token de sesión del portal (misma estructura
 * que usan los demás specs portal; sin firma válida ni PII real).
 */
function buildSessionToken(state: SessionRecoveryMockState): string {
  const payload = {
    sub: USER_ID,
    email: 'hash-admin',
    role: 'ADMIN',
    tenantId: 'tenant-inventory-001',
    schemaName: 'tenant_inventory_001',
    jti: `jti-session-e2e-${state.loginCount}-${state.refreshCount}-${Date.now()}`,
    type: 'tenant',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + state.loginTokenTtlSeconds,
  };

  return 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify(payload)) + '.fakesig';
}

function buildSupplierProfile(
  state: SessionRecoveryMockState,
  overrides: Record<string, unknown> = {},
) {
  const supplierCode = `PROV-${String(state.suppliers.length + 1).padStart(3, '0')}`;
  const partyRefId = String(overrides.partyRefId ?? `party-new-${state.supplierCreateCount}`);

  return {
    id: `sp-${state.suppliers.length + 1}`,
    supplierCode,
    partyRefId,
    status: 'ACTIVE',
    paymentTermsDays: null,
    currency: 'COP',
    incoterm: null,
    defaultLeadTimeDays: null,
    purchasingContactName: null,
    purchasingContactEmail: null,
    purchasingContactPhone: null,
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    party: {
      partyRefId,
      displayName: 'Proveedor nuevo',
      primaryContact: null,
      phone: null,
      email: null,
      city: 'Bogotá',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function seedSupplierDemo(state: SessionRecoveryMockState): void {
  state.suppliers.push(
    buildSupplierProfile(state, {
      id: 'sp-001',
      supplierCode: 'PROV-001',
      partyRefId: 'party-001',
      paymentTermsDays: 30,
      defaultLeadTimeDays: 7,
      purchasingContactName: 'Compras Demo',
      purchasingContactEmail: 'compras@demo.test',
      purchasingContactPhone: '3001112233',
      createdAt: nowIso(-2000),
      updatedAt: nowIso(-2000),
      party: {
        partyRefId: 'party-001',
        displayName: 'Proveedor Demo',
        primaryContact: 'Contacto operativo',
        phone: '3001234567',
        email: 'proveedor@demo.test',
        city: 'Bogotá',
        status: 'ACTIVE',
      },
    }),
  );
}

/**
 * Intercepta todo `/api/v1/**` con el contrato mínimo que esta prueba necesita:
 * bootstrap de auth, pestaña de proveedores de Inventario y los endpoints de
 * sesión (login/refresh) con estado controlado por el test.
 */
async function setupSessionRecoveryMocks(
  page: Page,
  state: SessionRecoveryMockState,
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    // --- Autenticación y bootstrap de sesión -------------------------------

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'ISP Sesion Demo',
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

    if (pathname.endsWith('/auth/login') && method === 'POST') {
      state.loginCount += 1;
      // Re-autenticación exitosa ⇒ hay sesión nueva: se recupera el refresh y
      // los guardados vuelven a funcionar (así lo modela el API real).
      state.refreshBlocked = false;
      state.supplierCreateFailuresLeft = 0;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: buildSessionToken(state) } }),
      });
      return;
    }

    if (pathname.endsWith('/auth/refresh') && method === 'POST') {
      state.refreshCount += 1;
      if (state.refreshBlocked) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'UNAUTHORIZED',
            message: 'Refresh token invalido.',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: buildSessionToken(state) } }),
      });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: USER_ID,
            email: 'hash-admin',
            role: 'ADMIN',
            tenantId: 'tenant-inventory-001',
            schemaName: 'tenant_inventory_001',
            jti: 'jti-session-e2e',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (/\/users\/[^/]+$/.test(pathname) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: USER_ID,
            email: USER_EMAIL,
            role: 'ADMIN',
            status: 'ACTIVE',
            firstName: 'Sesion',
            lastName: 'E2E',
            avatarUrl: null,
            mfaEnabled: false,
            emailVerified: true,
            createdAt: '2026-01-10T12:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (
      /^\/api\/v1\/access-control\/(me|users\/[^/]+)\/effective-permissions$/.test(pathname) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: USER_ID,
            role: 'ADMIN',
            effectivePermissions: [
              'inventory.stock.read',
              'inventory.stock.manage',
              'inventory.purchasing.read',
              'inventory.purchasing.manage',
            ],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: [
              {
                id: USER_ID,
                email: USER_EMAIL,
                role: 'ADMIN',
                status: 'ACTIVE',
                firstName: 'Sesion',
                lastName: 'E2E',
                isOperationalResource: false,
              },
            ],
            meta: { nextCursor: null, total: 1 },
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenant: {
              id: 'tenant-inventory-001',
              name: 'ISP Sesion Demo',
              slug: TENANT_SLUG,
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
              mfaCoverage: null,
              pendingAlerts: 0,
              auditEventsLast7d: 0,
            },
            alerts: [],
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-inventory-001',
            name: 'ISP Sesion Demo',
            slug: TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'tenant@sesion.local',
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

    if (pathname.endsWith('/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenantName: 'ISP Sesion Demo',
            activeSubscribers: 0,
            pendingInstallations: 0,
            overdueInvoices: 0,
            uptimePercent: 100,
            alerts: [],
          },
        }),
      });
      return;
    }

    // --- Inventario: bootstrap mínimo de la página --------------------------

    if (pathname.endsWith('/inventory/dashboard') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          itemsCount: 0,
          locationsCount: 0,
          serializedAssetsCount: 0,
          balancesCount: 0,
          totalOnHand: 0,
          estimatedTotalValue: 0,
          balancesByLocation: [],
          balancesByCategory: [],
          serializedAssetsByStatus: [],
          serializedAssetsByResponsibleType: [],
        }),
      });
      return;
    }

    if (pathname.endsWith('/inventory/replenishment/suggestions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    // --- Compras: pestaña proveedores ---------------------------------------

    if (pathname.endsWith('/purchasing/suppliers/lookup') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ match: null, hasSupplierProfile: false }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: state.suppliers,
          total: state.suppliers.length,
          page: 1,
          limit: 100,
        }),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/suppliers') && method === 'POST') {
      if (state.supplierCreateFailuresLeft > 0) {
        state.supplierCreateFailuresLeft -= 1;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'UNAUTHORIZED',
            message: 'No autenticado',
          }),
        });
        return;
      }

      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      state.supplierCreateCount += 1;
      const profile = buildSupplierProfile(state, {
        displayName: body.displayName ?? 'Proveedor nuevo',
        paymentTermsDays: body.paymentTermsDays ?? null,
        purchasingContactName: body.purchasingContactName ?? null,
        purchasingContactEmail: body.purchasingContactEmail ?? null,
        purchasingContactPhone: body.purchasingContactPhone ?? null,
        party: {
          partyRefId: `party-new-${state.supplierCreateCount}`,
          displayName: body.displayName ?? 'Proveedor nuevo',
          primaryContact: body.purchasingContactName ?? null,
          phone: body.purchasingContactPhone ?? null,
          email: body.purchasingContactEmail ?? null,
          city: 'Bogotá',
          status: 'ACTIVE',
        },
      });
      state.suppliers.unshift(profile);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }

    if (pathname.endsWith('/purchasing/providers') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
        }),
      });
      return;
    }

    // --- Fallback -------------------------------------------------------------/

    if (method === 'GET' || method === 'HEAD') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: pathname }),
    });
  });
}

function createSessionRecoveryMockState(): SessionRecoveryMockState {
  const state: SessionRecoveryMockState = {
    loginTokenTtlSeconds: LONG_TTL_SECONDS,
    loginCount: 0,
    refreshCount: 0,
    refreshBlocked: false,
    supplierCreateFailuresLeft: 0,
    supplierCreateCount: 0,
    suppliers: [],
  };
  seedSupplierDemo(state);
  return state;
}

/**
 * Marca la página con un valor que solo existe en el contexto JavaScript
 * actual: si la app recargara, el probe desaparecería. Se usa para acreditar
 * que la recuperación ocurre SIN recarga.
 */
async function markNoReloadProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __iwanaSessionE2eProbe?: string }).__iwanaSessionE2eProbe =
      'session-recovery-e2e';
  });
}

async function readNoReloadProbe(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as unknown as { __iwanaSessionE2eProbe?: string }).__iwanaSessionE2eProbe,
  );
}

async function loginViaUi(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: /bienvenido a/i })).toBeVisible();
  await page.getByPlaceholder('ejemplo: isp-demo').fill(TENANT_SLUG);
  await page.getByLabel(/correo electrónico/i).fill(USER_EMAIL);
  await page.getByPlaceholder('••••••••').fill('Password123!');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openSupplierCreateDrawer(page: Page): Promise<void> {
  await page.goto('/dashboard/inventory?tab=suppliers');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
  await expect(main.getByText('Proveedor Demo')).toBeVisible();

  await main.getByRole('button', { name: 'Nuevo proveedor' }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Nuevo proveedor' });
  await expect(drawer).toBeVisible();

  // La marca se coloca tras la ÚLTIMA navegación dura: lo que se acredita es
  // que la recuperación de sesión no recarga ni redirige la página.
  await markNoReloadProbe(page);
}

test.describe('Portal — sesión transparente con TTL corto', () => {
  test('renovación proactiva cubre el vencimiento sin modal ni error visible', async ({ page }) => {
    test.setTimeout(120_000);

    const state = createSessionRecoveryMockState();
    // Access token de 20s: el margen proactivo (90s) ya está vencido al
    // emitirse, así que la renovación proactiva dispara de inmediato.
    state.loginTokenTtlSeconds = SHORT_TTL_SECONDS;
    await setupSessionRecoveryMocks(page, state);

    await loginViaUi(page);
    await markNoReloadProbe(page);

    // La renovación proactiva debe haber ocurrido sin intervención del usuario.
    await expect.poll(() => state.refreshCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    // Se espera MÁS que el TTL del access token original (20s): la sesión debe
    // seguir viva gracias al token renovado.
    await page.waitForTimeout(SHORT_TTL_SECONDS * 1000 + 2_000);

    // Sin recarga durante la espera.
    expect(await readNoReloadProbe(page)).toBe('session-recovery-e2e');

    // Interacción real tras el vencimiento: alta de proveedor con éxito.
    await openSupplierCreateDrawer(page);
    const drawer = page.getByRole('dialog', { name: 'Nuevo proveedor' });
    await drawer.getByLabel('Número de NIT').fill('901555666');
    await drawer.getByLabel('Nombre').fill('Redes del Caribe SAS');
    await drawer.getByRole('button', { name: 'Continuar' }).click();
    await drawer.getByLabel('Plazo de pago (días)').fill('45');
    await drawer.getByLabel('Contacto de compras').fill('María Compras');
    await drawer.getByRole('button', { name: 'Crear proveedor' }).click();

    await expect(page.getByText('Proveedor registrado.')).toBeVisible();
    await expect(page.locator('main').getByText('Redes del Caribe SAS')).toBeVisible();

    // Nunca apareció el modal de recuperación ni el mensaje de sesión expirada.
    await expect(page.getByRole('dialog', { name: 'Vuelve a iniciar sesión' })).toHaveCount(0);
    await expect(page.getByText('Tu sesión expiró')).toHaveCount(0);
    expect(await readNoReloadProbe(page)).toBe('session-recovery-e2e');

    // La renovación fue proactiva: exactamente una, sin 401 reactivos detrás.
    expect(state.refreshCount).toBe(1);
    expect(state.loginCount).toBe(1);
  });
});

test.describe('Portal — recuperación de sesión en sitio', () => {
  test('refresh irrecuperable abre el modal, re-autentica y el reintento guarda', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const state = createSessionRecoveryMockState();
    state.loginTokenTtlSeconds = LONG_TTL_SECONDS;
    await setupSessionRecoveryMocks(page, state);

    await loginViaUi(page);
    await markNoReloadProbe(page);

    await openSupplierCreateDrawer(page);
    const drawer = page.getByRole('dialog', { name: 'Nuevo proveedor' });
    await drawer.getByLabel('Número de NIT').fill('901777888');
    await drawer.getByLabel('Nombre').fill('Redes del Caribe SAS');
    await drawer.getByRole('button', { name: 'Continuar' }).click();
    await drawer.getByLabel('Plazo de pago (días)').fill('45');
    await drawer.getByLabel('Contacto de compras').fill('María Compras');

    // Se provoca el fallo real: el próximo guardado responde 401 y el refresh
    // queda irrecuperable (401) — como una sesión realmente muerta.
    state.refreshBlocked = true;
    state.supplierCreateFailuresLeft = 1;
    await drawer.getByRole('button', { name: 'Crear proveedor' }).click();

    // Alerta accionable del drawer con CTAs de recuperación (frente C).
    await expect(
      drawer.getByText('Tu sesión expiró. Inicia sesión de nuevo para continuar.'),
    ).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Reintentar' })).toBeVisible();

    // El modal de re-autenticación se abre por el evento de sesión expirada.
    const recovery = page.getByRole('dialog', { name: 'Vuelve a iniciar sesión' });
    await expect(recovery).toBeVisible();

    // Hubo exactamente un intento de renovación (reactivo), rechazado.
    expect(state.refreshCount).toBe(1);

    // Sin recarga: el drawer y sus datos siguen en pantalla.
    expect(await readNoReloadProbe(page)).toBe('session-recovery-e2e');
    await expect(drawer.getByLabel('Contacto de compras')).toHaveValue('María Compras');

    // Re-autenticación DENTRO del modal.
    await recovery.getByLabel('Correo electrónico').fill(USER_EMAIL);
    await recovery.getByPlaceholder('••••••••').fill('Password123!');
    await recovery.getByRole('button', { name: 'Iniciar sesión' }).click();

    // El modal cierra sin recargar ni redirigir.
    await expect(recovery).toHaveCount(0);
    expect(await readNoReloadProbe(page)).toBe('session-recovery-e2e');
    expect(page.url()).toContain('/dashboard/inventory');

    // El reintento repite el guardado con éxito y sin perder el drawer.
    await drawer.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText('Proveedor registrado.')).toBeVisible();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('main').getByText('Redes del Caribe SAS')).toBeVisible();

    // Segundo login (el del modal); el refresh bloqueado no se reintentó solo.
    expect(state.loginCount).toBe(2);
    expect(state.refreshCount).toBe(1);
    expect(await readNoReloadProbe(page)).toBe('session-recovery-e2e');
  });
});
