import { expect, test } from '@playwright/test';

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

const mockExpediente = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-uuid-test',
  status: 'NUEVO_POTENCIAL',
  previousStatus: null,
  assignedTo: 'advisor-uuid-1',
  dataConsentRevoked: false,
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
  acquisitionChannel: 'REFERRAL',
  sourceDetail: 'Aliado estratégico',
  altContactName: null as string | null,
  altContactPhone: null as string | null,
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
    name: 'Laura Pérez',
    role: 'ADMIN',
  },
  expedienteId: mockExpediente.id,
};

const mockAttribution = {
  id: 'attr-1',
  tenantId: 'tenant-uuid-test',
  expedienteId: mockExpediente.id,
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
];

async function setAuthSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: MOCK_ACCESS_TOKEN, slug: MOCK_TENANT_SLUG },
  );
}

async function setupContactSectionMocks(page: import('@playwright/test').Page) {
  let savedContactPayload: Record<string, unknown> | null = null;

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

    if (url.includes('/auth/refresh') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { accessToken: MOCK_ACCESS_TOKEN },
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

    if (
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/sections/`) &&
      method === 'PATCH'
    ) {
      const postData = route.request().postData();
      const body = postData ? (JSON.parse(postData) as { data?: Record<string, unknown> }) : null;
      const payload = body?.data;
      if (
        payload &&
        (payload.altContactName !== undefined || payload.altContactPhone !== undefined)
      ) {
        savedContactPayload = payload as Record<string, unknown>;
        mockExpediente.altContactName = (payload.altContactName as string) || null;
        mockExpediente.altContactPhone = (payload.altContactPhone as string) || null;
      }
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

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/timeline`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            changes: [],
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

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/responsibility`) &&
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
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/responsibility/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0 }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/attribution`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockAttribution }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/attribution/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockAttribution] }),
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

    if (
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/coverage-checks`) &&
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
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/contact-attempts`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0 }),
      });
      return;
    }

    if (pathname.includes(`/crm/expedientes/${mockExpediente.id}/consents`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'consent-1',
              consentType: 'TRATAMIENTO_DATOS',
              status: 'ACEPTADO',
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

    await route.continue();
  });

  return {
    getSavedContactPayload: () => savedContactPayload,
  };
}

test.describe('CRM Expedientes - Sección Contacto: altContactName y altContactPhone', () => {
  test('guarda, persiste y permite limpiar altContactName y altContactPhone', async ({ page }) => {
    const mocks = await setupContactSectionMocks(page);
    await setAuthSession(page);
    await page.goto(`http://127.0.0.1:3002/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();

    const altContactNameInput = page.getByLabel(/nombre contacto alternativo/i);
    const altContactPhoneInput = page.getByLabel(/teléfono contacto alternativo/i);
    await expect(altContactNameInput).toBeVisible();
    await expect(altContactPhoneInput).toBeVisible();

    await altContactNameInput.fill('Carlos Martinez');
    await altContactPhoneInput.fill('3001234567');

    await page
      .getByRole('button', { name: /guardar cambios/i })
      .nth(1)
      .click();
    await expect(page.getByText(/sección actualizada correctamente/i)).toBeVisible();

    const savedPayload = mocks.getSavedContactPayload();
    expect(savedPayload).toMatchObject({
      altContactName: 'Carlos Martinez',
      altContactPhone: '3001234567',
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();

    await expect(altContactNameInput).toHaveValue('Carlos Martinez');
    await expect(altContactPhoneInput).toHaveValue('3001234567');

    await altContactNameInput.clear();
    await altContactPhoneInput.clear();

    await page
      .getByRole('button', { name: /guardar cambios/i })
      .nth(1)
      .click();
    await expect(page.getByText(/sección actualizada correctamente/i)).toBeVisible();

    const clearedPayload = mocks.getSavedContactPayload();
    expect(clearedPayload).toMatchObject({
      altContactName: null,
      altContactPhone: null,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();

    await expect(altContactNameInput).toHaveValue('');
    await expect(altContactPhoneInput).toHaveValue('');
  });

  test('altContactPhone tiene maxLength de 10 caracteres', async ({ page }) => {
    await setupContactSectionMocks(page);
    await setAuthSession(page);
    await page.goto(`http://127.0.0.1:3002/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();

    const altContactPhoneInput = page.getByLabel(/teléfono contacto alternativo/i);
    await expect(altContactPhoneInput).toBeVisible();

    const maxLength = await altContactPhoneInput.getAttribute('maxlength');
    expect(maxLength).toBe('10');
  });
});
