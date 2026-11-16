/**
 * Equipos del suscriptor en la ficha (live) · spec 2026-11-16-mod05-mod12-equipos-del-suscriptor.
 * CA-1 (tarjeta en Vista general), CA-3 (pestaña con equipos, materiales e historial), CA-4 visto
 * en pantalla (evento fuera del periodo del comodato no aparece en la pestaña), CA-6 (el menú ⋯
 * abre el drawer existente de Inventario con la historia completa), CA-8 (axe, teclado, 44 px).
 *
 * Datos: el tenant y el runner ADMIN los siembra seed-privacy-fase-1b-fixtures.mjs (como
 * portal-mod05-ficha-uisp-live). El suscriptor es fijo e idempotente (se busca por correo
 * sintético y solo se crea si no existe). El comodato, el material y los eventos se siembran por
 * SQL en el schema del tenant con un sufijo por corrida y se borran al terminar.
 *
 * pnpm exec playwright test tests/portal-mod05-equipos-suscriptor-live.spec.ts \
 *   --config playwright.portal.config.ts --retries=0   (desde e2e/, con API y worker arriba)
 */
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off', baseURL: 'http://localhost:3002' });

const tenantSlug = process.env.E2E_PRIVACY_1B_TENANT_SLUG;
const fixtureSuffix = tenantSlug?.startsWith('e2e-privacy-1b-')
  ? tenantSlug.slice('e2e-privacy-1b-'.length)
  : null;
const masterPassword = process.env.E2E_PRIVACY_ADMIN_PASSWORD;
const runnerEmail = fixtureSuffix ? `qa-privacy-runner-${fixtureSuffix}@example.invalid` : null;
const runnerPassword =
  tenantSlug && masterPassword && fixtureSuffix
    ? `Qa9-${createHmac('sha256', masterPassword).update(`privacy-fase-1b:runner:${tenantSlug}`).digest('hex')}!zA`
    : null;
const missingLiveEnvironment = [
  !tenantSlug?.trim() ? 'E2E_PRIVACY_1B_TENANT_SLUG' : null,
  !masterPassword?.trim() ? 'E2E_PRIVACY_ADMIN_PASSWORD' : null,
  !process.env.DB_NAME?.trim() ? 'DB_NAME' : null,
].filter((name): name is string => name !== null);

/** Suscriptor fijo de esta suite: se reutiliza entre corridas para no acumular datos. */
const FIXTURE_EMAIL = 'qa-equipos-ficha@example.invalid';
const FIXTURE_DOCUMENT = 'EQ-QA-FICHA-0001';

type Row = Record<string, unknown>;
type Database = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

function workspaceRoot(): string {
  let current = process.cwd();
  while (!existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('No se encontró la raíz del workspace');
    current = parent;
  }
  return current;
}

async function apiJson<T>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: { 'X-Tenant-Slug': tenantSlug!, 'X-Requested-With': 'XMLHttpRequest' },
    ...(data !== undefined ? { data } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; code?: string };
  expect(response.ok(), `API ${method} ${path}: ${response.status()} ${body.code ?? ''}`).toBe(
    true,
  );
  return body.data as T;
}

async function findSubscriberByEmail(page: Page, email: string): Promise<string | null> {
  const response = await page.request.post('/api/v1/crm/subscribers/search', {
    headers: { 'X-Tenant-Slug': tenantSlug!, 'X-Requested-With': 'XMLHttpRequest' },
    data: { email },
  });
  if (!response.ok()) return null;
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  return body.data?.[0]?.id ?? null;
}

/** Igual que portal-mod05-ficha-uisp-live, pero con correo fijo: solo crea la primera vez. */
async function findOrCreateSubscriber(page: Page): Promise<string> {
  const existing = await findSubscriberByEmail(page, FIXTURE_EMAIL);
  if (existing) return existing;

  const catalog = await apiJson<{ data: Array<{ id: string }> }>(
    page,
    '/commercial/catalog?type=PLAN&isActive=true&limit=100',
    'GET',
  );
  const planId = catalog.data[0]?.id;
  expect(planId, 'El seed debe dejar un plan activo.').toBeTruthy();
  const expediente = await apiJson<{ id: string }>(page, '/crm/expedientes', 'POST', {
    fullName: 'Equipos QA ficha',
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: 'Fixture equipos del suscriptor',
  });
  const sections: Array<[string, Record<string, unknown>]> = [
    [
      'identification',
      {
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumber: FIXTURE_DOCUMENT,
        firstName: 'Titular',
        lastName: 'Equipos QA',
      },
    ],
    [
      'contact',
      {
        phonePrimary: '+570000000000',
        emailPrimary: FIXTURE_EMAIL,
        altContactName: 'Contacto sintético',
        altContactPhone: '+570000000001',
      },
    ],
    [
      'location',
      {
        address: 'Carrera de prueba 999',
        municipality: 'Bogotá',
        department: 'Cundinamarca',
        postalCode: '110111',
        stratum: 3,
        neighborhood: 'Sector de pruebas',
        latitude: 4.711,
        longitude: -74.072,
      },
    ],
    [
      'commercial_interest',
      {
        acquisitionChannel: 'WEB',
        sourceDetail: 'Fixture equipos del suscriptor',
        interestedPlanId: planId,
      },
    ],
    [
      'technical_feasibility',
      {
        feasibility: 'VIABLE',
        candidateTechnologies: ['FIBER'],
        availableTechnology: 'FIBER',
        technicalConfidence: 'HIGH',
        evaluationSource: 'TECHNICAL_SITE_VISIT',
      },
    ],
    ['legal_consent', { identityVerified: 'VERIFIED', legalComplianceStatus: 'APPROVED' }],
  ];
  for (const [section, data] of sections) {
    await apiJson(page, `/crm/expedientes/${expediente.id}/sections/${section}`, 'PATCH', {
      data,
    });
  }
  const legalText = await apiJson<{ version: string }>(
    page,
    '/privacy/legal-texts/current?type=AUTORIZACION',
    'GET',
  );
  await apiJson(page, `/crm/expedientes/${expediente.id}/consents`, 'POST', {
    consentType: 'DATA_TREATMENT',
    status: 'ACCEPTED',
    channel: 'TELEFONO',
    legalTextVersion: legalText.version,
  });
  for (const targetStatus of [
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ]) {
    await apiJson(page, `/crm/expedientes/${expediente.id}/status`, 'PATCH', { targetStatus });
  }
  await expect
    .poll(() => findSubscriberByEmail(page, FIXTURE_EMAIL), { timeout: 30_000 })
    .not.toBeNull();
  return (await findSubscriberByEmail(page, FIXTURE_EMAIL))!;
}

interface EquipmentFixture {
  serial: string;
  mac: string;
  model: string;
  materialName: string;
  cleanup: () => Promise<void>;
}

/**
 * Siembra un comodato abierto con su instalación por OT, un material en el sitio del cliente y
 * un evento de recepción anterior al comodato (fuera del periodo: no debe salir en la pestaña,
 * sí en el drawer de Inventario). Todo con sufijo por corrida; `cleanup` lo borra en orden.
 */
async function seedEquipment(db: Database, subscriberId: string): Promise<EquipmentFixture> {
  const tenant = (
    await db.query(
      "SELECT id, schema_name FROM public.tenants WHERE slug = $1 AND status = 'ACTIVE'",
      [tenantSlug],
    )
  ).rows[0];
  expect(tenant, `Tenant ${tenantSlug} en ${process.env.DB_NAME}`).toBeTruthy();
  const tenantId = String(tenant!.id);
  const schema = String(tenant!.schema_name);
  expect(schema).toMatch(/^tenant_e2e_privacy_1b_/u);
  const q = (sql: string, params: unknown[] = []) =>
    db.query(sql.replaceAll('$S.', `"${schema}".`), params);

  const run = randomUUID().slice(0, 8).toUpperCase();
  const ids = {
    category: randomUUID(),
    serialItem: randomUUID(),
    materialItem: randomUUID(),
    asset: randomUUID(),
    site: randomUUID(),
    installMovement: randomUUID(),
    materialMovement: randomUUID(),
    loan: randomUUID(),
    executionOrder: randomUUID(),
  };
  const fixture = {
    serial: `SN-QA-EQ-${run}`,
    mac: `02:00:00:${run.slice(0, 2)}:${run.slice(2, 4)}:${run.slice(4, 6)}`,
    model: `ONT QA ${run}`,
    materialName: `Cable drop QA ${run}`,
  };
  const installedAt = new Date(Date.now() - 3 * 24 * 3_600_000);
  const receivedAt = new Date(installedAt.getTime() - 10 * 24 * 3_600_000);
  const insideAt = new Date(installedAt.getTime() + 60_000);
  const createdCategory = { value: false };

  const cleanup = async () => {
    await q('DELETE FROM $S.stock_movement_lines WHERE movement_id = ANY($1::uuid[])', [
      [ids.installMovement, ids.materialMovement],
    ]);
    await q('DELETE FROM $S.asset_lifecycle_events WHERE serialized_asset_id = $1', [ids.asset]);
    await q('DELETE FROM $S.asset_loan_assignments WHERE id = $1', [ids.loan]);
    await q('DELETE FROM $S.serialized_assets WHERE id = $1', [ids.asset]);
    await q('DELETE FROM $S.stock_movements WHERE id = ANY($1::uuid[])', [
      [ids.installMovement, ids.materialMovement],
    ]);
    await q('DELETE FROM $S.stock_locations WHERE id = $1', [ids.site]);
    await q('DELETE FROM $S.inventory_items WHERE id = ANY($1::uuid[])', [
      [ids.serialItem, ids.materialItem],
    ]);
    if (createdCategory.value) {
      await q('DELETE FROM $S.inventory_categories WHERE id = $1', [ids.category]);
    }
  };

  try {
    const existingCategory = (
      await q("SELECT id::text AS id FROM $S.inventory_categories WHERE code = 'CPE' LIMIT 1")
    ).rows[0];
    if (existingCategory) {
      ids.category = String(existingCategory.id);
    } else {
      await q(
        `INSERT INTO $S.inventory_categories (id, tenant_id, code, code_prefix, name)
         VALUES ($1, $2, $3, $4, 'Categoría QA equipos')`,
        [ids.category, tenantId, `QAEQ-${run}`, run.slice(0, 3)],
      );
      createdCategory.value = true;
    }
    await q(
      `INSERT INTO $S.inventory_items (id, tenant_id, sku, name, model, category, category_id, tracking_mode, unit_of_measure)
       VALUES ($1, $2, $3, 'ONT GPON QA', $4, 'CPE', $5, 'SERIALIZED', 'UNIT'),
              ($6, $2, $7, $8, NULL, 'CPE', $5, 'CONSUMABLE', 'METER')`,
      [
        ids.serialItem,
        tenantId,
        `QA-EQ-S-${run}`,
        fixture.model,
        ids.category,
        ids.materialItem,
        `QA-EQ-M-${run}`,
        fixture.materialName,
      ],
    );
    await q(
      `INSERT INTO $S.stock_locations (id, tenant_id, code, name, type, responsible_ref_id)
       VALUES ($1, $2, $3, 'Sitio QA equipos', 'CUSTOMER_SITE', $4)`,
      [ids.site, tenantId, `QA-EQ-CS-${run}`, subscriberId],
    );
    await q(
      `INSERT INTO $S.serialized_assets (id, tenant_id, inventory_item_id, current_status, serial_number,
         normalized_serial_number, mac_address, current_location_id, subscriber_ref_id)
       VALUES ($1, $2, $3, 'INSTALLED_COMODATO', $4, $4, $5, $6, $7)`,
      [ids.asset, tenantId, ids.serialItem, fixture.serial, fixture.mac, ids.site, subscriberId],
    );
    await q(
      `INSERT INTO $S.stock_movements (id, tenant_id, movement_number, origin, origin_context,
         origin_ref_id, idempotency_key, is_reversal, created_at)
       VALUES ($1, $2, $3, 'EXECUTION_ORDER', 'tasks.execution-order', $4, $5, false, $6),
              ($7, $2, $8, 'EXECUTION_ORDER', 'tasks.execution-order', $4, $9, false, $6)`,
      [
        ids.installMovement,
        tenantId,
        `QA-EQ-I-${run}`,
        ids.executionOrder,
        `qa-eq-install-${run}`,
        installedAt,
        ids.materialMovement,
        `QA-EQ-M-${run}`,
        `qa-eq-material-${run}`,
      ],
    );
    await q(
      `INSERT INTO $S.stock_movement_lines (tenant_id, movement_id, item_id, location_id, quantity, serialized_asset_id)
       VALUES ($1, $2, $3, $4, 12, NULL)`,
      [tenantId, ids.materialMovement, ids.materialItem, ids.site],
    );
    await q(
      `INSERT INTO $S.asset_loan_assignments (id, tenant_id, serialized_asset_id, subscriber_ref_id,
         installed_at, removed_at, execution_order_ref_id, stock_movement_id)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
      [
        ids.loan,
        tenantId,
        ids.asset,
        subscriberId,
        installedAt,
        ids.executionOrder,
        ids.installMovement,
      ],
    );
    await q(
      `INSERT INTO $S.asset_lifecycle_events (tenant_id, serialized_asset_id, event_type, stock_movement_id, created_at)
       VALUES ($1, $2, 'RECEIVED', NULL, $3),
              ($1, $2, 'INSTALLED', $4, $5)`,
      [tenantId, ids.asset, receivedAt, ids.installMovement, insideAt],
    );
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
  return { ...fixture, cleanup };
}

async function login(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(tenantSlug!);
  await page.getByLabel('Correo electrónico').fill(runnerEmail!);
  await page.locator('input[autocomplete="current-password"]').fill(runnerPassword!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectNoSeriousAxeViolations(
  page: Page,
  label: string,
  include?: string,
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  console.info(
    `axe ${label}`,
    JSON.stringify(
      result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    ),
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

function region(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

test.describe('Ficha del suscriptor · Equipos (live)', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  let db: Database;

  test.beforeAll(async () => {
    const fromDb = createRequire(resolve(workspaceRoot(), 'packages/database/package.json'));
    const Client = fromDb('pg').Client;
    db = new Client({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5433),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }) as Database;
    await db.connect();
  });

  test.afterAll(async () => {
    await db?.end();
  });

  test('CA-1/CA-3/CA-6/CA-8: tarjeta, pestaña Equipos y ficha del equipo desde el menú ⋯', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const subscriberId = await findOrCreateSubscriber(page);
    const fixture = await seedEquipment(db, subscriberId);
    try {
      await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);

      // CA-1: la Vista general muestra el equipo abierto sin cambiar de pestaña.
      await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const card = region(page, 'Equipos instalados');
      await expect(card).toBeVisible();
      await expect(card.getByText(fixture.model, { exact: true })).toBeVisible();
      await expect(card.getByText(`Serial ${fixture.serial}`, { exact: true })).toBeVisible();
      await expect(card.getByText('Instalado en comodato', { exact: true })).toBeVisible();

      // CA-3: «Ver todo» abre la pestaña con una sola llamada inicial al endpoint.
      const equipmentCalls: string[] = [];
      page.on('request', (request) => {
        if (/\/inventory\/subscribers\/[^/]+\/equipment/u.test(request.url())) {
          equipmentCalls.push(request.url());
        }
      });
      await card.getByRole('button', { name: 'Ver todo', exact: true }).click();
      const tab = page.getByRole('tab', { name: 'Equipos', exact: true });
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const panel = page.getByRole('tabpanel');

      const installed = panel.getByRole('region', { name: 'Equipos instalados', exact: true });
      const table = installed.getByRole('table', { name: 'Equipos instalados' });
      await expect(table).toBeVisible();
      for (const name of ['Equipo', 'Serial', 'MAC', 'Estado', 'Desde', 'Acciones']) {
        await expect(table.getByRole('columnheader', { name, exact: true })).toHaveCount(1);
      }
      const row = table.getByRole('row').filter({ hasText: fixture.serial });
      await expect(row).toHaveCount(1);
      await expect(row.getByText(fixture.mac, { exact: true })).toBeVisible();
      await expect(row.getByText('Instalado en comodato', { exact: true })).toBeVisible();

      const materials = panel.getByRole('region', { name: 'Materiales usados', exact: true });
      const materialRow = materials
        .getByRole('table', { name: 'Materiales usados' })
        .getByRole('row')
        .filter({ hasText: fixture.materialName });
      await expect(materialRow).toHaveCount(1);
      await expect(materialRow).toContainText('12');
      await expect(
        materialRow.getByRole('link', { name: /^Ver OT del movimiento/u }),
      ).toBeVisible();

      // CA-4 visto en pantalla: la recepción en bodega (antes del comodato) no sale en la pestaña.
      const history = panel.getByRole('region', { name: 'Historial de equipos', exact: true });
      const timeline = history.getByRole('list', { name: 'Historial de equipos' });
      await expect(timeline.getByText('Instalación', { exact: true })).toBeVisible();
      await expect(timeline.getByText('Recepción', { exact: true })).toHaveCount(0);
      expect(equipmentCalls, 'la pestaña reutiliza la lectura de la tarjeta').toEqual([]);

      // Vocabulario §2.4 en la pestaña.
      const panelText = (await panel.innerText()).toLowerCase();
      for (const forbidden of ['activo serializado', 'kardex', 'installed_comodato', 'loan']) {
        expect(panelText).not.toContain(forbidden);
      }

      // CA-8: axe sobre la pestaña.
      await expectNoSeriousAxeViolations(page, 'pestaña Equipos', '[role="tabpanel"]');

      // CA-8: menú ⋯ con teclado y objetivo de 44 px.
      const trigger = row.getByRole('button', {
        name: `Acciones de ${fixture.model}, serial ${fixture.serial}`,
      });
      const box = await trigger.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await trigger.focus();
      await page.keyboard.press('Enter');
      const openDetail = page.getByRole('menuitem', { name: 'Ver ficha del equipo', exact: true });
      await expect(openDetail).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Ver OT', exact: true })).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: 'Copiar serial', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Copiar MAC', exact: true })).toBeVisible();
      for (const item of await page.getByRole('menuitem').all()) {
        const itemBox = await item.boundingBox();
        expect(itemBox!.height, 'elemento del menú de 44 px').toBeGreaterThanOrEqual(44);
      }
      await expectNoSeriousAxeViolations(page, 'menú ⋯ de equipo', '[role="menu"]');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(trigger).toBeFocused();

      // CA-6: «Ver ficha del equipo» abre el drawer de Inventario con la historia completa.
      await page.keyboard.press('Enter');
      await expect(openDetail).toBeVisible();
      await openDetail.focus();
      const assetResponse = page.waitForResponse(
        (r) => /\/inventory\/assets\/[^/?]+/u.test(r.url()) && r.request().method() === 'GET',
      );
      await page.keyboard.press('Enter');
      expect((await assetResponse).status()).toBe(200);
      const drawer = page.getByTestId('serialized-asset-detail-drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(fixture.serial).first()).toBeVisible();
      await expect(drawer.getByText('Recepción', { exact: true }).first()).toBeVisible();
      await expect(drawer.getByText('Instalación', { exact: true }).first()).toBeVisible();
      await expect(drawer.getByTestId('asset-detail-open-kardex')).toHaveCount(0);
      await expectNoSeriousAxeViolations(
        page,
        'drawer del equipo',
        '[data-testid="serialized-asset-detail-drawer"]',
      );
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
