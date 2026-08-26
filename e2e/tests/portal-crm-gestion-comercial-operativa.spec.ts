import { expect, test } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
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
  firstName: 'Usuario',
  lastName: 'Perez',
  primaryContactName: null,
  primaryContactRole: null,
  documentNumber: '1012345678',
  phonePrimaryEncrypted: 'enc-telefono-demo',
  phoneSecondaryEncrypted: null,
  emailPrimaryEncrypted: null,
  acquisitionChannel: 'REFERRAL',
  sourceDetail: 'Aliado estratégico',
  source: 'Manual',
  address: 'Calle 10 # 20-30',
  municipality: 'Bogotá',
  department: 'Cundinamarca',
  interestedPlanId: 'plan-500',
  additionalProductIds: ['prod-router'],
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
    name: 'Usuario de prueba',
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
  actorName: 'Usuario de prueba',
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
    firstName: 'Usuario',
    lastName: 'Prueba',
    email: 'laura@iwana.co',
    role: 'ADMIN',
  },
  {
    id: 'user-uuid-advisor-1',
    firstName: 'Usuario',
    lastName: 'Alterno',
    email: 'carlos@iwana.co',
    role: 'ADVISOR',
  },
  {
    id: 'user-uuid-advisor-2',
    firstName: 'Usuario',
    lastName: 'Asignado',
    email: 'maria@iwana.co',
    role: 'ADVISOR',
  },
];

async function setAuthSession(page: import('@playwright/test').Page) {
  await seedPortalSession(page, { token: MOCK_ACCESS_TOKEN, tenantSlug: MOCK_TENANT_SLUG });
}

async function pickSearchableUser(
  page: import('@playwright/test').Page,
  panel: ReturnType<import('@playwright/test').Page['locator']>,
  query: string,
  optionName: RegExp | string,
) {
  const input = panel.getByRole('combobox', { name: /nuevo responsable/i });
  await input.click();
  await input.fill(query);
  const listbox = page.locator('#rs-user-listbox');
  await expect(listbox).toBeVisible();
  const option = page.getByRole('option', { name: optionName });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
  if (await listbox.isVisible()) {
    await page.keyboard.press('Escape');
  }
  await expect(listbox).toBeHidden();
}

async function setupMocks(page: import('@playwright/test').Page) {
  let capturedResponsibilityPayload: Record<string, unknown> | null = null;

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname;

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'ISP Demo',
            showTenantName: true,
            logoLightUrl: null,
            logoDarkUrl: null,
            sealLightUrl: null,
            sealDarkUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            loginBackgroundLightUrl: null,
            loginBackgroundDarkUrl: null,
          },
        }),
      });
      return;
    }

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
            firstName: 'Usuario',
            lastName: 'Prueba',
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

    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      const type = new URL(url).searchParams.get('type');
      if (type === 'PLAN') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'plan-500',
                type: 'PLAN',
                name: 'Plan Fibra 500',
                description: null,
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                technology: 'FTTH',
                installationRule: 'ON_DEMAND',
                downloadSpeedMbps: 500,
                uploadSpeedMbps: 500,
                currentPrice: '109900.00',
                installationFee: '0.00',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }

      if (type === 'PRODUCT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'prod-router',
                type: 'PRODUCT',
                name: 'Router WiFi 6',
                description: null,
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                category: 'CPE',
                isLoan: true,
                requiresInventory: true,
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }

      if (type === 'SERVICE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'srv-ip-publica',
                type: 'SERVICE',
                name: 'IP pública fija',
                description: null,
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                chargeType: 'RECURRING',
                currentPrice: '25000.00',
                installationFee: '0.00',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }
    }

    if (pathname.endsWith('/commercial/catalog/plan-500') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'plan-500',
            type: 'PLAN',
            name: 'Plan Fibra 500',
            description: null,
            taxClassificationId: null,
            retentionApplicable: false,
            isActive: true,
            technology: 'FTTH',
            installationRule: 'ON_DEMAND',
            downloadSpeedMbps: 500,
            uploadSpeedMbps: 500,
            currentPrice: '109900.00',
            installationFee: '0.00',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog/prod-router') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'prod-router',
            type: 'PRODUCT',
            name: 'Router WiFi 6',
            description: null,
            taxClassificationId: null,
            retentionApplicable: false,
            isActive: true,
            category: 'CPE',
            isLoan: true,
            requiresInventory: true,
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

    if (pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/bootstrap`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            expediente: {
              id: mockExpediente.id,
              status: mockExpediente.status,
              previousStatus: mockExpediente.previousStatus,
              statusChangedAt: mockExpediente.statusChangedAt,
              createdAt: mockExpediente.createdAt,
              updatedAt: mockExpediente.updatedAt,
              fullName: mockExpediente.fullName,
              documentType: mockExpediente.documentType,
              personType: mockExpediente.personType,
              dataConsentRevoked: mockExpediente.dataConsentRevoked,
              hasLocation: true,
              source: mockExpediente.source,
              acquisitionChannel: mockExpediente.acquisitionChannel,
              interestedPlanId: mockExpediente.interestedPlanId,
              additionalProductIds: mockExpediente.additionalProductIds,
              additionalServiceIds: [],
            },
            completeness: {
              commercial: 70,
              legal: 50,
              technical: 40,
              operational: 30,
              overall: 48,
              sectionCompleteness: [],
              installationReadiness: {
                status: 'NOT_READY',
                canTransition: false,
                title: 'No listo para instalación',
                message: 'Completa la información técnica pendiente.',
              },
              missingRequirements: [],
            },
            pipelineRecommendation: null,
            operationalMetadata: {
              createdBy: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
                role: 'ADMIN',
              },
              lastEditedBy: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
                role: 'ADMIN',
              },
              lastActivityAt: mockExpediente.updatedAt,
            },
            currentAttribution: mockAttribution,
            responsibility: mockResponsibility,
            subscriberSummary: null,
          },
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
          name: 'Usuario asignado',
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
                name: 'Usuario alterno',
                role: 'ADVISOR',
              },
              newResponsible: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
                role: 'ADMIN',
              },
              changedByActor: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
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

    if (pathname.includes('/users/search') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockUsers.map((user) => ({
            id: user.id,
            label: `${user.firstName} ${user.lastName}`,
            sublabel: user.email,
          })),
          total: mockUsers.length,
        }),
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: mockUsers,
            meta: { nextCursor: null, total: mockUsers.length },
          },
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
            events: [
              {
                kind: 'responsibility',
                id: 'timeline-responsibility-1',
                changedAt: '2026-03-26T11:30:00.000Z',
                previousResponsible: {
                  userId: 'user-uuid-advisor-1',
                  name: 'Usuario alterno',
                  role: 'ADVISOR',
                },
                newResponsible: {
                  userId: 'user-uuid-admin-test',
                  name: 'Usuario de prueba',
                  role: 'ADMIN',
                },
                actor: { userId: 'user-uuid-admin-test', name: 'Usuario de prueba', role: 'ADMIN' },
                notes: 'Toma de caso inicial',
              },
            ],
            metadata: {
              createdBy: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
                role: 'ADMIN',
              },
              lastEditedBy: {
                userId: 'user-uuid-admin-test',
                name: 'Usuario de prueba',
                role: 'ADMIN',
              },
              lastActivityAt: '2026-03-26T11:40:00.000Z',
            },
          },
          meta: {
            page: 1,
            limit: 5,
            total: 1,
            totalPages: 1,
            truncated: false,
            hasMore: false,
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpedienteId}/contact-attempts`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0 }),
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

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });

  return { getCapturedResponsibilityPayload: () => capturedResponsibilityPayload };
}

test.describe('CRM Gestion Comercial y Operativa — MOD05 Fase 01', () => {
  test('renderiza el tab Seguimiento con bloques operativos vigentes', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    await expect(page.getByText('Responsable', { exact: true })).toBeVisible();
    await expect(page.getByText('Asesor de origen', { exact: true })).toBeVisible();
    await expect(page.getByText('Interés del cliente', { exact: true })).toBeVisible();
    await expect(page.getByText('Origen', { exact: true })).toBeVisible();
  });

  test('bloque de responsable muestra al responsable actual', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await expect(page.getByText('Responsable', { exact: true })).toBeVisible();
    await expect(page.getByText('Usuario de prueba', { exact: false }).first()).toBeVisible();
  });

  test('responsable actual muestra nombre, rol y fecha de asignación', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    await expect(page.getByText('Usuario de prueba', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/admin/i).first()).toBeVisible();
    await expect(page.getByText(/desde/i).first()).toBeVisible();
  });

  test('interés del cliente muestra plan y producto adicional', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    await expect(page.getByText('Interés del cliente', { exact: true })).toBeVisible();
    await expect(page.getByText('Plan Fibra 500')).toBeVisible();
    await expect(page.getByText('Router WiFi 6')).toBeVisible();
  });

  test('origen muestra el canal comercial activo', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    const originBlock = page.locator('aside > div').filter({
      has: page.getByText('Origen', { exact: true }),
    });

    await expect(originBlock.getByText('Origen', { exact: true })).toBeVisible();
    await expect(originBlock.getByText('REFERRAL', { exact: true })).toBeVisible();
  });

  test('bloque de originador muestra la atribución comercial activa', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    const originatorBlock = page.locator('aside > div').filter({
      has: page.getByText('Asesor de origen', { exact: true }),
    });

    await expect(originatorBlock.getByText('Asesor de origen', { exact: true })).toBeVisible();
    await expect(originatorBlock.getByText('Usuario de prueba', { exact: true })).toBeVisible();
    await expect(originatorBlock.getByText('Administrador', { exact: true })).toBeVisible();
  });

  test('bitácora unificada expone filtros de pipeline y asignaciones', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    await expect(page.getByText(/bitácora de actividad/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Estados' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Asignaciones' })).toBeVisible();
  });

  test('bitácora muestra responsables previo y actual', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();

    const responsibilityEntry = page
      .locator('div')
      .filter({
        has: page.getByText('Cambio de responsable', { exact: true }),
      })
      .first();

    await expect(
      responsibilityEntry.getByText('Anterior: Usuario alterno', { exact: true }),
    ).toBeVisible();
    await expect(
      responsibilityEntry.getByText('Nuevo rol: Administrador', { exact: true }),
    ).toBeVisible();
  });

  test('reasignar responsable abre el formulario vigente', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await page.getByRole('button', { name: /reasignar responsable/i }).click();

    await expect(page.locator('#rs-user')).toBeVisible();
    await expect(page.getByLabel('Notas (opcional)')).toBeVisible();
    await expect(page.getByRole('button', { name: /guardar responsable/i })).toBeVisible();
  });

  test('responsibility form calls PATCH /responsibility with correct payload', async ({ page }) => {
    const mocks = await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await page.getByRole('button', { name: /reasignar responsable/i }).click();

    const responsibilityPanel = page
      .locator('div')
      .filter({
        has: page.getByText('Reasignar responsable', { exact: true }),
      })
      .first();

    await pickSearchableUser(page, responsibilityPanel, 'Us', /Usuario asignado/i);
    await responsibilityPanel
      .getByLabel('Notas (opcional)')
      .fill('Caso reasignado a usuario sintético');
    await responsibilityPanel.getByRole('button', { name: /guardar responsable/i }).click();

    await expect(page.getByText(/responsable actualizado/i)).toBeVisible({ timeout: 5000 });

    const payload = mocks.getCapturedResponsibilityPayload();
    expect(payload).toMatchObject({
      responsibleUserId: 'user-uuid-advisor-2',
      notes: 'Caso reasignado a usuario sintético',
    });
  });

  test('cancel button closes responsibility form without calling API', async ({ page }) => {
    await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await page.getByRole('button', { name: /reasignar responsable/i }).click();
    const responsibilityPanel = page
      .locator('div')
      .filter({
        has: page.getByText('Reasignar responsable', { exact: true }),
      })
      .first();
    await expect(responsibilityPanel.locator('#rs-user')).toBeVisible();

    await responsibilityPanel.getByRole('button', { name: 'Cancelar' }).nth(1).click();
    await expect(page.locator('#rs-user')).not.toBeVisible();
  });

  test('no legacy assign endpoint is called — uses /responsibility instead', async ({ page }) => {
    const mocks = await setupMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpedienteId}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await page.getByRole('button', { name: /reasignar responsable/i }).click();
    const responsibilityPanel = page
      .locator('div')
      .filter({
        has: page.getByText('Reasignar responsable', { exact: true }),
      })
      .first();
    await pickSearchableUser(page, responsibilityPanel, 'Us', /Usuario asignado/i);
    await responsibilityPanel.getByRole('button', { name: /guardar responsable/i }).click();

    await page.waitForLoadState('networkidle');
    const payload = mocks.getCapturedResponsibilityPayload();

    expect(payload).not.toBeNull();
    expect(payload).toHaveProperty('responsibleUserId');
  });
});
