/**
 * V1-R — Flujo E2E de Facturación en navegador contra portal y API reales (HLD §10).
 *
 * Tenant efímero por corrida (`srqa-bf-*`), siembra propia y limpieza al final.
 * Nunca `tenant_iwana`. Siembra adicional por SQL solo para lo que la API no
 * expone (marca `DATOS_BLOQUEADOS`, `additional_product_ids`, lectura de
 * auditoría): queda documentado en cada uso.
 *
 * Cubre, con valores comprobados (no solo estados HTTP):
 * CA-FAC-01 (vista previa del servidor), 02 (422 incompatible en ISP y
 * contrato), 03 (lote sin duplicados), 04 (consecutivo único), 05 (sin bloqueo
 * fiscal), 07 (señal y reapertura), 08 (saldo a favor), 09 (política no altera
 * periodos: fechas y valores), 10 (agenda en pagado), 12 (sin cambio de
 * estados), 13 (auditoría), 14 (PDF); RS-9 (cifrado y ausencia en claro),
 * RS-12 (aviso de adicionales), RS-21 (máscara, dato auditado), CA-UX-FAC-01,
 * 02, 04, 07, 09, 10, 12, 13, 14, 17.
 * Cobertura ajena a este archivo: CA-FAC-06 (idempotencia) en
 * `billing-payments.postgres.integration.spec.ts` y reintento con la misma
 * clave aquí; CA-FAC-11 (permisos) en `e2e/tests/api/mod14-facturacion.spec.ts`
 * (nivel A, 12×401); CA-FAC-15 (cobertura y migraciones) en las suites de
 * integración 173–175 de `@iwana/db` y el gate V5.
 *
 * Requiere API real en API_BASE_URL (127.0.0.1:3000 por defecto) y credenciales de plataforma
 * (E2E_PLATFORM_* o PLATFORM_SUPER_ADMIN_*). Sin ellas, omisión declarada.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-bf-${RUN_ID}`;
const ADMIN_EMAIL = `srqa-bf-admin-${RUN_ID}@example.invalid`;
const SUPPORT_EMAIL = `srqa-bf-soporte-${RUN_ID}@example.invalid`;
const SUPPORT_PASSWORD = `Qa9!Sup-${RUN_ID}`;
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
let tenantId: string | undefined;
let schemaName: string | undefined;
let adminToken: string | undefined;
let supportToken: string | undefined;
let tenantAdminPassword = '';
let subscriberId = '';
let contractId = '';
let blockedSubscriberId = '';
let blockedContractId = '';
let documentNumber = '';
let paymentId = '';
// CA-FAC-12 (V1-R3): estado del contrato y del suscriptor justo tras sembrar,
// antes de la primera operación de facturación. Se compara en la última
// prueba del flujo, tras todas las mutaciones.
let initialContractStatus = '';
let initialSubscriberStatus = '';
let initialSubscriberFirstName = '';
// Ciclo elegido en la siembra según la fecha de la corrida (punto 8: sin fechas fijas).
let cycleDay = 1;
let cutoffDay = 15;
let periodStart = '';
let agendaDate = '';

function bogotaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatBillingDateEs(value: string): string {
  const [year, month, day] = value.split('-');
  const monthName = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ][Number(month) - 1];
  if (!year || !day || !monthName) throw new Error(`Fecha civil inválida: ${value}`);
  return `${Number(day)} de ${monthName} de ${year}`;
}

type Envelope<T> = { data: T };

function apiHeaders(token: string, slug?: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...(slug ? { 'X-Tenant-Slug': slug } : {}) };
}

async function expectJson<T>(
  context: APIRequestContext,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  status: number,
  options: { headers?: Record<string, string>; data?: unknown } = {},
): Promise<T> {
  const response = await context.fetch(`${API_PREFIX}${path}`, { method, ...options });
  const body = (await response.json()) as Envelope<T> & { code?: unknown; message?: unknown };
  expect(
    response.status(),
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toBe(status);
  return (body as Envelope<T>).data;
}

/** SQL de siembra/lectura contra la base de la corrida (solo lo que la API no expone). */
function devPsql(sql: string): string {
  const container = process.env.E2E_POSTGRES_CONTAINER ?? 'iwana_postgres_dev';
  const user = process.env.E2E_DB_BOOTSTRAP_USER ?? 'iwana';
  const database = process.env.E2E_DB_NAME ?? 'dbiw';
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', user, '-d', database, '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function tenantPsql(sql: string): string {
  if (!schemaName) throw new Error('Sin esquema de tenant efímero.');
  // Los triggers del tenant (p. ej. titular_prevent_anonymized_mutation)
  // resuelven tablas sin calificar: fijar el search_path como hace la API.
  // `psql -c` imprime una línea por sentencia (SET, INSERT...): la útil es la última.
  const raw = devPsql(
    `SET search_path TO "${schemaName}", public; ${sql.replaceAll('__SCHEMA__', `"${schemaName}"`)}`,
  );
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? '';
}

async function cleanupQaTenants(): Promise<void> {
  if (!api || !platformToken) return;
  try {
    if (tenantId) {
      await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: apiHeaders(platformToken),
        data: { status: 'INACTIVE' },
      });
      await api.fetch(`${API_PREFIX}/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: apiHeaders(platformToken),
      });
    }
  } catch {
    // La limpieza es best-effort y nunca oculta el resultado de la suite.
  }
}

async function createDisposableTenant(): Promise<void> {
  const platformEmail =
    process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? '';
  const platformPassword =
    process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD ?? '';
  api = await request.newContext({ baseURL: API_BASE_URL });

  const platformSession = await expectJson<{ accessToken: string }>(
    api,
    '/auth/platform/login',
    'POST',
    200,
    { data: { email: platformEmail, password: platformPassword } },
  );
  platformToken = platformSession.accessToken;

  const created = await expectJson<{
    id: string;
    slug: string;
    schemaName: string;
    status: string;
  }>(api, '/tenants', 'POST', 201, {
    headers: apiHeaders(platformToken),
    data: {
      name: `Tenant sintético billing ${RUN_ID}`,
      slug: TENANT_SLUG,
      contactEmail: `qa-${RUN_ID}@example.invalid`,
      adminEmail: ADMIN_EMAIL,
      settings: {
        timezone: 'America/Bogota',
        currency: 'COP',
        features: { mfa_required_all: false },
      },
    },
  });
  tenantId = created.id;
  schemaName = created.schemaName;
  expect(created.slug).toBe(TENANT_SLUG);
  expect(schemaName).not.toBe('tenant_iwana');

  await expect
    .poll(
      async () => {
        const current = await expectJson<{ status: string }>(
          api!,
          `/tenants/${tenantId}`,
          'GET',
          200,
          {
            headers: apiHeaders(platformToken!),
          },
        );
        if (current.status === 'PROVISIONING_FAILED') throw new Error('Provisioning fallido.');
        return current.status;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe('ACTIVE');

  const credential = await expectJson<{ adminEmail: string; temporaryPassword: string }>(
    api,
    `/tenants/${tenantId}/regenerate-admin-credentials`,
    'POST',
    200,
    { headers: { ...apiHeaders(platformToken), 'Idempotency-Key': randomUUID() } },
  );
  tenantAdminPassword = `Qa9!${randomBytes(18).toString('hex')}`;
  const initialSession = await expectJson<{ accessToken: string }>(
    api,
    '/auth/login',
    'POST',
    200,
    {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      data: { email: credential.adminEmail, password: credential.temporaryPassword },
    },
  );
  await expectJson(api, '/auth/change-password', 'POST', 200, {
    headers: apiHeaders(initialSession.accessToken, TENANT_SLUG),
    data: { currentPassword: credential.temporaryPassword, newPassword: tenantAdminPassword },
  });
  const tenantSession = await expectJson<{ accessToken: string }>(api, '/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: tenantAdminPassword },
  });
  adminToken = tenantSession.accessToken;

  // Identidad fiscal del emisor (RS-13): sin razón social y NIT no se emite.
  await expectJson(api, '/tenants/me/profile', 'PATCH', 200, {
    headers: apiHeaders(adminToken, TENANT_SLUG),
    data: { legalName: 'Operador Sintético E2E', nit: '900000001', nitDv: '7' },
  });

  // Punto 8: el ciclo se elige según la fecha de la corrida, no por calendario fijo.
  const today = bogotaToday();
  const [runYear, runMonth] = today.split('-').map(Number);
  const daysInMonth = new Date(runYear, runMonth, 0).getDate();
  const cyclesRes = await api!.fetch(`${API_PREFIX}/crm/billing-cycles`, {
    headers: apiHeaders(adminToken, TENANT_SLUG),
  });
  if (cyclesRes.status() !== 200) throw new Error(`GET cycles: HTTP ${cyclesRes.status()}`);
  const cycles = (await cyclesRes.json()) as Array<{
    cycleDay: number;
    cutoffDay: number;
    active: boolean;
  }>;
  const viable = cycles
    .filter((c) => c.active && (c.cycleDay === 1 || c.cycleDay === 15))
    .filter((c) => {
      const generationDate = `${today.slice(0, 8)}${String(c.cycleDay).padStart(2, '0')}`;
      return generationDate <= today && c.cutoffDay <= daysInMonth;
    })
    .sort((a, b) => b.cycleDay - a.cycleDay);
  if (viable.length === 0) throw new Error(`Sin ciclo facturable el ${today}.`);
  cycleDay = viable[0]!.cycleDay;
  cutoffDay = viable[0]!.cutoffDay;
  periodStart = `${today.slice(0, 8)}${String(cycleDay).padStart(2, '0')}`;
  agendaDate = `${today.slice(0, 8)}${String(cutoffDay).padStart(2, '0')}`;
}

async function seedBillingFixture(): Promise<void> {
  const token = adminToken ?? '';
  const headers = apiHeaders(token, TENANT_SLUG);
  const legal = await expectJson<{ id: string }>(api!, '/privacy/legal-texts', 'POST', 201, {
    headers,
    data: {
      type: 'AUTORIZACION',
      version: `qa-bf-${RUN_ID}`,
      content: 'Texto de autorización sintético para prueba E2E de facturación.',
    },
  });
  const plan = await expectJson<{ id: string; name: string }>(
    api!,
    '/commercial/catalog/plans',
    'POST',
    201,
    {
      headers,
      data: {
        name: `Plan QA billing ${RUN_ID}`,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 20,
        installationRule: 'ALWAYS',
      },
    },
  );
  await expectJson(api!, `/commercial/catalog/${plan.id}/prices`, 'POST', 201, {
    headers,
    data: { customerSegment: 'RESIDENTIAL', basePrice: '100.00', installationFee: '0' },
  });

  async function seedSubscriber(
    tag: string,
    fiscalDocument: string,
    fiscalName: string,
    firstName: string,
  ) {
    const subscriber = await expectJson<{ id: string }>(api!, '/crm/subscribers', 'POST', 201, {
      headers,
      data: {
        personType: 'NATURAL',
        customerSegment: 'RESIDENTIAL',
        documentType: 'CC',
        documentNumber: `${tag}-${RUN_ID}`,
        firstName,
        lastName: `Sintético ${RUN_ID}`,
        stratum: 4,
        email: `qa-${tag}-${RUN_ID}@example.invalid`,
        address: `Dirección sintética ${RUN_ID}`,
        city: 'Bogotá',
        department: 'Cundinamarca',
        vatResponsibility: 'NO_RESPONSABLE',
        rutResponsibilities: [],
        authorizationChannel: 'PRESENCIAL',
        authorizations: [
          { purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId: legal.id },
        ],
      },
    });
    const contract = await expectJson<{ id: string }>(
      api!,
      `/crm/subscribers/${subscriber.id}/contracts`,
      'POST',
      201,
      {
        headers,
        data: {
          subscriberId: subscriber.id,
          planId: plan.id,
          planSnapshotJson: { id: plan.id, name: plan.name, monthlyPrice: '100.00' },
          alias: `Servicio QA ${tag} ${RUN_ID}`,
          installationAddress: `Dirección sintética ${RUN_ID}`,
          installationCity: 'Bogotá',
          installationDepartment: 'Cundinamarca',
          customerSegment: 'RESIDENTIAL',
          serviceUsage: 'NON_RESIDENTIAL',
          fiscalName,
          fiscalDocument,
          fiscalAddress: `Dirección sintética ${RUN_ID}`,
        },
      },
    );
    const active = await expectJson<{ billingCycleDay: number; vatSnapshot: unknown }>(
      api!,
      `/crm/contracts/${contract.id}/activate`,
      'POST',
      200,
      { headers, data: { billingCycleDay: cycleDay } },
    );
    expect(active.billingCycleDay).toBe(cycleDay);
    expect(active.vatSnapshot).toMatchObject({ treatment: 'STANDARD', ratePercent: 19 });
    return { subscriberId: subscriber.id, contractId: contract.id };
  }

  const main = await seedSubscriber('qa', '900000001', 'Titular Sintético', 'Titular');
  subscriberId = main.subscriberId;
  contractId = main.contractId;
  const blocked = await seedSubscriber('qb', '900000002', 'Titular Bloqueado', 'Bloqueado');
  blockedSubscriberId = blocked.subscriberId;
  blockedContractId = blocked.contractId;

  // RS-12: el aviso de adicionales se siembra antes de generar (la API no expone
  // adicionales en esta fase).
  tenantPsql(
    `UPDATE __SCHEMA__.contracts SET additional_product_ids = '["adicional-qa"]'::jsonb WHERE id = '${contractId}';`,
  );
  // Punto 3: marca de bloqueo sembrada por SQL (la API no expone marcas directas).
  const party = tenantPsql(
    `SELECT party_id::text FROM __SCHEMA__.subscribers WHERE id = '${blockedSubscriberId}';`,
  );
  tenantPsql(
    `INSERT INTO __SCHEMA__.party_privacy_marks (party_id, mark, event) VALUES ('${party}', 'DATOS_BLOQUEADOS', 'OPEN');`,
  );

  // Usuario de soporte: ve facturación sin datos protegidos.
  const support = await expectJson<{ id: string }>(api!, '/users', 'POST', 201, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: {
      email: SUPPORT_EMAIL,
      role: 'SUPPORT',
      password: SUPPORT_PASSWORD,
      firstName: 'Soporte',
      lastName: 'E2E',
    },
  });
  await expectJson(api!, `/users/${support.id}`, 'PATCH', 200, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { status: 'ACTIVE' },
  });
  const profiles = await expectJson<Array<{ id: string; name: string }>>(
    api!,
    '/access-control/profiles',
    'GET',
    200,
    { headers },
  );
  const supportProfile = profiles.find((profile) => profile.name === 'Acceso estándar Soporte');
  if (!supportProfile) throw new Error('Falta el perfil Acceso estándar Soporte.');
  await expectJson(api!, `/access-control/users/${support.id}/profiles`, 'PUT', 200, {
    headers,
    data: { profileIds: [supportProfile.id] },
  });
  const supportSession = await expectJson<{ accessToken: string }>(
    api!,
    '/auth/login',
    'POST',
    200,
    {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      data: { email: SUPPORT_EMAIL, password: SUPPORT_PASSWORD },
    },
  );
  supportToken = supportSession.accessToken;

  // CA-FAC-12 (V1-R3): estado del contrato y del suscriptor justo tras sembrar,
  // antes de la primera operación de facturación.
  const seededContract = await expectJson<{ status: string }>(
    api!,
    `/crm/contracts/${contractId}`,
    'GET',
    200,
    { headers },
  );
  const seededSubscriber = await expectJson<{ status: string; firstName: string }>(
    api!,
    `/crm/subscribers/${subscriberId}`,
    'GET',
    200,
    { headers },
  );
  initialContractStatus = seededContract.status;
  initialSubscriberStatus = seededSubscriber.status;
  initialSubscriberFirstName = seededSubscriber.firstName;
}

async function loginInPortal(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(TENANT_SLUG);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

function auditCount(entityType: string, action: string): number {
  const raw = tenantPsql(
    `SELECT COUNT(*)::int AS total FROM __SCHEMA__.audit_logs WHERE entity_type = '${entityType}' AND action = '${action}';`,
  );
  return Number(raw || 0);
}

test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' });

test.describe('MOD14 Facturación — flujo E2E en navegador (V1-R)', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test.setTimeout(600_000);

  test.beforeAll(async () => {
    try {
      await createDisposableTenant();
      await seedBillingFixture();
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

  test('política con vista previa del servidor y combinación incompatible deshabilitada (CA-FAC-01, CA-UX-FAC-01, 02)', async ({
    page,
    request,
  }) => {
    // CA-FAC-01 contra la API: la vista previa trae tres fechas por ciclo.
    const preview = await expectJson<{
      cycles: Array<{
        cycleDay: number;
        items: Array<{ periodStart: string; generationDate: string; dueDate: string }>;
      }>;
    }>(request, '/billing/policy/preview', 'POST', 200, {
      headers: apiHeaders(adminToken ?? '', TENANT_SLUG),
      data: {},
    });
    expect(preview.cycles.length).toBeGreaterThan(0);
    for (const cycle of preview.cycles) {
      expect(cycle.items).toHaveLength(3);
      for (const item of cycle.items) {
        expect(item.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(item.generationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      }
    }

    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto('/dashboard/settings/billing');
    await expect(page.getByText('Define las reglas de emisión de cobro')).toBeVisible();
    // La vista previa viene del servidor: tres fechas por ciclo activo.
    await expect(page.getByText('Vista previa de fechas')).toBeVisible();
    await expect(page.getByText('Vista previa actualizada para')).toBeVisible();
    // CA-UX-FAC-01: la combinación incompatible se deshabilita con explicación.
    await page.getByLabel('Momento del cobro').selectOption('VENCIDO');
    const fixedOption = page.locator('option[value="DIA_FIJO_CICLO"]');
    await expect(fixedOption).toBeDisabled();
    await expect(
      page.getByText(
        'El corte en día fijo solo es compatible con cobro anticipado, porque en cobro vencido el corte ocurriría antes de emitir el cobro. Utilice corte por plazo de pago más gracia.',
      ),
    ).toBeVisible();
    // Punto 4: guardar un cambio desde el portal y comprobar que persiste.
    // (El plazo solo es editable en modo plazo-más-gracia; la gracia no
    // afecta al corte en día fijo, así que el flujo posterior no cambia.)
    await page.getByLabel('Momento del cobro').selectOption('ANTICIPADO');
    await page.getByLabel('Días de gracia tras vencimiento').fill('1');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Días de gracia tras vencimiento')).toHaveValue('1');
  });

  test('generar, emitir y descargar el PDF con número y periodo (CA-FAC-03, 04, 05, 14)', async ({
    page,
  }) => {
    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto('/dashboard/billing/documents');
    // CA-UX-FAC-17: primera visita con acción de generar.
    await expect(page.getByText('Aún no hay documentos de cobro')).toBeVisible();
    await page.getByRole('button', { name: 'Generar documentos' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Generar documentos' });
    await expect(dialog).toBeVisible();
    // Generación acotada al contrato de la prueba (el tenant tiene dos).
    // El buscador cruza por columnas (nombre o apellido), no por nombre completo.
    await dialog.getByLabel(/suscriptor/i).fill('Titular');
    await expect(dialog.getByRole('list', { name: 'Resultados de suscriptores' })).toBeVisible();
    await dialog
      .getByRole('button', { name: /Titular Sintético/u })
      .first()
      .click();
    await dialog.getByLabel('Contrato').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Generar documentos' }).click();
    // CA-FAC-03: el lote genera un solo documento para el contrato.
    await expect(page.getByText('Documentos generados: 1')).toBeVisible();
    // CA-FAC-05: sin motivo de bloqueo, el borrador es emisible.
    await expect(page.getByText('Sin número')).toBeVisible();
    await page
      .getByRole('checkbox', {
        name: new RegExp(`Seleccionar documento ${formatBillingDateEs(periodStart)}`, 'u'),
      })
      .check();
    await page.getByRole('button', { name: 'Emitir 1 documentos seleccionados' }).click();
    await expect(page.getByRole('dialog', { name: 'Emitir 1 documentos' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar emisión' }).click();
    // CA-FAC-04: consecutivo único asignado.
    await expect(page.getByText('DC-000001')).toBeVisible();
    documentNumber = 'DC-000001';

    // CA-UX-FAC-04: el filtro de estado de pago queda en la URL.
    await page.getByLabel('Estado de pago').selectOption('PENDIENTE');
    await expect(page).toHaveURL(/paymentState=PENDIENTE/u);

    // CA-FAC-14: descarga del PDF.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/u);
    const pdfPath = await download.path();
    if (!pdfPath) throw new Error('La descarga del PDF no dejó archivo.');
    const { readFileSync } = await import('node:fs');
    const pdfBytes = readFileSync(pdfPath);
    expect(pdfBytes.byteLength).toBeGreaterThan(1_000);
    expect(pdfBytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  test('registrar pago con reparto FIFO y remanente a saldo a favor (CA-FAC-08; CA-UX-FAC-09, 10)', async ({
    page,
    request,
  }) => {
    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto('/dashboard/billing/payments');
    // Sin pagos, la cabecera y el estado vacío muestran «Registrar pago»: se
    // espera la carga y se usa el de la cabecera (primero en el DOM). Sin la
    // espera, el clic dependía de si la lista ya había cargado.
    await expect(page.getByText('Aún no hay pagos registrados')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar pago' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Registrar pago' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Suscriptor').fill('Titular');
    await expect(dialog.getByRole('list', { name: 'Resultados de suscriptores' })).toBeVisible();
    await dialog
      .getByRole('button', { name: /Titular Sintético/u })
      .first()
      .click();
    await dialog.getByLabel('Método de pago').selectOption('TRANSFERENCIA');
    await dialog.getByLabel('Monto del pago (COP)').fill('150');
    // CA-UX-FAC-09/10: sugerencia FIFO con remanente.
    await expect(dialog.getByText(/Remanente a saldo a favor/u)).toContainText('31');
    await dialog.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByText('Aún no hay pagos registrados')).not.toBeVisible();
    await expect(page.getByText('150,00').first()).toBeVisible();
    // Punto 1: el remanente queda como saldo a favor exacto en el estado de cuenta.
    const statement = await expectJson<{ creditBalance: string }>(
      request,
      `/billing/subscribers/${subscriberId}/statement`,
      'GET',
      200,
      { headers: apiHeaders(adminToken ?? '', TENANT_SLUG) },
    );
    expect(statement.creditBalance).toBe('31.00');
  });

  test('ficha con métricas y aviso de adicionales; agenda en Pagado (CA-FAC-10; CA-UX-FAC-12, 14)', async ({
    page,
  }) => {
    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}?tab=facturacion`);
    await expect(page.getByText('Total facturado')).toBeVisible();
    await expect(page.getByText('Saldo a favor disponible')).toBeVisible();
    // Punto 1: el valor visible de la tarjeta coincide con el saldo a favor.
    const creditCard = page.locator('article', { hasText: 'Saldo a favor disponible' });
    await expect(creditCard.getByText('$ 31,00')).toBeVisible();
    // RS-12: aviso de adicionales sin cobrar.
    await expect(
      page.getByText(
        'Este contrato tiene 1 adicionales que todavía no se cobran en este documento',
      ),
    ).toBeVisible();

    // Spec 2026-11-09 §3 (CA-11): estado de cuenta en la Vista general; abrir la pestaña no vuelve a pedirlo.
    const statementRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/billing/subscribers/${subscriberId}/statement`)) {
        statementRequests.push(request.url());
      }
    });
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}?tab=vista-general`);
    const summary = page.getByRole('region', { name: 'Estado de cuenta' });
    await expect(summary.getByText('$ 31,00')).toBeVisible();
    await expect(summary.getByText('No hay documentos de cobro pendientes')).toBeVisible();
    const requestsBeforeTab = statementRequests.length;
    expect(requestsBeforeTab).toBeGreaterThan(0);
    await summary.getByRole('button', { name: 'Ver facturación' }).click();
    await expect(page.getByRole('tab', { name: 'Facturación' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Saldo a favor disponible')).toBeVisible();
    expect(statementRequests).toHaveLength(requestsBeforeTab);

    await page.goto(`/dashboard/crm/subscribers/agenda-corte?date=${agendaDate}`);
    const row = page.getByRole('row', { name: /Titular Sintético/u });
    await expect(row.getByText('Pagado').first()).toBeVisible();
  });

  test('invariantes de API: 409, 422, política inmutable, estados y auditoría (CA-FAC-02, 09, 13; RS-9)', async ({
    request,
  }) => {
    const headers = apiHeaders(adminToken ?? '', TENANT_SLUG);
    const current = await expectJson<{ updatedAt: string }>(
      request,
      '/billing/policy',
      'GET',
      200,
      { headers },
    );
    // Versión vieja con combinación válida: 409, no 422.
    const stale = await request.put(`${API_PREFIX}/billing/policy`, {
      headers,
      data: {
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
        periodTiming: 'ANTICIPADO',
        generationLeadDays: 0,
        cutoffMode: 'DIA_FIJO_CICLO',
        paymentTermDays: 15,
        graceDays: 0,
        cutoffEnabled: true,
        minimumUnpaidForCutoff: 0,
        prorationMethod: 'DIAS_REALES',
        firstPeriodMode: 'SEPARADO',
        automaticGeneration: false,
        approvalMode: 'BORRADOR',
        autoApplyCredit: true,
        generationHour: 6,
        documentPrefix: 'DC',
      },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe('BILLING_POLICY_CHANGED');

    // Punto 3: 422 BILLING_POLICY_INCOMPATIBLE en el ISP (día fijo + vencido).
    const incompatibleTenant = await request.put(`${API_PREFIX}/billing/policy`, {
      headers,
      data: {
        expectedUpdatedAt: current.updatedAt,
        periodTiming: 'VENCIDO',
        generationLeadDays: 0,
        cutoffMode: 'DIA_FIJO_CICLO',
        paymentTermDays: 15,
        graceDays: 0,
        cutoffEnabled: true,
        minimumUnpaidForCutoff: 0,
        prorationMethod: 'DIAS_REALES',
        firstPeriodMode: 'SEPARADO',
        automaticGeneration: false,
        approvalMode: 'BORRADOR',
        autoApplyCredit: true,
        generationHour: 6,
        documentPrefix: 'DC',
      },
    });
    expect(incompatibleTenant.status()).toBe(422);
    expect((await incompatibleTenant.json()).code).toBe('BILLING_POLICY_INCOMPATIBLE');

    // Punto 3: 422 en el contrato (sobrescritura VENCIDO contra día fijo del ISP).
    const incompatibleContract = await request.put(
      `${API_PREFIX}/billing/contracts/${contractId}/policy`,
      {
        headers,
        data: { periodTiming: 'VENCIDO' },
      },
    );
    expect(incompatibleContract.status()).toBe(422);
    expect((await incompatibleContract.json()).code).toBe('BILLING_POLICY_INCOMPATIBLE');
    const contractPolicy = await expectJson<{ periodTiming: string | null }>(
      request,
      `/billing/contracts/${contractId}/policy`,
      'GET',
      200,
      { headers },
    );
    expect(contractPolicy.periodTiming).toBeNull();

    // Punto 2 + CA-FAC-09: cambiar la política no altera fechas ni valores del
    // periodo ya generado. El cambio de plazo (15 a 20 días) es justo lo que
    // debe no afectar.
    const beforeDocs = await expectJson<unknown>(
      request,
      '/billing/documents?limit=5',
      'GET',
      200,
      {
        headers,
      },
    );
    const before = (
      beforeDocs as unknown as Array<{
        subtotal: string;
        total: string;
        dueDate: string;
        periodStart: string;
        periodEnd: string;
      }>
    )[0];
    if (!before) throw new Error('Sin documento generado para comparar.');
    const beforePeriod = tenantPsql(
      `SELECT generation_date::text AS generation_date, due_date::text AS due_date, (effective_policy->>'proration_method') AS proration FROM __SCHEMA__.billing_periods WHERE contract_id = '${contractId}' ORDER BY period_start DESC LIMIT 1;`,
    );
    await expectJson(request, '/billing/policy', 'PUT', 200, {
      headers,
      data: {
        expectedUpdatedAt: current.updatedAt,
        periodTiming: 'ANTICIPADO',
        generationLeadDays: 0,
        cutoffMode: 'DIA_FIJO_CICLO',
        paymentTermDays: 20,
        graceDays: 0,
        cutoffEnabled: true,
        minimumUnpaidForCutoff: 0,
        prorationMethod: 'MES_30',
        firstPeriodMode: 'SEPARADO',
        automaticGeneration: false,
        approvalMode: 'BORRADOR',
        autoApplyCredit: true,
        generationHour: 6,
        documentPrefix: 'DC',
      },
    });
    const afterDocs = await expectJson<unknown>(request, '/billing/documents?limit=5', 'GET', 200, {
      headers,
    });
    const after = (
      afterDocs as unknown as Array<{
        subtotal: string;
        total: string;
        dueDate: string;
        periodStart: string;
        periodEnd: string;
      }>
    )[0];
    expect(after.subtotal).toBe(before.subtotal);
    expect(after.total).toBe(before.total);
    expect(after.dueDate).toBe(before.dueDate);
    expect(after.periodStart).toBe(before.periodStart);
    expect(after.periodEnd).toBe(before.periodEnd);
    expect(
      tenantPsql(
        `SELECT generation_date::text AS generation_date, due_date::text AS due_date, (effective_policy->>'proration_method') AS proration FROM __SCHEMA__.billing_periods WHERE contract_id = '${contractId}' ORDER BY period_start DESC LIMIT 1;`,
      ),
    ).toBe(beforePeriod);

    // RS-9: la lista no descifra y el jsonb no trae el documento en claro.
    const listed = afterDocs as unknown as Array<{
      buyerSnapshot: Record<string, unknown> | null;
    }>;
    expect(listed[0]?.buyerSnapshot?.['documentNumber'] ?? null).toBeNull();
    const rawJsonb = tenantPsql(
      `SELECT buyer_snapshot::text FROM __SCHEMA__.billing_documents WHERE number = 'DC-000001';`,
    );
    expect(rawJsonb).not.toContain('documentNumber');
    // El detalle sí lo descifra solo con permiso.
    const detail = await expectJson<{ buyerSnapshot: { documentNumber: string | null } }>(
      request,
      `/billing/documents/${(afterDocs as unknown as Array<{ id: string }>)[0]?.id}`,
      'GET',
      200,
      { headers },
    );
    expect(detail.buyerSnapshot.documentNumber).toBe('900000001');

    // CA-FAC-13: auditoría dentro de la transacción de cada mutación.
    expect(auditCount('BillingPolicy', 'UPDATE')).toBeGreaterThanOrEqual(1);
    expect(auditCount('BillingDocument', 'UPDATE')).toBeGreaterThanOrEqual(1);
    expect(auditCount('BillingPayment', 'CREATE')).toBeGreaterThanOrEqual(1);
  });

  test('anular el pago reabre el periodo y al re registrar vuelve a Pagado (CA-FAC-07)', async ({
    request,
  }) => {
    const headers = apiHeaders(adminToken ?? '', TENANT_SLUG);
    const payments = await expectJson<Array<{ id: string; status: string }>>(
      request,
      '/billing/payments?page=1&limit=5',
      'GET',
      200,
      { headers },
    );
    const payment = payments.find((item) => item.status === 'REGISTRADO');
    if (!payment) throw new Error('Sin pago REGISTRADO para anular.');
    paymentId = payment.id;
    await expectJson(request, `/billing/payments/${payment.id}/void`, 'POST', 200, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { reasonCode: 'ERROR_DE_REGISTRO' },
    });
    // Punto 5: el estado exacto tras anular, derivado de la fecha de vencimiento
    // (sin pago y con documento EMITIDO, solo puede ser PENDIENTE o VENCIDO).
    const dueDate = tenantPsql(
      `SELECT d.due_date::text FROM __SCHEMA__.billing_documents d WHERE d.id = (SELECT id FROM __SCHEMA__.billing_documents WHERE contract_id = '${contractId}' AND status = 'EMITIDO' ORDER BY created_at DESC LIMIT 1);`,
    );
    const expectedReopened = bogotaToday() > dueDate ? 'VENCIDO' : 'PENDIENTE';
    const reopened = await expectJson<{ state: string }>(
      request,
      `/billing/subscribers/${subscriberId}/statement`,
      'GET',
      200,
      { headers },
    ).then(
      (statement) =>
        (
          statement as unknown as {
            contractSummaries: Array<{ contractId: string; periodState: string }>;
          }
        ).contractSummaries.find((summary) => summary.contractId === contractId)?.periodState,
    );
    expect(reopened).toBe(expectedReopened);
    const repaid = await expectJson<{ status: string; unallocatedAmount: string }>(
      request,
      '/billing/payments',
      'POST',
      201,
      {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount: '119.00',
          paidAt: bogotaToday(),
        },
      },
    );
    expect(repaid.status).toBe('REGISTRADO');
    // CA-FAC-06: reintentar la misma clave con el mismo cuerpo devuelve el mismo pago.
    const repayKey = randomUUID();
    const firstAttempt = await expectJson<{ id: string }>(
      request,
      '/billing/payments',
      'POST',
      201,
      {
        headers: { ...headers, 'Idempotency-Key': repayKey },
        data: {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount: '1.00',
          paidAt: bogotaToday(),
        },
      },
    );
    const secondAttempt = await expectJson<{ id: string }>(
      request,
      '/billing/payments',
      'POST',
      201,
      {
        headers: { ...headers, 'Idempotency-Key': repayKey },
        data: {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount: '1.00',
          paidAt: bogotaToday(),
        },
      },
    );
    expect(secondAttempt.id).toBe(firstAttempt.id);
    const agendaRes = await request.get(
      `${API_PREFIX}/crm/billing-cycles/cutoff-agenda?date=${agendaDate}&page=1&limit=25`,
      { headers },
    );
    expect(agendaRes.status()).toBe(200);
    const agenda = (await agendaRes.json()) as {
      items: Array<{
        contractId: string;
        paymentState: string;
        paymentPaidAmount: string | null;
        paymentTotalAmount: string | null;
      }>;
    };
    const agendaItem = agenda.items.find((item) => item.contractId === contractId);
    expect(agendaItem?.paymentState).toBe('PAGADO');
    expect(agendaItem?.paymentPaidAmount).toBe('119.00');
    expect(agendaItem?.paymentTotalAmount).toBe('119.00');
  });

  test('titular bloqueado: sin permiso se enmascara y no se audita (RS-21; CA-UX-FAC-13)', async ({
    page,
    request,
  }) => {
    // El titular bloqueado necesita un documento para ejercer lista y detalle.
    const adminHeaders = apiHeaders(adminToken ?? '', TENANT_SLUG);
    const generated = await expectJson<{ generated: number }>(
      request,
      '/billing/documents/generate',
      'POST',
      200,
      {
        headers: { ...adminHeaders, 'Idempotency-Key': randomUUID() },
        data: { contractId: blockedContractId },
      },
    );
    expect(generated.generated).toBe(1);
    const blockedDocs = await expectJson<Array<{ id: string }>>(
      request,
      `/billing/documents?subscriberId=${blockedSubscriberId}&limit=5`,
      'GET',
      200,
      { headers: adminHeaders },
    );
    await expectJson(request, '/billing/documents/issue', 'POST', 200, {
      headers: { ...adminHeaders, 'Idempotency-Key': randomUUID() },
      data: { documentIds: [blockedDocs[0]?.id] },
    });

    // Punto 6: los conteos se toman antes de que el usuario sin permiso abra nada.
    const listBefore = auditCount('BillingDocument', 'LIST_ACCESS');
    const recordBefore = auditCount('BillingSubscriberStatement', 'RECORD_ACCESS');

    await loginInPortal(page, SUPPORT_EMAIL, SUPPORT_PASSWORD);
    await page.goto('/dashboard/billing/documents');
    await expect(page.getByText('[Dato protegido por custodia legal]').first()).toBeVisible();
    await expect(page.getByText('Titular Bloqueado')).not.toBeVisible();

    // Detalle enmascarado sin intentar reconstruir al adquirente.
    const maskedRow = page
      .locator('tr', { hasText: '[Dato protegido por custodia legal]' })
      .first();
    await maskedRow.getByRole('button', { name: 'Ver detalle' }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByText('[Dato protegido por custodia legal]').first()).toBeVisible();
    await expect(detail.getByText('Titular Bloqueado')).not.toBeVisible();

    // La ficha sin permiso no renderiza pestañas (vista restringida de CRM):
    // el estado de cuenta se verifica por API, igualmente enmascarado y sin auditar.
    const supportHeaders = apiHeaders(supportToken ?? '', TENANT_SLUG);
    const supportStatement = await expectJson<{
      buyerProtected: boolean;
      documents: Array<{ buyerProtected: boolean; buyerSnapshot: { displayName: string } | null }>;
    }>(request, `/billing/subscribers/${blockedSubscriberId}/statement`, 'GET', 200, {
      headers: supportHeaders,
    });
    expect(supportStatement.buyerProtected).toBe(true);
    for (const document of supportStatement.documents) {
      expect(document.buyerProtected).toBe(true);
    }
    expect(auditCount('BillingSubscriberStatement', 'RECORD_ACCESS')).toBe(recordBefore);
    await page.goto(`/dashboard/crm/subscribers/${blockedSubscriberId}?tab=facturacion`);
    await expect(page.getByText('Datos bloqueados').first()).toBeVisible();
    expect(auditCount('BillingDocument', 'LIST_ACCESS')).toBe(listBefore);
  });

  test('titular bloqueado: con permiso se ve el dato y queda auditado (RS-21)', async ({
    page,
    request,
  }) => {
    const listBefore = auditCount('BillingDocument', 'LIST_ACCESS');
    await loginInPortal(page, ADMIN_EMAIL, tenantAdminPassword);
    await page.goto('/dashboard/billing/documents');
    await expect(page.getByText('Titular Bloqueado')).toBeVisible();
    // Punto 6: la lista con permiso audita una vez el acceso a bloqueados.
    await expect
      .poll(() => auditCount('BillingDocument', 'LIST_ACCESS'), { timeout: 15_000 })
      .toBe(listBefore + 1);

    const before = auditCount('BillingSubscriberStatement', 'RECORD_ACCESS');
    await page.goto(`/dashboard/crm/subscribers/${blockedSubscriberId}?tab=facturacion`);
    await expect(page.getByText('Titular Bloqueado')).toBeVisible();
    await expect(page.getByText('Total facturado')).toBeVisible();
    await expect(page.getByText('[Dato protegido por custodia legal]')).not.toBeVisible();
    await expect
      .poll(() => auditCount('BillingSubscriberStatement', 'RECORD_ACCESS'), { timeout: 15_000 })
      .toBeGreaterThan(before);

    // CA-FAC-12 (V1-R3): el contrato y el suscriptor conservan el estado que
    // tenían tras la siembra, antes de la primera operación de facturación.
    // Esta es la última prueba del flujo: ya pasaron generar, emitir, pagar,
    // anular, re-registrar y la siembra del documento del titular bloqueado.
    const finalContract = await expectJson<{ status: string }>(
      request,
      `/crm/contracts/${contractId}`,
      'GET',
      200,
      { headers: apiHeaders(adminToken ?? '', TENANT_SLUG) },
    );
    const finalSubscriber = await expectJson<{ status: string; firstName: string }>(
      request,
      `/crm/subscribers/${subscriberId}`,
      'GET',
      200,
      { headers: apiHeaders(adminToken ?? '', TENANT_SLUG) },
    );
    expect(finalContract.status).toBe(initialContractStatus);
    expect(finalSubscriber.status).toBe(initialSubscriberStatus);
    expect(finalSubscriber.firstName).toBe(initialSubscriberFirstName);
  });
});
