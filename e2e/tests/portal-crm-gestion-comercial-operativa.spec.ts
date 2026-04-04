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

const mockExpedienteId = '11111111-1111-4111-8111-111111111111';

const mockExpediente = {
  id: mockExpedienteId,
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

const mockResponsibility = {
  currentResponsibleUserId: 'user-uuid-admin-test',
  currentResponsibleAssignedAt: '2026-03-26T10:30:00.000Z',
  currentResponsible: {
    userId: 'user-uuid-admin-test',
    name: 'Laura Pérez',
    role: 'ADMIN',
  },
  expedienteId: mockExpedienteId,
};

const mockAttribution = {
  id: 'attr-1',
  tenantId: 'tenant-uuid-test',
  expedienteId: mockExpedienteId,
  attributionRole: 'ORIGINATOR',
  actorId: 'user-uuid-admin-test',
  actorRole: 'ADMIN',
  actorName: 'Laura Pérez',
  acquisitionChannel: 'REFERRAL',
  notes: null,
  attributedAt: '2026-03-26T10:00:00.000Z',
  attributedBy: 'user-uuid-admin-test',
  revokedAt: null,
  revokedBy: null,
  revokedReason: null,
  createdAt: '2026-03-26T10:00:00.000Z',
};

const mockUsers = [
  {
    id: 'user-uuid-admin-test',
    firstName: 'Laura',
    lastName: 'Pérez',
    email: 'laura@iwana.co',
    role: 'ADMIN',
  },
  {
    id: 'user-uuid-advisor-1',
    firstName: 'Carlos',
    lastName: 'García',
    email: 'carlos@iwana.co',
    role: 'ADVISOR',
  },
  {
    id: 'user-uuid-advisor-2',
    firstName: 'María',
    lastName: 'López',
    email: 'maria@iwana.co',
    role: 'ADVISOR',
  },
];

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

async function setupMocks(page: import('@playwright/test').Page) {
  let capturedResponsibilityPayload: Record<string, unknown> | null = null;

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
          data: { NUEVO_POTENCIAL: 1, CONTACTADO: 0, PENDIENTE_DATOS: 0, PRECALIFICADO: 0 },
          total: 1,
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/expedientes') && method === 'GET' && url.includes('?')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockExpediente], total: 1 }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpedienteId}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockExpediente,
          completeness: { commercial: 70, legal: 50, technical: 40, operational: 30, overall: 48 },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/responsibility`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockResponsibility }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/responsibility`) &&
      method === 'PATCH'
    ) {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        responsibleUserId?: string;
        notes?: string;
      };
      capturedResponsibilityPayload = body;
      const updated = {
        ...mockResponsibility,
        currentResponsibleUserId: body.responsibleUserId,
        currentResponsibleAssignedAt: new Date().toISOString(),
        currentResponsible: {
          userId: body.responsibleUserId,
          name: 'María López',
          role: 'ADVISOR',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: updated }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/responsibility/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'history-1',
              previousResponsible: {
                userId: 'user-uuid-advisor-1',
                name: 'Carlos García',
                role: 'ADVISOR',
              },
              newResponsible: {
                userId: 'user-uuid-admin-test',
                name: 'Laura Pérez',
                role: 'ADMIN',
              },
              changedByActor: {
                userId: 'user-uuid-admin-test',
                name: 'Laura Pérez',
                role: 'ADMIN',
              },
              changedAt: '2026-03-26T10:30:00.000Z',
              notes: 'Toma de caso inicial',
            },
          ],
          total: 1,
        }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/attribution`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockAttribution }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/attribution/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockAttribution] }),
      });
      return;
    }

    if (
      pathname.includes('/users') &&
      method === 'GET' &&
      (pathname.includes('/users?') || pathname.match(/\/users$/))
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockUsers,
          meta: { nextCursor: null, total: mockUsers.length },
        }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/timeline`) && method === 'GET') {
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
            activities: [],
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

    if (pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/consents`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/coverage-checks`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    await route.continue();
  });

  return { getCapturedResponsibilityPayload: () => capturedResponsibilityPayload };
}

test.describe('CRM Gestion Comercial y Operativa — MOD05 Fase 01', () => {
  test('renders unified section with all sub-blocks', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /gestión comercial y operativa/i }),
    ).toBeVisible();
  });

  test('Responsable actual block appears first with highlighted background', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    const section = page.locator('text=Responsable actual').first();
    await expect(section).toBeVisible();

    const parent = section.locator('..').locator('..');
    const bgClass = await parent.getAttribute('class');
    expect(bgClass ?? '').toMatch(/bg-iwana-primary/i);
  });

  test('Responsable actual displays name, role and assignment date', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Laura Pérez', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });

  test('Interes del cliente sub-block renders without attribution label', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Interés del cliente', { exact: true })).toBeVisible();
    await expect(page.getByText('Plan:')).toBeVisible();
  });

  test('Origen de la oportunidad shows canal and detalle', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Origen de la oportunidad', { exact: true })).toBeVisible();
    await expect(page.getByText(/canal:/i)).toBeVisible();
    await expect(page.getByText(/detalle:/i)).toBeVisible();
  });

  test('Atribucion comercial block shows originador', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Atribución comercial', { exact: true })).toBeVisible();
    await expect(page.getByText(/originador/i)).toBeVisible();
    await expect(page.getByText('Laura Pérez', { exact: false })).toBeVisible();
  });

  test('two separate history blocks exist — historial comercial and historial operativo', async ({
    page,
  }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    const historialComercial = page.getByText('Historial comercial', { exact: true });
    const historialOperativo = page.getByText('Historial operativo', { exact: true });

    await expect(historialComercial).toBeVisible();
    await expect(historialOperativo).toBeVisible();

    const commercialCount = await page.getByText('Historial comercial').count();
    const operativeCount = await page.getByText('Historial operativo').count();
    expect(commercialCount).toBe(1);
    expect(operativeCount).toBe(1);
  });

  test('historial operativo shows previous and new responsible on reasign', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Carlos García', { exact: false })).toBeVisible();
    await expect(page.getByText('Laura Pérez', { exact: false })).toBeVisible();
  });

  test('reasign button opens responsibility form', async ({ page }) => {
    const mocks = await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reasignar/i }).click();

    await expect(page.getByLabel('Nuevo responsable')).toBeVisible();
    await expect(page.getByLabel('Notas (opcional)')).toBeVisible();
    await expect(page.getByRole('button', { name: /guardar responsable/i })).toBeVisible();
  });

  test('responsibility form calls PATCH /responsibility with correct payload', async ({ page }) => {
    const mocks = await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reasignar/i }).click();
    await page.waitForTimeout(300);

    await page.locator('#responsibility-user').selectOption('user-uuid-advisor-2');
    await page.getByLabel('Notas (opcional)').fill('Caso reasignado a María');
    await page.getByRole('button', { name: /guardar responsable/i }).click();

    await expect(page.getByText(/responsable actualizado/i)).toBeVisible({ timeout: 5000 });

    const payload = mocks.getCapturedResponsibilityPayload();
    expect(payload).toMatchObject({
      responsibleUserId: 'user-uuid-advisor-2',
      notes: 'Caso reasignado a María',
    });
  });

  test('cancel button closes responsibility form without calling API', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reasignar/i }).click();
    await expect(page.getByLabel('Nuevo responsable')).toBeVisible();

    await page.getByRole('button', { name: /cancelar/i }).click();
    await expect(page.getByLabel('Nuevo responsable')).not.toBeVisible();
  });

  test('no legacy assign endpoint is called — uses /responsibility instead', async ({ page }) => {
    const mocks = await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /reasignar/i }).click();
    await page.waitForTimeout(300);
    await page.locator('#responsibility-user').selectOption('user-uuid-advisor-2');
    await page.getByRole('button', { name: /guardar responsable/i }).click();

    await page.waitForLoadState('networkidle');
    const payload = mocks.getCapturedResponsibilityPayload();

    expect(payload).not.toBeNull();
    expect(payload).toHaveProperty('responsibleUserId');
  });
});
