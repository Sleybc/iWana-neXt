import { expect, test } from '@playwright/test';

const MOCK_TENANT_SLUG = 'test-isp';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'hash-admin-test',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-test-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const mockExpediente = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-uuid-test',
  status: 'NUEVO_POTENCIAL',
  previousStatus: null,
  assignedTo: 'advisor-uuid-1',
  dataConsentRevoked: true,
  statusChangedAt: '2026-03-26T12:00:00.000Z',
  discardReason: null,
  fullName: 'Empresa Demo SAS',
  documentType: 'NIT',
  documentNumberEncrypted: 'enc-documento-demo',
  personType: 'PERSONA_NATURAL',
  firstName: 'Laura',
  lastName: 'Perez',
  primaryContactName: null,
  primaryContactRole: null,
  documentNumber: '1012345678',
  phonePrimaryEncrypted: 'enc-telefono-demo',
  phoneSecondaryEncrypted: null,
  emailPrimaryEncrypted: null,
  source: 'Manual',
  address: 'Calle 10 # 20-30',
  municipality: 'Bogotá',
  department: 'Cundinamarca',
  interestedPlanId: 'plan-500',
  completenessCommercial: 70,
  completenessLegal: 50,
  completenessTechnical: 40,
  completenessOperational: 30,
  createdAt: '2026-03-26T10:00:00.000Z',
  updatedAt: '2026-03-26T12:00:00.000Z',
};

async function setAuthSession(page: import('@playwright/test').Page) {
  await page.goto('http://127.0.0.1:3002/dashboard');
  await page.evaluate(
    ({ token, slug }) => {
      localStorage.setItem('iwana.portal.access-token', token);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: MOCK_ACCESS_TOKEN, slug: MOCK_TENANT_SLUG },
  );
}

async function setupCrmMocks(page: import('@playwright/test').Page) {
  let capturedExpedientesQuery = '';
  let capturedTechnicalPayload: Record<string, unknown> | null = null;
  let contactAttemptCreated = false;
  let consentRevoked = false;

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname;

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'hash-admin-test',
            role: 'ADMIN',
            tenantId: 'tenant-uuid-test',
            schemaName: 'tenant_test_isp',
            jti: 'jti-test-1',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (url.includes('/users/user-uuid-admin-test') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-uuid-admin-test',
            firstName: 'Laura',
            lastName: 'Pérez',
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-test',
            name: 'ISP Prueba Colombia',
            slug: MOCK_TENANT_SLUG,
            showTenantName: true,
            sealLightUrl: null,
            sealDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/pipeline/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            NUEVO_POTENCIAL: 1,
            CONTACTADO: 0,
            PENDIENTE_DATOS: 0,
            PRECALIFICADO: 0,
            VALIDANDO_COBERTURA: 0,
            VIABLE_COMERCIALMENTE: 0,
            EN_COTIZACION: 0,
            PENDIENTE_DECISION: 0,
            LISTO_PARA_INSTALACION: 0,
            INSTALACION_AGENDADA: 0,
            CLIENTE_ACTIVO: 0,
            DESCARTADO: 0,
          },
          total: 1,
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/expedientes') && method === 'GET' && url.includes('?')) {
      capturedExpedientesQuery = new URL(url).search;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [mockExpediente],
          total: 1,
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/expedientes') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/timeline`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            changes: [
              {
                id: 'timeline-1',
                fromStatus: 'CONTACTADO',
                toStatus: 'NUEVO_POTENCIAL',
                changedAt: '2026-03-26T11:30:00.000Z',
                reason: null,
                actor: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              },
            ],
            activities: [
              {
                id: 'activity-1',
                type: contactAttemptCreated ? 'CONTACT_ATTEMPT' : 'CREATED',
                occurredAt: '2026-03-26T11:40:00.000Z',
                actor: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
                sectionLabel: contactAttemptCreated ? 'Intento de contacto' : null,
                fromStatus: null,
                toStatus: null,
                reason: contactAttemptCreated ? 'Seguimiento inicial validado' : null,
              },
            ],
            metadata: {
              createdBy: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              lastEditedBy: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              lastActivityAt: '2026-03-26T11:40:00.000Z',
            },
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/contact-attempts`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: contactAttemptCreated
            ? [
                {
                  id: 'attempt-1',
                  attemptedAt: '2026-03-26T11:40:00.000Z',
                  channel: 'TELEFONO',
                  result: 'EXITOSO',
                  durationMinutes: 5,
                  notes: 'Seguimiento inicial validado',
                  advisorId: 'user-uuid-admin-test',
                  actorName: 'Laura Pérez',
                },
              ]
            : [],
          total: contactAttemptCreated ? 1 : 0,
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/contact-attempts`) &&
      method === 'POST'
    ) {
      contactAttemptCreated = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'attempt-1',
            attemptedAt: '2026-03-26T11:40:00.000Z',
            channel: 'TELEFONO',
            result: 'EXITOSO',
            durationMinutes: 5,
            notes: 'Seguimiento inicial validado',
            advisorId: 'user-uuid-admin-test',
            actorName: 'Laura Pérez',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/consents`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'consent-1',
              consentType: 'TRATAMIENTO_DATOS',
              status: consentRevoked ? 'RECHAZADO' : 'ACEPTADO',
              channel: 'PRESENCIAL',
              obtainedAt: '2026-03-26T11:20:00.000Z',
              ipAddress: '10.0.0.1',
              legalTextVersion: 'Ley 1581 de 2012',
              evidenceRef: null,
            },
          ],
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/consents/consent-1/revoke`) &&
      method === 'PATCH'
    ) {
      consentRevoked = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'consent-1',
            consentType: 'TRATAMIENTO_DATOS',
            status: 'RECHAZADO',
            channel: 'PRESENCIAL',
            obtainedAt: '2026-03-26T11:20:00.000Z',
            ipAddress: '10.0.0.1',
            legalTextVersion: 'Ley 1581 de 2012',
            evidenceRef: null,
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/coverage-checks`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/sections/`) &&
      method === 'PATCH'
    ) {
      if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/sections/technical_feasibility`)) {
        const parsedBody = JSON.parse(route.request().postData() ?? '{}') as {
          data?: Record<string, unknown>;
        };
        capturedTechnicalPayload = parsedBody.data ?? null;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/status`) && method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockExpediente,
          completeness: {
            commercial: 70,
            legal: 50,
            technical: 40,
            operational: 30,
            overall: 48,
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/reactivate`) &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockExpediente,
          completeness: {
            commercial: 70,
            legal: 50,
            technical: 40,
            operational: 30,
            overall: 48,
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  return {
    getCapturedExpedientesQuery: () => capturedExpedientesQuery,
    getCapturedTechnicalPayload: () => capturedTechnicalPayload,
  };
}

test.describe('CRM expedientes - cierre Sprint 02', () => {
  test('CRM permite crear, listar y abrir detalle del expediente', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /pipeline de oportunidades/i })).toBeVisible();
    await expect(page.getByText('Empresa Demo SAS')).toBeVisible();
    await page.getByRole('link', { name: /empresa demo sas/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/crm/expedientes/${mockExpediente.id}`));
    await expect(page.getByText('advisor-uuid-1')).toBeVisible();
    await expect(page.getByText('1012345678')).toBeVisible();
  });

  test('CRM oculta PII en listados y mantiene detalle operativo', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('900123456')).toHaveCount(0);
    await page.getByRole('link', { name: /empresa demo sas/i }).click();
    await expect(page.getByText('1012345678')).toBeVisible();
    await expect(
      page.getByText(/consentimiento de tratamiento de datos fue revocado/i),
    ).toBeVisible();
  });

  test('CRM permite revocar consentimiento y refleja el hardening visual', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('button', { name: /revocar/i })
      .first()
      .click();
    await expect(page.getByText(/consentimiento revocado correctamente/i)).toBeVisible();
    await expect(
      page.getByText(/consentimiento de tratamiento de datos fue revocado/i),
    ).toBeVisible();
  });

  test('CRM envía filtros assignedTo y documentNumber al backend', async ({ page }) => {
    const mocks = await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Asesor asignado').fill('advisor-uuid-1');
    await page.getByLabel('Documento exacto').fill('900123456');
    await page.getByLabel('Documento exacto').press('Tab');
    await page.waitForTimeout(300);

    expect(mocks.getCapturedExpedientesQuery()).toContain('assignedTo=advisor-uuid-1');
    expect(mocks.getCapturedExpedientesQuery()).toContain('documentNumber=900123456');
  });

  test('CRM permite registrar intento de contacto y lo refleja en timeline', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Duración').fill('5');
    await page.getByLabel('Notas').fill('Seguimiento inicial validado');
    await page.getByRole('button', { name: /registrar contacto/i }).click();

    await expect(page.getByText(/intento de contacto registrado correctamente/i)).toBeVisible();
    await expect(page.getByText(/seguimiento inicial validado/i).first()).toBeVisible();
    await expect(page.getByText(/actividad reciente/i)).toBeVisible();
  });

  test('CRM guarda viabilidad tecnica estructurada con candidatas y recomendada', async ({
    page,
  }) => {
    const mocks = await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /viabilidad técnica/i }).click();

    await page.getByLabel('Resultado de cobertura').fill('Cobertura parcial con vista directa');
    await page.getByLabel('Resultado de viabilidad').selectOption('VIABLE');
    await page.getByRole('checkbox', { name: 'Fibra óptica' }).check();
    await page.getByLabel('Tecnología recomendada').selectOption('FIBER');
    await page.getByLabel('Nivel de certeza').selectOption('HIGH');
    await page.getByLabel('Fuente de evaluación').selectOption('TECHNICAL_SITE_VISIT');
    await page
      .getByLabel('Observación técnica')
      .fill('Solución viable con ajuste menor de acometida.');

    await page.getByRole('button', { name: /guardar sección/i }).click();
    await expect(page.getByText(/sección actualizada correctamente/i)).toBeVisible();

    expect(mocks.getCapturedTechnicalPayload()).toMatchObject({
      coverageResult: 'Cobertura parcial con vista directa',
      feasibility: 'VIABLE',
      candidateTechnologies: ['FIBER'],
      availableTechnology: 'FIBER',
      technicalConfidence: 'HIGH',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      technicalObservations: 'Solución viable con ajuste menor de acometida.',
    });
  });

  test('identificacion muestra campos correctos para persona natural en modo lectura', async ({
    page,
  }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Laura', { exact: true })).toBeVisible();
    await expect(page.getByText('Perez', { exact: true })).toBeVisible();
    await expect(page.getByText('NIT')).toBeVisible();
    await expect(page.getByRole('button', { name: /editar identificación/i })).toBeVisible();

    await page.getByRole('button', { name: /editar identificación/i }).click();
    await expect(page.getByLabel('Nombres')).toBeVisible();
    await expect(page.getByLabel('Apellidos')).toBeVisible();
  });

  test('identificacion muestra campos correctos para persona juridica en modo lectura', async ({
    page,
  }) => {
    const original = { ...mockExpediente };
    (mockExpediente as any).personType = 'PERSONA_JURIDICA';
    (mockExpediente as any).companyName = 'Empresa Test SAS';
    (mockExpediente as any).primaryContactName = 'Juan Rodriguez';
    (mockExpediente as any).primaryContactRole = 'Gerente comercial';
    (mockExpediente as any).firstName = null;
    (mockExpediente as any).lastName = null;

    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /editar identificación/i })).toBeVisible();

    await page.getByRole('button', { name: /editar identificación/i }).click();
    await expect(page.getByLabel('Razón social')).toBeVisible();
    await expect(page.getByLabel('Nombre del contacto principal')).toBeVisible();
    await expect(page.getByLabel('Cargo del contacto')).toBeVisible();

    Object.assign(mockExpediente, original);
  });
});
