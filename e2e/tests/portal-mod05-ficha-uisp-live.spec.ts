import { createHmac, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
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
  const email = `uisp-expediente-${suffix}@example.invalid`;
  const expediente = await apiJson<{ id: string }>(page, '/crm/expedientes', 'POST', {
    fullName: `Expediente UISP ${suffix}`,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: `Fixture UISP ${suffix}`,
  });
  const sections: Array<[string, Record<string, unknown>]> = [
    [
      'identification',
      {
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumber: `UISP-${suffix}`,
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
      {
        acquisitionChannel: 'WEB',
        sourceDetail: `Fixture UISP ${suffix}`,
        interestedPlanId: planId,
      },
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

// ── Ola 5 (QA de cierre) · spec 2026-11-10 ficha estilo UISP: CA-2, CA-3, CA-5, CA-6, CA-7, CA-8 ──

async function login(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(tenantSlug!);
  await page.getByLabel('Correo electrónico').fill(runnerEmail!);
  await page.locator('input[autocomplete="current-password"]').fill(runnerPassword!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectNoSeriousAxeViolations(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  console.info(
    `axe ${label}`,
    JSON.stringify(
      result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    ),
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

function region(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

test.describe('Ficha del suscriptor estilo UISP (live)', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test('CA-2/CA-3/CA-6: dos columnas, nota en Actividad, Registrar e insignias', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const id = await createConvertedSubscriber(page);
    await page.goto(`/dashboard/crm/subscribers/${id}`);
    await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // CA-2: identidad, servicios, siguiente cobro, tickets y visitas sin cambiar de pestaña.
    for (const name of [
      'Contacto',
      'Servicios',
      'Siguiente cobro',
      'Tickets activos',
      'Visitas abiertas',
      'Actividad',
    ]) {
      await expect(region(page, name), `tarjeta ${name}`).toBeVisible();
    }
    // Dos columnas a 1440: Contacto (derecha) empieza donde termina Servicios (izquierda).
    const services = await region(page, 'Servicios').boundingBox();
    const identity = await region(page, 'Contacto').boundingBox();
    expect(services).not.toBeNull();
    expect(identity).not.toBeNull();
    expect(identity!.x).toBeGreaterThanOrEqual(services!.x + services!.width);

    // CA-6: las insignias derivadas no exponen controles para asignarlas a mano.
    const badges = page.getByRole('list', { name: 'Insignias del suscriptor' });
    for (const list of await badges.all()) {
      await expect(list.getByRole('button')).toHaveCount(0);
    }

    // Actividad: crear una nota y verla en la bitácora.
    const noteText = `Nota QA ola 5 ${randomUUID().slice(0, 8)}`;
    const activity = region(page, 'Actividad');
    await activity.getByLabel('Nueva nota').fill(noteText);
    const saved = page.waitForResponse(
      (r) => /\/crm\/subscribers\/[^/]+\/notes$/u.test(r.url()) && r.request().method() === 'POST',
    );
    await activity.getByRole('button', { name: 'Guardar nota', exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(activity.getByText('Nota guardada.', { exact: true })).toBeVisible();
    await expect(activity.getByText(noteText, { exact: true })).toBeVisible();

    // CA-3: «Registrar ▾» con permisos de ADMIN lista las cinco opciones y delega en su flujo.
    const register = page.getByRole('button', { name: 'Registrar', exact: true });
    await register.click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Pago',
      'Ticket',
      'Visita',
      'Documento',
      'Servicio',
    ]);
    await page.getByRole('menuitem', { name: 'Ticket', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Soporte', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Vista general', exact: true }).click();
    await register.click();
    await page.getByRole('menuitem', { name: 'Documento', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Facturación', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(region(page, 'Documentos')).toBeVisible();
    await page.getByRole('tab', { name: 'Vista general', exact: true }).click();
    await register.click();
    await page.getByRole('menuitem', { name: 'Servicio', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Servicios', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('CA-5/CA-8: páginas de alta y de detalle de servicio', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    const id = await createConvertedSubscriber(page);
    await page.goto(`/dashboard/crm/subscribers/${id}/services/new`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('No pudimos cargar el servicio')).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, 'alta de servicio');

    const detail = await apiJson<{ contracts: Array<{ id: string }> }>(
      page,
      `/crm/subscribers/${id}/360`,
      'GET',
    );
    test.skip(
      detail.contracts.length === 0,
      'El suscriptor convertido no trae contrato: el detalle de servicio no tiene sujeto.',
    );
    const contractId = detail.contracts[0]!.id;
    await page.goto(`/dashboard/crm/subscribers/${id}/services/${contractId}`);
    await expect(page.getByRole('link', { name: 'Volver a servicios' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousAxeViolations(page, 'detalle de servicio');
    await page.getByRole('link', { name: 'Volver a servicios' }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/crm/subscribers/${id}`, 'u'));
  });

  test('CA-7/CA-8: densidad 1440×900, apilado en 375 px y axe claro/oscuro', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const id = await createConvertedSubscriber(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/dashboard/crm/subscribers/${id}`);
      await expect(region(page, 'Contacto')).toBeVisible();
      await expectNoSeriousAxeViolations(page, `ficha (${theme})`);
      const register = page.getByRole('button', { name: 'Registrar', exact: true });
      await register.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await expectNoSeriousAxeViolations(page, `menú Registrar (${theme})`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(register).toBeFocused();
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // CA-7: la Vista general de un titular con un servicio cabe sin desplazamiento a 1440×900.
    await page.goto(`/dashboard/crm/subscribers/${id}`);
    await expect(region(page, 'Actividad')).toBeVisible();
    const heights = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      inner: innerHeight,
    }));
    console.info('CA-7 1440x900', JSON.stringify(heights));
    expect(heights.scroll).toBeLessThanOrEqual(heights.inner);

    // CA-7: en 375 px no hay desborde horizontal y la columna izquierda va antes que la derecha.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(region(page, 'Contacto')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    const tops: number[] = [];
    for (const name of ['Servicios', 'Actividad', 'Contacto']) {
      const box = await region(page, name).boundingBox();
      expect(box, `tarjeta ${name} en 375 px`).not.toBeNull();
      tops.push(box!.y);
    }
    console.info('CA-7 375 order', JSON.stringify(tops));
    expect(tops[0]).toBeLessThan(tops[1]!);
    expect(tops[1]).toBeLessThan(tops[2]!);
  });
});
