import { randomBytes, randomUUID } from 'node:crypto';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

type Envelope<T> = { data: T };
type Tenant = { id: string; slug: string; schemaName: string; status: string };
type BillingCycleOption = {
  cycleDay: number;
  cutoffDay: number;
  active: boolean;
  nextCutoffDate: string;
};
type CutoffAgendaItem = {
  contractId: string;
  subscriberId: string;
  subscriberDisplayName: string;
  planName: string | null;
  billingCycleDay: number;
  cutoffDate: string;
};

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
const TENANT_SLUG = `srqa-mod05-cf-${RUN_ID}`;
const TENANT_ADMIN_EMAIL = `srqa-mod05-cf-${RUN_ID}@example.invalid`;
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
let tenantId: string | undefined;
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
  const body = (await response.json()) as Envelope<T> & { code?: unknown; message?: unknown };
  expect(
    response.status(),
    `API ${method} ${path}: HTTP ${response.status()} (${String(body.code ?? body.message ?? 'sin detalle')})`,
  ).toBe(status);
  const envelope = body as Envelope<T>;
  return envelope.data;
}

async function cleanupQaTenants(): Promise<void> {
  if (!api || !platformToken) return;
  const tenants = await expectJson<Tenant[]>(
    api,
    '/tenants?search=srqa-mod05-cf-&limit=100&offset=0',
    'GET',
    200,
    { headers: apiHeaders(platformToken) },
  );
  for (const tenant of tenants.filter((candidate) =>
    /^srqa-mod05-cf-[a-f0-9]{12}$/u.test(candidate.slug),
  )) {
    if (tenant.status === 'ACTIVE') {
      await expectJson<Tenant>(api, `/tenants/${tenant.id}`, 'PATCH', 200, {
        headers: apiHeaders(platformToken),
        data: { status: 'INACTIVE' },
      });
    }
    const deleted = await api.fetch(`${API_PREFIX}/tenants/${tenant.id}`, {
      method: 'DELETE',
      headers: apiHeaders(platformToken),
    });
    expect(deleted.status()).toBe(204);
    const hidden = await api.fetch(`${API_PREFIX}/tenants/${tenant.id}`, {
      headers: apiHeaders(platformToken),
    });
    expect(hidden.status()).toBe(200);
    const retained = (await hidden.json()) as Envelope<Tenant>;
    expect(retained.data.status).toBe('MARKED_FOR_DELETION');
  }
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
      name: `Tenant sintético MOD05 ciclo ${RUN_ID}`,
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
  expect(created.slug).toBe(TENANT_SLUG);
  expect(created.schemaName).toMatch(/^tenant_srqa_mod05_cf_[a-f0-9]{12}$/u);
  expect(created.schemaName).not.toBe('tenant_iwana');

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

async function seedContractFixture(): Promise<{
  subscriberId: string;
  contractId: string;
  subscriberDisplayName: string;
  planName: string;
}> {
  const token = requiredEnv(tenantAdminToken, 'sesión sintética de tenant');
  const headers = apiHeaders(token, TENANT_SLUG);
  const suffix = randomUUID().replace(/-/gu, '').slice(0, 8);
  const planName = `Plan QA ciclo ${suffix}`;
  const subscriberDisplayName = `Titular Sintético ${suffix}`;

  const legalText = await expectJson<{ id: string }>(api!, '/privacy/legal-texts', 'POST', 201, {
    headers,
    data: {
      type: 'AUTORIZACION',
      version: `qa-cf-${RUN_ID}`,
      content: 'Texto de autorización sintético para prueba E2E de ciclo de facturación.',
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
        name: planName,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FIBER',
        downloadSpeedMbps: 100,
        uploadSpeedMbps: 20,
        installationRule: 'ALWAYS',
      },
    },
  );
  const subscriber = await expectJson<{ id: string }>(api!, '/crm/subscribers', 'POST', 201, {
    headers,
    data: {
      personType: 'NATURAL',
      customerSegment: 'RESIDENTIAL',
      documentType: 'CC',
      documentNumber: `QA-${suffix}`,
      firstName: 'Titular',
      lastName: `Sintético ${suffix}`,
      stratum: 4,
      email: `qa-cf-${suffix}@example.invalid`,
      address: `Dirección sintética ${suffix}`,
      city: 'Bogotá',
      department: 'Cundinamarca',
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: [],
      authorizationChannel: 'PRESENCIAL',
      authorizations: [
        {
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          legalTextId: legalText.id,
        },
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
        planSnapshotJson: { id: plan.id, name: plan.name },
        alias: `Servicio QA ciclo ${suffix}`,
        installationAddress: `Dirección sintética ${suffix}`,
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        customerSegment: 'RESIDENTIAL',
        serviceUsage: 'NON_RESIDENTIAL',
      },
    },
  );

  return { subscriberId: subscriber.id, contractId: contract.id, subscriberDisplayName, planName };
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

function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  const months = [
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
  ];
  const monthName = months[Number(month) - 1];
  if (!year || !day || !monthName) throw new Error('El catálogo devolvió una fecha inválida.');
  return `${Number(day)} de ${monthName} de ${year}`;
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('MOD05 ciclo de facturación — CA-CF-12 contra Portal y API reales', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test.setTimeout(240_000);

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

  test('CA-CF-12: exige ciclo, activa el servicio y lo muestra en la agenda de corte', async ({
    page,
  }) => {
    const fixture = await seedContractFixture();
    const catalogResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/crm/billing-cycles') && response.request().method() === 'GET';
    });

    await loginInPortal(page);
    await page.goto(`/dashboard/crm/subscribers/${fixture.subscriberId}?tab=servicios`);
    const catalogResponse = await catalogResponsePromise;
    expect(catalogResponse.status()).toBe(200);
    const cycles = (await catalogResponse.json()) as BillingCycleOption[];
    const cycle = cycles.find((option) => option.cycleDay === 1 && option.active);
    expect(cycle).toBeDefined();
    expect(cycle?.nextCutoffDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    const nextCutoffDate = cycle!.nextCutoffDate;

    await expect(page.getByText(fixture.planName, { exact: true })).toBeVisible();
    // En la ficha U, «Activar» está en el pie de la tarjeta y fuera del menú de acciones.
    const actionsMenu = page.getByRole('button', { name: /^Acciones de /u });
    await expect(actionsMenu).toBeVisible();
    await actionsMenu.click();
    await expect(page.getByRole('menuitem', { name: 'Eliminar borrador' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Activar', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Activar servicio' });
    await expect(dialog).toBeVisible();
    const cycleSelect = dialog.getByLabel('Ciclo de facturación');
    const activateButton = dialog.getByRole('button', { name: 'Activar servicio', exact: true });
    await expect(cycleSelect).toBeEnabled();
    await expect(activateButton).toBeDisabled();

    await cycleSelect.click();
    await page.getByRole('option', { name: `Día ${cycle!.cycleDay}`, exact: true }).click();
    await expect(
      dialog.getByText(`Próximo corte: ${formatCivilDate(nextCutoffDate)}`),
    ).toBeVisible();
    await expect(activateButton).toBeEnabled();

    const activationResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith(`/crm/contracts/${fixture.contractId}/activate`) &&
        response.request().method() === 'POST'
      );
    });
    await activateButton.click();
    const activationResponse = await activationResponsePromise;
    expect(activationResponse.status()).toBe(200);
    const activationBody = (await activationResponse.json()) as Envelope<{
      id: string;
      status: string;
      billingCycleDay: number;
    }>;
    expect(activationBody.data).toMatchObject({
      id: fixture.contractId,
      status: 'ACTIVE',
      billingCycleDay: cycle!.cycleDay,
    });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(`Ciclo: día ${cycle!.cycleDay}`, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`Próximo corte: ${formatCivilDate(nextCutoffDate)}`, { exact: true }),
    ).toBeVisible();

    const agendaResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith('/crm/billing-cycles/cutoff-agenda') &&
        url.searchParams.get('date') === nextCutoffDate &&
        response.request().method() === 'GET'
      );
    });
    await page.goto(
      `/dashboard/crm/subscribers/agenda-corte?date=${encodeURIComponent(nextCutoffDate)}`,
    );
    const agendaResponse = await agendaResponsePromise;
    expect(agendaResponse.status()).toBe(200);
    const agenda = (await agendaResponse.json()) as {
      date: string;
      items: CutoffAgendaItem[];
      withoutCycleCount: number;
    };
    expect(agenda.date).toBe(nextCutoffDate);
    expect(agenda.items).toContainEqual(
      expect.objectContaining({
        contractId: fixture.contractId,
        subscriberId: fixture.subscriberId,
        subscriberDisplayName: fixture.subscriberDisplayName,
        planName: fixture.planName,
        billingCycleDay: cycle!.cycleDay,
        cutoffDate: nextCutoffDate,
      }),
    );
    await expect(page.getByRole('heading', { name: 'Agenda de corte' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ciclo: día 1', exact: true })).toBeVisible();
    await expect(
      page.getByRole('cell', { name: fixture.subscriberDisplayName, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name: fixture.planName, exact: true })).toBeVisible();
    await expect(
      page.getByRole('cell', { name: formatCivilDate(nextCutoffDate), exact: true }),
    ).toBeVisible();
  });
});
