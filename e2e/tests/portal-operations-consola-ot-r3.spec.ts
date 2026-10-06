import { expect, test, type Page, type Route } from '@playwright/test';
import { seedSession, setupMocks } from './helpers/consola-ot-fixtures';

// R3 — consumo y custodia bajo demanda de la consola de OT (HTTP simulado).
//
// La API se simula con `page.route` sobre el dev server real del portal. Lo que se
// verifica en el navegador es el momento de la consulta (la custodia solo al abrir
// «Registrar equipo instalado»), el filtro por categoría con varias páginas, los
// estados de error y vacío, y que el acto no mezcla disponibilidad con historial.
// Las capturas de `docs/quality/mod11-ola2b/` solo se escriben con R3_EVIDENCIA=1 para
// que una corrida normal no reescriba archivos versionados.

const EVIDENCE_DIR = 'docs/quality/mod11-ola2b';
const captureEvidence = process.env.R3_EVIDENCIA === '1';

const SNAPSHOT = {
  id: 'tpl-v2',
  key: 'INSTALACION_ESTANDAR',
  version: 2,
  label: 'Instalación estándar',
  requirements: [
    {
      key: 'installed-equipment',
      label: 'Equipos instalados en el sitio del cliente',
      required: true,
      kind: 'MATERIAL',
      itemCategory: 'CPE',
      finalDisposition: 'INSTALLED_AT_CUSTOMER',
    },
    {
      key: 'service-test',
      label: 'Prueba de servicio en el sitio',
      required: true,
      kind: 'EVIDENCE',
      evidenceType: 'PHOTO',
    },
  ],
};

const REQUIREMENTS = [
  {
    requirementId: 'installed-equipment',
    label: 'Equipos instalados en el sitio del cliente',
    kind: 'MATERIAL',
    satisfied: false,
    reason: 'No se ha registrado el material "Equipos instalados en el sitio del cliente".',
  },
  {
    requirementId: 'service-test',
    label: 'Prueba de servicio en el sitio',
    kind: 'EVIDENCE',
    satisfied: false,
    reason: 'No se ha vinculado una foto para "Prueba de servicio en el sitio".',
  },
];

function detail(id: string, status: string, allowedActions: string[]) {
  return {
    id,
    number: 'OTE-20261005-R3',
    version: 4,
    status,
    workType: 'INSTALLATION',
    template: SNAPSHOT,
    schedule: {
      eventId: 'event-r3',
      window: { startAt: '2026-10-05T14:00:00.000Z', endAt: '2026-10-05T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
    site: { id: 'site-001', label: 'Sitio de instalación' },
    completion: { progress: 0, completed: 0, total: 2, requirements: REQUIREMENTS },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  };
}

function listMeta(overrides: Record<string, unknown> = {}) {
  return {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
    ...overrides,
  };
}

const item = (id: string, sku: string, name: string) => ({
  id,
  sku,
  name,
  status: 'ACTIVE',
  categoryId: 'cat-cpe',
  categoryCode: 'CPE',
});

function custodyPage(page: number) {
  const location = {
    id: 'loc-mobile-001',
    name: 'Bodega móvil de Carlos López',
    type: 'MOBILE_TECHNICIAN',
    responsibleType: 'TECHNICIAN',
    responsibleRefId: 'tech-001',
  };
  const meta = (total: number) => listMeta({ page, totalPages: 2, hasMore: page < 2, total });
  if (page === 1) {
    // Primera página: solo herramientas, ninguna de la categoría del requisito.
    return {
      location,
      assets: {
        items: [
          {
            id: 'asset-tool',
            inventoryItemId: 'item-herramienta',
            serialNumber: 'HERR-0001',
            currentStatus: 'ASSIGNED_TO_TECHNICIAN',
          },
        ],
        meta: meta(1),
      },
      balances: { items: [], meta: meta(0) },
    };
  }
  return {
    location,
    assets: {
      items: [
        {
          id: 'asset-ont',
          inventoryItemId: 'item-ont',
          serialNumber: 'ONT-E2E-0001',
          currentStatus: 'ASSIGNED_TO_TECHNICIAN',
        },
      ],
      meta: meta(1),
    },
    balances: {
      items: [
        {
          id: 'balance-router',
          itemId: 'item-router',
          quantityOnHand: '4',
          quantityReserved: '0',
          condition: 'NEW',
        },
      ],
      meta: meta(1),
    },
  };
}

interface R3Mocks {
  /** Peticiones a `/inventory/*` en orden de llegada. */
  inventoryCalls: string[];
  /** Cuántas veces responderá 500 la custodia antes de recuperarse. */
  failCustody: { remaining: number };
}

async function mockR3(page: Page, options: { emptyCustody?: boolean } = {}): Promise<R3Mocks> {
  const mocks: R3Mocks = { inventoryCalls: [], failCustody: { remaining: 0 } };
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.includes('/inventory/')) mocks.inventoryCalls.push(`${path}${url.search}`);

    if (request.method() === 'GET') {
      if (/\/tasks\/execution-orders\/eo-r3-progress$/.test(path)) {
        return json(
          detail('eo-r3-progress', 'IN_PROGRESS', [
            'REGISTER_ACTIVITY',
            'REGISTER_ITEM_USAGE',
            'REGISTER_EVIDENCE',
            'CLOSE',
          ]),
        );
      }
      if (/\/tasks\/execution-orders\/eo-r3-prestart$/.test(path)) {
        // Aunque llegue el permiso de consumo, en preinicio no hay acto ni custodia.
        return json(detail('eo-r3-prestart', 'ASSIGNED', ['START', 'REGISTER_ITEM_USAGE']));
      }
      if (/\/tasks\/execution-orders\/eo-r3-[^/]+\/item-usage$/.test(path)) {
        return json({
          data: [
            {
              id: 'iu-1',
              itemId: 'item-ont',
              quantity: 1,
              serial: 'ONT-INSTALADA-0007',
              action: 'INSTALL',
              finalDisposition: 'INSTALLED_AT_CUSTOMER',
              inventoryRequestId: 'ir-1',
              movementStatus: 'PENDING',
              createdAt: '2026-10-05T14:30:00.000Z',
            },
          ],
          meta: listMeta({ total: 1 }),
        });
      }
      if (path.endsWith('/inventory/categories')) {
        return json({
          data: [{ id: 'cat-cpe', code: 'CPE', name: 'Equipos de cliente' }],
          meta: listMeta({ mode: 'cursor', page: null, totalPages: null, total: 1 }),
        });
      }
      if (path.endsWith('/inventory/items')) {
        return json({
          data: [
            item('item-ont', 'CPE-ONT-01', 'ONT de fibra'),
            item('item-router', 'CPE-RTR-01', 'Router WiFi'),
          ],
          meta: listMeta({ mode: 'cursor', page: null, totalPages: null, total: 2 }),
        });
      }
      if (path.endsWith('/inventory/custody')) {
        if (mocks.failCustody.remaining > 0) {
          mocks.failCustody.remaining -= 1;
          return json({ message: 'Servicio de inventario no disponible' }, 500);
        }
        if (options.emptyCustody) {
          const empty = (total: number) => listMeta({ total, totalPages: 0 });
          return json({
            location: null,
            assets: { items: [], meta: empty(0) },
            balances: { items: [], meta: empty(0) },
          });
        }
        return json(custodyPage(Number(url.searchParams.get('page') ?? '1')));
      }
    }
    return route.fallback();
  });
  return mocks;
}

async function evidence(page: Page, name: string) {
  if (captureEvidence) await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

test.describe('R3 consumo y custodia bajo demanda (HTTP simulado)', () => {
  test('en progreso: cargar la OT no consulta custodia; abrir el acto la consulta y filtra por categoría', async ({
    page,
  }) => {
    await setupMocks(page);
    const mocks = await mockR3(page);
    await seedSession(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-r3-progress');

    const drawer = page.getByRole('dialog');
    const trigger = drawer.getByRole('button', { name: /^Registrar equipo instalado para / });
    await expect(trigger).toBeVisible();
    // El historial del requisito se ve, la custodia disponible todavía no.
    await expect(drawer.getByText('ONT-INSTALADA-0007')).toBeVisible();
    await expect(drawer.getByText('En custodia del ejecutor')).toHaveCount(0);
    expect(mocks.inventoryCalls).toEqual([]);
    await evidence(page, 'r3-navegador-material-cerrado');

    await trigger.click();
    const act = drawer.getByRole('region', { name: 'Registrar equipo instalado' });
    await expect(act.getByText('ONT-E2E-0001')).toBeVisible();
    await expect(act.getByText('En custodia del ejecutor')).toBeVisible();
    await expect(act.getByText('Cantidad disponible: 4')).toBeVisible();
    // La herramienta de la primera página no es de la categoría: no se ofrece.
    await expect(act.getByText('HERR-0001')).toHaveCount(0);
    await expect(act.getByRole('combobox', { name: 'Destino' })).toBeDisabled();
    await expect(act.getByRole('combobox', { name: 'Destino' })).toContainText(
      'Instalado en cliente',
    );
    await expect(page.getByRole('dialog')).toHaveCount(1);

    const custodyCalls = mocks.inventoryCalls.filter((call) => call.includes('/inventory/custody'));
    expect(custodyCalls).toHaveLength(2);
    expect(custodyCalls[0]).toContain('responsibleRefId=tech-001');
    expect(custodyCalls[1]).toContain('page=2');
    expect(mocks.inventoryCalls.some((call) => call.includes('categoryId=cat-cpe'))).toBe(true);
    expect(mocks.inventoryCalls.some((call) => call.includes('/inventory/locations'))).toBe(false);

    await act.scrollIntoViewIfNeeded();
    await evidence(page, 'r3-navegador-material-abierto');

    await act.getByRole('combobox', { name: 'Ítem' }).click();
    await expect(page.getByRole('option')).toHaveText([
      'CPE-ONT-01 · ONT de fibra',
      'CPE-RTR-01 · Router WiFi',
    ]);
    await evidence(page, 'r3-navegador-material-selector');
    await page.getByRole('option', { name: 'CPE-ONT-01 · ONT de fibra' }).click();
    await expect(act.getByRole('combobox', { name: 'Ítem' })).toContainText(
      'CPE-ONT-01 · ONT de fibra',
    );

    // La disponibilidad vive en el acto y el historial en el requisito, por separado.
    const history = drawer.getByRole('region', { name: 'Equipos y materiales' });
    await expect(history.getByText('En custodia del ejecutor')).toHaveCount(0);
    await expect(history.getByText('Instalar · Cantidad: 1 · Instalado en cliente')).toBeVisible();
  });

  test('preinicio: aunque llegue el permiso de consumo no hay acto ni consulta de custodia', async ({
    page,
  }) => {
    await setupMocks(page);
    const mocks = await mockR3(page);
    await seedSession(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-r3-prestart');

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('button', { name: 'Iniciar ejecución' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /Registrar equipo instalado/ })).toHaveCount(0);
    await expect(drawer.getByText('En custodia del ejecutor')).toHaveCount(0);
    await expect(drawer.locator('form')).toHaveCount(0);
    expect(mocks.inventoryCalls).toEqual([]);
  });

  test('error de custodia: la orden sigue operativa y «Reintentar» recupera sin releer la orden', async ({
    page,
  }) => {
    await setupMocks(page);
    const mocks = await mockR3(page);
    mocks.failCustody.remaining = 1;
    await seedSession(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-r3-progress');

    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: /^Registrar equipo instalado para / }).click();
    const act = drawer.getByRole('region', { name: 'Registrar equipo instalado' });
    await expect(act.getByText('Custodia no disponible')).toBeVisible();
    await expect(act.getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
    await expect(drawer.getByText('OTE-20261005-R3').first()).toBeVisible();
    await evidence(page, 'r3-navegador-material-error');

    await act.getByRole('button', { name: 'Reintentar' }).click();
    await expect(act.getByText('ONT-E2E-0001')).toBeVisible();
    await expect(act.getByText('Custodia no disponible')).toHaveCount(0);
  });

  test('sin equipos de la categoría: copy de UX y selector sin opciones', async ({ page }) => {
    await setupMocks(page);
    await mockR3(page, { emptyCustody: true });
    await seedSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-r3-progress');

    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: /^Registrar equipo instalado para / }).click();
    const act = drawer.getByRole('region', { name: 'Registrar equipo instalado' });
    await expect(act.getByText('No hay equipos de esta categoría en tu custodia')).toBeVisible();
    await expect(
      act.getByText('Contacta a supervisión para revisar la disponibilidad.'),
    ).toBeVisible();
    await expect(act.getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
    await evidence(page, 'r3-navegador-material-vacio-movil');
  });
});
