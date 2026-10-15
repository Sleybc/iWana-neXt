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
type Tenant = { id: string; slug: string; schemaName: string; status: string };
type Envelope<T> = { data: T };

const fromDatabase = createRequire(resolve(process.cwd(), 'packages/database/package.json'));
const PgClientConstructor = (
  fromDatabase('pg') as {
    Client: new (config: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      connectionTimeoutMillis: number;
    }) => PgClient;
  }
).Client;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-mod05-g3-${RUN_ID}`;
const TENANT_ADMIN_EMAIL = `srqa-mod05-g3-${RUN_ID}@example.invalid`;
const REQUIRED_RETRY_MESSAGE =
  'No se creó el suscriptor: falta la autorización de tratamiento de datos. Regístrala en Consentimientos y vuelve a intentarlo.';
const REQUIRED_R8_MESSAGE =
  'Para pasar a Listo para instalación, registra la autorización de tratamiento de datos en Consentimientos.';
const INTERNAL_OR_PLACEHOLDER =
  /@placeholder\.iwana\.co|0000000000|SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED|crm\.expediente\.ready-for-installation|\b(?:NUEVO_POTENCIAL|EN_COTIZACION|LISTO_PARA_INSTALACION|PROSPECT|ACTIVE)\b/u;

let api: APIRequestContext | undefined;
let db: PgClient | undefined;
let platformToken: string | undefined;
let tenantAdminToken: string | undefined;
let tenantId: string | undefined;
let tenantSchema: string | undefined;
let tenantAdminPassword: string | undefined;

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
      name: `Tenant sintético MOD05 G3 ${RUN_ID}`,
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
  expect(tenantSchema).toMatch(/^tenant_srqa_mod05_g3_[a-f0-9]{12}$/u);

  await expect
    .poll(
      async () => {
        const current = await expectJson<Tenant>(api!, `/tenants/${tenantId}`, 'GET', 200, {
          headers: apiHeaders(platformToken!),
        });
        if (current.status === 'PROVISIONING_FAILED') {
          throw new Error('El provisioning del tenant G3 terminó en fallo.');
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
  tenantAdminPassword = `Qa9!${randomBytes(18).toString('hex')}`;
  const initialSession = await expectJson<{
    accessToken: string;
    mfaSetupRequired?: boolean;
    mfaRequired?: boolean;
  }>(api, '/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email: credential.adminEmail, password: credential.temporaryPassword },
  });
  expect(initialSession.mfaRequired ?? false).toBe(false);
  expect(initialSession.mfaSetupRequired ?? false).toBe(false);
  await expectJson<{ message: string }>(api, '/auth/change-password', 'POST', 200, {
    headers: apiHeaders(initialSession.accessToken, TENANT_SLUG),
    data: { currentPassword: credential.temporaryPassword, newPassword: tenantAdminPassword },
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

async function loginInPortal(
  page: Page,
  credentials: { email: string; password: string } = {
    email: TENANT_ADMIN_EMAIL,
    password: requiredEnv(tenantAdminPassword, 'contraseña efímera de tenant'),
  },
): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(TENANT_SLUG);
  await page.getByLabel('Correo electrónico').fill(credentials.email);
  await page.locator('input[autocomplete="current-password"]').fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function createSalesUserWithSubscriberPermission(): Promise<{
  email: string;
  password: string;
}> {
  const email = `sales-${RUN_ID}@example.invalid`;
  const password = `Qa9!${randomBytes(18).toString('hex')}`;
  const createdUser = await expectJson<{ id: string; role: string }>(api!, '/users', 'POST', 201, {
    headers: {
      ...apiHeaders(requiredEnv(tenantAdminToken, 'sesión sintética de tenant'), TENANT_SLUG),
      'Idempotency-Key': randomUUID(),
    },
    data: {
      email,
      password,
      role: 'SALES',
      firstName: 'Asesor',
      lastName: 'Sintético',
      mfaRequired: false,
    },
  });
  expect(createdUser.role).toBe('SALES');

  const profile = await expectJson<{ id: string }>(api!, '/access-control/profiles', 'POST', 201, {
    headers: apiHeaders(requiredEnv(tenantAdminToken, 'sesión sintética de tenant'), TENANT_SLUG),
    data: {
      name: `Perfil sintético SALES ${RUN_ID}`,
      description: 'Permisos mínimos sintéticos para verificar el techo de la acción.',
      baseRoleConstraint: 'SALES',
      permissionKeys: [
        'crm.expedientes.read',
        'crm.expedientes.manage',
        'crm.subscribers.read',
        'crm.subscribers.manage',
      ],
    },
  });
  await expectJson<{ userId: string; role: string; profileIds: string[] }>(
    api!,
    `/access-control/users/${createdUser.id}/profiles`,
    'PUT',
    200,
    {
      headers: apiHeaders(requiredEnv(tenantAdminToken, 'sesión sintética de tenant'), TENANT_SLUG),
      data: { profileIds: [profile.id] },
    },
  );

  const salesSession = await expectJson<{ accessToken: string }>(api!, '/auth/login', 'POST', 200, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG },
    data: { email, password },
  });
  const permissionSummary = await expectJson<{ effectivePermissions: string[] }>(
    api!,
    '/access-control/me/effective-permissions',
    'GET',
    200,
    { headers: apiHeaders(salesSession.accessToken, TENANT_SLUG) },
  );
  expect(permissionSummary.effectivePermissions).toContain('crm.subscribers.manage');

  return { email, password };
}

async function createCompleteExpedienteWithoutConsent(): Promise<{ id: string; fullName: string }> {
  const headers = apiHeaders(
    requiredEnv(tenantAdminToken, 'sesión sintética de tenant'),
    TENANT_SLUG,
  );
  const suffix = randomUUID().replace(/-/gu, '').slice(0, 8);
  const fullName = `Persona sintética ${suffix}`;

  await expectJson<{ id: string }>(api!, '/privacy/legal-texts', 'POST', 201, {
    headers,
    data: {
      type: 'AUTORIZACION',
      version: `g3-${RUN_ID}`,
      content: 'Texto de autorización sintético para prueba E2E.',
    },
  });
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
  await updateSection('contact', {
    emailPrimary: `expediente-${suffix}@example.invalid`,
    phonePrimary: '3005550103',
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

  return { id: created.id, fullName };
}

async function assertNoInternalCodeOrPlaceholder(page: Page): Promise<void> {
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(INTERNAL_OR_PLACEHOLDER);
}

async function seedPendingConversionFailure(expedienteId: string): Promise<void> {
  await ensureTenantDatabase();
  const schema = requiredEnv(tenantSchema, 'schema sintético');
  expect(schema).toMatch(/^tenant_srqa_mod05_g3_[a-f0-9]{12}$/u);
  const state = await db!.query(
    `UPDATE "${schema}".expediente_records
        SET previous_status = 'EN_COTIZACION', status = 'LISTO_PARA_INSTALACION', status_changed_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id`,
    [expedienteId, tenantId],
  );
  expect(state.rowCount).toBe(1);
  const failure = await db!.query(
    `INSERT INTO "${schema}".crm_conversion_failures
       (tenant_id, expediente_id, event_name, error_code, attempts, first_failed_at, last_failed_at)
     VALUES ($1, $2, 'crm.expediente.ready-for-installation', 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED', 1, now(), now())
     RETURNING id`,
    [tenantId, expedienteId],
  );
  expect(failure.rowCount).toBe(1);
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('MOD05 E3 — fallo de conversión y reintento contra servicios reales', () => {
  test.setTimeout(240_000);

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

  test('R8 bloquea sin consentimiento y ADMIN reintenta; SALES con permiso solo ve el motivo', async ({
    page,
    browser,
  }) => {
    await loginInPortal(page);
    const expediente = await createCompleteExpedienteWithoutConsent();
    const headers = apiHeaders(
      requiredEnv(tenantAdminToken, 'sesión sintética de tenant'),
      TENANT_SLUG,
    );

    await page.goto(`/dashboard/crm/expedientes/${expediente.id}`);
    await expect(page.getByRole('heading', { name: expediente.fullName })).toBeVisible();
    await page.getByLabel('Nuevo estado').click();
    await page.getByRole('option', { name: 'Listo para instalación', exact: true }).click();
    const r8ResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/expedientes/${expediente.id}/status`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Aplicar transición' }).click();
    const r8Response = await r8ResponsePromise;
    expect(r8Response.status()).toBe(422);
    expect((await r8Response.json()) as { code?: string; message?: string }).toMatchObject({
      code: 'EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED',
      message: REQUIRED_R8_MESSAGE,
    });
    await expect(page.getByText(REQUIRED_R8_MESSAGE, { exact: true })).toBeVisible();
    const unchanged = await expectJson<{ status: string }>(
      api!,
      `/crm/expedientes/${expediente.id}`,
      'GET',
      200,
      { headers },
    );
    expect(unchanged.status).not.toBe('LISTO_PARA_INSTALACION');
    await assertNoInternalCodeOrPlaceholder(page);

    await seedPendingConversionFailure(expediente.id);
    await page.reload();
    const failureMessage = page.getByText(REQUIRED_RETRY_MESSAGE, { exact: true });
    await expect(failureMessage).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar conversión' })).toBeVisible();
    await assertNoInternalCodeOrPlaceholder(page);

    const salesCredentials = await createSalesUserWithSubscriberPermission();
    const salesContext = await browser.newContext({
      baseURL: process.env.PORTAL_BASE_URL ?? 'http://127.0.0.1:3002',
    });
    try {
      const salesPage = await salesContext.newPage();
      await loginInPortal(salesPage, salesCredentials);
      await salesPage.goto(`/dashboard/crm/expedientes/${expediente.id}`);
      await expect(salesPage.getByRole('heading', { name: expediente.fullName })).toBeVisible();
      await expect(salesPage.getByText(REQUIRED_RETRY_MESSAGE, { exact: true })).toBeVisible();
      await expect(
        salesPage.getByText('Pide a un administrador que reintente la conversión.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(salesPage.getByRole('button', { name: 'Reintentar conversión' })).toHaveCount(0);
      await assertNoInternalCodeOrPlaceholder(salesPage);
    } finally {
      await salesContext.close();
    }

    const consent = await expectJson<{ consentType: string; status: string; channel: string }>(
      api!,
      `/crm/expedientes/${expediente.id}/consents`,
      'POST',
      201,
      {
        headers,
        data: {
          consentType: 'TRATAMIENTO_DATOS',
          status: 'ACEPTADO',
          channel: 'TELEFONO',
          evidenceRef: `g3-evidence-${RUN_ID}`,
        },
      },
    );
    expect(consent).toMatchObject({
      consentType: 'TRATAMIENTO_DATOS',
      status: 'ACEPTADO',
      channel: 'TELEFONO',
    });

    const retryResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/crm/expedientes/${expediente.id}/retry-conversion`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Reintentar conversión' }).click();
    const retryResponse = await retryResponsePromise;
    expect(retryResponse.status()).toBe(201);
    expect(
      (await retryResponse.json()) as { data?: { retried?: boolean; resolved?: boolean } },
    ).toMatchObject({
      data: { retried: true, resolved: true },
    });

    await expect(failureMessage).toHaveCount(0);
    const getBootstrap = () =>
      expectJson<{
        conversionFailure: unknown | null;
        subscriberSummary: { id: string } | null;
      }>(api!, `/crm/expedientes/${expediente.id}/bootstrap`, 'GET', 200, { headers });
    await expect
      .poll(async () => (await getBootstrap()).conversionFailure, { timeout: 20_000 })
      .toBeNull();
    const resolvedBootstrap = await getBootstrap();
    expect(resolvedBootstrap.subscriberSummary?.id).toBeTruthy();
    await assertNoInternalCodeOrPlaceholder(page);
  });
});
