/**
 * E2E — PortalTablePager: foco (v2-25) y a11y (v2-34).
 *
 * v2-25: el foco no cae al <body> al paginar con PortalTablePager.
 * v2-27: controles deshabilitados durante carga (bonus).
 * v2-34: auditoría axe-core sobre tabla paginada, sin violaciones.
 *
 * Riesgo estructural verificado: si el consumidor levanta `loading`
 * después de que el pager intenta restaurar el foco, el navegador
 * desenfoca el botón al deshabilitarse. Este spec lo ejerce con
 * un mock que introduce latencia deliberada.
 *
 * HTTP mockeado — no requiere backend. Sin PII real.
 */

import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedPortalSession } from './helpers/portal-session';

// ────────────────────────────────────────────────────────────────
// Fixtures de sesión
// ────────────────────────────────────────────────────────────────

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-pager-a11y',
      email: 'sha256:admin-hash-pager-a11y',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-pager-a11y',
      schemaName: 'tenant_pager_a11y',
      jti: 'jti-pager-a11y',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_TENANT = 'tenant-pager-a11y';

const MOCK_ME = {
  sub: 'user-admin-uuid-pager-a11y',
  email: 'sha256:admin-hash-pager-a11y',
  role: 'ADMIN',
  tenantId: 'tenant-uuid-pager-a11y',
  schemaName: 'tenant_pager_a11y',
  jti: 'jti-pager-a11y',
  type: 'tenant',
  passwordResetRequired: false,
};

// ────────────────────────────────────────────────────────────────
// Factory de suscriptores ficticios
// ────────────────────────────────────────────────────────────────

function buildSubscriber(id: string, firstName: string, lastName: string) {
  return {
    id,
    personType: 'NATURAL',
    firstName,
    lastName,
    businessName: null,
    commercialName: null,
    documentType: 'CC',
    documentNumber: id,
    nit: null,
    email: `${id}@prueba.local`,
    phone: null,
    customerSegment: 'RESIDENTIAL',
    vatTreatment: 'STANDARD',
    status: 'ACTIVE',
    city: 'Bogotá',
    department: 'Cundinamarca',
    stratum: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    externalId: null,
    createdBy: null,
  };
}

const PAGE1 = Array.from({ length: 20 }, (_, i) =>
  buildSubscriber(`sub-pager-p1-${i}`, 'Ana', `FocoUno${i}`),
);
const PAGE2 = Array.from({ length: 20 }, (_, i) =>
  buildSubscriber(`sub-pager-p2-${i}`, 'Luis', `FocoDos${i}`),
);
const PAGE3 = Array.from({ length: 5 }, (_, i) =>
  buildSubscriber(`sub-pager-p3-${i}`, 'Eva', `FocoTres${i}`),
);

interface PageEnvelope {
  data: ReturnType<typeof buildSubscriber>[];
  total: number;
  meta: {
    nextCursor: null;
    total: number;
    totalIsEstimate: boolean;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
    mode: string;
    capabilities: { randomAccess: boolean; sortableFields: string[] };
    sort: null;
  };
}

function pageEnvelope(
  data: ReturnType<typeof buildSubscriber>[],
  page: number,
  limit: number,
  total: number,
): PageEnvelope {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    total,
    meta: {
      nextCursor: null,
      total,
      totalIsEstimate: false,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Sesión: inyecta token y slug en localStorage
// ────────────────────────────────────────────────────────────────

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: MOCK_TENANT });
}

// ────────────────────────────────────────────────────────────────
// Mocks HTTP — simula todas las rutas que necesita la página
// ────────────────────────────────────────────────────────────────

interface MockOptions {
  /** Latencia artificial en ms para simular carga (ej. v2-27). */
  subscriberDelayMs?: number;
  /** Si es true, solo la primera carga de suscriptores tiene delay. */
  firstLoadOnly?: boolean;
  /**
   * Compuerta determinista: la respuesta de la página indicada queda retenida
   * hasta que el test la libere. Sustituye a las esperas por tiempo, que son
   * la fuente del no determinismo de R-14: aquí el estado `refreshing=true`
   * se mantiene abierto tanto como haga falta, sin carrera contra axe.
   */
  gate?: { page: number; wait: () => Promise<void> };
}

async function setupMocks(page: Page, opts: MockOptions = {}) {
  const { subscriberDelayMs = 0, firstLoadOnly = false, gate } = opts;
  let subscriberLoads = 0;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Branding público
    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant Foco A11y',
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

    // Summary del tenant
    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-pager-a11y',
            slug: MOCK_TENANT,
            displayName: 'Tenant Foco A11y',
            status: 'ACTIVE',
          },
        }),
      });
      return;
    }

    // Perfil del tenant
    if (url.includes('/tenants/me') && !url.includes('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-pager-a11y',
            name: 'Tenant Foco A11y',
            slug: MOCK_TENANT,
            status: 'ACTIVE',
            contactEmail: 'contacto@pager-a11y.test',
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

    // Sesión (/auth/me)
    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ME }),
      });
      return;
    }

    // Perfil de usuario
    if (url.match(/\/users\/[^/]+$/) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-admin-uuid-pager-a11y',
            email: 'admin@pager-a11y.test',
            role: 'ADMIN',
            status: 'ACTIVE',
            firstName: 'Ana',
            lastName: 'Foco',
            phone: null,
            jobTitle: 'Administradora',
            avatarUrl: null,
            mfaEnabled: false,
            emailVerified: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      });
      return;
    }

    // Permisos efectivos
    if (/\/access-control\/users\/[^/]+\/effective-permissions$/.test(url) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: 'user-admin-uuid-pager-a11y',
            role: 'ADMIN',
            effectivePermissions: ['settings.read'],
            recoveryPermissions: [],
            profileSources: [],
          },
        }),
      });
      return;
    }

    // Notificaciones
    if (url.includes('/notifications') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    // Audit logs
    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'audit-1',
              tenantId: 'tenant-uuid-pager-a11y',
              userId: 'user-admin-uuid-pager-a11y',
              action: 'LOGIN',
              entityType: 'User',
              entityId: 'user-admin-uuid-pager-a11y',
              oldValue: null,
              newValue: null,
              ipAddress: null,
              userAgent: null,
              requestId: null,
              createdAt: new Date(Date.now() - 60_000).toISOString(),
            },
          ],
        }),
      });
      return;
    }

    // Dashboard summary
    if (url.includes('/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenantName: 'Tenant Foco A11y',
            activeSubscribers: 45,
            pendingInstallations: 0,
            overdueInvoices: 0,
            uptimePercent: 99.9,
            alerts: [],
          },
        }),
      });
      return;
    }

    // Settings sections
    if (url.includes('/configuration/settings-sections') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    // Logout
    if (url.includes('/auth/logout') && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // Refresh
    if (url.includes('/auth/refresh') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accessToken: MOCK_TOKEN } }),
      });
      return;
    }

    // ── Suscriptores (listado paginado) ──
    if (
      url.includes('/crm/subscribers') &&
      !url.includes('/crm/subscribers/') &&
      method === 'GET'
    ) {
      subscriberLoads += 1;
      const parsed = new URL(url);
      const pageNum = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1;
      const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '20', 10) || 20;
      const status = parsed.searchParams.get('status');

      // Simular filtro sin resultados
      if (status === 'SUSPENDED') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(pageEnvelope([], 1, limit, 0)),
        });
        return;
      }

      const total = 45;
      let data = PAGE1;
      if (pageNum === 2) data = PAGE2;
      if (pageNum === 3) data = PAGE3;

      // ── Latencia artificial para ejercer v2-27 ──
      const shouldDelay = subscriberDelayMs > 0 && (!firstLoadOnly || subscriberLoads <= 1);

      if (shouldDelay) {
        await new Promise((resolve) => setTimeout(resolve, subscriberDelayMs));
      }

      if (gate && pageNum === gate.page) {
        await gate.wait();
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pageEnvelope(data, pageNum, limit, total)),
      });
      return;
    }

    // Fallback
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// Helpers de aserción
// ────────────────────────────────────────────────────────────────

/** Verifica que el foco está en un botón del pager, no en <body>. */
async function expectFocusOnPagerButton(page: Page) {
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  expect(tag).toBe('BUTTON');

  const ariaLabel = await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.getAttribute('aria-label'),
  );
  expect(ariaLabel).toMatch(/^(Siguiente|Anterior|Página \d+)$/);

  // Verificación adicional: el elemento activo está dentro del nav de paginación
  const inNav = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return false;
    const nav = el.closest('nav[aria-label]');
    if (!nav) return false;
    return (nav.getAttribute('aria-label') ?? '').includes('Paginación');
  });
  expect(inNav).toBe(true);
}

/** Conteo visible del pie (excluye aria-live). */
function visiblePagerCount(page: Page, text: string) {
  return page.locator('p:not([aria-live])').filter({ hasText: text });
}

/** Presupuesto de espera del reposo del pager. Una `duration-200` cabe de sobra. */
const PAGER_SETTLE_TIMEOUT_MS = 3_000;

/**
 * Espera a que **los controles del pager** terminen sus transiciones CSS.
 *
 * Por qué existe (hallazgo V2-A, INFORME-ADR065-V2-E2E-A11Y-EVIDENCIA-v1.0 §4.2):
 * al salir de `loading` el botón «Anterior» pasa a habilitado en el mismo frame,
 * pero `Button` lleva `transition-all duration-200` y la variante `secondary`
 * cambia de la paleta `disabled:` (`bg-gray-50` / `text-gray-400`) a la normal
 * (`bg-white` / `text-iwana-primary`). Durante esos ~200 ms el botón ya NO está
 * exento —`disabled === false`, `aria-busy="false"`— y los colores interpolados
 * miden 2,93–3,94:1. Auditar ahí es muestrear el peor instante posible.
 *
 * **Método elegido: `Animation.finished` del Web Animations API** sobre
 * `getAnimations({ subtree: true })` del `<nav>` de paginación. Justificación de
 * la elección, que la disposición D-1 pide explícita:
 *
 * - **Frente a `transitionend`:** es la misma señal, pero sin su agujero. Si la
 *   transición se interrumpe (otra paginación encadenada, un cambio de clase a
 *   mitad de camino), `transitionend` no se dispara nunca y la espera cuelga;
 *   `finished` **rechaza** con `AbortError`, que aquí se absorbe y se vuelve a
 *   consultar el conjunto de animaciones vivas. Además no exige registrar un
 *   listener antes del evento: pregunta por el estado actual del motor.
 * - **Frente a «dos frames de color estable» a secas:** la traza medida de la
 *   sonda de §4.2 la desmonta — `color` valía `oklab(0.706998 …)` en `tMs 0` y
 *   **el mismo valor en `tMs 3`**, y solo cambiaba en `tMs 15`. Una transición
 *   tarda un par de frames en arrancar, así que dos frames iguales pueden
 *   significar «aún no ha empezado», no «ya terminó». Elevar el número de
 *   frames sería una cifra mágica sin criterio.
 *
 * La estabilidad de estilo en dos frames **sí** se conserva, pero como
 * *confirmación posterior* al drenaje de animaciones, no como criterio único:
 * ahí ya no hay carrera de arranque que la engañe.
 *
 * Alcance deliberado: solo el `<nav>` de paginación. Ampliarlo a `document.body`
 * colgaría el helper ante cualquier animación indefinida del sistema
 * (`animate-spin`, `animate-pulse`), que nunca resuelve `finished`.
 *
 * Si el reposo no llega dentro del presupuesto, el helper **falla con
 * diagnóstico** en vez de rendirse en silencio: rendirse es exactamente el bug
 * que este cambio corrige.
 */
async function waitForPagerControlsSettled(page: Page) {
  const pending = await page.evaluate(async (timeoutMs: number) => {
    const nav = Array.from(document.querySelectorAll('nav[aria-label]')).find((candidate) =>
      (candidate.getAttribute('aria-label') ?? '').includes('Paginación'),
    );
    // Sin pager numerado no hay nada que esperar (tabla de una sola página).
    if (!nav) return [];

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Dos frames de cortesía: una transición CSS se registra durante la
    // recalculación de estilo POSTERIOR al commit de React, no en el frame en
    // que cambia el atributo. Sin esto se puede consultar `getAnimations()`
    // antes de que exista la transición y concluir reposo en falso — el mismo
    // error de muestreo que se está corrigiendo, una capa más abajo.
    await nextFrame();
    await nextFrame();

    const deadline = performance.now() + timeoutMs;
    const runningAnimations = () =>
      nav.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running');

    const describe = (animation: Animation) => {
      const effect = animation.effect as KeyframeEffect | null;
      const target = effect?.target as Element | null;
      const label = target?.getAttribute('aria-label') ?? target?.tagName ?? '?';
      return `${animation.constructor.name}(${
        (animation as unknown as { transitionProperty?: string }).transitionProperty ?? 'n/a'
      }) sobre ${label}`;
    };

    let inFlight = runningAnimations();
    while (inFlight.length > 0) {
      if (performance.now() > deadline) {
        return inFlight.map(describe);
      }
      // `finished` rechaza si la transición se cancela; eso NO es un error del
      // helper, es la señal de que ese objeto ya no está en vuelo. Se absorbe y
      // se vuelve a preguntar por el conjunto vivo.
      await Promise.all(inFlight.map((animation) => animation.finished.catch(() => undefined)));
      await nextFrame();
      inFlight = runningAnimations();
    }

    // Confirmación: dos frames consecutivos con el mismo color computado en los
    // controles y sus etiquetas. Ya sin animaciones vivas, esto solo puede
    // fallar si algo repinta fuera del motor de transiciones.
    const snapshot = () =>
      Array.from(nav.querySelectorAll<HTMLElement>('button, button *'))
        .map((element) => {
          const computed = getComputedStyle(element);
          return `${computed.color}|${computed.backgroundColor}|${computed.borderColor}|${computed.opacity}`;
        })
        .join(';');

    let previous = snapshot();
    await nextFrame();
    while (snapshot() !== previous) {
      if (performance.now() > deadline) {
        return ['el estilo computado del pager no se estabilizó en dos frames consecutivos'];
      }
      previous = snapshot();
      await nextFrame();
    }

    return [];
  }, PAGER_SETTLE_TIMEOUT_MS);

  expect(
    pending,
    `El pager no alcanzó el reposo en ${PAGER_SETTLE_TIMEOUT_MS} ms; en vuelo: ${pending.join(', ')}`,
  ).toEqual([]);
}

/**
 * Espera a que la tabla **y el pager** estén realmente en reposo antes de
 * auditar: sin `aria-busy`, con la opacidad del contenedor en 1 y con las
 * transiciones de los controles del pager terminadas.
 *
 * Las dos primeras condiciones cubren el contenedor de la tabla (`transition-
 * opacity`, 150 ms): sin ellas, una auditoría lanzada tras `networkidle` mide
 * un contraste atenuado — el flake de R-14/A-1.
 *
 * La tercera cubre el segundo transitorio, el de **salida** de la carga, que la
 * versión anterior de este helper no alcanzaba pese a declarar que auditaba «el
 * reposo»: devolvía el control en el instante exacto en que arrancaba la
 * transición de los botones del pager. Ver `waitForPagerControlsSettled`.
 *
 * Lo que este helper NO hace, y es deliberado: no cambia **qué** se asserta.
 * Corrige **cuándo** se muestrea. Las aserciones de axe siguen siendo
 * `toEqual([])`, sin techo ni tolerancia.
 *
 * El estado transitorio de **entrada** en carga tiene su propio test dedicado
 * más abajo (v2-34 R-14), con compuerta en la ruta y sin espera por tiempo.
 */
async function waitForTableSettled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.waitForFunction(() => {
    const shell = document.querySelector('table')?.parentElement;
    if (!shell) return false;
    return Number.parseFloat(getComputedStyle(shell).opacity) === 1;
  });
  await waitForPagerControlsSettled(page);
}

interface AxeContrastData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
  expectedContrastRatio?: string;
  fontSize?: string;
  fontWeight?: string;
}

interface AxeNodeLike {
  target: unknown[];
  html: string;
  any: Array<{ id: string; data?: AxeContrastData }>;
}

interface AxeViolationLike {
  id: string;
  impact?: string | null;
  help: string;
  nodes: AxeNodeLike[];
}

/**
 * Vuelca las violaciones con los datos medidos por axe (par de colores y ratio).
 * La evidencia va al log del reporter: un `toEqual([])` a secas no dice qué
 * elemento ni con qué ratio falla, y sin eso el hallazgo no es enrutable.
 */
function logAxeEvidence(label: string, rawViolations: readonly unknown[]) {
  if (rawViolations.length === 0) return;
  const violations = rawViolations as readonly AxeViolationLike[];
  console.log(
    `\n===== ${label} =====\n` +
      JSON.stringify(
        violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodeCount: v.nodes.length,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            html: n.html.slice(0, 190),
            data: n.any[0]?.data,
          })),
        })),
        null,
        2,
      ) +
      `\n===== /${label} =====`,
  );
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

test.describe('PortalTablePager — foco (v2-25) y a11y (v2-34)', () => {
  // ── v2-25: Foco no cae al <body> al paginar ──

  test('v2-25: foco permanece en un botón del pager al paginar', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    // Esperar que la tabla y la primera página carguen
    await expect(page.getByRole('heading', { name: 'Suscriptores' })).toBeVisible();
    await expect(page.getByText('Ana FocoUno0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 1–20 de 45 suscriptores')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    // Click en Siguiente
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Esperar que la página 2 se refleje en la UI
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Luis FocoDos0')).toBeVisible();
    await expect(page.getByText('Ana FocoUno0')).toHaveCount(0);
    await expect(visiblePagerCount(page, 'Mostrando 21–40 de 45 suscriptores')).toBeVisible();

    // Assert: el foco está en un botón del pager, NO en <body>
    await expectFocusOnPagerButton(page);
  });

  test('v2-25: foco restaurado tras paginar a la última página parcial', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.setViewportSize({ width: 1280, height: 800 });

    // Ir directo a página 2 y luego a página 3 (la última, con solo 5 registros)
    await page.goto('/dashboard/crm/subscribers?page=2');
    await expect(page.getByText('Luis FocoDos0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByText('Eva FocoTres0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 41–45 de 45 suscriptores')).toBeVisible();

    // El botón Siguiente debe estar deshabilitado (última página)
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    // Assert: foco está en un botón del pager
    await expectFocusOnPagerButton(page);
  });

  test('v2-25: foco restaurado tras volver con Anterior', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers?page=2');
    await expect(page.getByText('Luis FocoDos0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anterior' })).toBeEnabled();

    await page.getByRole('button', { name: 'Anterior' }).click();

    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByText('Ana FocoUno0')).toBeVisible();

    // Assert: foco en un botón del pager
    await expectFocusOnPagerButton(page);
  });

  // ── v2-27: Controles deshabilitados durante carga (bonus) ──

  test('v2-27: controles se deshabilitan durante carga con latencia', async ({ page }) => {
    // Mock con 400ms de latencia para que el estado "loading" sea observable
    await seedSession(page);
    await setupMocks(page, { subscriberDelayMs: 400, firstLoadOnly: false });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    await expect(page.getByText('Ana FocoUno0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    // Click en Siguiente — la API mockeada tarda 400ms
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Inmediatamente después del click, los controles deben estar deshabilitados
    // (el consumidor SubscribersListClientInner pone refreshing=true en loadPage)
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    // El nav debe marcar aria-busy durante la carga
    await expect(page.locator('nav[aria-busy="true"]')).toBeAttached();

    // Esperar que la nueva página cargue
    await expect(page.getByText('Luis FocoDos0')).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/page=2/);

    // Después de cargar, los controles deben dejar de estar deshabilitados
    // Siguiente sigue habilitado (hay página 3); Anterior también
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Anterior' })).toBeEnabled();

    // aria-busy debe haberse removido
    await expect(page.locator('nav[aria-busy="true"]')).not.toBeAttached();

    // Riesgo estructural v2-25 + v2-27: si el loading se levanta después de
    // restaurar el foco, el navegador desenfoca el botón al deshabilitarse.
    // Verificamos que el foco quedó en un botón del pager.
    await expectFocusOnPagerButton(page);
  });

  // ── v2-34: Auditoría axe-core sobre tabla paginada ──

  test('v2-34: axe-core no reporta violaciones en tabla paginada', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    // Esperar que la tabla cargue completamente
    await expect(page.getByText('Ana FocoUno0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 1–20 de 45 suscriptores')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await waitForTableSettled(page);

    // ── Auditoría axe en página 1 ──
    const page1Result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    logAxeEvidence('AXE_V2_34_PAGE1', page1Result.violations);
    expect(page1Result.violations).toEqual([]);

    // ── Paginar a página 2 y re-auditar ──
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Luis FocoDos0')).toBeVisible();
    await expect(page).toHaveURL(/page=2/);
    await page.waitForLoadState('networkidle');
    await waitForTableSettled(page);

    const page2Result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    logAxeEvidence('AXE_V2_34_PAGE2', page2Result.violations);
    expect(page2Result.violations).toEqual([]);

    // ── Auditoría en página 3 (última, parcial) ──
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Eva FocoTres0')).toBeVisible();
    await expect(page).toHaveURL(/page=3/);
    await page.waitForLoadState('networkidle');
    await waitForTableSettled(page);

    const page3Result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    logAxeEvidence('AXE_V2_34_PAGE3', page3Result.violations);
    expect(page3Result.violations).toEqual([]);
  });

  // ── R-14 / A-1: el estado transitorio de carga debe cumplir AA ──

  /**
   * REGRESIÓN PERMANENTE — hallazgo A-1 del INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.
   *
   * v2-34 exige que el contenido durante la carga cumpla AA. El defecto medido
   * (opacity-60 sobre el contenedor aria-busy: celda 3.34:1, línea secundaria
   * 2.32:1, cabecera 2.23:1) se corrigió el 2026-07-26 según el contrato de
   * estados atenuados §4.2 (docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md):
   * la región ocupada NO se atenúa — la señal son los controles disabled,
   * aria-busy, el anuncio aria-live y cursor-progress (portalDataBusyRegionClassName).
   *
   * Este test muere si alguien reintroduce una atenuación por opacidad sobre la
   * región busy: la aserción estructural exige opacidad computada = 1 DENTRO de
   * la ventana de carga y axe audita el contraste en esa misma ventana.
   *
   * Determinismo: la respuesta de la página 2 queda retenida por una compuerta
   * hasta que la auditoría termina. No hay espera por tiempo, así que no hay
   * carrera posible entre axe y el fin de la carga.
   */
  test('v2-34 R-14: el estado de carga cumple contraste AA', async ({ page }) => {
    let releaseGate: () => void = () => undefined;
    const gatePromise = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    await seedSession(page);
    await setupMocks(page, { gate: { page: 2, wait: () => gatePromise } });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    await expect(page.getByText('Ana FocoUno0')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await waitForTableSettled(page);

    // Disparar la carga de la página 2; la compuerta la mantiene en vuelo.
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // El estado transitorio está activo y es observable.
    await expect(page.locator('nav[aria-busy="true"]')).toBeAttached();
    const shellOpacity = await page.evaluate(() => {
      const shell = document.querySelector('table')?.parentElement;
      return shell ? getComputedStyle(shell).opacity : null;
    });
    // Contrato §4.2: la región busy NO se atenúa — el texto queda en su token
    // pleno con opacidad 1. Si vuelve un `opacity-*` sobre la región, muere aquí.
    expect(Number.parseFloat(shellOpacity ?? '1')).toBe(1);

    let refreshingResult: Awaited<ReturnType<AxeBuilder['analyze']>>;
    try {
      refreshingResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    } finally {
      // Liberar siempre la compuerta: un test que deja la ruta colgada
      // contamina el teardown y vuelve no determinista al resto del archivo.
      releaseGate();
    }

    logAxeEvidence('AXE_V2_34_REFRESHING', refreshingResult.violations);

    // Cierre limpio del ciclo antes de terminar.
    await expect(page.getByText('Luis FocoDos0')).toBeVisible();
    await waitForTableSettled(page);

    expect(refreshingResult.violations).toEqual([]);
  });

  /**
   * REGRESIÓN PERMANENTE — hallazgo A-2 del INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.
   *
   * La versión anterior de este test asertaba `violations.length <= 3` «por
   * posibles falsos positivos del emulado». La medición desmonta esa premisa:
   *
   * 1. No había falsos positivos porque NO había modo oscuro. El tema del portal
   *    lo aplica `ThemeProvider` (packages/ui) con la clase `.dark` en <html>,
   *    leyendo `localStorage['iwana-theme']`; solo cae en `prefers-color-scheme`
   *    cuando esa clave no existe. `seedSession()` navega antes a /auth/login,
   *    y ese montaje persiste `iwana-theme='light'`. A partir de ahí
   *    `emulateMedia({colorScheme:'dark'})` es inerte: medido, `html.className`
   *    quedaba vacío y `body` en rgb(255,255,255). El test auditaba el tema
   *    claro y pasaba con 0 violaciones bajo un techo de 3.
   * 2. Con el tema oscuro realmente aplicado, axe reportaba 5 nodos reales con
   *    dos pares de colores — no artefactos del emulado. Ambos corregidos:
   *
   *      a) Botón primario y botón de página activa del pager:
   *         #ffffff sobre #7b75ab (--color-iwana-primary-400) → 4.22:1 (exige 4.5:1)
   *         CORREGIDO el 2026-07-26 → `dark:bg-iwana-primary-500` (#5A5190, ~7:1).
   *         Superficies: Button.tsx:28, portal-ui.tsx:704.
   *      b) Placeholder de Select, ×4 filtros:
   *         #6a7282 sobre #2a2a2a (dark-surface-3) → 2.96:1 (exige 4.5:1)
   *         CORREGIDO el 2026-07-26 → `dark:text-gray-400` (5,52:1).
   *
   * El techo `<= 3` quedó retirado: la aserción es `toEqual([])`, igual que en
   * modo claro. Ambos defectos corregidos → sin `test.fail()`.
   */
  test('v2-34: modo oscuro no introduce violaciones de contraste', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    // Mecanismo real del producto: ThemeProvider lee localStorage['iwana-theme'].
    // Sembrar ANTES de navegar (addInitScript) — evaluate en about:blank falla con SecurityError.
    await page.addInitScript(() => {
      window.localStorage.setItem('iwana-theme', 'dark');
    });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    await expect(page.getByText('Ana FocoUno0')).toBeVisible();
    // Guardarraíl: si el tema oscuro no se aplicó, el test debe morir aquí y no
    // dar por buena una auditoría del tema claro.
    await expect(page.locator('html.dark')).toBeAttached();
    await page.waitForLoadState('networkidle');
    await waitForTableSettled(page);

    const darkResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    logAxeEvidence('AXE_V2_34_DARK', darkResult.violations);
    expect(darkResult.violations).toEqual([]);
  });
});
