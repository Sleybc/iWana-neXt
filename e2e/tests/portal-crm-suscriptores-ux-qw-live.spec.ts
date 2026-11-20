import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off', baseURL: 'http://localhost:3002' });

// El tenant y el runner ADMIN los siembra seed-privacy-fase-1b-fixtures.mjs
// (R4.1 lo invoca en memoria). El suscriptor lo crea el propio test.
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
].filter((name): name is string => name !== null);

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

/** Expediente completo, con autorización y llevado a instalación: así se convierte. */
async function createConvertedSubscriber(page: Page): Promise<string> {
  const catalog = await apiJson<{ data: Array<{ id: string }> }>(
    page,
    '/commercial/catalog?type=PLAN&isActive=true&limit=100',
    'GET',
  );
  const planId = catalog.data[0]?.id;
  expect(planId, 'El seed debe dejar un plan activo.').toBeTruthy();
  const suffix = randomUUID().slice(0, 8);
  const email = `qw-expediente-${suffix}@example.invalid`;
  const expediente = await apiJson<{ id: string }>(page, '/crm/expedientes', 'POST', {
    fullName: `Expediente QW ${suffix}`,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: `Fixture QW ${suffix}`,
  });
  const sections: Array<[string, Record<string, unknown>]> = [
    [
      'identification',
      {
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumber: `QW-${suffix}`,
        firstName: 'Titular',
        lastName: suffix,
      },
    ],
    [
      'contact',
      {
        phonePrimary: '+570000000000',
        emailPrimary: email,
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
      { acquisitionChannel: 'WEB', sourceDetail: `Fixture QW ${suffix}`, interestedPlanId: planId },
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
  const findSubscriber = async (): Promise<string | null> => {
    const data = await apiJson<{ subscriberSummary: { id: string } | null }>(
      page,
      `/crm/expedientes/${expediente.id}/bootstrap`,
      'GET',
    );
    return data.subscriberSummary?.id ?? null;
  };
  await expect.poll(findSubscriber, { timeout: 20_000 }).not.toBeNull();
  return (await findSubscriber())!;
}

test('V1 real: un prospecto queda fuera de la búsqueda y conserva su ficha', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(tenantSlug!);
  await page.getByLabel('Correo electrónico').fill(runnerEmail!);
  await page.locator('input[autocomplete="current-password"]').fill(runnerPassword!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const targetId = await createConvertedSubscriber(page);
  const detail = await apiJson<{
    subscriber: { documentNumber: string | null; status: string; personType: string };
    expedienteSummary: unknown;
  }>(page, `/crm/subscribers/${targetId}/360`, 'GET');
  const target = { id: targetId };
  console.info(
    'V1 fixture capabilities',
    JSON.stringify({
      document: Boolean(detail.subscriber.documentNumber),
      expediente: Boolean(detail.expedienteSummary),
      status: detail.subscriber.status,
    }),
  );
  await page.goto('/dashboard/crm/subscribers');
  const search = page.getByRole('searchbox', { name: 'Buscar suscriptor' });
  await expect(search).toBeVisible();
  const documentValue = detail.subscriber.documentNumber ?? '';
  expect(Boolean(documentValue)).toBe(true);
  const searched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/crm/subscribers/search') &&
      response.request().method() === 'POST',
  );
  await search.fill(documentValue);
  const response = await searched;
  expect(response.status()).toBe(200);
  const result = (await response.json()) as { data: Array<{ id: string }> };
  expect(detail.subscriber.status).toBe('PROSPECT');
  expect(result.data.map(({ id }) => id)).not.toContain(target.id);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).click();
  const filterResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      url.pathname.endsWith('/crm/subscribers/search') &&
      url.searchParams.get('status') === 'SUSPENDED' &&
      candidate.request().method() === 'POST'
    );
  });
  await page.getByRole('option', { name: 'Suspendido', exact: true }).click();
  const filtered = await filterResponse;
  expect(filtered.status()).toBe(200);
  const filteredResult = (await filtered.json()) as { data: Array<{ id: string }> };
  expect(filteredResult.data.map(({ id }) => id)).not.toContain(target.id);
  await expect(search).toHaveValue(documentValue);
  expect(page.url().includes(documentValue)).toBe(false);
  await page.goto(`/dashboard/crm/subscribers/${target.id}?tab=datos`);
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Datos', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Cumplimiento', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Servicios', exact: true })).toBeFocused();
  await page.goto(`/dashboard/crm/subscribers/${target.id}?tab=financiero`);
  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  console.info('V1 CA3/CA4: recarga, fallback y teclado reales');
  const billing = page.getByRole('region', { name: 'Facturación', exact: true });
  await expect(billing.getByText('Ciclo de facturación', { exact: true })).toBeVisible();
  await expect(billing.getByText('Nombre fiscal', { exact: true })).toBeVisible();
  await expect(billing.getByText('Registrado en la venta', { exact: true })).toHaveCount(0);
  await expect(
    billing.getByRole('button', { name: 'Editar facturación', exact: true }),
  ).toHaveCount(0);
  // El bloque «Cambiar estado → Suspendido» quedó obsoleto con a583e9f0: la
  // suspensión es un comando de ciclo de vida sobre servicios de un suscriptor
  // ACTIVE, y aquí es PROSPECT. La cubre portal-mod05-lifecycle.spec.ts.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/dashboard/crm/subscribers/${target.id}?tab=datos`);
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  console.info(
    'V1 mobile detail widths',
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  );
  await page.goto('/dashboard/crm/subscribers');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Más filtros' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  console.info(
    'V1 mobile list widths',
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  );
});

test('V1 controlado: búsqueda exacta, tabs, facturación y móvil', async ({ page }) => {
  test.setTimeout(60_000);
  const me = {
    sub: 'qa-user',
    role: 'ADMIN',
    tenantId: 'qa-tenant',
    schemaName: 'tenant_qa',
    type: 'tenant',
    passwordResetRequired: false,
  };
  const subscriber = {
    id: 'qa-subscriber',
    tenantId: 'qa-tenant',
    personType: 'NATURAL',
    customerSegment: 'RESIDENTIAL',
    documentType: 'CC',
    documentNumber: '1000000001',
    firstName: 'Titular',
    lastName: 'Sintético',
    email: 'titular@example.invalid',
    phone: '5550000001',
    status: 'ACTIVE',
    stratum: 3,
    vatTreatment: 'STANDARD',
    vatResponsibility: 'RESPONSABLE',
    rutResponsibilities: ['O-13'],
    fiscalCompleteness: { complete: true, missing: [] },
    privacyRestricted: false,
    contactPending: false,
    privacyMarks: [],
    address: 'Dirección sintética',
    city: 'Bogotá',
    department: 'Cundinamarca',
    anonymizedAt: null,
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  };
  const envelope = {
    subscriber,
    contacts: [],
    contracts: [],
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    timelineSeed: [],
    expedienteSummary: {
      id: 'qa-expediente',
      status: 'NUEVO_POTENCIAL',
      paymentMethod: 'PSE',
      billingCycle: 'Mensual',
      fiscalName: 'Titular sintético',
    },
  };
  let searches = 0;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];
    let total = 1;
    if (path.endsWith('/auth/me')) data = me;
    else if (path.includes('/users/qa-user'))
      data = {
        ...me,
        id: 'qa-user',
        firstName: 'Usuario',
        lastName: 'Sintético',
        mfaEnabled: true,
      };
    else if (path.includes('/effective-permissions'))
      data = {
        effectivePermissions: [
          'crm.subscribers.read',
          'crm.subscribers.manage',
          'privacy.read',
          'privacy.manage',
        ],
        isAdmin: true,
      };
    else if (path.includes('/tenants/'))
      data = {
        id: 'qa-tenant',
        name: 'Tenant sintético',
        slug: 'qa-tenant',
        status: 'ACTIVE',
        showTenantName: true,
      };
    else if (path.endsWith('/crm/subscribers/qa-subscriber/360')) data = envelope;
    else if (path.endsWith('/crm/subscribers/search')) {
      searches++;
      expect(route.request().postDataJSON()).toEqual({ search: '1000000001' });
      const matches = url.searchParams.get('status') !== 'SUSPENDED';
      data = matches ? [subscriber] : [];
      total = matches ? 1 : 0;
    } else if (path.endsWith('/crm/subscribers')) total = 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        meta: {
          total,
          page: 1,
          limit: 20,
          totalPages: total,
          nextCursor: null,
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      }),
    });
  });
  await page.context().addCookies([
    {
      name: 'portalAccessToken',
      value: 'synthetic-cookie-for-intercepted-http',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  await page.addInitScript(() => localStorage.setItem('iwana.portal.tenant-slug', 'qa-tenant'));
  await page.goto('/dashboard/crm/subscribers');
  const search = page.getByRole('searchbox', { name: 'Buscar suscriptor' });
  await search.fill('1000000001');
  await expect.poll(() => searches).toBe(1);
  await expect(
    page
      .getByRole('table', { name: 'Listado de suscriptores' })
      .getByRole('row', { name: /Titular Sintético/u }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Estado', exact: true }).click();
  await page.getByRole('option', { name: 'Suspendido', exact: true }).click();
  await expect(page.getByText('No se encontraron resultados', { exact: true })).toBeVisible();
  await expect.poll(() => searches).toBe(2);
  await expect(search).toHaveValue('1000000001');
  await expect(page).toHaveURL(/status=SUSPENDED/u);
  expect(page.url()).not.toContain('1000000001');
  await page.goto('/dashboard/crm/subscribers/qa-subscriber?tab=datos');
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Datos', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Cumplimiento', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Servicios', exact: true })).toBeFocused();
  await page.goto('/dashboard/crm/subscribers/qa-subscriber?tab=financiero');
  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const billing = page.getByRole('region', { name: 'Facturación', exact: true });
  await expect(billing.getByText('Ciclo de facturación', { exact: true })).toBeVisible();
  await expect(billing.getByText('Nombre fiscal', { exact: true })).toBeVisible();
  await expect(billing.getByText('Registrado en la venta', { exact: true })).toHaveCount(0);
  await expect(
    billing.getByRole('button', { name: 'Editar facturación', exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/crm/subscribers/qa-subscriber?tab=datos');
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  console.info(
    'V1 controlado mobile detail widths',
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  );
  await page.goto('/dashboard/crm/subscribers');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Más filtros' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  console.info(
    'V1 controlado mobile list widths',
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  );
});
