import { randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Se reutilizan el fixture ZIP sintético y el UISP falso https del módulo (apps/api, CommonJS).
// El cargador ESM de Playwright no transpila fuera de este paquete: se transpila aquí cada archivo
// y sus importaciones relativas, con un `require` anclado en su carpeta para las dependencias.
function loadApiTestModule<T>(path: string, cache = new Map<string, unknown>()): T {
  if (cache.has(path)) return cache.get(path) as T;
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} as T };
  cache.set(path, module.exports);
  const nodeRequire = createRequire(path);
  const localRequire = (specifier: string): unknown =>
    specifier.startsWith('./') || specifier.startsWith('../')
      ? loadApiTestModule(resolve(dirname(path), `${specifier}.ts`), cache)
      : nodeRequire(specifier);
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  cache.set(path, module.exports);
  return module.exports;
}

const MIGRATION_TEST_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../apps/api/src/modules/migration/test',
);
const { buildSyntheticUispZip } = loadApiTestModule<
  typeof import('../../apps/api/src/modules/migration/test/uisp-zip.fixture')
>(resolve(MIGRATION_TEST_DIR, 'uisp-zip.fixture.ts'));
const { startFakeUisp } = loadApiTestModule<
  typeof import('../../apps/api/src/modules/migration/test/fake-uisp-server')
>(resolve(MIGRATION_TEST_DIR, 'fake-uisp-server.ts'));
type FakeUispServer = Awaited<ReturnType<typeof startFakeUisp>>;

/**
 * Importación UISP: usuarios del personal (spec 2026-11-15 «usuarios» §5–§6, ADR-110 D15) contra
 * Portal, API y worker reales y un UISP falso https en loopback (nunca una instancia real).
 * CA-1 (traer sin duplicar), CA-2 (enlazar sin cambiar al usuario), CA-3 (crear activos e
 * inactivos), CA-4 (conteo de invitaciones; el contenido del correo no se prueba aquí),
 * CA-5 (atribución al promover y conteo de no enlazados), CA-6 («Actualizar autores» idempotente),
 * CA-7 (número «sin datos»), CA-8 (la clave no vuelve en respuestas ni en la página),
 * CA-9 (revertir no borra usuarios) y a11y claro/oscuro. Tenant desechable; datos sintéticos.
 */

type Envelope<T> = { data: T };
type Tenant = { id: string; slug: string; schemaName: string; status: string };
type BatchReport = {
  id: string;
  status: string;
  counts: {
    procesamiento: string;
    entidades: Record<string, { leidos: number; validos: number; rechazados: number }>;
    observaciones: Record<string, number>;
  };
  promotion: { procesamiento: string; promovidos: Record<string, number> } | null;
};
type UispUserRow = {
  id: string;
  uispUserId: number;
  displayName: string | null;
  email: string | null;
  isActiveInUisp: boolean | null;
  source: 'API' | 'SIN_DATOS';
  status: 'PENDIENTE' | 'ENLAZADO' | 'CREADO' | 'DESCARTADO';
  matchedUserId: string | null;
  targetUserId: string | null;
  proposedRole: string | null;
  referencedInBatches: number;
};
type TenantUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  isOperationalResource: boolean;
  firstName?: string | null;
  lastName?: string | null;
};
type Ticket = {
  id: string;
  subject: string;
  assignedUserId: string | null;
  createdByUserId: string;
};
type Comment = { body: string; authorUserId: string };
type Payment = { id: string; subscriberId: string; paidAt: string; createdBy: string };

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const SHORT = RUN_ID.slice(0, 6);
const TENANT_PREFIX = 'srqa-uisp-usr-';
const TENANT_SLUG = `${TENANT_PREFIX}${RUN_ID}`;
const TENANT_ADMIN_EMAIL = `${TENANT_PREFIX}${RUN_ID}@example.invalid`;
const PLAN_NAME = `Plan QA usuarios ${SHORT}`;
const TAG_NAME = `Etiqueta QA usuarios ${SHORT}`;
// Clave sintética por corrida: nunca una clave real de UISP.
const APP_KEY = `clave-sintetica-${randomBytes(12).toString('hex')}`;
// Correos en dominios reservados (RFC 2606): nunca llegan a nadie.
const MATCH_EMAIL = `coincide-${RUN_ID}@example.com`;
const CLIENT_ID = 9301;

// Números de usuario de UISP (por tenant): activo, inactivo, coincidente, a descartar y uno que
// solo aparece en el lote (la API no lo devuelve: «sin datos»).
const U_ACTIVE = 5101;
const U_INACTIVE = 5102;
const U_MATCH = 5103;
const U_DISCARD = 5104;
const U_MISSING = 5199;
const NAMES = {
  [U_ACTIVE]: `Ana Activa ${SHORT}`,
  [U_INACTIVE]: `Iván Inactivo ${SHORT}`,
  [U_MATCH]: `Marta Coincide ${SHORT}`,
  [U_DISCARD]: `Diego Descarta ${SHORT}`,
} as const;
const MISSING_NAME = `Técnico retirado ${SHORT}`;
const ROLE_LABEL = 'Técnico de campo';

const UISP_ADMINS = [
  {
    id: U_ACTIVE,
    email: `activo-${RUN_ID}@example.com`,
    username: 'ana.activa',
    firstName: 'Ana',
    lastName: `Activa ${SHORT}`,
    isActive: true,
  },
  {
    id: U_INACTIVE,
    email: `inactivo-${RUN_ID}@example.com`,
    username: 'ivan.inactivo',
    firstName: 'Iván',
    lastName: `Inactivo ${SHORT}`,
    isActive: false,
  },
  {
    id: U_MATCH,
    email: MATCH_EMAIL.toUpperCase(),
    username: 'marta.coincide',
    firstName: 'Marta',
    lastName: `Coincide ${SHORT}`,
    isActive: true,
  },
  {
    id: U_DISCARD,
    email: `descarta-${RUN_ID}@example.com`,
    username: 'diego.descarta',
    firstName: 'Diego',
    lastName: `Descarta ${SHORT}`,
    isActive: true,
  },
];

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
let importerId: string | undefined;
let matchUserId: string | undefined;
let uisp: FakeUispServer | undefined;

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

async function expectBody<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  status: number,
  options: { headers?: Record<string, string>; data?: unknown; multipart?: unknown } = {},
): Promise<{ text: string; body: Envelope<T> & Record<string, unknown> }> {
  const response = await api!.fetch(`${API_PREFIX}${path}`, { method, ...options } as never);
  const text = await response.text();
  let body = {} as Envelope<T> & Record<string, unknown>;
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // Respuesta vacía o no JSON: se reporta con el estado.
  }
  expect(
    response.status(),
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toBe(status);
  return { text, body };
}

async function expectJson<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  status: number,
  options: { headers?: Record<string, string>; data?: unknown; multipart?: unknown } = {},
): Promise<T> {
  return (await expectBody<T>(path, method, status, options)).body.data;
}

/** Listas que vienen como `data: T[]` o envueltas otra vez por el interceptor. */
function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const nested = (value as { data?: unknown; items?: unknown } | null) ?? {};
  if (Array.isArray(nested.data)) return nested.data as T[];
  if (nested.data && typeof nested.data === 'object') return asList<T>(nested.data);
  if (Array.isArray(nested.items)) return nested.items as T[];
  throw new Error(`Se esperaba una lista: ${String(JSON.stringify(value)).slice(0, 200)}`);
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

function jwtSubject(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1]!.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString(
      'utf8',
    ),
  ) as { sub?: string };
  return requiredEnv(payload.sub, 'sub del JWT del administrador');
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
      name: `Tenant sintético usuarios UISP ${RUN_ID}`,
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
  expect(created.schemaName).toMatch(/^tenant_srqa_uisp_usr_[a-f0-9]{12}$/u);
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
  importerId = jwtSubject(tenantAdminToken);

  // Destinos de las equivalencias del lote: un plan con precio y una etiqueta del catálogo.
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
  await expectJson(`/commercial/catalog/${plan.id}/prices`, 'POST', 201, {
    headers: tenantHeaders(),
    data: { customerSegment: 'RESIDENTIAL', basePrice: '80000.00', installationFee: '0.00' },
  });
  await expectJson('/crm/subscriber-tags', 'POST', 201, {
    headers: tenantHeaders(),
    data: { name: TAG_NAME, color: '#1D4ED8' },
  });

  // Usuario de iWana cuyo correo coincide con uno de UISP (CA-2).
  const match = await expectJson<{ id: string }>('/users', 'POST', 201, {
    headers: { ...tenantHeaders(), 'Idempotency-Key': randomUUID() },
    data: {
      email: MATCH_EMAIL,
      role: 'SUPPORT',
      password: `Qa9!${randomBytes(12).toString('hex')}`,
      firstName: 'Usuaria',
      lastName: `Existente ${SHORT}`,
    },
  });
  matchUserId = match.id;
}

async function startUisp(): Promise<FakeUispServer> {
  const server = await startFakeUisp();
  server.routes.set('/crm/api/v1.0/version', { status: 200, body: { version: '2.4.0' } });
  server.routes.set('/crm/api/v1.0/users/admins', { status: 200, body: UISP_ADMINS });
  return server;
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
  // Mismo criterio que portal-importacion-uisp-live: se espera a que terminen las animaciones
  // antes de medir el contraste; un contraste insuficiente real sigue fallando.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))),
  );
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const detail = blocking
    .flatMap((v) =>
      v.nodes.slice(0, 5).map((node) => {
        const data = (node.any[0]?.data ?? {}) as {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
        };
        const colors = data.fgColor
          ? ` ${data.fgColor} sobre ${data.bgColor} (${data.contrastRatio}:1)`
          : '';
        return `${v.id} → ${node.target.join(' ')}${colors}`;
      }),
    )
    .join(' | ');
  expect(blocking, `axe ${label}: ${detail}`).toEqual([]);
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

async function listUispUsers(): Promise<UispUserRow[]> {
  const { body } = await expectBody<UispUserRow[]>('/migration/uisp-users', 'GET', 200, {
    headers: tenantHeaders(),
  });
  return body.data;
}

async function uispRow(uispUserId: number): Promise<UispUserRow> {
  const row = (await listUispUsers()).find((candidate) => candidate.uispUserId === uispUserId);
  if (!row) throw new Error(`No hay fila de revisión para el usuario de UISP ${uispUserId}.`);
  return row;
}

function getUser(id: string): Promise<TenantUser> {
  return expectJson<TenantUser>(`/users/${id}`, 'GET', 200, { headers: tenantHeaders() });
}

async function attribution(subscriberId: string) {
  const ticketsBody = (
    await expectBody<unknown>(
      `/assurance/tickets?page=1&limit=50&subscriberId=${subscriberId}`,
      'GET',
      200,
      { headers: tenantHeaders() },
    )
  ).body;
  const tickets = asList<Ticket>(ticketsBody);
  const ticket = tickets.find((candidate) => candidate.subject === 'Ticket sintético con tareas');
  if (!ticket) throw new Error(`Ticket importado ausente: ${tickets.map((t) => t.subject)}`);
  const commentsBody = (
    await expectBody<unknown>(`/assurance/tickets/${ticket.id}/comments`, 'GET', 200, {
      headers: tenantHeaders(),
    })
  ).body;
  const comments = asList<Comment>(commentsBody);
  const paymentsBody = (
    await expectBody<unknown>(
      // Sin filtro por cliente: `main` solo acepta page y limit; el tenant es desechable.
      '/billing/payments?page=1&limit=100',
      'GET',
      200,
      { headers: tenantHeaders() },
    )
  ).body;
  const payments = asList<Payment>(paymentsBody)
    .filter((payment) => payment.subscriberId === subscriberId)
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  return {
    assigned: ticket.assignedUserId,
    createdBy: ticket.createdByUserId,
    authors: Object.fromEntries(comments.map((comment) => [comment.body, comment.authorUserId])),
    payments: payments.map((payment) => payment.createdBy),
  };
}

function reviewRow(page: Page, name: string) {
  return page.getByRole('checkbox', { name: `Seleccionar a ${name}`, exact: true });
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('Importación UISP: usuarios del personal — contra Portal, API, worker y UISP falso', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(480_000);

  test.beforeAll(async () => {
    try {
      uisp = await startUisp();
      await createDisposableTenant();
    } catch (error) {
      // La limpieza no debe ocultar la causa original del fallo.
      await cleanupQaTenants().catch(() => undefined);
      await uisp?.close();
      throw error;
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupQaTenants();
    } finally {
      await uisp?.close();
      await api?.dispose();
    }
  });

  test('CA-1…CA-9: conecta, trae, crea, enlaza, descarta, invita, promueve con autores y los actualiza', async ({
    page,
  }) => {
    const fake = uisp!;
    await loginInPortal(page);
    await page.goto('/dashboard/settings/imports#usuarios-uisp');

    // ── Conexión con la huella del certificado autofirmado (§2.1) ──
    const connectionPanel = page.getByRole('region', { name: 'Conexión con UISP' });
    await expect(connectionPanel.getByText('Aún no hay conexión con UISP')).toBeVisible({
      timeout: 30_000,
    });
    await connectionPanel.getByLabel('Dirección de UISP').fill(fake.baseUrl);
    await connectionPanel.getByLabel('Clave de aplicación', { exact: true }).fill(APP_KEY);
    await connectionPanel.getByLabel('Confiar en este certificado').check();
    await connectionPanel.getByLabel('Huella SHA-256 del certificado').fill(fake.sha256);
    const saved = page.waitForResponse(
      (r) => r.url().includes('/migration/uisp-connection') && r.request().method() === 'PUT',
    );
    await connectionPanel.getByRole('button', { name: 'Probar y guardar' }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    // CA-8: la clave nunca vuelve en la respuesta.
    expect(await savedResponse.text()).not.toContain(APP_KEY);
    await expect(
      page.getByText('Conexión guardada. UISP respondió correctamente.', { exact: true }),
    ).toBeVisible();
    await expect(connectionPanel.getByText('Guardada; no se muestra')).toBeVisible();
    await expect(connectionPanel.getByText(/^Huella fijada/u)).toBeVisible();

    await connectionPanel.getByRole('button', { name: 'Probar conexión' }).click();
    await expect(
      connectionPanel.getByText('UISP respondió correctamente.', { exact: true }),
    ).toBeVisible();
    await expect(connectionPanel.getByText('Conexión correcta').first()).toBeVisible();
    // El API real llamó al UISP falso con la clave en la cabecera y solo con GET.
    const versionCalls = fake.requests.filter((r) => r.path === '/crm/api/v1.0/version');
    expect(versionCalls.length).toBeGreaterThanOrEqual(2);
    expect(versionCalls.every((r) => r.method === 'GET' && r.appKey === APP_KEY)).toBe(true);
    const connection = await expectBody<unknown>('/migration/uisp-connection', 'GET', 200, {
      headers: tenantHeaders(),
    });
    expect(connection.text).not.toContain(APP_KEY);
    expect(connection.body.data).toMatchObject({
      baseUrl: fake.baseUrl,
      hasAppKey: true,
      trustedCertificateSha256: fake.sha256,
      lastCheckResult: 'OK',
    });

    // ── Traer usuarios (§2.2; CA-1) ──
    const usersPanel = page.locator('#usuarios-uisp');
    await usersPanel.getByRole('button', { name: 'Traer usuarios de UISP' }).click();
    await expect(
      usersPanel.getByText('Lista actualizada: 4 usuarios de UISP.', { exact: true }),
    ).toBeVisible({ timeout: 150_000 });
    const fetched = await listUispUsers();
    expect(fetched.map((row) => row.uispUserId).sort()).toEqual([
      U_ACTIVE,
      U_INACTIVE,
      U_MATCH,
      U_DISCARD,
    ]);
    expect(fetched.every((row) => row.status === 'PENDIENTE' && row.source === 'API')).toBe(true);
    expect(
      fake.requests.some((r) => r.path === '/crm/api/v1.0/users/admins' && r.method === 'GET'),
    ).toBe(true);
    const matchRow = fetched.find((row) => row.uispUserId === U_MATCH)!;
    expect(matchRow.matchedUserId, 'CA-2: coincidencia por correo').toBe(matchUserId);
    expect(fetched.filter((row) => row.matchedUserId !== null)).toHaveLength(1);

    const table = usersPanel.getByRole('table', { name: 'Usuarios de UISP para revisar' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('row', { name: new RegExp(NAMES[U_MATCH], 'u') })).toContainText(
      'Mismo correo',
    );
    await expect(
      table.getByRole('row', { name: new RegExp(NAMES[U_INACTIVE], 'u') }),
    ).toContainText('Inactivo');

    await axeLightAndDark(
      page,
      '/dashboard/settings/imports#usuarios-uisp',
      () => expect(table).toBeVisible({ timeout: 30_000 }),
      'usuarios de UISP · revisión',
    );

    // ── Crear en selección múltiple con un rol (§2.3; CA-3) ──
    await reviewRow(page, NAMES[U_ACTIVE]).check();
    await reviewRow(page, NAMES[U_INACTIVE]).check();
    await usersPanel.getByLabel('Rol para crear').selectOption({ label: ROLE_LABEL });
    await usersPanel.getByRole('button', { name: 'Crear (2)' }).click();
    const createDialog = page.getByRole('dialog', {
      name: `Crear 2 usuarios como ${ROLE_LABEL}`,
    });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByLabel(/^Mostrar en Programación a los activos/u)).toBeChecked();
    const created = page.waitForResponse(
      (r) => r.url().includes('/migration/uisp-users/resolve') && r.request().method() === 'POST',
    );
    await createDialog.getByRole('button', { name: 'Crear', exact: true }).click();
    expect((await created).status()).toBe(200);
    await expect(usersPanel.getByText(/^2 usuarios creados sin acceso\./u)).toBeVisible();

    // ── Enlazar (CA-2) ──
    await reviewRow(page, NAMES[U_MATCH]).check();
    await usersPanel.getByRole('button', { name: 'Enlazar (1)' }).click();
    await expect(
      usersPanel.getByText('1 usuario enlazado con su usuario de iWana.', { exact: true }),
    ).toBeVisible();

    // ── Descartar ──
    await reviewRow(page, NAMES[U_DISCARD]).check();
    await usersPanel.getByRole('button', { name: 'Descartar (1)' }).click();
    await page
      .getByRole('dialog', { name: 'Descartar 1 usuario de UISP' })
      .getByRole('button', { name: 'Descartar', exact: true })
      .click();
    await expect(usersPanel.getByText(/^1 usuario descartado\./u)).toBeVisible();

    const resolved = await listUispUsers();
    const byNumber = new Map(resolved.map((row) => [row.uispUserId, row]));
    expect(byNumber.get(U_ACTIVE)).toMatchObject({ status: 'CREADO', displayName: null });
    expect(byNumber.get(U_INACTIVE)).toMatchObject({ status: 'CREADO', displayName: null });
    expect(byNumber.get(U_MATCH)).toMatchObject({
      status: 'ENLAZADO',
      targetUserId: matchUserId,
      email: null,
    });
    expect(byNumber.get(U_DISCARD)).toMatchObject({ status: 'DESCARTADO', targetUserId: null });
    const activeUserId = byNumber.get(U_ACTIVE)!.targetUserId!;
    const inactiveUserId = byNumber.get(U_INACTIVE)!.targetUserId!;
    expect(activeUserId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(inactiveUserId).toMatch(/^[0-9a-f-]{36}$/u);

    const activeUser = await getUser(activeUserId);
    expect(activeUser).toMatchObject({
      role: 'TECHNICIAN',
      status: 'PENDING_VERIFICATION',
      isOperationalResource: true,
    });
    const inactiveUser = await getUser(inactiveUserId);
    expect(inactiveUser).toMatchObject({
      role: 'TECHNICIAN',
      status: 'INACTIVE',
      isOperationalResource: false,
    });
    // CA-2: el usuario enlazado no cambia.
    expect(await getUser(matchUserId!)).toMatchObject({
      email: MATCH_EMAIL,
      role: 'SUPPORT',
      firstName: 'Usuaria',
    });

    // ── Invitar: solo cuenta (el contenido del correo lo cubre otro encargo) (§2.4; CA-4) ──
    await usersPanel.getByRole('button', { name: /^Creados/u }).click();
    await reviewRow(page, `Usuario de UISP n.º ${U_ACTIVE}`).check();
    await reviewRow(page, `Usuario de UISP n.º ${U_INACTIVE}`).check();
    const invited = page.waitForResponse(
      (r) => r.url().includes('/migration/uisp-users/invite') && r.request().method() === 'POST',
    );
    await usersPanel.getByRole('button', { name: 'Enviar invitación (2)' }).click();
    const invitedResponse = await invited;
    expect(invitedResponse.status()).toBe(200);
    expect(((await invitedResponse.json()) as Envelope<unknown>).data).toEqual({
      invitados: 1,
      omitidos: 1,
    });
    await expect(
      usersPanel.getByText(/^Enviamos 1 invitación\. 1 usuario no la recibió/u),
    ).toBeVisible();
    // Un INACTIVE no se invita y sigue sin acceso.
    expect((await getUser(inactiveUserId)).status).toBe('INACTIVE');

    // ── Lote sintético que referencia esos números (§2.6; CA-5) ──
    await page.goto('/dashboard/settings/imports');
    await page.getByLabel('Archivos ZIP de clientes de UISP').setInputFiles([
      {
        name: `cliente-${CLIENT_ID}.zip`,
        mimeType: 'application/zip',
        buffer: await buildSyntheticUispZip({
          clientId: CLIENT_ID,
          document: `100000${CLIENT_ID}`,
          lastName: 'Sintético usuarios',
          stratum: '3',
          ticketAssignedUserId: U_ACTIVE,
          ticketActivity: [
            {
              id: 1,
              userId: U_MATCH,
              public: true,
              createdAt: '2023-03-01T08:00:00-0500',
              comment: { body: 'Abre la coincidente' },
            },
            {
              id: 2,
              userId: U_DISCARD,
              public: false,
              createdAt: '2023-03-01T09:00:00-0500',
              comment: { body: 'Comentario del descartado' },
            },
            {
              id: 3,
              userId: U_MISSING,
              public: true,
              createdAt: '2023-03-02T09:30:00-0500',
              comment: { body: 'Comentario sin datos' },
            },
          ],
          paymentUserIds: [U_INACTIVE, U_ACTIVE],
        }),
      },
    ]);
    await page.getByRole('button', { name: 'Subir y simular' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/imports\/[0-9a-f-]{36}$/u);
    const batchId = new URL(page.url()).pathname.split('/').pop()!;
    await waitBatch(
      batchId,
      (r) => r.status === 'SIMULADO' && r.counts.procesamiento === 'COMPLETADO',
    );
    await page.reload();

    const pendingList = page.getByRole('list', { name: 'Equivalencias pendientes' });
    await expect(pendingList).toBeVisible({ timeout: 30_000 });
    for (let guard = 0; guard < 12; guard += 1) {
      const rows = pendingList.getByRole('listitem');
      if ((await pendingList.count()) === 0 || (await rows.count()) === 0) break;
      const row = rows.first();
      const heading = (await row.locator('p').first().innerText()).trim();
      const target = row.getByLabel('Equivale en iWana a');
      if (heading.startsWith('Plan:')) await target.selectOption({ label: PLAN_NAME });
      else if (heading.startsWith('Etiqueta:')) await target.selectOption({ label: TAG_NAME });
      else await target.selectOption({ index: 1 });
      const mapped = page.waitForResponse(
        (r) => r.url().includes('/migration/mappings') && r.request().method() === 'POST',
      );
      await row.getByRole('button', { name: /^Guardar equivalencia de / }).click();
      expect((await mapped).status()).toBe(201);
      await expect(page.getByText(heading, { exact: true })).toHaveCount(0);
    }
    await expect(
      page.getByText('Todos los valores del lote tienen equivalencia.', { exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Promover' }).click();
    await page
      .getByRole('dialog', { name: 'Promover el lote' })
      .getByRole('button', { name: 'Promover', exact: true })
      .click();
    const promoted = await waitBatch(
      batchId,
      (r) => (r.status === 'PROMOVIDO' || r.status === 'CONCILIADO') && r.promotion !== null,
    );
    const promotionReport = `informe: ${JSON.stringify({ p: promoted.promotion, o: promoted.counts.observaciones })}`;
    expect(promoted.promotion?.promovidos.SUSCRIPTOR, promotionReport).toBe(1);
    expect(promoted.promotion?.promovidos.PAGO, promotionReport).toBe(2);
    // El descartado y el «sin datos» quedan sin enlazar; el informe solo cuenta (sin números).
    expect(promoted.counts.observaciones.USUARIO_UISP_SIN_ENLAZAR, promotionReport).toBe(2);
    expect(JSON.stringify(promoted.counts)).not.toContain(String(U_MISSING));

    const subscribers = await expectJson<Array<{ id: string }>>(
      '/crm/subscribers?page=1&limit=50',
      'GET',
      200,
      { headers: tenantHeaders() },
    );
    expect(subscribers).toHaveLength(1);
    const subscriberId = subscribers[0]!.id;

    const afterPromotion = await attribution(subscriberId);
    expect(afterPromotion, 'CA-5: atribución al promover').toEqual({
      assigned: activeUserId,
      createdBy: matchUserId,
      authors: {
        'Abre la coincidente': matchUserId,
        'Comentario del descartado': importerId,
        'Comentario sin datos': importerId,
      },
      payments: [inactiveUserId, activeUserId],
    });

    // ── Número que solo está en el lote: «sin datos» (§2.2; CA-7) y repetir no duplica (CA-1) ──
    await page.goto('/dashboard/settings/imports#usuarios-uisp');
    await page
      .locator('#usuarios-uisp')
      .getByRole('button', { name: 'Traer usuarios de UISP' })
      .click();
    await expect(
      page
        .locator('#usuarios-uisp')
        .getByText(/^(Lista actualizada: 5 usuarios de UISP\.|Lectura terminada)/u),
    ).toBeVisible({ timeout: 150_000 });
    const refetched = await listUispUsers();
    expect(refetched).toHaveLength(5);
    expect(new Set(refetched.map((row) => row.uispUserId)).size).toBe(5);
    // Repetir no reabre lo resuelto.
    expect(refetched.find((row) => row.uispUserId === U_ACTIVE)?.status).toBe('CREADO');
    expect(refetched.find((row) => row.uispUserId === U_DISCARD)?.status).toBe('DESCARTADO');
    expect(refetched.find((row) => row.uispUserId === U_MISSING)).toMatchObject({
      source: 'SIN_DATOS',
      status: 'PENDIENTE',
      displayName: null,
      isActiveInUisp: null,
      referencedInBatches: 1,
    });

    const missingName = `Usuario de UISP n.º ${U_MISSING} (sin datos)`;
    await reviewRow(page, missingName).check();
    await page.locator('#usuarios-uisp').getByLabel('Rol para crear').selectOption({
      label: ROLE_LABEL,
    });
    await page.locator('#usuarios-uisp').getByRole('button', { name: 'Crear (1)' }).click();
    const missingDialog = page.getByRole('dialog', { name: `Crear 1 usuario como ${ROLE_LABEL}` });
    await missingDialog
      .getByLabel(`Nombre para el usuario de UISP n.º ${U_MISSING}`)
      .fill(MISSING_NAME);
    await missingDialog.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page.getByText(/^1 usuario creado sin acceso\./u)).toBeVisible();
    const missingUserId = (await uispRow(U_MISSING)).targetUserId!;
    expect(await getUser(missingUserId)).toMatchObject({
      status: 'INACTIVE',
      isOperationalResource: false,
    });

    // ── «Actualizar autores» desde el lote (§2.7; CA-6) ──
    await page.goto(`/dashboard/settings/imports/${batchId}`);
    const refreshed = page.waitForResponse((r) =>
      r.url().includes(`/migration/batches/${batchId}/refresh-authors`),
    );
    await page.getByRole('button', { name: 'Actualizar autores' }).click();
    const refreshedResponse = await refreshed;
    expect(refreshedResponse.status()).toBe(200);
    expect(((await refreshedResponse.json()) as Envelope<unknown>).data).toEqual({
      tickets: 0,
      comentarios: 1,
      pagos: 0,
      respetados: 0,
      sinEnlazar: 1,
    });
    const result = page.getByRole('list', { name: 'Resultado de actualizar autores' });
    await expect(result).toContainText('1 comentario quedó con su autor de UISP.');
    await expect(result).toContainText('1 usuario de UISP de este lote sigue sin enlazar');

    const afterRefresh = await attribution(subscriberId);
    expect(afterRefresh).toEqual({
      ...afterPromotion,
      authors: { ...afterPromotion.authors, 'Comentario sin datos': missingUserId },
    });
    expect((await getBatch(batchId)).counts.observaciones.USUARIO_UISP_SIN_ENLAZAR).toBe(1);

    // Repetir no cambia nada nuevo.
    expect(
      await expectJson(`/migration/batches/${batchId}/refresh-authors`, 'POST', 200, {
        headers: tenantHeaders(),
      }),
    ).toEqual({ tickets: 0, comentarios: 0, pagos: 0, respetados: 0, sinEnlazar: 1 });
    expect(await attribution(subscriberId)).toEqual(afterRefresh);

    await axeLightAndDark(
      page,
      `/dashboard/settings/imports/${batchId}`,
      () => expect(page.getByRole('button', { name: 'Actualizar autores' })).toBeVisible(),
      'informe del lote con «Actualizar autores»',
    );

    // CA-8: la clave no aparece en la página ni en la lista.
    await page.goto('/dashboard/settings/imports#usuarios-uisp');
    // Sin pendientes, el filtro por defecto muestra el estado vacío: se espera el grupo de filtros.
    await expect(
      page.locator('#usuarios-uisp').getByRole('group', { name: 'Filtrar por estado' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.content()).not.toContain(APP_KEY);
    expect(
      (await expectBody('/migration/uisp-users', 'GET', 200, { headers: tenantHeaders() })).text,
    ).not.toContain(APP_KEY);

    // ── Revertir el lote no borra usuarios (§2.8; CA-9) ──
    await page.goto(`/dashboard/settings/imports/${batchId}`);
    await page.getByRole('button', { name: 'Revertir' }).click();
    await page
      .getByRole('dialog', { name: 'Revertir el lote' })
      .getByRole('button', { name: 'Revertir', exact: true })
      .click();
    await expect(
      page.getByText('Lote revertido. Lo que trajo ya no está en iWana.', { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    for (const id of [activeUserId, inactiveUserId, missingUserId, matchUserId!]) {
      await getUser(id);
    }
  });
});
