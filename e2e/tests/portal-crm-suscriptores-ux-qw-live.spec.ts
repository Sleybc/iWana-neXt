import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off', baseURL: 'http://localhost:3002' });

test('V1 real: búsqueda exacta, tabs, teclado, facturación y móvil', async ({ page }) => {
  test.setTimeout(180_000);
  const slug = process.env.E2E_TENANT_SLUG;
  test.skip(
    !slug || !process.env.E2E_TENANT_ADMIN_EMAIL || !process.env.E2E_TENANT_ADMIN_PASSWORD,
    'G2 pendiente: faltan credenciales admin CRM del seed; no se sustituyen por cuenta AUDITOR.',
  );
  const login = await page.request.post('http://localhost:3000/api/v1/auth/login', {
    headers: { 'X-Tenant-Slug': slug! },
    data: {
      email: process.env.E2E_TENANT_ADMIN_EMAIL,
      password: process.env.E2E_TENANT_ADMIN_PASSWORD,
    },
  });
  expect(login.status()).toBe(200);
  const session = (await login.json()).data;
  expect(Boolean(session.accessToken)).toBe(true);
  await page.context().addCookies([
    {
      name: 'portalAccessToken',
      value: session.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
  await page.addInitScript(
    (tenantSlug) => localStorage.setItem('iwana.portal.tenant-slug', tenantSlug!),
    slug,
  );
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'X-Tenant-Slug': slug! };
  const listed = await page.request.get('http://localhost:3000/api/v1/crm/subscribers?limit=100', {
    headers,
  });
  expect(listed.status()).toBe(200);
  const records = (await listed.json()).data;
  console.info('V1 fixture: registros disponibles', records.length);
  const target = records.find(
    (r: { privacyRestricted?: boolean; personType?: string }) =>
      !r.privacyRestricted && r.personType === 'NATURAL',
  );
  expect(Boolean(target)).toBe(true);
  const detailResponse = await page.request.get(
    `http://localhost:3000/api/v1/crm/subscribers/${target.id}/360`,
    { headers },
  );
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()).data;
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
  const documentValue = detail.subscriber.documentNumber;
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
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toBeFocused();
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
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Estado destino' }).click();
  await page.getByRole('option', { name: 'Suspendido', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /Razón/ })).toHaveAttribute(
    'aria-required',
    'true',
  );
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
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

test('V1 controlado: frontend real con HTTP sintético, desktop y 375 px', async ({ page }) => {
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
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toBeFocused();
  await page.goto('/dashboard/crm/subscribers/qa-subscriber?tab=financiero');
  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Editar facturación', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar facturación', exact: true }).click();
  await expect(page.getByText('Fallo sintético de facturación', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar estado', exact: true }).click();
  await page.getByRole('combobox', { name: 'Estado destino' }).click();
  await page.getByRole('option', { name: 'Suspendido', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Razón/ })).toHaveAttribute(
    'aria-required',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
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
