import { randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Se reutiliza el fixture sintético del módulo (apps/api, CommonJS con `jszip` propio). El
// cargador ESM de Playwright no lo transpila fuera de este paquete, así que se transpila aquí y se
// evalúa con un `require` anclado en su carpeta.
type UispFixtureModule =
  typeof import('../../apps/api/src/modules/migration/test/uisp-zip.fixture');
function loadUispFixture(): UispFixtureModule {
  const path = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../apps/api/src/modules/migration/test/uisp-zip.fixture.ts',
  );
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} as UispFixtureModule };
  new Function('require', 'module', 'exports', outputText)(
    createRequire(path),
    module,
    module.exports,
  );
  return module.exports;
}
const { buildSyntheticUispZip } = loadUispFixture();

/**
 * Importación desde UISP (spec 2026-11-10 v1.1, ADR-110) contra Portal, API y worker reales.
 * CA-1 (paquete legible y verificado), CA-3 (simulación, 9 tareas sin fuente, conciliación),
 * CA-4 (histórico importado sin numeración ni estado fiscal),
 * CA-6 (promoción idempotente y reversión por lote) y a11y claro/oscuro.
 * Tenant desechable: nunca toca tenant_iwana. Datos 100 % sintéticos (fixture del módulo).
 */

type Envelope<T> = { data: T };
type Tenant = { id: string; slug: string; schemaName: string; status: string };
type BatchReport = {
  id: string;
  status: string;
  counts: {
    procesamiento: string;
    archivos: { recibidos: number; leidos: number };
    entidades: Record<string, { leidos: number; validos: number; rechazados: number }>;
    observaciones: Record<string, number>;
  };
  promotion: { procesamiento: string; promovidos: Record<string, number> } | null;
  reconciliation: { resultado: string; titulares: number; conciliados: number } | null;
};
type BillingDocument = {
  id: string;
  status: string;
  number: string | null;
  externalNumber?: string | null;
  subscriberId: string;
};

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_PREFIX = 'srqa-uisp-imp-';
const TENANT_SLUG = `${TENANT_PREFIX}${RUN_ID}`;
const TENANT_ADMIN_EMAIL = `${TENANT_PREFIX}${RUN_ID}@example.invalid`;
const PLAN_NAME = `Plan QA importación ${RUN_ID.slice(0, 6)}`;
const TAG_NAME = `Etiqueta QA ${RUN_ID.slice(0, 6)}`;
// Tres clientes × un ticket con 3 tareas que no viajan = 9 tareas sin fuente (CA-3).
const CLIENT_IDS = [9101, 9102, 9103] as const;
const missingLiveEnvironment = [
  !(process.env.E2E_PLATFORM_EMAIL?.trim() || process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim())
    ? 'E2E_PLATFORM_EMAIL o PLATFORM_SUPER_ADMIN_EMAIL'
    : null,
  !(process.env.E2E_PLATFORM_PASSWORD?.trim() || process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim())
    ? 'E2E_PLATFORM_PASSWORD o PLATFORM_SUPER_ADMIN_PASSWORD'
    : null,
].filter((name): name is string => name !== null);

let api: APIRequestContext | undefined;
let platformToken: string | undefined;
let tenantAdminToken: string | undefined;
let tenantAdminPassword: string | undefined;

function requiredEnv(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Falta configurar ${key} para el E2E real.`);
  return value;
}

function apiHeaders(token: string, slug?: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...(slug ? { 'X-Tenant-Slug': slug } : {}) };
}

function tenantHeaders(): Record<string, string> {
  return apiHeaders(requiredEnv(tenantAdminToken, 'sesión sintética de tenant'), TENANT_SLUG);
}

async function expectJson<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  status: number,
  options: { headers?: Record<string, string>; data?: unknown; multipart?: unknown } = {},
): Promise<T> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { method, ...options } as never);
  const body = (await response.json().catch(() => ({}))) as Envelope<T> & {
    code?: unknown;
    message?: unknown;
  };
  expect(
    response.status(),
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toBe(status);
  return body.data;
}

async function cleanupQaTenants(): Promise<void> {
  if (!api || !platformToken) return;
  const tenants = await expectJson<Tenant[]>(
    `/tenants?search=${TENANT_PREFIX}&limit=100&offset=0`,
    'GET',
    200,
    { headers: apiHeaders(platformToken) },
  );
  const pattern = new RegExp(`^${TENANT_PREFIX}[a-f0-9]{12}$`, 'u');
  for (const tenant of tenants.filter((candidate) => pattern.test(candidate.slug))) {
    if (tenant.status === 'ACTIVE') {
      await expectJson<Tenant>(`/tenants/${tenant.id}`, 'PATCH', 200, {
        headers: apiHeaders(platformToken),
        data: { status: 'INACTIVE' },
      });
    }
    const deleted = await api.fetch(`${API_PREFIX}/tenants/${tenant.id}`, {
      method: 'DELETE',
      headers: apiHeaders(platformToken),
    });
    expect(deleted.status()).toBe(204);
  }
}

async function createDisposableTenant(): Promise<void> {
  api = await request.newContext({ baseURL: API_BASE_URL });
  const platformSession = await expectJson<{ accessToken: string }>(
    '/auth/platform/login',
    'POST',
    200,
    {
      data: {
        email: requiredEnv(
          process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL,
          'E2E_PLATFORM_EMAIL',
        ),
        password: requiredEnv(
          process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD,
          'E2E_PLATFORM_PASSWORD',
        ),
      },
    },
  );
  platformToken = platformSession.accessToken;
  const created = await expectJson<Tenant>('/tenants', 'POST', 201, {
    headers: apiHeaders(platformToken),
    data: {
      name: `Tenant sintético importación UISP ${RUN_ID}`,
      slug: TENANT_SLUG,
      contactEmail: `qa-${RUN_ID}@example.invalid`,
      adminEmail: TENANT_ADMIN_EMAIL,
      settings: {
        timezone: 'America/Bogota',
        currency: 'COP',
        features: { mfa_required_all: false },
      },
    },
  });
  expect(created.schemaName).toMatch(/^tenant_srqa_uisp_imp_[a-f0-9]{12}$/u);
  expect(created.schemaName).not.toBe('tenant_iwana');
  await expect
    .poll(
      async () => {
        const current = await expectJson<Tenant>(`/tenants/${created.id}`, 'GET', 200, {
          headers: apiHeaders(platformToken!),
        });
        if (current.status === 'PROVISIONING_FAILED') {
          throw new Error('El provisioning del tenant E2E terminó en fallo.');
        }
        return current.status;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('ACTIVE');

  const credential = await expectJson<{ adminEmail: string; temporaryPassword: string }>(
    `/tenants/${created.id}/regenerate-admin-credentials`,
    'POST',
    200,
    { headers: { ...apiHeaders(platformToken), 'Idempotency-Key': randomUUID() } },
  );
  tenantAdminPassword = `Qa9!${randomBytes(18).toString('hex')}`;
  const initial = await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: credential.temporaryPassword },
  });
  await expectJson('/auth/change-password', 'POST', 200, {
    headers: apiHeaders(initial.accessToken, TENANT_SLUG),
    data: { currentPassword: credential.temporaryPassword, newPassword: tenantAdminPassword },
  });
  const session = await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: tenantAdminPassword },
  });
  tenantAdminToken = session.accessToken;

  // Destinos de las equivalencias: un plan activo y una etiqueta del catálogo del tenant.
  const plan = await expectJson<{ id: string }>('/commercial/catalog/plans', 'POST', 201, {
    headers: tenantHeaders(),
    data: {
      name: PLAN_NAME,
      vatConcept: 'INTERNET_ACCESS',
      technology: 'FIBER',
      downloadSpeedMbps: 100,
      uploadSpeedMbps: 50,
      installationRule: 'ALWAYS',
    },
  });
  // Un plan sin precio vigente para el segmento del titular no puede congelarse en el contrato
  // importado (snapshot de MOD06): los titulares sintéticos son personas naturales.
  await expectJson(`/commercial/catalog/${plan.id}/prices`, 'POST', 201, {
    headers: tenantHeaders(),
    data: { customerSegment: 'RESIDENTIAL', basePrice: '80000.00', installationFee: '0.00' },
  });
  await expectJson('/crm/subscriber-tags', 'POST', 201, {
    headers: tenantHeaders(),
    data: { name: TAG_NAME, color: '#1D4ED8' },
  });
}

async function syntheticZips(): Promise<Array<{ name: string; mimeType: string; buffer: Buffer }>> {
  return Promise.all(
    CLIENT_IDS.map(async (clientId, index) => ({
      name: `cliente-${clientId}.zip`,
      mimeType: 'application/zip',
      buffer: await buildSyntheticUispZip({
        clientId,
        document: `100000${clientId}`,
        lastName: `Sintético ${index + 1}`,
        stratum: '3',
      }),
    })),
  );
}

async function loginInPortal(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(TENANT_SLUG);
  await page.getByLabel('Correo electrónico').fill(TENANT_ADMIN_EMAIL);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(requiredEnv(tenantAdminPassword, 'contraseña efímera de tenant'));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function expectNoSeriousAxeViolations(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

async function axeLightAndDark(page: Page, url: string, ready: () => Promise<void>, label: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(url);
    await ready();
    await expectNoSeriousAxeViolations(page, `${label} (${theme})`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

function getBatch(batchId: string): Promise<BatchReport> {
  return expectJson<BatchReport>(`/migration/batches/${batchId}`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

async function waitBatch(batchId: string, done: (report: BatchReport) => boolean) {
  await expect
    .poll(async () => done(await getBatch(batchId)), {
      timeout: 120_000,
      intervals: [1_000, 2_000, 4_000],
    })
    .toBe(true);
  return getBatch(batchId);
}

async function listSubscriberIds(): Promise<string[]> {
  const list = await expectJson<Array<{ id: string }>>(
    '/crm/subscribers?page=1&limit=50',
    'GET',
    200,
    { headers: tenantHeaders() },
  );
  return list.map((item) => item.id);
}

async function listDocuments(query = ''): Promise<BillingDocument[]> {
  return expectJson<BillingDocument[]>(`/billing/documents?page=1&limit=100${query}`, 'GET', 200, {
    headers: tenantHeaders(),
  });
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Importación desde UISP — ADR-110 contra Portal, API y worker reales', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  test.beforeAll(async () => {
    try {
      await createDisposableTenant();
    } catch (error) {
      await cleanupQaTenants();
      throw error;
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupQaTenants();
    } finally {
      await api?.dispose();
    }
  });

  test('CA-1/CA-3/CA-4/CA-6: simula, equivale, promueve, concilia y revierte', async ({ page }) => {
    await loginInPortal(page);

    // ── Subida y simulación (CA-1, CA-3) ──
    await page.goto('/dashboard/settings/imports');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByLabel('Archivos ZIP de clientes de UISP').setInputFiles(await syntheticZips());
    await expect(page.getByText('3 archivos seleccionados.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Subir y simular' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/imports\/[0-9a-f-]{36}$/u);
    const batchId = new URL(page.url()).pathname.split('/').pop()!;

    const simulated = await waitBatch(
      batchId,
      (r) => r.status === 'SIMULADO' && r.counts.procesamiento === 'COMPLETADO',
    );
    expect(simulated.counts.archivos).toMatchObject({ recibidos: 3, leidos: 3 });
    expect(simulated.counts.entidades.SUSCRIPTOR?.leidos).toBe(3);
    expect(simulated.counts.entidades.CONTRATO?.leidos).toBe(6);
    expect(simulated.counts.entidades.DOCUMENTO_COBRO?.leidos).toBe(9);
    expect(simulated.counts.entidades.PAGO?.leidos).toBe(6);
    expect(simulated.counts.entidades.TICKET?.leidos).toBe(6);
    // Tres tickets con tareas que no viajan (observación) suman 9 tareas sin fuente.
    expect(simulated.counts.observaciones.TAREAS_SIN_FUENTE).toBe(3);
    expect(simulated.counts.tareasSinFuente).toBe(9);

    await expect(page.getByText('Simulado', { exact: true })).toBeVisible({ timeout: 30_000 });
    const entityTable = page.getByRole('table', { name: 'Registros por entidad' });
    await expect(entityTable.getByRole('row', { name: /^Suscriptores 3 /u })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Observaciones' })
        .getByText('Tareas de UISP que no se importan: 9', { exact: true }),
    ).toBeVisible();

    // ── Equivalencias pendientes desde la UI (D4) ──
    await expect(page.getByText('Hay valores sin equivalencia', { exact: true })).toBeVisible();
    const pendingList = page.getByRole('list', { name: 'Equivalencias pendientes' });
    await expect(pendingList).toBeVisible();
    for (let guard = 0; guard < 12; guard += 1) {
      const rows = pendingList.getByRole('listitem');
      if ((await pendingList.count()) === 0 || (await rows.count()) === 0) break;
      const row = rows.first();
      const heading = (await row.locator('p').first().innerText()).trim();
      const target = row.getByLabel('Equivale en iWana a');
      if (heading.startsWith('Plan:')) await target.selectOption({ label: PLAN_NAME });
      else if (heading.startsWith('Etiqueta:')) await target.selectOption({ label: TAG_NAME });
      else await target.selectOption({ index: 1 });
      const saved = page.waitForResponse(
        (r) => r.url().includes('/migration/mappings') && r.request().method() === 'POST',
      );
      await row.getByRole('button', { name: /^Guardar equivalencia de / }).click();
      expect((await saved).status()).toBe(201);
      await expect(page.getByText(heading, { exact: true })).toHaveCount(0);
    }
    await expect(
      page.getByText('Todos los valores del lote tienen equivalencia.', { exact: true }),
    ).toBeVisible();

    await axeLightAndDark(
      page,
      `/dashboard/settings/imports/${batchId}`,
      () => expect(page.getByRole('button', { name: 'Promover' })).toBeVisible(),
      'informe del lote simulado',
    );
    await axeLightAndDark(
      page,
      '/dashboard/settings/imports',
      () => expect(page.getByRole('list', { name: 'Lotes de importación' })).toBeVisible(),
      'lista de importaciones',
    );

    // ── Promoción (CA-6) ──
    await page.goto(`/dashboard/settings/imports/${batchId}`);
    await page.getByRole('button', { name: 'Promover' }).click();
    const promoteDialog = page.getByRole('dialog', { name: 'Promover el lote' });
    await promoteDialog.getByRole('button', { name: 'Promover', exact: true }).click();
    const promoted = await waitBatch(
      batchId,
      (r) => (r.status === 'PROMOVIDO' || r.status === 'CONCILIADO') && r.promotion !== null,
    );
    // Solo conteos por entidad y motivo: el informe de promoción no lleva PII.
    const promotionReport = `informe de promoción: ${JSON.stringify(promoted.promotion)}`;
    expect(promoted.promotion?.promovidos.SUSCRIPTOR, promotionReport).toBe(3);
    expect(promoted.promotion?.promovidos.DOCUMENTO_COBRO, promotionReport).toBe(9);
    expect(promoted.promotion?.promovidos.PAGO, promotionReport).toBe(6);

    // Repetir la promoción del mismo lote se rechaza y no duplica.
    const repeat = await api!.fetch(`${API_PREFIX}/migration/batches/${batchId}/promote`, {
      method: 'POST',
      headers: tenantHeaders(),
    });
    expect(repeat.status()).toBe(409);
    const subscriberIds = await listSubscriberIds();
    expect(subscriberIds).toHaveLength(3);

    // ── Ficha: etiquetas, documentos importados y cobro histórico (CA-4) ──
    const subscriberId = subscriberIds[0]!;
    const detail = await expectJson<{ tags?: Array<{ name: string }> }>(
      `/crm/subscribers/${subscriberId}`,
      'GET',
      200,
      { headers: tenantHeaders() },
    );
    expect(detail.tags?.map((tag) => tag.name)).toContain(TAG_NAME);

    const documents = await listDocuments(`&subscriberId=${subscriberId}`);
    expect(documents).toHaveLength(3);
    for (const document of documents) {
      expect(document.status).toBe('IMPORTADO');
      expect(document.number, 'Un histórico importado no consume numeración (CA-4)').toBeNull();
      expect(document.externalNumber).toMatch(/^SINT-2023-[123]$/u);
    }
    expect(await listDocuments(`&subscriberId=${subscriberId}&status=EMITIDO`)).toHaveLength(0);
    const withPdf = documents.find((d) => d.externalNumber === 'SINT-2023-1')!;
    const pdf = await api!.fetch(`${API_PREFIX}/billing/documents/${withPdf.id}/pdf`, {
      headers: tenantHeaders(),
    });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);
    await expect(page.getByRole('list', { name: 'Etiquetas' }).first()).toContainText(TAG_NAME);
    await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
    await expect(page).toHaveURL(/[?&]tab=documentos(?:&|$)/u);
    await expect(page.getByText('Soporte importado (PDF)', { exact: true })).toBeVisible();
    await expect(page.getByText('Soporte importado (imagen)', { exact: true })).toBeVisible();
    // Spec MOD05↔MOD14 2026-11-13 D1: Documentos solo lista archivos; los históricos de cobro
    // importados viven en Facturación → Facturas.
    await expect(
      page
        .getByRole('tabpanel', { name: 'Documentos' })
        .getByText(/^Histórico importado SINT-2023-/u),
    ).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, 'ficha · Documentos importados');
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}?tab=facturacion&sub=facturas`);
    const invoices = page.getByRole('tabpanel', { name: 'Facturas', exact: true });
    for (const n of [1, 2, 3]) {
      await expect(invoices.getByRole('row').filter({ hasText: `SINT-2023-${n}` })).toContainText(
        'Histórico importado',
        { timeout: 30_000 },
      );
    }

    // ── Conciliación (CA-3) ──
    await page.goto(`/dashboard/settings/imports/${batchId}`);
    await page.getByRole('button', { name: 'Conciliar' }).click();
    await expect(page.getByText('Conciliación actualizada.', { exact: true })).toBeVisible();
    await expect(page.getByText('Los saldos coinciden con UISP', { exact: true })).toBeVisible();
    await expect(page.getByText(/^3 de 3 suscriptores coinciden\./u)).toBeVisible();
    const reconciled = await getBatch(batchId);
    expect(reconciled.status).toBe('CONCILIADO');
    expect(reconciled.reconciliation).toMatchObject({
      resultado: 'CONCILIADO',
      titulares: 3,
      conciliados: 3,
    });
    await axeLightAndDark(
      page,
      `/dashboard/settings/imports/${batchId}`,
      () => expect(page.getByText('Los saldos coinciden con UISP')).toBeVisible(),
      'informe del lote conciliado',
    );

    // ── Un segundo lote con los mismos ZIP no duplica (idempotencia por external_id) ──
    const form = new FormData();
    for (const file of await syntheticZips()) {
      form.append('files', new Blob([file.buffer], { type: file.mimeType }), file.name);
    }
    const second = await expectJson<{ id: string }>('/migration/batches', 'POST', 202, {
      headers: tenantHeaders(),
      multipart: form,
    });
    await waitBatch(second.id, (r) => r.counts.procesamiento === 'COMPLETADO');
    const again = await api!.fetch(`${API_PREFIX}/migration/batches/${second.id}/promote`, {
      method: 'POST',
      headers: tenantHeaders(),
    });
    expect([202, 409]).toContain(again.status());
    if (again.status() === 202) {
      await waitBatch(second.id, (r) => r.status !== 'CARGADO' && r.promotion !== null);
    }
    expect(await listSubscriberIds()).toHaveLength(3);
    expect(await listDocuments(`&subscriberId=${subscriberId}`)).toHaveLength(3);

    // ── Reversión por lote (CA-6) ──
    await page.goto(`/dashboard/settings/imports/${batchId}`);
    await page.getByRole('button', { name: 'Revertir' }).click();
    const revertDialog = page.getByRole('dialog', { name: 'Revertir el lote' });
    await revertDialog.getByRole('button', { name: 'Revertir', exact: true }).click();
    await expect(
      page.getByText('Lote revertido. Lo que trajo ya no está en iWana.', { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Revertido', { exact: true })).toBeVisible();
    expect((await getBatch(batchId)).status).toBe('REVERTIDO');
    expect(await listSubscriberIds()).toHaveLength(0);
    expect(await listDocuments(`&subscriberId=${subscriberId}`)).toHaveLength(0);
    const gone = await api!.fetch(`${API_PREFIX}/crm/subscribers/${subscriberId}`, {
      headers: tenantHeaders(),
    });
    expect(gone.status()).toBe(404);
  });
});
