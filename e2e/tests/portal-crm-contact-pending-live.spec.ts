import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

type PgResult = { rowCount: number | null; rows: Array<Record<string, unknown>> };
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<PgResult>;
};
type PgConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionTimeoutMillis: number;
};
type Tenant = { id: string; slug: string; schemaName: string; status: string };
type Envelope<T> = { data: T };

const fromDatabase = createRequire(resolve(process.cwd(), 'packages/database/package.json'));
const PgClientConstructor = (
  fromDatabase('pg') as {
    Client: new (config: PgConfig) => PgClient;
  }
).Client;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-mod05-e3-${RUN_ID}`;
const TENANT_ADMIN_EMAIL = `srqa-mod05-e3-${RUN_ID}@example.invalid`;
const PLACEHOLDER_OR_RAW_ENUM =
  /@placeholder\.iwana\.co|0000000000|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:PROSPECT|ACTIVE)\b/u;

let api: APIRequestContext | undefined;
let db: PgClient | undefined;
let platformToken: string | undefined;
let tenantAdminToken: string | undefined;
let tenantId: string | undefined;
let tenantSchema: string | undefined;
let tenantAdminPassword: string | undefined;
type SeededExpediente = { id: string; fullName: string; subscriberId: string };

function requiredEnv(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Falta configurar ${key} para el E2E real.`);
  return value;
}

function apiHeaders(token: string, slug?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(slug ? { 'X-Tenant-Slug': slug } : {}),
  };
}

async function expectJson<T>(
  context: APIRequestContext,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  status: number,
  options: { headers?: Record<string, string>; data?: unknown } = {},
): Promise<T> {
  const response = await context.fetch(`${API_PREFIX}${path}`, { method, ...options });
  expect(response.status()).toBe(status);
  const envelope = (await response.json()) as Envelope<T>;
  return envelope.data;
}

async function deactivateTenantAndVerify(): Promise<void> {
  if (!api || !platformToken || !tenantId) return;
  await expectJson<Tenant>(api, `/tenants/${tenantId}`, 'PATCH', 200, {
    headers: apiHeaders(platformToken),
    data: { status: 'INACTIVE' },
  });
  const tenant = await expectJson<Tenant>(api, `/tenants/${tenantId}`, 'GET', 200, {
    headers: apiHeaders(platformToken),
  });
  expect(tenant.status).toBe('INACTIVE');
}

async function createDisposableTenant(): Promise<void> {
  const platformEmail = requiredEnv(
    process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL,
    'E2E_PLATFORM_EMAIL',
  );
  const platformPassword = requiredEnv(
    process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD,
    'E2E_PLATFORM_PASSWORD',
  );
  api = await request.newContext({ baseURL: API_BASE_URL });

  const platformSession = await expectJson<{ accessToken: string }>(
    api,
    '/auth/platform/login',
    'POST',
    200,
    { data: { email: platformEmail, password: platformPassword } },
  );
  platformToken = platformSession.accessToken;

  const created = await expectJson<Tenant>(api, '/tenants', 'POST', 201, {
    headers: apiHeaders(platformToken),
    data: {
      name: `Tenant sintético MOD05 E3 ${RUN_ID}`,
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
  tenantId = created.id;
  tenantSchema = created.schemaName;
  expect(created.slug).toBe(TENANT_SLUG);
  expect(tenantSchema).toMatch(/^tenant_srqa_mod05_e3_[a-f0-9]{12}$/u);

  await expect
    .poll(
      async () => {
        const current = await expectJson<Tenant>(api!, `/tenants/${tenantId}`, 'GET', 200, {
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

  const credential = await expectJson<{
    adminEmail: string;
    temporaryPassword: string;
  }>(api, `/tenants/${tenantId}/regenerate-admin-credentials`, 'POST', 200, {
    headers: {
      ...apiHeaders(platformToken),
      'Idempotency-Key': randomUUID(),
    },
  });
  const temporaryPassword = credential.temporaryPassword;
  tenantAdminPassword = `Qa9!${randomBytes(18).toString('hex')}`;
  const initialSession = await expectJson<{
    accessToken: string;
    mfaSetupRequired?: boolean;
    mfaRequired?: boolean;
  }>(api, '/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: temporaryPassword },
  });
  expect(initialSession.mfaRequired ?? false).toBe(false);
  expect(initialSession.mfaSetupRequired ?? false).toBe(false);

  // El primer acceso de la cuenta administrativa siempre fuerza rotación. El
  // contrato de login no expone esa bandera; se completa antes del navegador.
  await expectJson<{ message: string }>(api, '/auth/change-password', 'POST', 200, {
    headers: apiHeaders(initialSession.accessToken, TENANT_SLUG),
    data: { currentPassword: temporaryPassword, newPassword: tenantAdminPassword },
  });

  const tenantSession = await expectJson<{ accessToken: string }>(api, '/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: tenantAdminPassword },
  });
  tenantAdminToken = tenantSession.accessToken;
}

async function ensureTenantDatabase(): Promise<void> {
  if (db) return;
  const dbName = requiredEnv(process.env.DB_NAME, 'DB_NAME');
  expect(dbName).toMatch(/^(dbiw|test|iwana_it_[a-z0-9_]+)$/u);
  db = new PgClientConstructor({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    database: dbName,
    user: requiredEnv(process.env.DB_USER, 'DB_USER'),
    password: requiredEnv(process.env.DB_PASSWORD, 'DB_PASSWORD'),
    connectionTimeoutMillis: 5_000,
  });
  await db.connect();
}

async function seedExpediente(
  withPrimaryContact: boolean,
  createLegalText: boolean,
  page: Page,
): Promise<SeededExpediente> {
  const token = requiredEnv(tenantAdminToken, 'sesión sintética de tenant');
  const slug = TENANT_SLUG;
  const headers = apiHeaders(token, slug);
  const suffix = randomUUID().replace(/-/gu, '').slice(0, 8);
  const fullName = `Persona sintética ${suffix}`;

  if (createLegalText) {
    await expectJson<{ id: string }>(api!, '/privacy/legal-texts', 'POST', 201, {
      headers,
      data: {
        type: 'AUTORIZACION',
        version: `qa-${RUN_ID}`,
        content: 'Texto de autorización sintético para prueba E2E.',
      },
    });
  }

  const created = await expectJson<{ id: string }>(api!, '/crm/expedientes', 'POST', 201, {
    headers,
    data: {
      fullName,
      acquisitionChannel: 'WEB',
      customerSegment: 'RESIDENTIAL',
      sourceDetail: `Fixture sintético E2E ${suffix}`,
    },
  });

  const updateSection = async (section: string, data: Record<string, unknown>) =>
    expectJson<{ id: string }>(
      api!,
      `/crm/expedientes/${created.id}/sections/${section}`,
      'PATCH',
      200,
      { headers, data: { data } },
    );

  await updateSection('identification', {
    personType: 'PERSONA_NATURAL',
    documentType: 'CC',
    documentNumber: `QA-${suffix}`,
    firstName: 'Persona',
    lastName: `Sintética ${suffix}`,
  });
  // El primer expediente se convierte realmente sin canal principal. El segundo
  // es un fixture legado separado que comienza con canales para completar R5.
  await updateSection('contact', {
    ...(withPrimaryContact
      ? {
          emailPrimary: `expediente-${suffix}@example.invalid`,
          phonePrimary: '3005550103',
        }
      : {}),
    altContactName: `Contacto alternativo ${suffix}`,
    altContactPhone: '3005550101',
  });
  await updateSection('location', {
    address: 'Dirección sintética 101',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: '110111',
    stratum: 2,
    neighborhood: 'Sector sintético',
    latitude: 4.711,
    longitude: -74.072,
  });
  await updateSection('commercial_interest', {
    acquisitionChannel: 'WEB',
    interestedPlanId: `fixture-plan-${suffix}`,
  });
  await updateSection('technical_feasibility', {
    feasibility: 'VIABLE',
    candidateTechnologies: ['FIBER'],
    availableTechnology: 'FIBER',
    evaluationSource: 'TECHNICAL_SITE_VISIT',
    technicalConfidence: 'HIGH',
  });
  await updateSection('legal_consent', {
    identityVerified: 'VERIFIED',
    legalComplianceStatus: 'APPROVED',
  });

  // A18: publicar AUTORIZACION y capturar tratamiento contractual con medio
  // antes de emitir el evento real de conversión.
  const treatmentConsent = await expectJson<{
    consentType: string;
    status: string;
    channel: string;
    legalTextVersion: string;
  }>(api!, `/crm/expedientes/${created.id}/consents`, 'POST', 201, {
    headers,
    data: {
      consentType: 'TRATAMIENTO_DATOS',
      status: 'ACEPTADO',
      channel: 'TELEFONO',
      evidenceRef: `qa-e3-${suffix}`,
    },
  });
  expect(treatmentConsent).toMatchObject({
    consentType: 'TRATAMIENTO_DATOS',
    status: 'ACEPTADO',
    channel: 'TELEFONO',
    legalTextVersion: `qa-${RUN_ID}`,
  });

  await ensureTenantDatabase();

  const schema = requiredEnv(tenantSchema, 'schema sintético');
  expect(schema).toMatch(/^tenant_srqa_mod05_e3_[a-f0-9]{12}$/u);
  const statusUpdate = await db.query(
    `UPDATE "${schema}".expediente_records
        SET previous_status = 'EN_COTIZACION', status = 'LISTO_PARA_INSTALACION', status_changed_at = now()
      WHERE id = $1 AND tenant_id = $2 AND status = 'NUEVO_POTENCIAL'
      RETURNING id`,
    [created.id, tenantId],
  );
  expect(statusUpdate.rowCount).toBe(1);
  await db.query(
    `INSERT INTO "${schema}".crm_conversion_failures
       (tenant_id, expediente_id, event_name, error_code, attempts, first_failed_at, last_failed_at)
     VALUES ($1, $2, 'crm.expediente.ready-for-installation', 'E2E_FIXTURE_PENDING', 1, now(), now())`,
    [tenantId, created.id],
  );

  const retried = await expectJson<{ retried: boolean; resolved: boolean }>(
    api!,
    `/crm/expedientes/${created.id}/retry-conversion`,
    'POST',
    201,
    { headers },
  );
  expect(retried.retried).toBe(true);
  if (!retried.resolved) {
    const schema = requiredEnv(tenantSchema, 'schema sintético');
    const failure = await db!.query(
      `SELECT error_code
         FROM "${schema}".crm_conversion_failures
        WHERE expediente_id = $1
          AND event_name = 'crm.expediente.ready-for-installation'
          AND resolved_at IS NULL`,
      [created.id],
    );
    expect(failure.rowCount).toBe(1);
    const errorCode = String(failure.rows[0]?.['error_code'] ?? '');
    expect(errorCode).toMatch(/^[A-Z0-9_]+$/u);

    await page.goto(`/dashboard/crm/expedientes/${created.id}`);
    const failureBanner = page.getByRole('alert');
    await expect(failureBanner).toBeVisible();
    const failureMessage = await failureBanner.innerText();
    expect(failureMessage.trim()).not.toBe('');
    expect(failureMessage).not.toContain(errorCode);
  } else {
    console.info(
      'E2E F2: conversión completada; la condición de aserción del banner de fallo no se activó.',
    );
  }
  expect(retried.resolved).toBe(true);

  await expect
    .poll(
      async () => {
        const bootstrap = await expectJson<{ subscriberSummary: { id: string } | null }>(
          api!,
          `/crm/expedientes/${created.id}/bootstrap`,
          'GET',
          200,
          { headers },
        );
        return bootstrap.subscriberSummary?.id ?? null;
      },
      { timeout: 20_000, intervals: [250, 500, 1_000] },
    )
    .toBeTruthy();
  const finalBootstrap = await expectJson<{ subscriberSummary: { id: string } | null }>(
    api!,
    `/crm/expedientes/${created.id}/bootstrap`,
    'GET',
    200,
    { headers },
  );
  const createdSubscriberId = finalBootstrap.subscriberSummary?.id;
  expect(createdSubscriberId).toBeTruthy();

  const subscriber360 = await expectJson<{
    habeasData: Array<{ purpose: string; granted: boolean; channel: string }>;
  }>(api!, `/crm/subscribers/${createdSubscriberId}/360`, 'GET', 200, { headers });
  expect(subscriber360.habeasData).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        purpose: 'TRATAMIENTO_CONTRACTUAL',
        granted: true,
        channel: 'TELEFONO',
      }),
    ]),
  );

  return { id: created.id, fullName, subscriberId: createdSubscriberId! };
}

async function nullSubscriberContact(subscriber: SeededExpediente): Promise<void> {
  await ensureTenantDatabase();
  const schema = requiredEnv(tenantSchema, 'schema sintético');
  expect(schema).toMatch(/^tenant_srqa_mod05_e3_[a-f0-9]{12}$/u);
  const result = await db!.query(
    `UPDATE "${schema}".subscribers
        SET email_encrypted = NULL, email_hmac = NULL, phone_encrypted = NULL, phone_hmac = NULL
      WHERE id = $1 AND tenant_id = $2 AND expediente_id = $3
      RETURNING id`,
    [subscriber.subscriberId, tenantId, subscriber.id],
  );
  expect(result.rowCount).toBe(1);
}

async function assertNoPlaceholderOrRawEnum(page: Page): Promise<void> {
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(PLACEHOLDER_OR_RAW_ENUM);
}

async function chooseOption(page: Page, label: string, optionLabel: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
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

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('MOD05 E3 — contacto pendiente contra Portal y API reales', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    const dbName = requiredEnv(process.env.DB_NAME, 'DB_NAME');
    expect(dbName).toMatch(/^(dbiw|test|iwana_it_[a-z0-9_]+)$/u);
    try {
      await createDisposableTenant();
    } catch (error) {
      await deactivateTenantAndVerify();
      throw error;
    }
  });

  test.afterAll(async () => {
    try {
      await deactivateTenantAndVerify();
      if (tenantId) console.info(`QA tenant ${TENANT_SLUG}: final status INACTIVE confirmed.`);
    } finally {
      if (db) await db.end();
      if (api) await api.dispose();
    }
  });

  test('verifica CA-E3-01..04 y el flujo de contacto pendiente con API real', async ({ page }) => {
    const createRequests: string[] = [];
    page.on('request', (requestEvent) => {
      const url = new URL(requestEvent.url());
      if (url.pathname.endsWith('/crm/subscribers') && requestEvent.method() === 'POST') {
        createRequests.push(url.pathname);
      }
    });

    await loginInPortal(page);
    // Primer caso: conversión HTTP real con expediente sin canal principal.
    const noContact = await seedExpediente(false, true, page);

    // CA-E3-02: con los campos de identidad y autorización completos, la falta
    // de ambos canales se bloquea en el formulario antes de llamar al API.
    await page.goto('/dashboard/crm/subscribers/new');
    await expect(page.getByRole('heading', { name: 'Crear suscriptor' })).toBeVisible();
    await expect(page.getByText('Texto vigente · versión', { exact: false })).toBeVisible();
    await chooseOption(page, 'Tipo de documento', 'Cédula de ciudadanía');
    await page.getByLabel('Número de documento').fill(`QA-${RUN_ID.slice(0, 8)}`);
    await page.getByLabel('Nombre', { exact: true }).fill('Persona sintética');
    await page.getByLabel('Apellido', { exact: true }).fill(`QA ${RUN_ID.slice(0, 8)}`);
    await chooseOption(page, 'Estrato', 'Estrato 2');
    await chooseOption(page, 'Segmento', 'Residencial');
    await page.getByLabel('Dirección', { exact: true }).fill('Dirección sintética 101');
    await chooseOption(page, 'Medio por el que la persona otorgó la autorización', 'Teléfono');
    await page
      .getByText(
        'Autorizo el uso de mis datos para prestar, facturar y dar soporte al servicio. Es necesaria para crear el suscriptor.',
        { exact: true },
      )
      .locator('..')
      .getByRole('checkbox')
      .check();
    await page.getByRole('button', { name: 'Crear suscriptor' }).click();
    await expect(
      page.getByText('Registra al menos un teléfono o un correo.', { exact: true }),
    ).toHaveCount(2);
    expect(createRequests).toHaveLength(0);
    await assertNoPlaceholderOrRawEnum(page);

    await page.goto(`/dashboard/crm/subscribers/${noContact.subscriberId}`);
    await expect(page.getByRole('heading', { name: noContact.fullName })).toBeVisible();
    await expect(page.getByText('Contacto pendiente', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar contacto' })).toBeVisible();
    await assertNoPlaceholderOrRawEnum(page);

    // CA-E3-03, R4: la API real devuelve 422 y el portal presenta texto y acción.
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await chooseOption(page, 'Estado destino', 'Activo');
    const subscriber422 = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/subscribers/${noContact.subscriberId}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Confirmar' }).click();
    const subscriberRejection = await subscriber422;
    expect(subscriberRejection.status()).toBe(422);
    expect((await subscriberRejection.json()) as { code?: string }).toMatchObject({
      code: 'SUBSCRIBER_CONTACT_REQUIRED',
    });
    await expect(
      page.getByText(
        'Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Agregar contacto' }),
    ).toBeVisible();
    const pendingSubscriber = await expectJson<{ status: string; contactPending: boolean }>(
      api!,
      `/crm/subscribers/${noContact.subscriberId}`,
      'GET',
      200,
      { headers: apiHeaders(tenantAdminToken!, TENANT_SLUG) },
    );
    expect(pendingSubscriber).toMatchObject({ status: 'PROSPECT', contactPending: true });
    await assertNoPlaceholderOrRawEnum(page);

    // El validador previo requiere las seis secciones al 100%; como este
    // expediente se convirtió realmente sin contacto, se registra el 400
    // INVALID_STATUS_TRANSITION y se confirma que no cambió su estado.
    await page.goto(`/dashboard/crm/expedientes/${noContact.id}`);
    await expect(page.getByRole('heading', { name: noContact.fullName })).toBeVisible();
    await chooseOption(page, 'Nuevo estado', 'Cliente activo');
    const incompleteExpedienteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/expedientes/${noContact.id}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Aplicar transición' }).click();
    const incompleteRejection = await incompleteExpedienteResponsePromise;
    expect(incompleteRejection.status()).toBe(400);
    expect((await incompleteRejection.json()) as { code?: string }).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
    const unchangedExpediente = await expectJson<{ status: string }>(
      api!,
      `/crm/expedientes/${noContact.id}`,
      'GET',
      200,
      { headers: apiHeaders(tenantAdminToken!, TENANT_SLUG) },
    );
    expect(unchangedExpediente.status).toBe('LISTO_PARA_INSTALACION');
    await expect(
      page.getByText('Estado actual: Listo para instalación', { exact: true }),
    ).toBeVisible();
    await assertNoPlaceholderOrRawEnum(page);

    // Agregar contacto al suscriptor realmente convertido sin canales y
    // comprobar que ahora sí se activa mediante el Portal y el API.
    await page.goto(`/dashboard/crm/subscribers/${noContact.subscriberId}`);
    await expect(page.getByRole('heading', { name: noContact.fullName })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar contacto' }).click();
    await expect(page.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    const noContactEmail = `subscriber-${RUN_ID}@example.invalid`;
    await page.getByLabel('Correo principal').fill(noContactEmail);
    await page.getByRole('button', { name: 'Guardar cambios' }).nth(1).click();
    await expect(page.getByText('Contacto pendiente', { exact: true })).toHaveCount(0);
    const completedSubscriber = await expectJson<{
      status: string;
      contactPending: boolean;
      email: string | null;
    }>(api!, `/crm/subscribers/${noContact.subscriberId}`, 'GET', 200, {
      headers: apiHeaders(tenantAdminToken!, TENANT_SLUG),
    });
    expect(completedSubscriber.contactPending).toBe(false);
    expect(completedSubscriber.email).toBe(noContactEmail);
    await assertNoPlaceholderOrRawEnum(page);

    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await chooseOption(page, 'Estado destino', 'Activo');
    const noContactActivationPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/subscribers/${noContact.subscriberId}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Confirmar' }).click();
    expect((await noContactActivationPromise).status()).toBe(200);
    await expect(page.getByText('Activo', { exact: true })).toBeVisible();
    const activatedNoContactSubscriber = await expectJson<{
      status: string;
      contactPending: boolean;
    }>(api!, `/crm/subscribers/${noContact.subscriberId}`, 'GET', 200, {
      headers: apiHeaders(tenantAdminToken!, TENANT_SLUG),
    });
    expect(activatedNoContactSubscriber).toMatchObject({ status: 'ACTIVE', contactPending: false });
    await assertNoPlaceholderOrRawEnum(page);

    // Segundo caso separado: fixture legado sintético con expediente completo
    // y subscriber sin canales. Permite llegar al guard R5 sin alterar la
    // conversión sin contacto del primer caso.
    const legacy = await seedExpediente(true, false, page);
    await nullSubscriberContact(legacy);
    const legacyPending = await expectJson<{ status: string; contactPending: boolean }>(
      api!,
      `/crm/subscribers/${legacy.subscriberId}`,
      'GET',
      200,
      { headers: apiHeaders(tenantAdminToken!, TENANT_SLUG) },
    );
    expect(legacyPending).toMatchObject({ status: 'PROSPECT', contactPending: true });

    await page.goto(`/dashboard/crm/expedientes/${legacy.id}`);
    await expect(page.getByRole('heading', { name: legacy.fullName })).toBeVisible();
    await chooseOption(page, 'Nuevo estado', 'Cliente activo');
    const expediente422Promise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/expedientes/${legacy.id}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Aplicar transición' }).click();
    const expedienteRejection = await expediente422Promise;
    expect(expedienteRejection.status()).toBe(422);
    expect((await expedienteRejection.json()) as { code?: string }).toMatchObject({
      code: 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED',
    });
    await expect(
      page.getByText(
        'No se puede marcar como cliente activo: el suscriptor no tiene teléfono ni correo registrados.',
        { exact: true },
      ),
    ).toBeVisible();
    const subscriberLink = page.getByRole('link', { name: 'Abrir ficha del suscriptor' });
    await expect(subscriberLink).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${legacy.subscriberId}`,
    );
    const stillPendingLegacyExpediente = await expectJson<{ status: string }>(
      api!,
      `/crm/expedientes/${legacy.id}`,
      'GET',
      200,
      { headers: apiHeaders(tenantAdminToken!, TENANT_SLUG) },
    );
    expect(stillPendingLegacyExpediente.status).toBe('LISTO_PARA_INSTALACION');
    await assertNoPlaceholderOrRawEnum(page);

    // El enlace de R5 lleva al suscriptor; «Agregar contacto» abre Datos.
    await subscriberLink.click();
    await expect(page.getByRole('heading', { name: legacy.fullName })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar contacto' }).click();
    await expect(page.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    const legacyEmail = `legacy-subscriber-${RUN_ID}@example.invalid`;
    await page.getByLabel('Correo principal').fill(legacyEmail);
    await page.getByRole('button', { name: 'Guardar cambios' }).nth(1).click();
    await expect(page.getByText('Contacto pendiente', { exact: true })).toHaveCount(0);
    const completedLegacySubscriber = await expectJson<{
      status: string;
      contactPending: boolean;
      email: string | null;
    }>(api!, `/crm/subscribers/${legacy.subscriberId}`, 'GET', 200, {
      headers: apiHeaders(tenantAdminToken!, TENANT_SLUG),
    });
    expect(completedLegacySubscriber).toMatchObject({ contactPending: false, email: legacyEmail });
    await assertNoPlaceholderOrRawEnum(page);

    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await chooseOption(page, 'Estado destino', 'Activo');
    const legacyActivationPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/subscribers/${legacy.subscriberId}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Confirmar' }).click();
    expect((await legacyActivationPromise).status()).toBe(200);
    await expect(page.getByText('Activo', { exact: true })).toBeVisible();

    await page.goto(`/dashboard/crm/expedientes/${legacy.id}`);
    await expect(page.getByRole('heading', { name: legacy.fullName })).toBeVisible();
    await chooseOption(page, 'Nuevo estado', 'Cliente activo');
    const expedienteActivationPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/expedientes/${legacy.id}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Aplicar transición' }).click();
    expect((await expedienteActivationPromise).status()).toBe(200);
    await expect(page.getByText('Estado actual: Activo', { exact: true })).toBeVisible();
    const finalLegacyExpediente = await expectJson<{ status: string }>(
      api!,
      `/crm/expedientes/${legacy.id}`,
      'GET',
      200,
      { headers: apiHeaders(tenantAdminToken!, TENANT_SLUG) },
    );
    expect(finalLegacyExpediente.status).toBe('CLIENTE_ACTIVO');
    await assertNoPlaceholderOrRawEnum(page);
  });
});
