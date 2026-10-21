import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const privacyFixtureTenant = process.env.E2E_PRIVACY_1B_TENANT_SLUG;
const privacyFixtureAdminEmail = process.env.E2E_PRIVACY_ADMIN_EMAIL;
const privacyFixtureAdminPassword = process.env.E2E_PRIVACY_ADMIN_PASSWORD;
const privacyFixtureSuffix = privacyFixtureTenant?.startsWith('e2e-privacy-1b-')
  ? privacyFixtureTenant.slice('e2e-privacy-1b-'.length)
  : null;
const privacyRunnerEmail = privacyFixtureSuffix
  ? `qa-privacy-runner-${privacyFixtureSuffix}@example.invalid`
  : null;
const privacyRunnerPassword =
  privacyFixtureTenant && privacyFixtureAdminPassword && privacyFixtureSuffix
    ? deriveFixturePassword(privacyFixtureAdminPassword, privacyFixtureTenant, 'runner')
    : null;
const usePrivacyFixture = Boolean(
  privacyFixtureTenant && privacyFixtureAdminEmail && privacyRunnerEmail && privacyRunnerPassword,
);
const tenantSlug = usePrivacyFixture ? privacyFixtureTenant : process.env.E2E_TENANT_SLUG;
const auditorEmail = usePrivacyFixture ? privacyRunnerEmail : process.env.E2E_AUDITOR_EMAIL;
const auditorPassword = usePrivacyFixture
  ? privacyRunnerPassword
  : process.env.E2E_AUDITOR_PASSWORD;
const configuredPlanId = process.env.E2E_PRIVACY_PLAN_ID;
const missingLiveEnvironment = [
  !tenantSlug?.trim() ? 'E2E_TENANT_SLUG' : null,
  !auditorEmail?.trim() ? 'E2E_AUDITOR_EMAIL' : null,
  !auditorPassword?.trim() ? 'E2E_AUDITOR_PASSWORD' : null,
].filter((name): name is string => name !== null);

function requireFixture(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Falta configurar ${name} en .env.development.local.`);
  return value;
}

function deriveFixturePassword(masterPassword: string, slug: string, purpose: string): string {
  const digest = createHmac('sha256', masterPassword)
    .update(`privacy-fase-1b:${purpose}:${slug}`)
    .digest('hex');
  return `Qa9-${digest}!zA`;
}

function tenantHeaders(): Record<string, string> {
  return {
    'X-Tenant-Slug': requireFixture(tenantSlug, 'E2E_TENANT_SLUG'),
    'X-Requested-With': 'XMLHttpRequest',
  };
}

async function apiJson<T>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(path, {
    method,
    headers: tenantHeaders(),
    ...(data !== undefined ? { data } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    code?: string;
  };
  expect(response.ok(), `API ${method} ${path}: ${response.status()} ${body.code ?? ''}`).toBe(
    true,
  );
  return body.data as T;
}

async function authenticatePortal(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Empresa').fill(requireFixture(tenantSlug, 'E2E_TENANT_SLUG'));
  await page
    .getByLabel('Correo electrónico')
    .fill(requireFixture(auditorEmail, 'E2E_AUDITOR_EMAIL'));
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(requireFixture(auditorPassword, 'E2E_AUDITOR_PASSWORD'));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function resolvePlan(page: Page): Promise<{ id: string; name: string }> {
  const catalog = await apiJson<{
    data: Array<{ id: string; name: string }>;
  }>(page, '/api/v1/commercial/catalog?type=PLAN&isActive=true&limit=100', 'GET');
  const plan = catalog.data.find((item) => item.id === configuredPlanId) ?? catalog.data[0] ?? null;
  if (!plan) {
    throw new Error('El catálogo del tenant sintético no tiene planes activos para el E2E.');
  }
  return plan;
}

async function createExpedienteFixture(
  page: Page,
  planId: string,
): Promise<{ id: string; suffix: string; planId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const name = `Expediente Sintético E2E ${suffix}`;
  const email = `privacy-expediente-${suffix}@example.invalid`;
  const newExpediente = await apiJson<{ id: string }>(page, '/api/v1/crm/expedientes', 'POST', {
    fullName: name,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: `Fixture E2E ${suffix}`,
  });

  const updateSection = (section: string, data: Record<string, unknown>) =>
    apiJson(page, `/api/v1/crm/expedientes/${newExpediente.id}/sections/${section}`, 'PATCH', {
      data,
    });

  await updateSection('identification', {
    personType: 'PERSONA_NATURAL',
    documentType: 'CC',
    documentNumber: `QA-${suffix}`,
    firstName: 'Prueba',
    lastName: suffix,
  });
  await updateSection('contact', {
    phonePrimary: '+570000000000',
    emailPrimary: email,
    altContactName: 'Contacto sintético',
    altContactPhone: '+570000000001',
  });
  await updateSection('location', {
    address: 'Carrera de prueba 999',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: '110111',
    stratum: 3,
    neighborhood: 'Sector de pruebas',
    latitude: 4.711,
    longitude: -74.072,
  });
  await updateSection('commercial_interest', {
    acquisitionChannel: 'WEB',
    sourceDetail: `Fixture E2E ${suffix}`,
    interestedPlanId: planId,
  });
  await updateSection('technical_feasibility', {
    feasibility: 'VIABLE',
    candidateTechnologies: ['FIBER'],
    availableTechnology: 'FIBER',
    technicalConfidence: 'HIGH',
    evaluationSource: 'TECHNICAL_SITE_VISIT',
  });
  await updateSection('legal_consent', {
    identityVerified: 'VERIFIED',
    legalComplianceStatus: 'APPROVED',
  });

  return { id: newExpediente.id, suffix, email, planId, subscriberName: `Prueba ${suffix}` };
}

async function searchConvertedSubscriber(page: Page, email: string): Promise<string | null> {
  const response = await page.request.post('/api/v1/crm/subscribers/search', {
    headers: tenantHeaders(),
    data: { email },
  });
  if (!response.ok()) return null;
  const body = (await response.json()) as { data?: Array<{ id: string }> };
  return body.data?.[0]?.id ?? null;
}

async function createConvertedSubscriberFixture(page: Page): Promise<{
  subscriberId: string;
  contractId: string;
  partyId: string;
  subscriberName: string;
}> {
  const plan = await resolvePlan(page);
  const expediente = await createExpedienteFixture(page, plan.id);
  await page.goto(`/dashboard/crm/expedientes/${expediente.id}`);
  await expect(page.getByRole('heading', { name: 'Consentimientos (Ley 1581)' })).toBeVisible();
  await expect(page.getByText('Texto vigente · versión', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar autorización' }).first().click();
  const authorizationForm = page.getByRole('region', { name: 'Registrar una autorización' });
  const channel = authorizationForm.getByLabel(
    'Medio por el que la persona otorgó la autorización',
  );
  await expect(channel).toContainText('Selecciona un medio');
  await channel.click();
  await page.getByRole('option', { name: 'Teléfono' }).click();
  await authorizationForm.getByRole('button', { name: 'Registrar autorización' }).click();
  await expect(page.getByText('Medio: Teléfono', { exact: true })).toBeVisible();

  for (const label of [
    'Precalificado',
    'Validando cobertura',
    'En cotización',
    'Listo para instalación',
  ]) {
    const newStatus = page.getByLabel('Nuevo estado');
    await newStatus.click();
    await page.getByRole('option', { name: label }).click();
    await page.getByRole('button', { name: 'Aplicar transición' }).click();
    await expect(page.getByText(`Estado actual: ${label}`, { exact: true })).toBeVisible();
  }

  await expect
    .poll(() => searchConvertedSubscriber(page, expediente.email), { timeout: 20_000 })
    .not.toBeNull();
  const subscriberId = await searchConvertedSubscriber(page, expediente.email);
  expect(subscriberId).toBeTruthy();

  const convertedProfile = await apiJson<{
    subscriber: { partyId: string | null };
    habeasData: Array<{ channel: string }>;
  }>(page, `/api/v1/crm/subscribers/${subscriberId}/360`, 'GET');
  if (!convertedProfile.subscriber.partyId) {
    throw new Error('La API real no devolvió el vínculo sintético del titular.');
  }
  expect(
    convertedProfile.habeasData.some((authorization) => authorization.channel === 'TELEFONO'),
  ).toBe(true);

  // El alta del contrato exige los datos fiscales mínimos de persona natural.
  await apiJson(page, `/api/v1/crm/subscribers/${subscriberId}`, 'PATCH', {
    vatResponsibility: 'NO_RESPONSABLE',
    rutResponsibilities: ['R-99-PN'],
  });

  const contract = await apiJson<{ id: string }>(
    page,
    `/api/v1/crm/subscribers/${subscriberId}/contracts`,
    'POST',
    {
      subscriberId,
      planId: expediente.planId,
      planSnapshotJson: { id: expediente.planId, name: plan.name, vatConcept: 'INTERNET_ACCESS' },
      alias: 'Servicio E2E',
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      customerSegment: 'RESIDENTIAL',
      installationAddress: 'Carrera de prueba 999',
      installationCity: 'Bogotá',
      installationDepartment: 'Cundinamarca',
      installationPostalCode: '110111',
    },
  );
  await apiJson(page, `/api/v1/crm/contracts/${contract.id}/activate`, 'POST', {});

  return {
    subscriberId: subscriberId!,
    contractId: contract.id,
    partyId: convertedProfile.subscriber.partyId,
    subscriberName: expediente.subscriberName,
  };
}

test.describe('Privacidad contra API real y tenant sintético', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test.setTimeout(90_000);

  test('radica, verifica identidad, completa y resuelve una consulta', async ({ page }) => {
    await authenticatePortal(page);
    await page.goto('/dashboard/privacy');

    await expect(page.getByRole('heading', { name: 'Privacidad', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Radicar solicitud' }).click();
    await page.getByLabel('Nombre completo').fill('Solicitante Sintético E2E');
    await page.getByLabel('Número de documento').fill('QA-CONSULTA-E2E');
    await page
      .getByLabel('Correo o dirección para responder')
      .fill('privacy-request@example.invalid');
    await expect(page.getByLabel('Método')).toHaveValue('');
    await page.getByRole('button', { name: 'Registrar solicitud' }).click();

    await expect(page.getByRole('heading', { name: 'Identidad de quien solicita' })).toBeVisible();
    await expect(page.getByText('Pendiente de verificación')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver evidencia' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Verificar identidad' }).click();
    await page.getByLabel('Método de verificación').selectOption('DOCUMENTO_PRESENCIAL');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Verificada el:')).toBeVisible();

    await page.getByRole('button', { name: 'Registrar información recibida' }).click();
    await expect(page.getByRole('region', { name: 'Datos del cambio' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Estado:\s*En trámite/)).toBeVisible();
    await page.getByRole('button', { name: 'Responder y cerrar' }).click();
    await expect(page.getByRole('region', { name: 'Datos del cambio' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Respuesta' }).fill('Respuesta sintética registrada.');
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Estado:\s*Respondida/)).toBeVisible();
  });

  test('captura la autorización en el expediente, convierte y muestra el medio en la ficha 360°', async ({
    page,
  }) => {
    await authenticatePortal(page);
    const fixture = await createConvertedSubscriberFixture(page);
    await page.goto(`/dashboard/crm/subscribers/${fixture.subscriberId}`);
    await expect(page.getByRole('heading', { name: fixture.subscriberName })).toBeVisible();
    await page.getByRole('tab', { name: 'Cumplimiento' }).click();
    await expect(page.getByText(fixture.partyId, { exact: false })).toHaveCount(0);
    await expect(page.getByText('Medio: Teléfono', { exact: false })).toBeVisible();
  });

  test('radica suplantación desde la ficha 360° y suspende el contrato impugnado', async ({
    page,
  }) => {
    await authenticatePortal(page);
    const fixture = await createConvertedSubscriberFixture(page);
    await page.goto(`/dashboard/crm/subscribers/${fixture.subscriberId}`);
    await expect(page.getByRole('heading', { name: fixture.subscriberName })).toBeVisible();
    await page.getByRole('tab', { name: 'Cumplimiento' }).click();
    await expect(page.getByText(fixture.partyId, { exact: false })).toHaveCount(0);
    const fileRequestButton = page.getByRole('button', { name: 'Radicar solicitud' });
    await expect(fileRequestButton).toBeVisible();
    await fileRequestButton.click();
    await page.getByLabel('Tipo de solicitud').selectOption('SUPLANTACION');
    await page
      .getByLabel('Confirmo que la solicitud corresponde a la persona de esta ficha.')
      .check();
    await page.getByLabel('Método').selectOption('DOCUMENTO_PRESENCIAL');
    await page.getByLabel('Servicio E2E · Activo').check();
    await page.getByRole('button', { name: 'Registrar solicitud' }).click();

    await expect(
      page.getByText('1 contrato impugnado fue confirmado como suspendido.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(fixture.contractId, { exact: false })).toHaveCount(0);
    const contract = await apiJson<{ status: string }>(
      page,
      `/api/v1/crm/contracts/${fixture.contractId}`,
      'GET',
    );
    expect(contract.status).toBe('SUSPENDED');
  });
});
