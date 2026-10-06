import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { seedSession, setupMocks } from './helpers/consola-ot-fixtures';

// MOD11 Origen de OT · E4-portal (CA-12): bandeja y resumen distinguen la OT
// sin ventana («Por programar» / «Sin ventana planificada») sin columna, orden
// local ni encabezados ordenables. API simulada con page.route sobre las
// fixtures de la consola; las rutas de este archivo se registran DESPUÉS de
// `setupMocks`, así que tienen prioridad y delegan el resto con `fallback()`.

const EVIDENCE_DIR = fileURLToPath(new URL('../../docs/quality/mod11-e4', import.meta.url));

const WINDOW = { startAt: '2026-10-06T14:00:00.000Z', endAt: '2026-10-06T16:00:00.000Z' };

function row(id: string, number: string, status: string, window: typeof WINDOW | null) {
  return {
    id,
    number,
    status,
    result: null,
    workType: 'INSTALLATION',
    schedule: { eventId: window ? `event-${id}` : null, window },
    assignee:
      status === 'CREATED' ? null : { type: 'TECHNICIAN', id: 't1', displayLabel: 'Técnico' },
    customerDisplayLabel: 'Cliente de prueba',
    municipality: 'Bogotá',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  };
}

// Orden publicado por el servidor: sin ventana primero, luego fecha descendente.
const ROWS = [
  row('eo-e4-created', 'OTE-E4-001', 'CREATED', null),
  row('eo-e4-assigned', 'OTE-E4-002', 'ASSIGNED', null),
  row('eo-e4-route', 'OTE-E4-003', 'EN_ROUTE', null),
  row('eo-e4-progress', 'OTE-E4-004', 'IN_PROGRESS', null),
  row('eo-e4-blocked', 'OTE-E4-005', 'BLOCKED', null),
  row('eo-e4-completed', 'OTE-E4-006', 'COMPLETED', null),
  row('eo-e4-observed', 'OTE-E4-007', 'COMPLETED_WITH_OBSERVATIONS', null),
  row('eo-e4-notexec', 'OTE-E4-008', 'NOT_EXECUTED', null),
  row('eo-e4-cancelled', 'OTE-E4-009', 'CANCELLED', null),
  row('eo-e4-windowed', 'OTE-E4-010', 'ASSIGNED', WINDOW),
];

function detail(id: string, status: string, window: typeof WINDOW | null) {
  return {
    id,
    number: 'OTE-E4-001',
    version: 1,
    status,
    annulled: false,
    workType: 'INSTALLATION',
    template: null,
    schedule: { eventId: window ? 'event-e4' : null, window },
    assignee: null,
    site: { id: 'site-001', label: 'Sitio de prueba' },
    completion: { progress: 0 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  };
}

const DETAILS: Record<string, ReturnType<typeof detail>> = {
  'eo-e4-created': detail('eo-e4-created', 'CREATED', null),
  'eo-e4-cancelled': detail('eo-e4-cancelled', 'CANCELLED', null),
  'eo-e4-windowed': detail('eo-e4-windowed', 'ASSIGNED', WINDOW),
};

async function setupE4(page: Page) {
  await setupMocks(page);
  await seedSession(page);
  await page.route(/\/api\/v1\/tasks\/execution-orders(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: ROWS,
        total: ROWS.length,
        page: 1,
        limit: 20,
        meta: {
          nextCursor: null,
          total: ROWS.length,
          totalIsEstimate: false,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      }),
    });
  });
  await page.route(/\/api\/v1\/tasks\/execution-orders\/eo-e4-[^/?]+(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const body = DETAILS[id];
    if (!body) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe('E4-portal: OT sin ventana (HTTP simulado)', () => {
  test('bandeja: estado abierto «Por programar», terminal «Sin ventana planificada», con ventana el intervalo', async ({
    page,
  }) => {
    await setupE4(page);
    await page.goto('/dashboard/operations/execution-orders');

    const table = page.getByRole('table', { name: 'Bandeja de órdenes de ejecución' });
    await expect(table).toBeVisible();

    const windowCell = (number: string) =>
      table
        .getByRole('row', { name: new RegExp(number) })
        .getByRole('cell')
        .nth(4);

    for (const open of ['001', '002', '003', '004', '005']) {
      await expect(windowCell(`OTE-E4-${open}`)).toHaveText('Por programar');
    }
    for (const terminal of ['006', '007', '008', '009']) {
      await expect(windowCell(`OTE-E4-${terminal}`)).toHaveText('Sin ventana planificada');
    }
    const windowed = windowCell('OTE-E4-010');
    await expect(windowed).not.toHaveText(/Por programar|Sin ventana planificada|^—$/);
    await expect(windowed).toHaveText(/2026|oct|\d{1,2}:\d{2}/i);

    // Sin columna extra, sin encabezados ordenables y el orden del servidor se respeta.
    await expect(table.getByRole('columnheader')).toHaveCount(8);
    await expect(table.locator('th[aria-sort]')).toHaveCount(0);
    await expect(table.locator('thead button')).toHaveCount(0);
    const numbers = await table.getByRole('button', { name: /^OTE-E4-/ }).allTextContents();
    expect(numbers).toEqual(ROWS.map((r) => r.number));
    // Sin enums crudos visibles en la bandeja.
    await expect(
      table.getByText(/\b(CREATED|IN_PROGRESS|COMPLETED_WITH_OBSERVATIONS)\b/),
    ).toHaveCount(0);

    await page.screenshot({ path: `${EVIDENCE_DIR}/e4-bandeja-ventana-nula.png`, fullPage: false });
  });

  test('resumen abierto: «Por programar» con la ayuda, sin invitar a reclamar la orden', async ({
    page,
  }) => {
    await setupE4(page);
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-e4-created');

    const drawer = page.getByRole('dialog');
    const block = drawer.getByText('Ventana planificada', { exact: true }).locator('..');
    await expect(block).toContainText('Por programar');
    await expect(block).toContainText(
      'Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.',
    );
    await expect(drawer.getByRole('button', { name: /reclam|tomar|asignarme/i })).toHaveCount(0);

    await page.screenshot({ path: `${EVIDENCE_DIR}/e4-resumen-abierto-sin-ventana.png` });
  });

  test('resumen terminal: «Sin ventana planificada» sin ayuda; con ventana, el intervalo', async ({
    page,
  }) => {
    await setupE4(page);
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-e4-cancelled');

    let drawer = page.getByRole('dialog');
    let block = drawer.getByText('Ventana planificada', { exact: true }).locator('..');
    await expect(block).toContainText('Sin ventana planificada');
    await expect(drawer.getByText(/Coordina su programación/)).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE_DIR}/e4-resumen-terminal-sin-ventana.png` });

    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-e4-windowed');
    drawer = page.getByRole('dialog');
    block = drawer.getByText('Ventana planificada', { exact: true }).locator('..');
    await expect(block).not.toContainText(/Por programar|Sin ventana planificada/);
    await expect(block).toContainText('–');
    await expect(drawer.getByText(/Coordina su programación/)).toHaveCount(0);
  });
});
