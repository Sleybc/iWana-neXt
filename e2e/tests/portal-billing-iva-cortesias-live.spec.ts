/**
 * MOD14 · IVA por concepto y cortesías — E2E vivo (spec docs/specs/2026-11-12-mod14-iva-por-concepto-y-cortesias.md).
 *
 * Portal y API reales (job «E2E operativo R4.1»). Tenant desechable por worker (`srqa-iv-*`),
 * siembra por API y limpieza al final. Nunca `tenant_iwana`. SQL solo para leer la auditoría,
 * que la API no expone.
 *
 * Autocontenido: el `beforeAll` crea solo el tenant, el catálogo y el usuario de soporte; cada
 * prueba siembra su propio titular y contrato, de modo que si el CI reinicia el worker tras un
 * fallo (otro tenant, otro RUN_ID) ninguna prueba depende del estado que dejó otra.
 *
 * Cubre:
 * - CA-1: estrato 2 residencial con soporte de estrato → internet exento (0 %) e instalación
 *   de 50.000 con IVA 19 % (9.500).
 * - CA-2 / R2 / R3: adicional de servicio cobrado cada periodo con su IVA y su precio congelado
 *   (un cambio de tarifa posterior no lo reprecia); producto solo en el primer cobro.
 * - CA-3 / R4 / R5: ADMIN regala desde el portal («Otorgar cortesía» → «Regalar una línea») la
 *   línea de prorrateo de un documento emitido; queda saldado, auditado con motivo, el periodo
 *   siguiente se cobra completo y anular la cortesía desde el portal restaura el saldo.
 * - CA-4: SUPPORT sin permiso no ve el botón (lista y detalle) y la API responde 403.
 * - Idempotencia: doble envío con la misma Idempotency-Key no duplica; otra carga con la misma
 *   clave responde 409.
 * - a11y: axe WCAG 2.2 AA (serious/critical) del diálogo de cortesía en claro y oscuro.
 *
 * Requiere API_BASE_URL y credenciales de plataforma (E2E_PLATFORM_* o PLATFORM_SUPER_ADMIN_*).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-iv-${RUN_ID}`;
const ADMIN_EMAIL = `srqa-iv-admin-${RUN_ID}@example.invalid`;
const SUPPORT_EMAIL = `srqa-iv-soporte-${RUN_ID}@example.invalid`;
const SUPPORT_PASSWORD = `Qa9!Sup-${RUN_ID}`;
const DOCUMENTS_URL = '/dashboard/billing/documents';
/** PNG 1×1 sintético: soporte de estrato sin datos reales. */
const STRATUM_EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const missingLiveEnvironment = [
  !(process.env.E2E_PLATFORM_EMAIL?.trim() || process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim())
    ? 'E2E_PLATFORM_EMAIL o PLATFORM_SUPER_ADMIN_EMAIL'
    : null,
  !(process.env.E2E_PLATFORM_PASSWORD?.trim() || process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim())
    ? 'E2E_PLATFORM_PASSWORD o PLATFORM_SUPER_ADMIN_PASSWORD'
    : null,
].filter((name): name is string => name !== null);

type Envelope<T> = { data: T };
type DocLine = {
  id: string;
  kind: string;
  description: string;
  unitPrice: string;
  baseAmount: string;
  taxAmount: string;
  total: string;
  vatTreatment: string;
  vatRate: string;
};
type Courtesy = { id: string; status: string; amount: string; reasonCode: string };
type BillingDoc = {
  id: string;
  status: string;
  number: string | null;
  periodStart: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  pendingAmount: string | null;
  courtesyAmount?: string;
  lines?: DocLine[];
  courtesies?: Courtesy[];
};

let api: APIRequestContext | undefined;
let platformToken: string | undefined;
let tenantId: string | undefined;
let schemaName: string | undefined;
let adminToken = '';
let supportToken = '';
let tenantAdminPassword = '';
let legalTextId = '';
let cycleDay = 1;
let periodStart = '';
let nextPeriodStart = '';
let today = '';
const catalog = {
  residentialPlanId: '',
  residentialPlanName: '',
  simplePlanId: '',
  simplePlanName: '',
  productId: '',
  serviceId: '',
};

function bogotaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addOneMonth(civil: string): string {
  const [year, month, day] = civil.split('-').map(Number) as [number, number, number];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${next[0]}-${String(next[1]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function apiHeaders(token: string, slug?: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...(slug ? { 'X-Tenant-Slug': slug } : {}) };
}

function tenantHeaders(token = adminToken): Record<string, string> {
  return apiHeaders(token, TENANT_SLUG);
}

function withKey(headers: Record<string, string>, key = randomUUID()): Record<string, string> {
  return { ...headers, 'Idempotency-Key': key };
}

async function expectJson<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  status: number,
  options: {
    headers?: Record<string, string>;
    data?: unknown;
    multipart?: Record<string, { name: string; mimeType: string; buffer: Buffer }>;
  } = {},
): Promise<T> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { method, ...options });
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

/** Lectura de auditoría por SQL (la API no la expone por entidad). */
function tenantPsql(sql: string): string {
  if (!schemaName) throw new Error('Sin esquema de tenant efímero.');
  const container = process.env.E2E_POSTGRES_CONTAINER ?? 'iwana_postgres_dev';
  const user = process.env.E2E_DB_BOOTSTRAP_USER ?? 'iwana';
  const database = process.env.E2E_DB_NAME ?? 'dbiw';
  const raw = execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      user,
      '-d',
      database,
      '-At',
      '-c',
      `SET search_path TO "${schemaName}", public; ${sql}`,
    ],
    { encoding: 'utf8' },
  ).trim();
  return (
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

async function cleanupTenant(): Promise<void> {
  if (!api || !platformToken || !tenantId) return;
  try {
    await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: apiHeaders(platformToken),
      data: { status: 'INACTIVE' },
    });
    await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: apiHeaders(platformToken),
    });
  } catch {
    // Limpieza best-effort: nunca oculta el resultado de la suite.
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
        email: process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? '',
        password:
          process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD ?? '',
      },
    },
  );
  platformToken = platformSession.accessToken;

  const created = await expectJson<{ id: string; slug: string; schemaName: string }>(
    '/tenants',
    'POST',
    201,
    {
      headers: apiHeaders(platformToken),
      data: {
        name: `Tenant sintético IVA cortesías ${RUN_ID}`,
        slug: TENANT_SLUG,
        contactEmail: `qa-iv-${RUN_ID}@example.invalid`,
        adminEmail: ADMIN_EMAIL,
        settings: {
          timezone: 'America/Bogota',
          currency: 'COP',
          features: { mfa_required_all: false },
        },
      },
    },
  );
  tenantId = created.id;
  schemaName = created.schemaName;
  expect(schemaName).not.toBe('tenant_iwana');

  await expect
    .poll(
      async () => {
        const current = await expectJson<{ status: string }>(`/tenants/${tenantId}`, 'GET', 200, {
          headers: apiHeaders(platformToken!),
        });
        if (current.status === 'PROVISIONING_FAILED') throw new Error('Provisioning fallido.');
        return current.status;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('ACTIVE');

  const credential = await expectJson<{ adminEmail: string; temporaryPassword: string }>(
    `/tenants/${tenantId}/regenerate-admin-credentials`,
    'POST',
    200,
    { headers: withKey(apiHeaders(platformToken)) },
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
  adminToken = session.accessToken;

  // RS-13: sin identidad fiscal del emisor no se emite.
  await expectJson('/tenants/me/profile', 'PATCH', 200, {
    headers: tenantHeaders(),
    data: { legalName: 'Operador Sintético E2E', nit: '900000001', nitDv: '7' },
  });
}

/** Ciclo 1 o 15 ya generado en el mes de la corrida (sin fechas fijas). */
async function chooseCycle(): Promise<void> {
  today = bogotaToday();
  const [year, month] = today.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(year, month, 0).getDate();
  const response = await api!.fetch(`${API_PREFIX}/crm/billing-cycles`, {
    headers: tenantHeaders(),
  });
  expect(response.status(), 'GET /crm/billing-cycles').toBe(200);
  const cycles = (await response.json()) as Array<{
    cycleDay: number;
    cutoffDay: number;
    active: boolean;
  }>;
  const viable = cycles
    .filter((c) => c.active && (c.cycleDay === 1 || c.cycleDay === 15))
    .filter((c) => {
      const generation = `${today.slice(0, 8)}${String(c.cycleDay).padStart(2, '0')}`;
      return generation <= today && c.cutoffDay <= daysInMonth;
    })
    .sort((a, b) => b.cycleDay - a.cycleDay);
  if (viable.length === 0) throw new Error(`Sin ciclo facturable el ${today}.`);
  cycleDay = viable[0]!.cycleDay;
  periodStart = `${today.slice(0, 8)}${String(cycleDay).padStart(2, '0')}`;
  nextPeriodStart = addOneMonth(periodStart);
}

async function seedCatalogAndUsers(): Promise<void> {
  const headers = tenantHeaders();
  const legal = await expectJson<{ id: string }>('/privacy/legal-texts', 'POST', 201, {
    headers,
    data: {
      type: 'AUTORIZACION',
      version: `qa-iv-${RUN_ID}`,
      content: 'Texto de autorización sintético para prueba E2E de IVA y cortesías.',
    },
  });
  legalTextId = legal.id;

  // CA-1: plan de internet con instalación de 50.000 (IVA de instalación por defecto: STANDARD).
  const residential = await expectJson<{ id: string; name: string }>(
    '/commercial/catalog/plans',
    'POST',
    201,
    {
      headers,
      data: {
        name: `Plan QA residencial ${RUN_ID}`,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 20,
        installationRule: 'ALWAYS',
      },
    },
  );
  await expectJson(`/commercial/catalog/${residential.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '55000.00', installationFee: '50000.00' },
  });
  catalog.residentialPlanId = residential.id;
  catalog.residentialPlanName = residential.name;

  // CA-3/CA-4: plan sin instalación, para que el primer cobro tenga una sola línea.
  const simple = await expectJson<{ id: string; name: string }>(
    '/commercial/catalog/plans',
    'POST',
    201,
    {
      headers,
      data: {
        name: `Plan QA cortesía ${RUN_ID}`,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 50,
        uploadSpeedMbps: 10,
        installationRule: 'ALWAYS',
      },
    },
  );
  await expectJson(`/commercial/catalog/${simple.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '55000.00', installationFee: '0' },
  });
  catalog.simplePlanId = simple.id;
  catalog.simplePlanName = simple.name;

  // CA-2: adicionales con IVA propio del catálogo (STANDARD 19 %).
  const product = await expectJson<{ id: string }>('/commercial/catalog/products', 'POST', 201, {
    headers,
    data: {
      name: `Router QA ${RUN_ID}`,
      vatConcept: 'EQUIPMENT_SALE',
      vatTreatment: 'STANDARD',
      category: 'CPE',
      chargeType: 'ONE_TIME',
    },
  });
  await expectJson(`/commercial/catalog/${product.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '120000.00', installationFee: '0' },
  });
  catalog.productId = product.id;

  const service = await expectJson<{ id: string }>('/commercial/catalog/services', 'POST', 201, {
    headers,
    data: {
      name: `IP fija QA ${RUN_ID}`,
      vatConcept: 'INDEPENDENT_SERVICE',
      vatTreatment: 'STANDARD',
      chargeType: 'RECURRING',
    },
  });
  await expectJson(`/commercial/catalog/${service.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '30000.00', installationFee: '0' },
  });
  catalog.serviceId = service.id;

  // CA-4: usuario SUPPORT con el perfil estándar (lee facturación, sin permiso de cortesías).
  const support = await expectJson<{ id: string }>('/users', 'POST', 201, {
    headers: withKey(headers),
    data: {
      email: SUPPORT_EMAIL,
      role: 'SUPPORT',
      password: SUPPORT_PASSWORD,
      firstName: 'Soporte',
      lastName: 'E2E',
    },
  });
  await expectJson(`/users/${support.id}`, 'PATCH', 200, {
    headers: withKey(headers),
    data: { status: 'ACTIVE' },
  });
  const profiles = await expectJson<Array<{ id: string; name: string }>>(
    '/access-control/profiles',
    'GET',
    200,
    { headers },
  );
  const supportProfile = profiles.find((profile) => profile.name === 'Acceso estándar Soporte');
  if (!supportProfile) throw new Error('Falta el perfil Acceso estándar Soporte.');
  await expectJson(`/access-control/users/${support.id}/profiles`, 'PUT', 200, {
    headers,
    data: { profileIds: [supportProfile.id] },
  });
  const supportSession = await expectJson<{ accessToken: string }>('/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: SUPPORT_EMAIL, password: SUPPORT_PASSWORD },
  });
  supportToken = supportSession.accessToken;
}

type ContractSeed = {
  tag: string;
  planId: string;
  planName: string;
  residentialStratum2?: boolean;
  startDate: string;
  additionalProductIds?: string[];
  additionalServiceIds?: string[];
};

/** Titular + contrato + activación; la activación genera el primer cobro (ADR-109 D6). */
async function seedContract(seed: ContractSeed): Promise<{
  subscriberId: string;
  contractId: string;
  firstDocument: BillingDoc;
}> {
  const headers = tenantHeaders();
  const stratum = seed.residentialStratum2 ? 2 : 4;
  const subscriber = await expectJson<{ id: string }>('/crm/subscribers', 'POST', 201, {
    headers,
    data: {
      personType: 'NATURAL',
      customerSegment: 'RESIDENTIAL',
      documentType: 'CC',
      documentNumber: `${seed.tag}-${RUN_ID}`,
      firstName: `Titular ${seed.tag}`,
      lastName: `Sintético ${RUN_ID}`,
      stratum,
      email: `qa-${seed.tag}-${RUN_ID}@example.invalid`,
      address: `Dirección sintética ${RUN_ID}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: [],
      authorizationChannel: 'PRESENCIAL',
      authorizations: [
        { purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId: legalTextId },
      ],
    },
  });
  const contract = await expectJson<{ id: string }>(
    `/crm/subscribers/${subscriber.id}/contracts`,
    'POST',
    201,
    {
      headers,
      data: {
        subscriberId: subscriber.id,
        planId: seed.planId,
        planSnapshotJson: { id: seed.planId, name: seed.planName, monthlyPrice: '55000.00' },
        alias: `Servicio QA ${seed.tag} ${RUN_ID}`,
        installationAddress: `Dirección sintética ${RUN_ID}`,
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        customerSegment: 'RESIDENTIAL',
        serviceUsage: seed.residentialStratum2 ? 'RESIDENTIAL' : 'NON_RESIDENTIAL',
        ...(seed.residentialStratum2 ? { installationStratum: 2 } : {}),
        fiscalName: `Titular ${seed.tag} Sintético`,
        fiscalDocument: `${seed.tag}-${RUN_ID}`,
        fiscalAddress: `Dirección sintética ${RUN_ID}`,
        startDate: seed.startDate,
        ...(seed.additionalProductIds ? { additionalProductIds: seed.additionalProductIds } : {}),
        ...(seed.additionalServiceIds ? { additionalServiceIds: seed.additionalServiceIds } : {}),
      },
    },
  );
  if (seed.residentialStratum2) {
    // ADR-093: sin soporte de estrato verificable el internet residencial cae a STANDARD.
    await expectJson(`/crm/contracts/${contract.id}/stratum-evidence`, 'POST', 201, {
      headers,
      multipart: {
        file: { name: 'soporte-estrato.png', mimeType: 'image/png', buffer: STRATUM_EVIDENCE_PNG },
      },
    });
  }
  const active = await expectJson<{ vatSnapshot: { treatment: string; ratePercent: number } }>(
    `/crm/contracts/${contract.id}/activate`,
    'POST',
    200,
    { headers, data: { billingCycleDay: cycleDay } },
  );
  expect(active.vatSnapshot).toMatchObject(
    seed.residentialStratum2
      ? { treatment: 'EXEMPT', ratePercent: 0 }
      : { treatment: 'STANDARD', ratePercent: 19 },
  );

  let documents: Array<{ id: string }> = [];
  await expect
    .poll(
      async () => {
        documents = await expectJson<Array<{ id: string }>>(
          `/billing/documents?subscriberId=${subscriber.id}&limit=5`,
          'GET',
          200,
          { headers },
        );
        return documents.length;
      },
      { timeout: 30_000, message: 'La activación no generó el primer cobro.' },
    )
    .toBe(1);
  return {
    subscriberId: subscriber.id,
    contractId: contract.id,
    firstDocument: await getDocument(documents[0]!.id),
  };
}

function getDocument(id: string, token = adminToken): Promise<BillingDoc> {
  return expectJson<BillingDoc>(`/billing/documents/${id}`, 'GET', 200, {
    headers: tenantHeaders(token),
  });
}

async function listDocuments(subscriberId: string): Promise<BillingDoc[]> {
  return expectJson<BillingDoc[]>(
    `/billing/documents?subscriberId=${subscriberId}&limit=10`,
    'GET',
    200,
    { headers: tenantHeaders() },
  );
}

async function issueDocument(id: string): Promise<BillingDoc> {
  await expectJson('/billing/documents/issue', 'POST', 200, {
    headers: withKey(tenantHeaders()),
    data: { documentIds: [id] },
  });
  const issued = await getDocument(id);
  expect(issued.status).toBe('EMITIDO');
  expect(issued.number).toBeTruthy();
  return issued;
}

async function generateNextPeriod(contractId: string): Promise<void> {
  const summary = await expectJson<{ generated: number }>(
    '/billing/documents/generate',
    'POST',
    200,
    { headers: withKey(tenantHeaders()), data: { contractId, date: nextPeriodStart } },
  );
  expect(summary.generated).toBe(1);
}

function line(document: BillingDoc, predicate: (item: DocLine) => boolean): DocLine {
  const found = (document.lines ?? []).find(predicate);
  if (!found) {
    throw new Error(
      `Línea esperada ausente en ${document.id}: ${JSON.stringify(
        (document.lines ?? []).map((item) => [item.kind, item.description]),
      )}`,
    );
  }
  return found;
}

function cents(value: string | null | undefined): number {
  return Math.round(Number(value ?? 'NaN') * 100);
}

async function loginInPortal(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(TENANT_SLUG);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

function documentRow(page: Page, number: string) {
  return page.getByRole('row').filter({ hasText: number });
}

async function openCourtesyDialog(page: Page, number: string) {
  await page.goto(DOCUMENTS_URL);
  await page.getByRole('button', { name: `Otorgar cortesía en la factura ${number}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Otorgar cortesía' });
  await expect(dialog.getByRole('group', { name: 'Tipo de cortesía' })).toBeVisible();
  await expect(dialog.getByLabel('Motivo')).toBeVisible();
  return dialog;
}

async function expectNoSeriousAxeViolations(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' });

test.describe('MOD14 IVA por concepto y cortesías — E2E vivo', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    try {
      await createDisposableTenant();
      await chooseCycle();
      await seedCatalogAndUsers();
    } catch (error) {
      await cleanupTenant();
      throw error;
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupTenant();
    } finally {
      await api?.dispose();
    }
  });

  test('CA-1 y CA-2: internet exento, instalación al 19 %, servicio cada periodo con precio congelado y producto solo en el primer cobro', async ({
    page,
  }) => {
    const seeded = await seedContract({
      tag: 'ca1',
      planId: catalog.residentialPlanId,
      planName: catalog.residentialPlanName,
      residentialStratum2: true,
      startDate: periodStart,
      additionalProductIds: [catalog.productId],
      additionalServiceIds: [catalog.serviceId],
    });
    const first = seeded.firstDocument;

    // CA-1: el internet del estrato 2 va exento; la instalación causa 19 % (9.500).
    expect(line(first, (l) => l.kind === 'PLAN')).toMatchObject({
      baseAmount: '55000.00',
      taxAmount: '0.00',
      total: '55000.00',
      vatTreatment: 'EXEMPT',
    });
    expect(line(first, (l) => l.kind === 'INSTALACION')).toMatchObject({
      description: 'Instalación',
      baseAmount: '50000.00',
      taxAmount: '9500.00',
      total: '59500.00',
      vatTreatment: 'STANDARD',
      vatRate: '19.0000',
    });
    // CA-2: producto completo con IVA 19 % en el primer cobro; servicio del periodo completo.
    expect(
      line(first, (l) => l.kind === 'ADICIONAL' && l.description.startsWith('Router QA')),
    ).toMatchObject({
      baseAmount: '120000.00',
      taxAmount: '22800.00',
      total: '142800.00',
      vatTreatment: 'STANDARD',
    });
    expect(
      line(first, (l) => l.kind === 'ADICIONAL' && l.description.startsWith('IP fija QA')),
    ).toMatchObject({
      unitPrice: '30000.00',
      baseAmount: '30000.00',
      taxAmount: '5700.00',
      total: '35700.00',
    });
    expect(first.lines).toHaveLength(4);
    expect(first).toMatchObject({
      subtotal: '255000.00',
      taxTotal: '38000.00',
      total: '293000.00',
    });

    // R2/R3: subir la tarifa del servicio en el catálogo no reprecia el contrato ya creado.
    await expectJson(`/commercial/catalog/${catalog.serviceId}/prices`, 'POST', 201, {
      headers: tenantHeaders(),
      data: { customerSegment: 'RESIDENTIAL', basePrice: '40000.00', installationFee: '0' },
    });
    await generateNextPeriod(seeded.contractId);
    const documents = await listDocuments(seeded.subscriberId);
    const nextSummary = documents.find((doc) => doc.periodStart === nextPeriodStart);
    expect(nextSummary, `Sin documento del periodo ${nextPeriodStart}`).toBeTruthy();
    const next = await getDocument(nextSummary!.id);
    expect(next.lines?.map((l) => l.kind).sort()).toEqual(['ADICIONAL', 'PLAN']);
    expect(line(next, (l) => l.kind === 'ADICIONAL')).toMatchObject({
      unitPrice: '30000.00',
      baseAmount: '30000.00',
      taxAmount: '5700.00',
      total: '35700.00',
    });
    expect(next.lines?.some((l) => l.description.startsWith('Router QA'))).toBe(false);
    expect(next.lines?.some((l) => l.kind === 'INSTALACION')).toBe(false);
    expect(next.total).toBe('90700.00');

    // El detalle del portal muestra los conceptos del primer cobro.
    const issued = await issueDocument(first.id);
    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto(DOCUMENTS_URL);
    await documentRow(page, issued.number!).getByRole('button', { name: 'Ver detalle' }).click();
    const detailLines = page.getByRole('row').filter({ hasText: 'Instalación' });
    await expect(detailLines.first()).toBeVisible();
    await expect(page.getByRole('cell', { name: `Router QA ${RUN_ID}` }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: `IP fija QA ${RUN_ID}` }).first()).toBeVisible();
  });

  test('CA-3: ADMIN regala desde el portal la línea del primer cobro emitido; queda saldado, auditado, el mes siguiente se cobra completo y anular restaura el saldo', async ({
    page,
  }) => {
    // Inicio a mitad de periodo → línea PRORRATEO. El día del ciclo (1 o 15) no hay tramo
    // parcial: el primer cobro es el periodo completo y se regala la línea PLAN.
    const prorated = today !== periodStart;
    const seeded = await seedContract({
      tag: 'ca3',
      planId: catalog.simplePlanId,
      planName: catalog.simplePlanName,
      startDate: today,
    });
    const issued = await issueDocument(seeded.firstDocument.id);
    const gifted = line(issued, (l) => l.kind === (prorated ? 'PRORRATEO' : 'PLAN'));
    expect(issued.lines).toHaveLength(1);
    expect(cents(issued.pendingAmount)).toBe(cents(gifted.total));

    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);

    // a11y del diálogo en claro y oscuro (WCAG 2.2 AA, serious/critical).
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const dialog = await openCourtesyDialog(page, issued.number!);
      await expectNoSeriousAxeViolations(page, `diálogo de cortesía (${theme})`);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
    }
    await page.emulateMedia({ colorScheme: 'light' });

    const dialog = await openCourtesyDialog(page, issued.number!);
    await dialog.getByRole('radio', { name: 'Regalar una línea' }).check();
    await dialog.getByLabel('Línea a regalar').selectOption(gifted.id);
    await dialog.getByLabel('Motivo').selectOption('PRORRATEO_INICIAL');
    const submit = dialog.getByRole('button', { name: 'Otorgar cortesía', exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden();

    // R4/R5: ajuste no monetario sobre el emitido; el documento queda saldado.
    const settled = await getDocument(issued.id);
    expect(settled.pendingAmount).toBe('0.00');
    expect(settled.total).toBe(issued.total);
    const active = (settled.courtesies ?? []).filter((c) => c.status === 'ACTIVA');
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ amount: gifted.total, reasonCode: 'PRORRATEO_INICIAL' });
    await expect(
      documentRow(page, issued.number!).getByRole('button', {
        name: `Otorgar cortesía en la factura ${issued.number!}`,
      }),
    ).toHaveCount(0);

    // CA-4 (auditoría): la cortesía queda auditada con su motivo.
    expect(
      tenantPsql(
        `SELECT new_value->>'reasonCode' FROM audit_logs WHERE entity_type = 'BillingCourtesy' AND action = 'CREATE' AND entity_id = '${active[0]!.id}';`,
      ),
    ).toBe('PRORRATEO_INICIAL');

    // CA-3: el periodo siguiente se cobra completo (sin cortesía arrastrada).
    await generateNextPeriod(seeded.contractId);
    const next = (await listDocuments(seeded.subscriberId)).find(
      (doc) => doc.periodStart === nextPeriodStart,
    );
    expect(next, `Sin documento del periodo ${nextPeriodStart}`).toBeTruthy();
    const nextDetail = await getDocument(next!.id);
    expect(nextDetail.lines?.map((l) => l.kind)).toEqual(['PLAN']);
    expect(nextDetail).toMatchObject({
      subtotal: '55000.00',
      taxTotal: '10450.00',
      total: '65450.00',
    });
    expect(nextDetail.courtesies ?? []).toHaveLength(0);

    // R5: anular la cortesía desde el detalle devuelve el saldo.
    await page.goto(DOCUMENTS_URL);
    await documentRow(page, issued.number!).getByRole('button', { name: 'Ver detalle' }).click();
    await page.getByRole('button', { name: 'Anular cortesía' }).click();
    const voidDialog = page.getByRole('dialog', { name: 'Anular cortesía' });
    await voidDialog.getByLabel('Motivo de anulación').selectOption('DECISION_REVERTIDA');
    await voidDialog.getByRole('button', { name: 'Confirmar anulación' }).click();
    await expect(voidDialog).toBeHidden();
    await expect
      .poll(async () => (await getDocument(issued.id)).pendingAmount, { timeout: 15_000 })
      .toBe(gifted.total);
    const restored = await getDocument(issued.id);
    expect(restored.courtesies?.find((c) => c.id === active[0]!.id)?.status).toBe('ANULADA');
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'BillingCourtesy' AND action = 'UPDATE' AND entity_id = '${active[0]!.id}';`,
      ),
    ).toBe('1');
  });

  test('CA-4 e idempotencia: sin permiso no hay botón y la API da 403; la misma Idempotency-Key no duplica', async ({
    page,
  }) => {
    const seeded = await seedContract({
      tag: 'ca4',
      planId: catalog.simplePlanId,
      planName: catalog.simplePlanName,
      startDate: periodStart,
    });
    const issued = await issueDocument(seeded.firstDocument.id);
    expect(issued.pendingAmount).toBe('65450.00');
    const body = { target: 'VALOR', amount: '1000.00', reasonCode: 'PROMOCION_COMERCIAL' };

    // CA-4: SUPPORT ve el documento pero no la acción, ni en la lista ni en el detalle.
    await loginInPortal(page, SUPPORT_EMAIL, SUPPORT_PASSWORD);
    await page.goto(DOCUMENTS_URL);
    const row = documentRow(page, issued.number!);
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: /Otorgar cortesía/u })).toHaveCount(0);
    await row.getByRole('button', { name: 'Ver detalle' }).click();
    await expect(page.getByRole('columnheader', { name: 'IVA' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Otorgar cortesía/u })).toHaveCount(0);

    const forbidden = await api!.fetch(`${API_PREFIX}/billing/documents/${issued.id}/courtesies`, {
      method: 'POST',
      headers: withKey(tenantHeaders(supportToken)),
      data: body,
    });
    expect(forbidden.status()).toBe(403);
    expect((await getDocument(issued.id)).courtesies ?? []).toHaveLength(0);

    // Idempotencia: el mismo envío dos veces devuelve la misma cortesía y baja el saldo una vez.
    const key = randomUUID();
    const first = await expectJson<Courtesy>(
      `/billing/documents/${issued.id}/courtesies`,
      'POST',
      201,
      { headers: withKey(tenantHeaders(), key), data: body },
    );
    const replayResponse = await api!.fetch(
      `${API_PREFIX}/billing/documents/${issued.id}/courtesies`,
      { method: 'POST', headers: withKey(tenantHeaders(), key), data: body },
    );
    expect([200, 201]).toContain(replayResponse.status());
    const replay = ((await replayResponse.json()) as Envelope<Courtesy>).data;
    expect(replay.id).toBe(first.id);

    const conflict = await api!.fetch(`${API_PREFIX}/billing/documents/${issued.id}/courtesies`, {
      method: 'POST',
      headers: withKey(tenantHeaders(), key),
      data: { ...body, amount: '2000.00' },
    });
    expect(conflict.status()).toBe(409);
    expect(((await conflict.json()) as { code?: string }).code).toBe('IDEMPOTENCY_KEY_REUSED');

    const after = await getDocument(issued.id);
    expect(after.courtesies ?? []).toHaveLength(1);
    expect(after.pendingAmount).toBe('64450.00');
    expect(
      tenantPsql(
        `SELECT COUNT(*)::int FROM audit_logs WHERE entity_type = 'BillingCourtesy' AND action = 'CREATE' AND entity_id = '${first.id}';`,
      ),
    ).toBe('1');
  });
});
