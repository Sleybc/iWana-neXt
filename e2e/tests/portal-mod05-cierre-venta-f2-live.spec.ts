import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  API_PREFIX,
  REQUIRED,
  SITE_ID,
  TENANT_SLUG,
  api,
  asList,
  drawSignature,
  login,
  missingEnv,
  raw,
  uploadEvidence,
  type Dict,
  type Generation,
  type Order,
  type Provisioning,
  type Session,
} from './helpers/cierre-venta-live';
import { seedPortalSession } from './helpers/portal-session';

// QA · spec 2026-11-11 Cierre de venta fase 2 (contrato automático e instalación), CA-1 a CA-6.
// API y worker reales del `pnpm dev` en el tenant de desarrollo (`E2E_TENANT_SLUG`); datos
// sintéticos. CA-7 (retiro de connection_fee) se cubre en la migración 191 y sus pruebas.

const INSTALLATION_FEE = 90_000;
const PERMANENCE_DISCOUNT = 30_000;

type ContractView = {
  id: string;
  status: string;
  expedienteId?: string | null;
  billingCycleDay: number | null;
  billingCycleMissing?: boolean;
  installationFee: number | null;
  serviceUsage?: string | null;
  installationStratum?: number | null;
};
type DocumentLine = {
  kind: string;
  description: string;
  unitPrice: string;
  baseAmount: string;
};

/** Oportunidad con plan y punto de servicio, sin ciclo de facturación, hasta EN_COTIZACION. */
async function createOpportunity(page: Page, admin: Session, planId: string, suffix: string) {
  const email = `cierre-f2-${suffix}@example.invalid`;
  const expediente = await api<{ id: string }>(page, admin.token, 'POST', '/crm/expedientes', {
    fullName: 'Titular fase dos ' + suffix,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: 'Fixture E2E cierre de venta fase 2 ' + suffix,
  });
  const sections: Array<[string, Dict]> = [
    [
      'identification',
      {
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumber: 'CF' + suffix.slice(0, 10),
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
        address: 'Carrera de prueba 998',
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
      { acquisitionChannel: 'WEB', sourceDetail: 'Fixture ' + suffix, interestedPlanId: planId },
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
    version: 'cierre-f2-' + suffix.slice(0, 18),
    content: 'Texto de autorización sintético para la prueba E2E de cierre de venta fase 2.',
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
    evidenceRef: 'cierre-venta-f2:' + suffix,
  });
  for (const targetStatus of ['PRECALIFICADO', 'VALIDANDO_COBERTURA', 'EN_COTIZACION']) {
    await api(page, admin.token, 'PATCH', `/crm/expedientes/${expediente.id}/status`, {
      targetStatus,
    });
  }
  return { expedienteId: expediente.id, email };
}

async function setStatus(page: Page, admin: Session, expedienteId: string, targetStatus: string) {
  await api(page, admin.token, 'PATCH', `/crm/expedientes/${expedienteId}/status`, {
    targetStatus,
  });
}

test.describe('MOD05 · Cierre de venta fase 2: contrato automático e instalación (live)', () => {
  test.skip(missingEnv.length > 0, `Entorno E2E real omitido; faltan: ${missingEnv.join(', ')}.`);
  test.describe.configure({ mode: 'serial' });

  test('CA-1..CA-6: borrador automático, falta ciclo, firma y primer cobro con instalación', async ({
    page,
    browser,
  }) => {
    test.setTimeout(600_000);
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

    // ── Plan con instalación 90.000 y oferta de permanencia (descuento 30.000) ──
    const plan = await api<{ id: string; name: string }>(
      page,
      admin.token,
      'POST',
      '/commercial/catalog/plans',
      {
        name: 'Plan cierre f2 ' + suffix,
        vatConcept: 'INTERNET_ACCESS',
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 100,
        installationRule: 'ON_DEMAND',
      },
    );
    await api(page, admin.token, 'POST', `/commercial/catalog/${plan.id}/prices`, {
      customerSegment: 'RESIDENTIAL',
      basePrice: '80000.00',
      installationFee: String(INSTALLATION_FEE),
    });
    const offer = await api<Dict>(
      page,
      admin.token,
      'PUT',
      `/commercial/catalog/${plan.id}/permanence-offer`,
      { offersPermanence: true, months: 3, discountedOrDeferredAmount: PERMANENCE_DISCOUNT },
    );
    expect(offer['installationFee'], 'La oferta lee installation_fee (CA-7)').toBe(
      INSTALLATION_FEE,
    );
    await api(page, noc.token, 'PUT', '/network/plan-profiles/' + plan.id, {
      pcqAddressList: 'cf2_' + suffix.slice(0, 10),
    });

    const { expedienteId, email } = await createOpportunity(page, admin, plan.id, suffix);
    const findSubscriber = async () => {
      const rows = asList<{ id: string }>(
        await api<unknown>(page, admin.token, 'POST', '/crm/subscribers/search', { email }),
      );
      return rows[0]?.id ?? null;
    };
    const contractsOf = async (subscriberId: string) =>
      asList<ContractView>(
        await api<unknown>(page, admin.token, 'GET', `/crm/subscribers/${subscriberId}/contracts`),
      );

    // ── CA-3: el suscriptor nuevo no tiene datos tributarios → aviso, sin contrato ──
    await setStatus(page, admin, expedienteId, 'LISTO_PARA_INSTALACION');
    await expect.poll(findSubscriber, { timeout: 30_000 }).not.toBeNull();
    const subscriberId = (await findSubscriber())!;
    const readIssue = async () =>
      (
        await api<{ contractAutoCreationIssue?: { missing: string[] } | null }>(
          page,
          admin.token,
          'GET',
          '/crm/subscribers/' + subscriberId,
        )
      ).contractAutoCreationIssue ?? null;
    await expect.poll(readIssue, { timeout: 30_000 }).not.toBeNull();
    const issue = (await readIssue())!;
    expect(issue.missing).toContain('VAT_RESPONSIBILITY');
    expect(await contractsOf(subscriberId), 'Sin datos obligatorios no se crea').toHaveLength(0);

    await seedPortalSession(page, { token: admin.token, tenantSlug: TENANT_SLUG! });
    await test.step('Aviso «No se pudo crear el contrato» en la ficha (CA-3)', async () => {
      await page.goto('/dashboard/crm/subscribers/' + subscriberId, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByText('No se pudo crear el contrato automáticamente')).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page
          .getByRole('list', { name: 'Datos que faltan para el contrato' })
          .getByText('Responsabilidad de IVA', { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Completar datos', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Crear contrato', exact: true })).toBeVisible();
    });

    // ── CA-1: completados los datos, el evento repetido crea un único borrador ──
    await api(page, admin.token, 'PATCH', '/crm/subscribers/' + subscriberId, {
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: ['R-99-PN'],
    });
    // Reintento: completar el dato que faltaba crea el borrador sin repetir el evento.
    expect(
      await contractsOf(subscriberId),
      'Completar los datos con aviso pendiente reintenta y crea el contrato',
    ).toHaveLength(1);
    for (let i = 0; i < 2; i += 1) {
      await setStatus(page, admin, expedienteId, 'EN_COTIZACION');
      await setStatus(page, admin, expedienteId, 'LISTO_PARA_INSTALACION');
      await expect
        .poll(async () => (await contractsOf(subscriberId)).length, { timeout: 30_000 })
        .toBe(1);
    }
    await page.waitForTimeout(3_000);
    const contracts = await contractsOf(subscriberId);
    expect(contracts, 'Un solo contrato aunque el evento se repita (CA-1)').toHaveLength(1);
    const contractId = contracts[0]!.id;
    const draft = await api<ContractView>(page, admin.token, 'GET', '/crm/contracts/' + contractId);
    expect(draft.status).toBe('DRAFT');
    // CA-2: la oportunidad no tiene ciclo → borrador sin ciclo.
    expect(draft.billingCycleDay).toBeNull();
    expect(draft.billingCycleMissing).toBe(true);
    // CA-6: el cargo queda congelado en el contrato al crearlo.
    expect(Number(draft.installationFee)).toBe(INSTALLATION_FEE);
    expect(await readIssue(), 'El aviso se limpia al crear el contrato').toBeNull();
    // D1: el uso del servicio se deriva de la oportunidad (NATURAL + segmento RESIDENTIAL →
    // RESIDENTIAL, ADR-093) con el estrato del punto; sin él la firma daría 422.
    expect(draft.serviceUsage, 'Uso del servicio tomado de la oportunidad').toBe('RESIDENTIAL');
    expect(draft.installationStratum, 'Estrato tomado de la oportunidad').toBe(3);

    await test.step('Ficha: «Falta ciclo de facturación» (CA-2)', async () => {
      await page.goto('/dashboard/crm/subscribers/' + subscriberId, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText('No se pudo crear el contrato automáticamente')).toHaveCount(0);
      const servicesTab = page.getByRole('tab', { name: /^Servicios/u });
      if (await servicesTab.count()) await servicesTab.first().click();
      await expect(page.getByText('Falta ciclo de facturación').first()).toBeVisible({
        timeout: 30_000,
      });
    });

    // ── CA-5: permanencia aceptada en el borrador ──
    const permanence = await api<{ permanence: Dict }>(
      page,
      admin.token,
      'PUT',
      `/crm/contracts/${contractId}/permanence`,
      { accepted: true },
    );
    expect(permanence.permanence['accepted']).toBe(true);
    expect(Number(permanence.permanence['connectionFee'])).toBe(INSTALLATION_FEE);
    expect(Number(permanence.permanence['discountedOrDeferredAmount'])).toBe(PERMANENCE_DISCOUNT);

    // ── OT de instalación y aprovisionamiento CERTIFIED (API real de MOD13) ──
    const dispatched = await api<Order>(
      page,
      noc.token,
      'POST',
      '/tasks/execution-orders/dispatch',
      {
        originContext: 'MANUAL',
        workType: 'INSTALLATION',
        organizationSiteId: SITE_ID,
        customerDisplayLabel: 'Titular fase dos ' + suffix,
        serviceAddress: 'Dirección de prueba ' + suffix,
        municipality: 'Bogotá',
        sector: 'Sector de pruebas',
        workSummary: 'Instalación sintética cierre de venta fase 2 ' + suffix,
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
      { 'If-Match': String(createdOrder.version), 'Idempotency-Key': 'cf2-assign-' + randomUUID() },
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
      { 'If-Match': String(assigned.version), 'Idempotency-Key': 'cf2-start-' + randomUUID() },
    );
    expect(started.status).toBe('IN_PROGRESS');
    const orderId = started.id;
    const servicePhoto = await uploadEvidence(page, tech, orderId, 'PHOTO', 'service-test');
    const networks = asList<{ cidr: string }>(
      await api<unknown>(page, noc.token, 'GET', '/network/ipv4-networks?limit=100'),
    );
    const used = new Set(networks.map((n) => n.cidr));
    const cidr = Array.from({ length: 256 }, (_, i) => `10.252.${i}.0/24`).find(
      (c) => !used.has(c),
    )!;
    const base = cidr.split('/')[0]!.split('.').slice(0, 3).join('.');
    const router = await api<{ id: string }>(page, noc.token, 'POST', '/network/routers', {
      name: 'cf2-router-' + suffix,
      managementHost: `cf2-${suffix}.router.invalid`,
      organizationSiteId: SITE_ID,
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'],
    });
    const network = await api<{ id: string }>(page, noc.token, 'POST', '/network/ipv4-networks', {
      routerId: router.id,
      name: 'cf2-network-' + suffix,
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
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'cf2_' + suffix.slice(0, 10) },
      },
    );
    const certified = await api<Provisioning>(
      page,
      noc.token,
      'POST',
      `/network/provisioning/${reserved.id}/certify`,
      { evidenceId: servicePhoto.id, version: reserved.version },
    );
    expect(certified.status).toBe('CERTIFIED');

    // ── Generar el contrato en la consola del técnico ──
    const techContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3002' });
    const techPage = await techContext.newPage();
    await techPage.setViewportSize({ width: 1440, height: 1000 });
    await seedPortalSession(techPage, { token: tech.token, tenantSlug: TENANT_SLUG! });
    const consoleUrl = '/dashboard/operations/execution-orders?executionOrderId=' + orderId;
    const contractStep = techPage.getByRole('region', { name: 'Contrato', exact: true });
    let generation: Generation | null = null;
    await test.step('Generar el contrato y verlo', async () => {
      await techPage.goto(consoleUrl, { waitUntil: 'domcontentloaded' });
      await expect(contractStep).toBeVisible({ timeout: 60_000 });
      await expect(contractStep.getByText('Falta ciclo de facturación')).toBeVisible({
        timeout: 60_000,
      });
      await contractStep.getByRole('button', { name: 'Generar contrato' }).click();
      const frame = contractStep.locator('iframe[title="Contrato para leer con el cliente"]');
      await expect(frame).toBeVisible({ timeout: 120_000 });
      generation = await api<Generation>(
        page,
        tech.token,
        'GET',
        `/crm/contracts/${contractId}/document-generations/latest?executionOrderId=${orderId}`,
      );
      expect(generation.status).toBe('READY');
    });

    // ── CA-2: la firma responde 409 BILLING_CYCLE_REQUIRED sin ciclo ──
    const signBody = () => ({
      idempotencyKey: randomUUID(),
      generationId: generation!.generationId,
      documentSha256: generation!.documentSha256,
      executionOrderId: orderId,
      signatureImage:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      signer: { fullName: 'Titular QA', documentType: 'CC', documentNumber: 'CF12345' },
      location: null,
      device: { userAgent: 'e2e', platform: null },
    });
    const blocked = await raw(
      page,
      tech.token,
      'POST',
      `/crm/contracts/${contractId}/signature`,
      signBody(),
    );
    expect(blocked.status()).toBe(409);
    expect(((await blocked.json()) as { code?: string }).code).toBe('BILLING_CYCLE_REQUIRED');
    expect(
      (await api<ContractView>(page, admin.token, 'GET', '/crm/contracts/' + contractId)).status,
    ).toBe('DRAFT');

    // ── Se asigna el ciclo; la firma queda habilitada ──
    const cycles = await api<Dict[]>(page, admin.token, 'GET', '/crm/billing-cycles');
    const cycleDay = cycles.find((c) => c['active'] === true && Number.isInteger(c['cycleDay']))?.[
      'cycleDay'
    ];
    expect(typeof cycleDay, 'Ciclo de facturación activo en el tenant').toBe('number');
    await api(page, admin.token, 'PATCH', '/crm/contracts/' + contractId, {
      billingCycleDay: cycleDay,
    });
    const withCycle = await api<ContractView>(
      page,
      admin.token,
      'GET',
      '/crm/contracts/' + contractId,
    );
    expect(withCycle.billingCycleDay).toBe(cycleDay);
    expect(withCycle.billingCycleMissing ?? false).toBe(false);

    // ── CA-6 (PDF): el documento generado lleva el cargo congelado ──
    // El cambio de ciclo invalida la generación anterior: se genera de nuevo.
    await test.step('Generar de nuevo y firmar en el lienzo', async () => {
      await techPage.goto(consoleUrl, { waitUntil: 'domcontentloaded' });
      await expect(contractStep).toBeVisible({ timeout: 60_000 });
      await expect(contractStep.getByText('Falta ciclo de facturación')).toHaveCount(0);
      const regenerate = contractStep.getByRole('button', {
        name: /^Generar (de nuevo|contrato)$/u,
      });
      if (await regenerate.count()) await regenerate.first().click();
      const frame = contractStep.locator('iframe[title="Contrato para leer con el cliente"]');
      await expect(frame).toBeVisible({ timeout: 120_000 });
      const canvas = contractStep.getByRole('img', { name: 'Área de firma' });
      await drawSignature(canvas, techPage);
      const signed = techPage.waitForResponse(
        (r) =>
          r.url().endsWith(`/crm/contracts/${contractId}/signature`) &&
          r.request().method() === 'POST',
        { timeout: 90_000 },
      );
      await contractStep.getByRole('button', { name: 'Firmar contrato' }).click();
      const signedResponse = await signed;
      expect(signedResponse.status(), await signedResponse.text()).toBeLessThan(300);
      await expect(contractStep.getByRole('heading', { name: 'Contrato firmado' })).toBeVisible();
    });
    const active = await api<ContractView>(
      page,
      admin.token,
      'GET',
      '/crm/contracts/' + contractId,
    );
    expect(active.status).toBe('ACTIVE');
    expect(Number(active.installationFee), 'Cargo congelado tras activar (CA-6)').toBe(
      INSTALLATION_FEE,
    );

    // ── CA-4/CA-5: primer cobro con una sola línea «Instalación», neta de permanencia ──
    const documentsOf = async () =>
      asList<{ id: string }>(
        await api<unknown>(
          page,
          admin.token,
          'GET',
          `/billing/documents?subscriberId=${subscriberId}&limit=50`,
        ),
      );
    await expect
      .poll(async () => (await documentsOf()).length, {
        timeout: 90_000,
        intervals: [1_000, 2_000, 5_000],
      })
      .toBe(1);
    await page.waitForTimeout(5_000);
    const documents = await documentsOf();
    expect(documents, 'El primer cobro no se duplica').toHaveLength(1);
    const document = await api<{ lines: DocumentLine[] }>(
      page,
      admin.token,
      'GET',
      '/billing/documents/' + documents[0]!.id,
    );
    const installationLines = document.lines.filter((line) => line.kind === 'INSTALACION');
    expect(installationLines, 'Una sola línea de instalación (CA-4)').toHaveLength(1);
    const installation = installationLines[0]!;
    expect(Number(installation.unitPrice), 'Mismo valor que el contrato (CA-6)').toBe(
      INSTALLATION_FEE,
    );
    expect(Number(installation.baseAmount), 'Cargo neto de permanencia (CA-5)').toBe(
      INSTALLATION_FEE - PERMANENCE_DISCOUNT,
    );
    expect(installation.description).toMatch(/^Instalación \(cargo .*descuento por permanencia/u);
    // D2: el contrato guarda el snapshot completo del plan → el primer cobro trae la mensualidad.
    expect(
      document.lines.some((line) => ['PLAN', 'PRORRATEO'].includes(line.kind)),
      JSON.stringify(document.lines.map((line) => [line.kind, line.description, line.baseAmount])),
    ).toBe(true);

    // ── CA-6 (vista previa): el detalle del contrato muestra el valor congelado ──
    await test.step('Detalle del contrato e historial de cobro en la ficha', async () => {
      await page.goto('/dashboard/crm/subscribers/' + subscriberId, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText('Falta ciclo de facturación')).toHaveCount(0);
      const servicesTab = page.getByRole('tab', { name: /^Servicios/u });
      if (await servicesTab.count()) await servicesTab.first().click();
      await page
        .getByRole('button', { name: /Ver detalle|Detalle/u })
        .first()
        .click();
      const fee = page.getByText('Instalación', { exact: true }).locator('xpath=..');
      await expect(fee.first()).toContainText(/90\.000/u, { timeout: 30_000 });
    });

    await techContext.close();
  });
});
