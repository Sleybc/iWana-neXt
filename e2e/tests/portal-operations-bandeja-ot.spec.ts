/**
 * E2E de navegador — sub-rutas de Operaciones y bandeja de OT (MOD11 OLA4 F6).
 *
 * Cubre CA-01…CA-07 de la spec `2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md`
 * §6 con HTTP mockeado (sin backend): la verificación contra API real vive en
 * `e2e/tests/api/execution-orders-operational.spec.ts` bloque 9.
 *
 * - CA-01: la bandeja canónica lista, filtra y abre la OT sin pasar por Programación.
 * - CA-02: el deep link legado `/dashboard/operations?executionOrderId=` sigue vivo
 *   y termina en la URL canónica (despachador en servidor).
 * - CA-04: página y filtros viven en la URL; Siguiente empuja, filtro reemplaza y
 *   el botón Atrás vuelve al estado anterior.
 * - CA-05: cada tabla monta un solo pie, elegido por `meta.capabilities.randomAccess`.
 * - CA-06: cerrar el drawer conserva filtros, página y orden.
 * - CA-07: entrar a `/tasks/new` no monta el árbol de la OT (ni pide su listado).
 *
 * CA-03 (BOLA y alcance del conteo, ADR-065 §15) se fija en
 * `tasks.boundary.spec.ts` (dos alcances, predicado parametrizado) y en
 * `ExecutionOrdersClient.spec.tsx` (el pie refleja el `meta.total` del alcance).
 *
 * HTTP mockeado — no requiere backend. Sin PII real.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

// ────────────────────────────────────────────────────────────────
// Fixtures de sesión
// ────────────────────────────────────────────────────────────────

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-operations-e2e',
      email: 'sha256:admin-hash-operations-e2e',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-operations-e2e',
      schemaName: 'tenant_operations_e2e',
      jti: 'jti-operations-e2e',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_TENANT = 'tenant-operations-e2e';

const MOCK_ME = {
  sub: 'user-admin-uuid-operations-e2e',
  email: 'sha256:admin-hash-operations-e2e',
  role: 'ADMIN',
  tenantId: 'tenant-uuid-operations-e2e',
  schemaName: 'tenant_operations_e2e',
  jti: 'jti-operations-e2e',
  type: 'tenant',
  passwordResetRequired: false,
};

const OPERATIONS_PERMISSIONS = [
  'operations.execution_orders.read',
  'operations.tasks.read',
  'operations.tasks.manage',
  'settings.read',
];

// ────────────────────────────────────────────────────────────────
// Factories de datos ficticios
// ────────────────────────────────────────────────────────────────

const ORDERS_TOTAL = 45;
const TASKS_TOTAL = 45;

function buildOrder(pageNumber: number, index: number) {
  return {
    id: `eo-p${pageNumber}-${index}`,
    number: `OT-P${pageNumber}-${index}`,
    status: 'ASSIGNED',
    result: null,
    workType: 'INSTALLATION',
    schedule: {
      eventId: `event-p${pageNumber}-${index}`,
      window: {
        startAt: `2026-09-${String(10 + pageNumber).padStart(2, '0')}T14:00:00.000Z`,
        endAt: `2026-09-${String(10 + pageNumber).padStart(2, '0')}T16:00:00.000Z`,
      },
    },
    assignee: { type: 'TECHNICIAN', id: `tech-${index}`, displayLabel: `Técnico ${index}` },
    customerDisplayLabel: `Cliente ${index}`,
    municipality: 'Bogotá',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
  };
}

function buildTask(pageNumber: number, index: number) {
  return {
    id: `task-p${pageNumber}-${index}`,
    taskNumber: `TSK-P${pageNumber}-${index}`,
    type: 'INTERNAL_OPERATION',
    status: 'OPEN',
    priority: 'NORMAL',
    title: `Tarea P${pageNumber}-${index}`,
    responsibleRefId: 'user-admin-uuid-operations-e2e',
    responsibleLabel: 'Admin de prueba',
    recipientType: 'INTERNAL_AREA',
    recipientRefId: 'operations-area',
    recipientLabel: 'Operaciones',
    executionMode: 'IMMEDIATE',
    scheduledRequired: false,
    dueAt: '2026-09-20T14:00:00.000Z',
    createdAt: '2026-09-13T10:00:00.000Z',
  };
}

const ORDERS_PAGES = [
  Array.from({ length: 20 }, (_, index) => buildOrder(1, index)),
  Array.from({ length: 20 }, (_, index) => buildOrder(2, index)),
  Array.from({ length: 5 }, (_, index) => buildOrder(3, index)),
];

const TASKS_PAGES = [
  Array.from({ length: 20 }, (_, index) => buildTask(1, index)),
  Array.from({ length: 20 }, (_, index) => buildTask(2, index)),
  Array.from({ length: 5 }, (_, index) => buildTask(3, index)),
];

function pageMeta(page: number, limit: number, total: number, randomAccess = true) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
    mode: 'page',
    capabilities: { randomAccess, sortableFields: [] },
    sort: null,
  };
}

// ────────────────────────────────────────────────────────────────
// Sesión
// ────────────────────────────────────────────────────────────────

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: MOCK_TENANT });
}

// ────────────────────────────────────────────────────────────────
// Mocks HTTP
// ────────────────────────────────────────────────────────────────

interface MockState {
  /** Modo del pie del listado de OT (`randomAccess`). */
  ordersRandomAccess: boolean;
  /** Peticiones al listado de OT — CA-07 exige que crear tarea no lo pida. */
  ordersListRequests: number;
  /** Peticiones al listado de tareas. */
  tasksListRequests: number;
  /** Fuerza un 500 en la siguiente consulta al listado de OT (P1-1). */
  ordersFailNext: boolean;
}

function createMockState(): MockState {
  return {
    ordersRandomAccess: true,
    ordersListRequests: 0,
    tasksListRequests: 0,
    ordersFailNext: false,
  };
}

async function setupMocks(page: Page, state: MockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    const method = request.method();

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    // Branding público
    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      return json({
        data: {
          displayName: 'Tenant Operaciones E2E',
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
      });
    }

    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return json({
        data: {
          id: 'tenant-uuid-operations-e2e',
          slug: MOCK_TENANT,
          displayName: 'Tenant Operaciones E2E',
          status: 'ACTIVE',
        },
      });
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return json({
        data: {
          id: 'tenant-uuid-operations-e2e',
          name: 'Tenant Operaciones E2E',
          slug: MOCK_TENANT,
          status: 'ACTIVE',
          contactEmail: 'contacto@operations-e2e.test',
          showTenantName: true,
        },
      });
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      return json({ data: MOCK_ME });
    }

    if (pathname.endsWith('/access-control/me/effective-permissions') && method === 'GET') {
      return json({
        data: {
          userId: MOCK_ME.sub,
          role: 'ADMIN',
          effectivePermissions: OPERATIONS_PERMISSIONS,
          recoveryPermissions: [],
          profileSources: [],
        },
      });
    }

    if (pathname.endsWith('/notifications') && method === 'GET') {
      return json({ data: [], meta: { nextCursor: null, total: 0 } });
    }

    if (pathname.endsWith('/dashboard/summary') && method === 'GET') {
      return json({
        data: {
          tenantName: 'Tenant Operaciones E2E',
          activeSubscribers: 0,
          pendingInstallations: 0,
          overdueInvoices: 0,
          uptimePercent: 99.9,
          alerts: [],
        },
      });
    }

    if (pathname.endsWith('/configuration/settings-sections') && method === 'GET') {
      return json({ data: [] });
    }

    if (pathname.endsWith('/auth/logout') && method === 'POST') {
      return json({});
    }

    if (pathname.endsWith('/auth/refresh') && method === 'POST') {
      return json({ data: { accessToken: MOCK_TOKEN } });
    }

    // Typeahead de personas (filtros «Asignado a» / «Responsable»)
    if (pathname.endsWith('/users/search') && method === 'GET') {
      return json({ data: [], total: 0 });
    }

    // Perfil de usuario (layout)
    if (/\/users\/[^/]+$/.test(pathname) && method === 'GET') {
      return json({
        data: {
          id: MOCK_ME.sub,
          email: 'admin@operations-e2e.test',
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          phone: null,
          jobTitle: 'Administradora',
          avatarUrl: null,
          mfaEnabled: false,
          emailVerified: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }

    // Catálogo de sedes de la toolbar de OT
    if (pathname.endsWith('/organization/sites') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    // Custodia del ejecutor (drawer): sin responsable asignado no se consulta,
    // pero el contrato responde 200 con `location` null si llegara. La respuesta
    // viaja SIN envelope (contrato congelado v1 de `/inventory/custody`).
    if (pathname.endsWith('/inventory/custody') && method === 'GET') {
      return json({
        location: null,
        assets: { items: [], meta: pageMeta(1, 25, 0) },
        balances: { items: [], meta: pageMeta(1, 25, 0) },
      });
    }

    // Catálogos que la consola de OT carga al abrir el detalle (evitan el
    // rechazo no controlado del hook al mapear `items.data`).
    if (pathname.endsWith('/inventory/items') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    if (pathname.endsWith('/inventory/locations') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    // ── Bandeja de OT ────────────────────────────────────────────
    if (pathname.endsWith('/tasks/execution-orders') && method === 'GET') {
      state.ordersListRequests += 1;
      if (state.ordersFailNext) {
        state.ordersFailNext = false;
        return json({ statusCode: 500, message: 'Fallo simulado del refresco' }, 500);
      }
      const parsed = new URL(url);
      const pageNumber = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1;
      const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '20', 10) || 20;
      const data = ORDERS_PAGES[Math.min(pageNumber, ORDERS_PAGES.length) - 1] ?? [];
      return json({
        data,
        total: ORDERS_TOTAL,
        page: pageNumber,
        limit,
        meta: pageMeta(pageNumber, limit, ORDERS_TOTAL, state.ordersRandomAccess),
      });
    }

    // Detalle de la OT (drawer por `?executionOrderId=`): el contrato devuelve
    // el registro directo, sin envelope (`returnFullResponse` lo conserva tal cual).
    // `eo-ghost` simula el enlace vencido del estado E6.
    if (/\/tasks\/execution-orders\/[^/]+$/.test(pathname) && method === 'GET') {
      const orderId = pathname.split('/').pop() ?? 'eo-p1-0';
      if (orderId === 'eo-ghost') {
        return json({ statusCode: 404, message: 'Orden no encontrada' }, 404);
      }
      return json({
        id: orderId,
        number: orderId.replace('eo-', 'OT-').toUpperCase(),
        version: 1,
        status: 'ASSIGNED',
        workType: 'INSTALLATION',
        template: null,
        schedule: {
          eventId: 'event-detail-001',
          window: {
            startAt: '2026-09-14T14:00:00.000Z',
            endAt: '2026-09-14T16:00:00.000Z',
          },
        },
        site: { id: 'site-001', label: 'Sede operativa' },
        completion: { progress: 0, completed: 0, total: 3 },
        syncState: 'IN_SYNC',
        inventoryReconciliation: 'NOT_REQUIRED',
        allowedActions: [],
        createdAt: '2026-09-13T10:00:00.000Z',
        updatedAt: '2026-09-13T10:00:00.000Z',
      });
    }

    if (
      /\/tasks\/execution-orders\/[^/]+\/(activities|item-usage|evidences)$/.test(pathname) &&
      method === 'GET'
    ) {
      return json({ data: [], meta: pageMeta(1, 25, 0) });
    }

    // ── Bandeja de tareas ────────────────────────────────────────
    if (pathname.endsWith('/tasks') && method === 'GET') {
      state.tasksListRequests += 1;
      const parsed = new URL(url);
      const pageNumber = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1;
      const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '20', 10) || 20;
      const data = TASKS_PAGES[Math.min(pageNumber, TASKS_PAGES.length) - 1] ?? [];
      return json({
        data,
        total: TASKS_TOTAL,
        page: pageNumber,
        limit,
        meta: pageMeta(pageNumber, limit, TASKS_TOTAL),
      });
    }

    // Trazabilidad del detalle de tarea (drawer): el contrato devuelve el
    // arreglo directo, sin envelope (`returnFullResponse`).
    if (/\/tasks\/[^/]+\/(timeline|assignment-history)$/.test(pathname) && method === 'GET') {
      return json([]);
    }

    // Detalle de tarea por deep link (`?taskId=`): `task-ghost` simula el
    // enlace vencido del estado E7; el resto devuelve el registro pedido.
    if (/\/tasks\/[^/]+$/.test(pathname) && method === 'GET') {
      const taskId = pathname.split('/').pop() ?? '';
      if (taskId === 'task-ghost') {
        return json({ statusCode: 404, message: 'Tarea no encontrada' }, 404);
      }
      return json({ ...buildTask(1, 0), id: taskId });
    }

    // Fallback
    return json({ data: null });
  });
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

/** Conteo visible del pie (excluye la región aria-live que repite el texto). */
function visiblePagerCount(page: Page, text: string) {
  return page.locator('p:not([aria-live])').filter({ hasText: text });
}

test.describe('Operaciones — sub-rutas y bandeja de OT (CA-01…CA-07)', () => {
  test('CA-01: la bandeja canónica lista, filtra y abre la OT sin pasar por Programación', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders');

    // Listado con su marco de módulo y su pie numerado (alcance del API: 45).
    await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible();
    await expect(page.getByText('Bandeja de órdenes de ejecución')).toBeVisible();
    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();
    await expect(
      visiblePagerCount(page, 'Mostrando 1–20 de 45 órdenes de ejecución'),
    ).toBeVisible();
    expect(state.ordersListRequests).toBeGreaterThanOrEqual(1);

    // Filtro por estado: se refleja en la URL (replace) sin salir de la bandeja.
    await page.getByRole('combobox', { name: 'Estado' }).click();
    await page.getByRole('option', { name: 'Asignada' }).click();
    await expect(page).toHaveURL(/\/dashboard\/operations\/execution-orders\?.*status=ASSIGNED/);

    // Apertura de la OT desde la fila: el detalle vive en la URL.
    await page.getByRole('button', { name: 'OT-P1-0' }).click();
    await expect(page).toHaveURL(/executionOrderId=eo-p1-0/);
    await expect(page.getByRole('heading', { name: 'OT-P1-0' })).toBeVisible();
  });

  test('CA-02: el deep link legado abre la OT y termina en la URL canónica (despachador)', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations?executionOrderId=eo-p1-0');

    // El despachador de la raíz redirige (307) preservando la query completa.
    await expect(page).toHaveURL(
      /\/dashboard\/operations\/execution-orders\?executionOrderId=eo-p1-0/,
    );
    await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'OT-P1-0' })).toBeVisible();
  });

  test('CA-04: página en URL — Siguiente empuja y Atrás vuelve a la página anterior', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders');

    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'OT-P2-0' })).toBeVisible();

    await page.goBack();

    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();
  });

  test('CA-04: cambiar filtro reinicia a página 1 y lo refleja con replace', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?page=2');
    await expect(page.getByRole('button', { name: 'OT-P2-0' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Estado' }).click();
    await page.getByRole('option', { name: 'Asignada' }).click();

    await expect(page).toHaveURL(/status=ASSIGNED/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();
  });

  test('CA-05: cada tabla monta un solo pie, elegido por randomAccess', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });

    // randomAccess: true → pager numerado, nunca «Cargar más».
    await page.goto('/dashboard/operations/execution-orders');
    await expect(
      visiblePagerCount(page, 'Mostrando 1–20 de 45 órdenes de ejecución'),
    ).toBeVisible();
    await expect(page.locator('nav[aria-label*="Paginación"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);

    await page.goto('/dashboard/operations/tasks');
    await expect(visiblePagerCount(page, 'Mostrando 1–20 de 45 tareas')).toBeVisible();
    await expect(page.locator('nav[aria-label*="Paginación"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
  });

  test('CA-05: con randomAccess false la tabla degrada a «Cargar más» y no monta el pager', async ({
    page,
  }) => {
    const state = createMockState();
    state.ordersRandomAccess = false;
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders');

    await expect(page.getByRole('button', { name: 'Cargar más' })).toBeVisible();
    await expect(page.locator('nav[aria-label*="Paginación"]')).toHaveCount(0);
  });

  test('CA-06: cerrar el drawer conserva filtros, página y orden', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?status=ASSIGNED&page=2');
    await expect(page.getByRole('button', { name: 'OT-P2-0' })).toBeVisible();

    await page.getByRole('button', { name: 'OT-P2-0' }).click();
    await expect(page).toHaveURL(/executionOrderId=eo-p2-0/);
    await expect(page.getByRole('heading', { name: 'OT-P2-0' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar' }).click();

    await expect(page).not.toHaveURL(/executionOrderId=/);
    await expect(page).toHaveURL(/status=ASSIGNED/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'OT-P2-0' })).toBeVisible();
  });

  test('CA-06: cerrar el drawer de tareas conserva filtros, página y orden', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/tasks?status=OPEN&page=2');
    await expect(page.getByRole('button', { name: 'Tarea P2-0' })).toBeVisible();

    await page.getByRole('button', { name: 'Tarea P2-0' }).click();
    await expect(page).toHaveURL(/taskId=task-p2-0/);
    await expect(page.getByRole('heading', { name: 'Tarea P2-0' })).toBeVisible();

    // El drawer del detalle de tarea cierra con Escape (Dialog accesible).
    await page.keyboard.press('Escape');

    await expect(page).not.toHaveURL(/taskId=/);
    await expect(page).toHaveURL(/status=OPEN/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'Tarea P2-0' })).toBeVisible();
  });

  test('CA-07: entrar a crear tarea no monta el árbol de la OT', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/tasks/new');

    await expect(page.getByRole('heading', { name: 'Crear tarea' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Bandeja de órdenes de ejecución' }),
    ).toHaveCount(0);
    // El intake no consulta el listado de OT ni monta su bandeja.
    expect(state.ordersListRequests).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────
  // OLA 4.1 — cierre de bloqueantes de PROD-UX y DS-OWNER
  // ────────────────────────────────────────────────────────────────

  test('E6: el deep link a una OT inaccesible muestra la alerta con salida a la bandeja', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-ghost');

    await expect(page.getByText('No pudimos abrir esta orden de ejecución')).toBeVisible();
    // El error de llegada es la alerta del contenedor, no un drawer bloqueante.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('link', { name: 'Ver todas las órdenes de ejecución' }).click();

    await expect(page).toHaveURL(/\/dashboard\/operations\/execution-orders$/);
    await expect(page.getByText('No pudimos abrir esta orden de ejecución')).toHaveCount(0);
  });

  test('PROD-UX #4: la alerta E7 desaparece al ejecutar «Ver todas las tareas»', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/tasks?taskId=task-ghost');

    await expect(page.getByText('No pudimos abrir esta tarea')).toBeVisible();
    await page.getByRole('link', { name: 'Ver todas las tareas' }).click();

    await expect(page).toHaveURL(/\/dashboard\/operations\/tasks$/);
    await expect(page.getByText('No pudimos abrir esta tarea')).toHaveCount(0);
  });

  test('DS P1-1: un fallo de refresco conserva las filas y no co-renderiza el vacío', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders');
    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();

    state.ordersFailNext = true;
    await page.getByRole('button', { name: 'Actualizar' }).click();

    await expect(page.getByText('No pudimos cargar la información')).toBeVisible();
    await expect(page.getByRole('button', { name: 'OT-P1-0' })).toBeVisible();
    await expect(page.getByText('Todavía no hay órdenes de ejecución')).toHaveCount(0);
  });

  test('M3.1: cancelar el alta vuelve a la bandeja con su estado restaurado', async ({ page }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/tasks?status=OPEN&page=2');
    await expect(page.getByRole('button', { name: 'Tarea P2-0' })).toBeVisible();

    await page.getByRole('link', { name: 'Crear tarea' }).click();
    await expect(page).toHaveURL(/\/dashboard\/operations\/tasks\/new\?returnTo=/);

    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL(/\/dashboard\/operations\/tasks\?.*status=OPEN/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('button', { name: 'Tarea P2-0' })).toBeVisible();
  });

  test('PROD-UX #7: al cerrar la OT por deep link el foco aterriza en el encabezado de resultados', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-p1-0');
    await expect(page.getByRole('heading', { name: 'OT-P1-0' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar' }).click();

    await expect(page).not.toHaveURL(/executionOrderId=/);
    await expect(page.locator('#execution-orders-results')).toBeFocused();
  });

  test('PROD-UX #1: el detalle de tareas cierra con «Cerrar» visible y devuelve el foco a resultados', async ({
    page,
  }) => {
    const state = createMockState();
    await setupMocks(page, state);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/tasks?taskId=task-p1-0&status=OPEN');
    await expect(page.getByRole('heading', { name: 'Tarea P1-0' })).toBeVisible();

    const close = page.getByRole('button', { name: 'Cerrar' });
    await expect(close).toBeVisible();
    await close.click();

    await expect(page).not.toHaveURL(/taskId=/);
    await expect(page).toHaveURL(/status=OPEN/);
    await expect(page.locator('#tasks-results')).toBeFocused();
  });
});
