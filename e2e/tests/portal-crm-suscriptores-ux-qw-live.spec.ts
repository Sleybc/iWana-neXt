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
    const response = await page.request.post('/api/v1/crm/subscribers/search', {
      headers: { 'X-Tenant-Slug': tenantSlug!, 'X-Requested-With': 'XMLHttpRequest' },
      data: { email },
    });
    if (!response.ok()) return null;
    const body = (await response.json()) as { data?: Array<{ id: string }> };
    return body.data?.[0]?.id ?? null;
  };
  await expect.poll(findSubscriber, { timeout: 20_000 }).not.toBeNull();
  return (await findSubscriber())!;
}

test('V1 real: búsqueda exacta, tabs, teclado, facturación y móvil', async ({ page }) => {
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
  await expect(page.getByRole('radio', { name: 'Documento', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Documento', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Documento', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    'Cédula, NIT o pasaporte',
  );
  await expect(page).toHaveURL(/mode=document/u);
  const documentValue = detail.subscriber.documentNumber ?? '';
  expect(Boolean(documentValue)).toBe(true);
  await page.getByRole('searchbox').fill(documentValue);
  const searched = page.waitForResponse(
    (r) => r.url().endsWith('/crm/subscribers/search') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  expect((await searched).status()).toBe(200);
  await expect(page.getByText('Coincidencia exacta · 1 resultado', { exact: true })).toBeVisible();
  expect(page.url().includes(documentValue)).toBe(false);
  console.info('V1 CA1/CA2: lookup real 200 y resultado único sin valor en URL');
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
  expect(
    Boolean(detail.expedienteSummary),
    'El fixture live requiere oportunidad para verificar CA5.',
  ).toBe(true);
  if (detail.expedienteSummary) {
    await page.route('**/crm/expedientes/*/sections/billing', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'QA_FORCED',
          message: 'Error sintético de facturación para V1',
        }),
      }),
    );
    await page.getByRole('button', { name: 'Editar facturación', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar facturación', exact: true }).click();
    await expect(
      page.getByText('Error sintético de facturación para V1', { exact: true }),
    ).toBeVisible();
    console.info('V1 CA5: error forzado interceptado visible; ninguna escritura enviada');
  }
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
  await page.goto('/dashboard/crm/subscribers?mode=document');
  await expect(page.getByRole('searchbox')).toBeVisible();
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
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
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
      expect(route.request().postDataJSON()).toEqual({ documentNumber: '1000000001' });
      data = [subscriber];
    } else if (path.endsWith('/crm/subscribers')) data = [subscriber];
    else if (path.endsWith('/sections/billing')) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'QA_FORCED', message: 'Fallo sintético de facturación' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
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
  await page.getByRole('radio', { name: 'Documento', exact: true }).click();
  await expect(page).toHaveURL(/mode=document/u);
  await page.getByRole('searchbox').fill('1000000001');
  await expect(page.getByRole('searchbox')).toHaveValue('1000000001');
  expect(searches).toBe(0);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Coincidencia exacta · 1 resultado', { exact: true })).toBeVisible();
  expect(searches).toBe(1);
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
  await page.getByRole('button', { name: 'Editar facturación', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar facturación', exact: true }).click();
  await expect(page.getByText('Fallo sintético de facturación', { exact: true })).toBeVisible();
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
  await page.goto('/dashboard/crm/subscribers?mode=document');
  await expect(page.getByRole('searchbox')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  console.info(
    'V1 controlado mobile list widths',
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    })),
  );
});
