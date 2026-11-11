import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

// Ola 5 (QA) · spec 2026-11-11 Cierre de venta (CA-1..CA-14, D7), ADR-109.
// Corre contra API y worker reales en el tenant de desarrollo de MOD11/MOD13
// (`E2E_TENANT_SLUG`, usuarios ADMIN, NOC y TECHNICIAN de `.env.development.local`).
// El aprovisionamiento llega a CERTIFIED por la API real de MOD13 (reserva + evidencia
// «service-test» + certificación del NOC), sin SQL. Los datos son sintéticos.

const API_PREFIX = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000') + '/api/v1';
const TENANT_SLUG = process.env.E2E_TENANT_SLUG;
const SITE_ID = process.env.E2E_MOD13_SITE_ID;
const REQUIRED = {
  E2E_TENANT_SLUG: TENANT_SLUG,
  E2E_MOD13_SITE_ID: SITE_ID,
  E2E_TENANT_ADMIN_EMAIL: process.env.E2E_TENANT_ADMIN_EMAIL,
  E2E_TENANT_ADMIN_PASSWORD: process.env.E2E_TENANT_ADMIN_PASSWORD,
  E2E_NOC_EMAIL: process.env.E2E_NOC_EMAIL,
  E2E_NOC_PASSWORD: process.env.E2E_NOC_PASSWORD,
  E2E_TECH_EMAIL: process.env.E2E_TECH_EMAIL,
  E2E_TECH_PASSWORD: process.env.E2E_TECH_PASSWORD,
};
const missingEnv = Object.entries(REQUIRED)
  .filter(([, value]) => !value?.trim())
  .map(([name]) => name);

const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);

type Dict = Record<string, unknown>;
type Session = { token: string; userId: string };
type Order = { id: string; version: number; status: string };
type Provisioning = { id: string; status: string; version: number; certifiedAt?: string | null };
type Generation = {
  generationId: string;
  status: string;
  documentSha256: string | null;
  failureReason: string | null;
  missingOperatorFields: string[];
};
type OperatorProfile = Dict & { equipmentIncidentReportChannel: string | null };

function headers(token?: string): Record<string, string> {
  return {
    'X-Tenant-Slug': TENANT_SLUG!,
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  };
}

function unwrap<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: unknown }).data;
    if (data !== undefined) return data as T;
  }
  return body as T;
}

async function raw(
  page: Page,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  data?: unknown,
  extra: Record<string, string> = {},
) {
  return page.request.fetch(API_PREFIX + path, {
    method,
    headers: { ...headers(token), ...extra },
    ...(data !== undefined ? { data } : {}),
  });
}

async function api<T>(
  page: Page,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  data?: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const response = await raw(page, token, method, path, data, extra);
  const body: unknown = await response.json().catch(() => ({}));
  const code = (body as { code?: unknown })?.code;
  expect(
    response.ok(),
    `API ${method} ${path}: HTTP ${response.status()} code=${typeof code === 'string' ? code : '-'} ${response.ok() ? '' : JSON.stringify(body).slice(0, 300)}`,
  ).toBe(true);
  return unwrap<T>(body);
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as T[];
  throw new Error('La API no devolvió una lista.');
}

async function login(page: Page, email: string, password: string): Promise<Session> {
  const response = await page.request.post(API_PREFIX + '/auth/login', {
    headers: { 'X-Tenant-Slug': TENANT_SLUG! },
    data: { email, password },
  });
  expect(response.status(), 'Inicio de sesión E2E').toBe(200);
  const token = ((await response.json()) as { data?: { accessToken?: string } }).data?.accessToken;
  expect(typeof token).toBe('string');
  const payload = JSON.parse(Buffer.from(token!.split('.')[1] ?? '', 'base64url').toString()) as {
    sub: string;
  };
  return { token: token!, userId: payload.sub };
}

async function expectNoSeriousAxeViolations(page: Page, scope: string, label: string) {
  const result = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  console.info(
    `axe ${label}`,
    JSON.stringify(
      result.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length })),
    ),
  );
  expect(blocking, `axe ${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => window.localStorage.setItem('iwana-theme', value), theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (theme === 'dark') await expect(page.locator('html.dark')).toBeAttached();
  else await expect(page.locator('html.dark')).toHaveCount(0);
}

/** Bogotá no tiene horario de verano: la fecha civil local del instante. */
function tenantLocalDate(iso: string, timeZone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

async function uploadEvidence(
  page: Page,
  tech: Session,
  orderId: string,
  evidenceType: 'PHOTO' | 'SIGNATURE',
  requirementKey: string,
): Promise<{ id: string; mediaAssetId: string }> {
  const requestId = randomUUID();
  const boundary = '----iwanaCierre' + requestId.replace(/-/gu, '');
  const crlf = '\r\n';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="e-${requestId}.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
    ),
    JPG,
    Buffer.from(`${crlf}--${boundary}--${crlf}`),
  ]);
  const order = await api<Order>(page, tech.token, 'GET', '/tasks/execution-orders/' + orderId);
  const upload = await page.request.post(
    API_PREFIX + '/tasks/execution-orders/' + orderId + '/evidence-assets',
    {
      headers: {
        ...headers(tech.token),
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'If-Match': String(order.version),
        'Idempotency-Key': 'cierre-upload-' + requestId,
      },
      data: body,
    },
  );
  expect(upload.status(), 'Carga de evidencia').toBe(202);
  const mediaAssetId = unwrap<{ mediaAssetId: string }>(await upload.json()).mediaAssetId;
  // El análisis corre en el worker; las rutas /evidence tienen cuota de 10/min.
  await page.waitForTimeout(10_000);
  const current = await api<Order>(page, tech.token, 'GET', '/tasks/execution-orders/' + orderId);
  return api<{ id: string; mediaAssetId: string }>(
    page,
    tech.token,
    'POST',
    '/tasks/execution-orders/' + orderId + '/evidence',
    {
      mediaAssetId,
      evidenceType,
      requirementKey,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      capturedAt: new Date().toISOString(),
    },
    { 'If-Match': String(current.version), 'Idempotency-Key': 'cierre-reg-' + requestId },
  );
}

/** Expediente → suscriptor → contrato DRAFT (sin activar) con precio y ciclo. */
async function createDraftContract(
  page: Page,
  admin: Session,
  plan: { id: string; name: string },
  suffix: string,
) {
  const email = `cierre-${suffix}@example.invalid`;
  const expediente = await api<{ id: string }>(page, admin.token, 'POST', '/crm/expedientes', {
    fullName: 'Titular cierre ' + suffix,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: 'Fixture E2E cierre de venta ' + suffix,
  });
  const sections: Array<[string, Dict]> = [
    [
      'identification',
      {
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumber: 'CV' + suffix.slice(0, 10),
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
      { acquisitionChannel: 'WEB', sourceDetail: 'Fixture ' + suffix, interestedPlanId: plan.id },
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
    await api(page, admin.token, 'PATCH', `/crm/expedientes/${expediente.id}/sections/${section}`, {
      data,
    });
  }
  await api(page, admin.token, 'POST', '/privacy/legal-texts', {
    type: 'AUTORIZACION',
    version: 'cierre-' + suffix.slice(0, 20),
    content: 'Texto de autorización sintético para la prueba E2E de cierre de venta.',
  });
  const legal = await api<{ version: string }>(
    page,
    admin.token,
    'GET',
    '/privacy/legal-texts/current?type=AUTORIZACION',
  );
  await api(page, admin.token, 'POST', `/crm/expedientes/${expediente.id}/consents`, {
    consentType: 'TRATAMIENTO_DATOS',
    status: 'ACEPTADO',
    channel: 'TELEFONO',
    legalTextVersion: legal.version,
    evidenceRef: 'cierre-venta:' + suffix,
  });
  for (const targetStatus of [
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ]) {
    await api(page, admin.token, 'PATCH', `/crm/expedientes/${expediente.id}/status`, {
      targetStatus,
    });
  }
  const findSubscriber = async () => {
    const rows = asList<{ id: string }>(
      await api<unknown>(page, admin.token, 'POST', '/crm/subscribers/search', { email }),
    );
    return rows[0]?.id ?? null;
  };
  await expect.poll(findSubscriber, { timeout: 30_000 }).not.toBeNull();
  const subscriberId = (await findSubscriber())!;
  await api(page, admin.token, 'PATCH', '/crm/subscribers/' + subscriberId, {
    vatResponsibility: 'NO_RESPONSABLE',
    rutResponsibilities: ['R-99-PN'],
  });
  const cycles = await api<Dict[]>(page, admin.token, 'GET', '/crm/billing-cycles');
  const cycleDay = cycles.find((c) => c['active'] === true && Number.isInteger(c['cycleDay']))?.[
    'cycleDay'
  ];
  expect(typeof cycleDay, 'Ciclo de facturación activo en el tenant').toBe('number');
  const contract = await api<{ id: string; status: string }>(
    page,
    admin.token,
    'POST',
    `/crm/subscribers/${subscriberId}/contracts`,
    {
      subscriberId,
      planId: plan.id,
      planSnapshotJson: {
        id: plan.id,
        name: plan.name,
        vatConcept: 'INTERNET_ACCESS',
        monthlyPrice: 80000,
      },
      alias: 'Servicio cierre ' + suffix,
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      customerSegment: 'RESIDENTIAL',
      installationAddress: 'Carrera de prueba 999',
      installationCity: 'Bogotá',
      installationDepartment: 'Cundinamarca',
      installationPostalCode: '110111',
      billingCycleDay: cycleDay,
    },
  );
  expect(contract.status).toBe('DRAFT');
  return { subscriberId, contractId: contract.id, email };
}

async function drawSignature(canvas: Locator, page: Page) {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(
      box.x + box.width * (0.15 + i * 0.05),
      box.y + box.height * (0.6 - Math.sin(i / 2) * 0.25),
      { steps: 3 },
    );
  }
  await page.mouse.up();
}

test.describe('MOD05 · Cierre de venta con contrato firmado en la OT (live)', () => {
  test.skip(missingEnv.length > 0, `Entorno E2E real omitido; faltan: ${missingEnv.join(', ')}.`);
  test.describe.configure({ mode: 'serial' });

  test('CA-1/2/3/4/5/9/11/12: genera, firma en la consola, activa y cobra una vez', async ({
    page,
    browser,
  }) => {
    test.setTimeout(480_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect((await page.request.get(API_PREFIX + '/health')).status()).toBe(200);
    expect(TENANT_SLUG).not.toBe('tenant_iwana');

    const admin = await login(
      page,
      REQUIRED.E2E_TENANT_ADMIN_EMAIL!,
      REQUIRED.E2E_TENANT_ADMIN_PASSWORD!,
    );
    const noc = await login(page, REQUIRED.E2E_NOC_EMAIL!, REQUIRED.E2E_NOC_PASSWORD!);
    const tech = await login(page, REQUIRED.E2E_TECH_EMAIL!, REQUIRED.E2E_TECH_PASSWORD!);
    const suffix = (Date.now().toString(36) + randomUUID().replace(/-/gu, '')).slice(0, 16);

    // ── Datos de la empresa (razón social/NIT en el perfil) y plantilla aprobada (CA-6) ──
    await test.step('Perfil de la empresa y plantilla CONTRATO_SERVICIO aprobada', async () => {
      await api(page, admin.token, 'PATCH', '/tenants/me/profile', {
        legalName: 'Operador Sintético QA S.A.S.',
        nit: '900000001',
      });
      // CA-6: sin la declaración de aprobación jurídica no se publica la plantilla.
      const unapproved = await raw(page, admin.token, 'POST', '/privacy/legal-texts', {
        type: 'CONTRATO_SERVICIO',
        version: 'sin-aprobar-' + suffix.slice(0, 10),
        format: 'HTML',
        content: '<p>Plantilla sin aprobación</p>',
      });
      expect(unapproved.status(), 'Plantilla sin declaración rechazada').toBe(400);
      // Se publica siempre una versión nueva desde la semilla vigente del repo: el worker
      // renderiza el texto publicado (no el archivo), así la prueba sigue a la plantilla actual.
      {
        const html = readFileSync(
          resolve(
            dirname(fileURLToPath(import.meta.url)),
            '../../apps/worker/src/templates/contracts/contrato-servicio.base.html',
          ),
          'utf8',
        );
        await api(page, admin.token, 'POST', '/privacy/legal-texts', {
          type: 'CONTRATO_SERVICIO',
          version: 'qa-' + suffix.slice(0, 12),
          format: 'HTML',
          content: html,
          legalApprovalDeclaration: 'APROBADO_POR_ASESORIA_JURIDICA',
        });
      }
    });

    // CA-11 (parte 1): se deja vacío un dato obligatorio del operador por API.
    const profile = await api<OperatorProfile>(
      page,
      admin.token,
      'GET',
      '/organization/contract-profile',
    );
    await api(page, admin.token, 'PUT', '/organization/contract-profile', {
      qualityAndCoverageUrl: 'https://operador-qa.example.invalid/calidad',
      customerServiceChannels: [{ kind: 'PHONE', value: '6010000000', label: 'Línea de atención' }],
      reconnectionFee: 15000,
      annualIncreaseCapPercent: 5,
      equipmentIncidentReportChannel: null,
      otherConditions: profile['otherConditions'] ?? null,
    });

    // ── Plan, contrato DRAFT, OT de instalación y aprovisionamiento CERTIFIED ──
    const plan = await api<{ id: string; name: string }>(
      page,
      admin.token,
      'POST',
      '/commercial/catalog/plans',
      {
        name: 'Plan cierre ' + suffix,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 100,
        installationRule: 'ON_DEMAND',
      },
    );
    // El snapshot del contrato toma el precio vigente del plan para el segmento.
    await api(page, admin.token, 'POST', `/commercial/catalog/${plan.id}/prices`, {
      customerSegment: 'RESIDENTIAL',
      basePrice: '80000.00',
      installationFee: '0',
    });
    await api(page, noc.token, 'PUT', '/network/plan-profiles/' + plan.id, {
      pcqAddressList: 'cierre_' + suffix.slice(0, 10),
    });
    const { subscriberId, contractId } = await createDraftContract(page, admin, plan, suffix);

    const dispatched = await api<Order>(
      page,
      noc.token,
      'POST',
      '/tasks/execution-orders/dispatch',
      {
        originContext: 'MANUAL',
        workType: 'INSTALLATION',
        organizationSiteId: SITE_ID,
        customerDisplayLabel: 'Titular cierre ' + suffix,
        serviceAddress: 'Dirección de prueba ' + suffix,
        municipality: 'Bogotá',
        sector: 'Sector de pruebas',
        workSummary: 'Instalación sintética cierre de venta ' + suffix,
        subscriberId,
      },
    );
    const createdOrder = await api<Order>(
      page,
      noc.token,
      'GET',
      '/tasks/execution-orders/' + dispatched.id,
    );
    await api<Order>(
      page,
      noc.token,
      'POST',
      `/tasks/execution-orders/${dispatched.id}/assign`,
      { assigneeType: 'TECHNICIAN', assigneeId: tech.userId },
      {
        'If-Match': String(createdOrder.version),
        'Idempotency-Key': 'cierre-assign-' + randomUUID(),
      },
    );
    const assigned = await api<Order>(
      page,
      tech.token,
      'GET',
      '/tasks/execution-orders/' + dispatched.id,
    );
    const started = await api<Order>(
      page,
      tech.token,
      'POST',
      `/tasks/execution-orders/${assigned.id}/start`,
      {},
      { 'If-Match': String(assigned.version), 'Idempotency-Key': 'cierre-start-' + randomUUID() },
    );
    expect(started.status).toBe('IN_PROGRESS');
    const orderId = started.id;

    const servicePhoto = await uploadEvidence(page, tech, orderId, 'PHOTO', 'service-test');

    const networks = asList<{ cidr: string }>(
      await api<unknown>(page, noc.token, 'GET', '/network/ipv4-networks?limit=100'),
    );
    const used = new Set(networks.map((n) => n.cidr));
    const cidr = Array.from({ length: 256 }, (_, i) => `10.251.${i}.0/24`).find(
      (c) => !used.has(c),
    )!;
    const base = cidr.split('/')[0]!.split('.').slice(0, 3).join('.');
    const router = await api<{ id: string }>(page, noc.token, 'POST', '/network/routers', {
      name: 'cierre-router-' + suffix,
      managementHost: `cierre-${suffix}.router.invalid`,
      organizationSiteId: SITE_ID,
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'],
    });
    const network = await api<{ id: string }>(page, noc.token, 'POST', '/network/ipv4-networks', {
      routerId: router.id,
      name: 'cierre-network-' + suffix,
      cidr,
      gateway: `${base}.1`,
      assignableFrom: `${base}.10`,
      assignableTo: `${base}.250`,
      excludedIps: [],
      defaultControlMethod: 'PCQ_ADDRESS_LIST',
    });
    const reserved = await api<Provisioning>(
      page,
      noc.token,
      'POST',
      '/network/provisioning/reserve',
      {
        executionOrderId: orderId,
        routerId: router.id,
        ipv4NetworkId: network.id,
        contractId,
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'cierre_' + suffix.slice(0, 10) },
      },
    );
    expect(reserved.status).toBe('RESERVED');

    // ── Antes de certificar: el paso existe pero no se opera (D7) ──
    // AxeBuilder exige una página creada desde un contexto explícito.
    const techContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3002' });
    const techPage = await techContext.newPage();
    await techPage.setViewportSize({ width: 1440, height: 1000 });
    await seedPortalSession(techPage, { token: tech.token, tenantSlug: TENANT_SLUG! });
    const consoleUrl = '/dashboard/operations/execution-orders?executionOrderId=' + orderId;
    const contractStep = techPage.getByRole('region', { name: 'Contrato', exact: true });
    await test.step('Paso Contrato deshabilitado sin certificación', async () => {
      await techPage.goto(consoleUrl, { waitUntil: 'domcontentloaded' });
      await expect(contractStep).toBeVisible({ timeout: 60_000 });
      await expect(contractStep.getByText('No disponible', { exact: true })).toBeVisible();
      await expect(contractStep.getByRole('button', { name: 'Generar contrato' })).toHaveCount(0);
    });

    const certified = await api<Provisioning>(
      page,
      noc.token,
      'POST',
      `/network/provisioning/${reserved.id}/certify`,
      { evidenceId: servicePhoto.id, version: reserved.version },
    );
    expect(certified.status).toBe('CERTIFIED');
    const context = await api<{
      provisioning: { certifiedAt: string | null; contractId?: string };
    }>(page, noc.token, 'GET', `/network/provisioning/orders/${orderId}/context`);
    const certifiedAt = context.provisioning.certifiedAt ?? certified.certifiedAt ?? null;
    expect(certifiedAt).toBeTruthy();

    // ── CA-5: con servicio certificado y sin firma, la ficha muestra «Pendiente de firma» ──
    await seedPortalSession(page, { token: admin.token, tenantSlug: TENANT_SLUG! });
    await test.step('Insignia «Pendiente de firma» en la ficha antes de firmar', async () => {
      await page.goto('/dashboard/crm/subscribers/' + subscriberId, {
        waitUntil: 'domcontentloaded',
      });
      // Soft: un fallo aquí no oculta el resto del flujo, pero sigue haciendo fallar el test.
      await expect
        .soft(page.getByText('Pendiente de firma', { exact: true }).first())
        .toBeVisible({ timeout: 30_000 });
    });

    // ── CA-11: generar con un dato del operador faltante indica cuál ──
    await test.step('Generación falla indicando el dato del operador que falta', async () => {
      await techPage.goto(consoleUrl, { waitUntil: 'domcontentloaded' });
      await expect(contractStep.getByText('Pendiente de firma', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await contractStep.getByRole('button', { name: 'Generar contrato' }).click();
      await expect(
        contractStep.getByText('Faltan datos de la empresa para el contrato'),
      ).toBeVisible({ timeout: 90_000 });
      await expect(
        contractStep
          .getByRole('list', { name: 'Datos de la empresa que faltan' })
          .getByText('Canal de reporte de hurto o daño de equipos'),
      ).toBeVisible();
    });

    await test.step('El administrador completa el dato en Configuración › Organización', async () => {
      await page.goto('/dashboard/settings/organization', { waitUntil: 'domcontentloaded' });
      const field = page.getByLabel('Canal de reporte de hurto o daño de equipos');
      await expect(field).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText('Faltan datos obligatorios para generar contratos'),
      ).toBeVisible();
      await field.fill('Línea 6010000000 o soporte@operador-qa.example.invalid');
      const saved = page.waitForResponse(
        (r) => r.url().includes('/organization/contract-profile') && r.request().method() === 'PUT',
      );
      await page.getByRole('button', { name: 'Guardar datos del operador' }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByText('Faltan datos obligatorios para generar contratos')).toHaveCount(
        0,
      );
    });

    // ── CA-1: generar → PDF visible → firmar (lienzo) → «Contrato firmado» ──
    let generation: Generation | null = null;
    await test.step('Generar de nuevo y leer el PDF', async () => {
      const generated = techPage.waitForResponse(
        (r) => r.url().includes('/document-generations') && r.request().method() === 'POST',
      );
      await contractStep.getByRole('button', { name: 'Generar de nuevo' }).click();
      expect((await generated).status()).toBeLessThan(300);
      await expect(contractStep.getByText('Generando contrato…').first()).toBeAttached();
      const frame = contractStep.locator('iframe[title="Contrato para leer con el cliente"]');
      await expect(frame).toBeVisible({ timeout: 120_000 });
      await expect(frame).toHaveAttribute('src', /^blob:/u);
      generation = await api<Generation>(
        page,
        tech.token,
        'GET',
        `/crm/contracts/${contractId}/document-generations/latest?executionOrderId=${orderId}`,
      );
      expect(generation.status).toBe('READY');
      expect(generation.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
      // CA-12: sin enlace de descarga en el paso.
      await expect(contractStep.getByRole('link', { name: /descargar/iu })).toHaveCount(0);
      await expect(contractStep.getByLabel('Nombre completo')).toHaveValue(/Titular/u);
    });

    // CA-4: la firma se ata a la huella mostrada; otra huella se rechaza.
    await test.step('Firma con huella alterada rechazada (CA-4)', async () => {
      const tampered = await raw(
        page,
        tech.token,
        'POST',
        `/crm/contracts/${contractId}/signature`,
        {
          idempotencyKey: randomUUID(),
          generationId: generation!.generationId,
          documentSha256: '0'.repeat(64),
          executionOrderId: orderId,
          signatureImage:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signer: { fullName: 'Titular QA', documentType: 'CC', documentNumber: 'CV12345' },
          location: null,
          device: { userAgent: 'e2e', platform: null },
        },
      );
      expect(tampered.status()).toBe(409);
      expect(((await tampered.json()) as { code?: string }).code).toBe(
        'CONTRACT_DOCUMENT_HASH_MISMATCH',
      );
    });

    // axe en el paso Contrato, claro y oscuro, con el PDF y el lienzo visibles.
    await test.step('axe sin violaciones serias en el paso Contrato (claro y oscuro)', async () => {
      const frame = contractStep.locator('iframe[title="Contrato para leer con el cliente"]');
      const stepSelector = async () => {
        const labelledBy = await contractStep.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        return techPage.evaluate(
          (id) => `section[aria-labelledby="${CSS.escape(id)}"]`,
          labelledBy!,
        );
      };
      await expectNoSeriousAxeViolations(techPage, await stepSelector(), 'paso Contrato claro');
      await applyTheme(techPage, 'dark');
      await expect(frame).toBeVisible({ timeout: 60_000 });
      await expectNoSeriousAxeViolations(techPage, await stepSelector(), 'paso Contrato oscuro');
      await applyTheme(techPage, 'light');
      await expect(frame).toBeVisible({ timeout: 60_000 });
    });

    let signResponse: Dict = {};
    await test.step('Firmar en el lienzo → «Contrato firmado»', async () => {
      const canvas = contractStep.getByRole('img', { name: 'Área de firma' });
      await drawSignature(canvas, techPage);
      const signed = techPage.waitForResponse(
        (r) =>
          r.url().endsWith(`/crm/contracts/${contractId}/signature`) &&
          r.request().method() === 'POST',
        { timeout: 90_000 },
      );
      await contractStep.getByRole('button', { name: 'Firmar contrato' }).click();
      const response = await signed;
      expect(response.status()).toBeLessThan(300);
      signResponse = unwrap<Dict>(await response.json());
      await expect(contractStep.getByRole('heading', { name: 'Contrato firmado' })).toBeVisible();
      await expect(contractStep.getByText('Firmado', { exact: true })).toBeVisible();
      await expect(contractStep.locator('iframe')).toHaveCount(0);
    });

    // ── CA-2: ACTIVE con inicio de cobro = fecha de certificación (D7) ──
    const expectedStart = tenantLocalDate(certifiedAt!);
    expect(signResponse['status']).toBe('ACTIVE');
    expect(signResponse['billingStartDate']).toBe(expectedStart);
    expect(signResponse['signedDocumentSha256']).toMatch(/^[a-f0-9]{64}$/u);
    const contract = await api<{ status: string; startDate: string | null }>(
      page,
      admin.token,
      'GET',
      '/crm/contracts/' + contractId,
    );
    expect(contract.status).toBe('ACTIVE');
    expect(contract.startDate?.slice(0, 10)).toBe(expectedStart);

    // ── CA-3: MOD14 genera el primer cobro sin esperar el lote, una sola vez ──
    const documentsFor = async () =>
      asList<{ id: string }>(
        await api<unknown>(
          page,
          admin.token,
          'GET',
          `/billing/documents?subscriberId=${subscriberId}&limit=50`,
        ),
      ).length;
    await expect.poll(documentsFor, { timeout: 90_000, intervals: [1_000, 2_000, 5_000] }).toBe(1);
    await page.waitForTimeout(5_000);
    expect(await documentsFor(), 'El primer cobro no se duplica').toBe(1);

    // ── CA-12: después de firmar el técnico no reabre ni descarga el PDF ──
    const reopen = await raw(
      page,
      tech.token,
      'GET',
      `/crm/contracts/${contractId}/document-generations/${generation!.generationId}/document?executionOrderId=${orderId}`,
    );
    expect(reopen.status()).toBe(403);
    expect(((await reopen.json()) as { code?: string }).code).toBe('CONTRACT_DOCUMENT_SIGNED');
    const techDownload = await raw(
      page,
      tech.token,
      'GET',
      `/crm/contracts/${contractId}/signed-document`,
    );
    expect(techDownload.status()).toBe(403);
    // Repetir la firma no reactiva ni duplica.
    const again = await raw(page, tech.token, 'POST', `/crm/contracts/${contractId}/signature`, {
      idempotencyKey: randomUUID(),
      generationId: generation!.generationId,
      documentSha256: generation!.documentSha256,
      executionOrderId: orderId,
      signatureImage:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      signer: { fullName: 'Titular QA', documentType: 'CC', documentNumber: 'CV12345' },
      location: null,
      device: { userAgent: 'e2e', platform: null },
    });
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { code?: string }).code).toBe('CONTRACT_NOT_DRAFT');

    // ── CA-9 / CA-4: fila «Contrato firmado» en Documentos; descarga verifica la huella ──
    await test.step('Fila «Contrato firmado» en Documentos y sin insignia pendiente', async () => {
      await page.goto('/dashboard/crm/subscribers/' + subscriberId, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('Pendiente de firma', { exact: true })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
      const table = page.getByRole('list', { name: 'Documentos del suscriptor' });
      await expect(table.getByText(/^Contrato firmado/u).first()).toBeVisible({ timeout: 30_000 });
      const pdf = await raw(
        page,
        admin.token,
        'GET',
        `/crm/contracts/${contractId}/signed-document`,
      );
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()['content-type']).toContain('application/pdf');
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    });

    await techContext.close();
  });
});
