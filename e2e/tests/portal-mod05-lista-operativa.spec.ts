import { expect, test, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-lista-sintetica';
const SUBSCRIBER_IDS = [
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
] as const;
const CONTRACT_IDS = [
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
] as const;

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-lista-sintetica',
      email: 'sha256:operador-sintetico',
      role: 'ADMIN',
      tenantId: 'tenant-id-sintetico',
      schemaName: 'tenant_lista_sintetica',
      jti: 'jti-lista-sintetica',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_ME = {
  sub: 'user-lista-sintetica',
  email: 'sha256:operador-sintetico',
  role: 'ADMIN',
  tenantId: 'tenant-id-sintetico',
  schemaName: 'tenant_lista_sintetica',
  jti: 'jti-lista-sintetica',
  type: 'tenant',
  passwordResetRequired: false,
};

type MockOptions = { restricted?: boolean; lifecycle?: boolean };

function subscriberListItem(
  id: string,
  index: number,
  restricted = false,
  status: 'ACTIVE' | 'SUSPENDED' = 'SUSPENDED',
) {
  return {
    id,
    tenantId: 'tenant-id-sintetico',
    partyId: null,
    userId: null,
    privacyRestricted: restricted,
    anonymizedAt: null,
    anonymizedRequestId: null,
    status,
    personType: 'NATURAL',
    customerSegment: 'RESIDENTIAL',
    stratum: 3,
    vatTreatment: 'STANDARD',
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    documentType: 'CC',
    firstName: restricted ? 'NOMBRE_CENTINELA' : index === 0 ? 'Ana' : 'Luis',
    lastName: restricted ? 'APELLIDO_CENTINELA' : index === 0 ? 'Sintética' : 'Operativo',
    businessName: null,
    commercialName: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    contactPending: false,
    hasLiveContracts: true,
    primaryService: {
      contractId: CONTRACT_IDS[index],
      planName: 'Fibra sintética',
      status,
      city: restricted ? null : 'Ciudad Sintética',
      alias: null,
    },
    otherLiveServicesCount: 0,
    documentNumber: restricted ? 'DOCUMENTO_CENTINELA' : `DOC-SINTETICO-${index}`,
    email: restricted ? 'CORREO_CENTINELA@example.invalid' : 'persona@example.invalid',
    phone: '000000000000',
    city: 'Ciudad Sintética',
    department: 'Departamento Sintético',
  };
}

function subscriberDetail(
  id: string,
  restricted = false,
  status: 'ACTIVE' | 'SUSPENDED' = 'SUSPENDED',
) {
  return {
    ...subscriberListItem(id, 0, restricted, status),
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    altContactName: null,
    altContactPhone: null,
    whatsapp: null,
    address: null,
    neighborhood: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    manualOverrideReason: null,
    externalId: null,
    createdBy: null,
    deletedAt: null,
    fiscalCompleteness: { complete: true, missing: [] },
  };
}

function contract(id: string, subscriberId: string, status: 'ACTIVE' | 'SUSPENDED' = 'SUSPENDED') {
  return {
    id,
    tenantId: 'tenant-id-sintetico',
    quoteId: null,
    subscriberId,
    planId: 'plan-sintetico',
    planSnapshotJson: { name: 'Fibra sintética' },
    status,
    statusReasonCode: status === 'SUSPENDED' ? 'MORA' : null,
    statusChangedAt: '2026-10-19T10:00:00.000Z',
    titularAnonymizedAt: null,
    alias: 'Sede sintética',
    installationAddress: null,
    installationCity: 'Ciudad Sintética',
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    deletedAt: null,
  };
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: TENANT_SLUG });
}

async function setupMocks(page: Page, options: MockOptions = {}) {
  const contractRequests: string[] = [];
  const previewRequests: Array<{ id: string; payload: unknown }> = [];
  const suspendRequests: string[] = [];
  const suspendedSubscriberIds = new Set<string>();
  const statusFor = (id: string): 'ACTIVE' | 'SUSPENDED' =>
    !options.lifecycle || suspendedSubscriberIds.has(id) ? 'SUSPENDED' : 'ACTIVE';
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            displayName: 'Empresa sintética',
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
        },
      });
    }
    if (pathname.endsWith('/auth/me') && method === 'GET') {
      return route.fulfill({ json: { data: MOCK_ME } });
    }
    if (pathname.endsWith('/access-control/me/effective-permissions') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            effectivePermissions: ['crm.subscribers.read', 'crm.subscribers.manage'],
            isAdmin: true,
          },
        },
      });
    }
    if (pathname.endsWith('/users/user-lista-sintetica') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            id: MOCK_ME.sub,
            email: 'admin@example.invalid',
            role: 'ADMIN',
            status: 'ACTIVE',
            tenantId: 'tenant-id-sintetico',
            mfaEnabled: true,
            mfaRequired: false,
            emailVerified: true,
            passwordResetRequired: false,
            firstName: 'Operador',
            lastName: 'Sintético',
            phone: null,
            jobTitle: 'Administración',
            documentType: null,
            documentNumber: null,
            avatarUrl: null,
            createdAt: '2026-10-19T10:00:00.000Z',
            updatedAt: '2026-10-19T10:00:00.000Z',
            deletedAt: null,
          },
        },
      });
    }
    if (pathname.endsWith('/tenants/me') && method === 'GET' && !pathname.includes('/summary')) {
      return route.fulfill({
        json: {
          data: {
            id: 'tenant-id-sintetico',
            name: 'Empresa sintética',
            slug: TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'admin@example.invalid',
            showTenantName: true,
          },
        },
      });
    }
    if (pathname.endsWith('/tenants/me/summary')) {
      return route.fulfill({
        json: {
          data: {
            id: 'tenant-id-sintetico',
            slug: TENANT_SLUG,
            displayName: 'Empresa sintética',
            status: 'ACTIVE',
          },
        },
      });
    }
    if (pathname.includes('/notifications') && method === 'GET') {
      return route.fulfill({ json: { data: [], meta: { nextCursor: null, total: 0 } } });
    }
    if (pathname.includes('/audit-logs') && method === 'GET') {
      return route.fulfill({ json: { data: [] } });
    }
    if (pathname.endsWith('/crm/subscribers/queue-counts') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            active: options.lifecycle ? 3 - suspendedSubscriberIds.size : 3,
            suspended: options.lifecycle ? 2 + suspendedSubscriberIds.size : 2,
            contactPending: 1,
            fiscalIncomplete: 1,
            withoutLiveServices: 0,
          },
        },
      });
    }
    if (
      (pathname.endsWith('/crm/subscribers') && method === 'GET') ||
      (pathname.endsWith('/crm/subscribers/search') && method === 'POST')
    ) {
      const data = options.restricted
        ? [subscriberListItem(SUBSCRIBER_IDS[0], 0, true)]
        : SUBSCRIBER_IDS.map((id, index) => subscriberListItem(id, index, false, statusFor(id)));
      return route.fulfill({
        json: {
          data,
          total: data.length,
          meta: {
            nextCursor: null,
            total: data.length,
            totalIsEstimate: false,
            page: 1,
            limit: 20,
            totalPages: 1,
            hasMore: false,
            mode: 'page',
            capabilities: { randomAccess: true, sortableFields: [] },
            sort: null,
          },
        },
      });
    }

    const previewMatch = pathname.match(/\/crm\/subscribers\/([^/]+)\/services\/preview$/);
    if (previewMatch && method === 'POST' && options.lifecycle) {
      const id = previewMatch[1] ?? SUBSCRIBER_IDS[0];
      previewRequests.push({ id, payload: request.postDataJSON() });
      return route.fulfill({
        json: {
          data: {
            action: 'SUSPEND',
            affectedContracts: [
              { id: CONTRACT_IDS[0], fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' },
            ],
            subscriberStatus: { from: 'ACTIVE', to: 'SUSPENDED' },
            hasLiveContracts: true,
            warnings: [],
          },
        },
      });
    }

    const suspendMatch = pathname.match(/\/crm\/subscribers\/([^/]+)\/services\/suspend$/);
    if (suspendMatch && method === 'POST' && options.lifecycle) {
      const id = suspendMatch[1] ?? SUBSCRIBER_IDS[0];
      suspendRequests.push(id);
      suspendedSubscriberIds.add(id);
      return route.fulfill({ json: { data: {} } });
    }

    const contractMatch = pathname.match(/\/crm\/subscribers\/([^/]+)\/contracts$/);
    if (contractMatch && method === 'GET') {
      contractRequests.push(contractMatch[1] ?? '');
      const id = contractMatch[1] ?? SUBSCRIBER_IDS[0];
      return route.fulfill({
        json: { data: [contract(CONTRACT_IDS[0], id, statusFor(id))] },
      });
    }

    const detailMatch = pathname.match(/\/crm\/subscribers\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const id = detailMatch[1] ?? SUBSCRIBER_IDS[0];
      return route.fulfill({
        json: {
          data: subscriberDetail(id, options.restricted, statusFor(id)),
        },
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'E2E_UNMOCKED',
        message: 'Ruta no configurada para la prueba.',
      }),
    });
  });

  return { contractRequests, previewRequests, suspendRequests };
}

test.describe('MOD05 Fase 06 · lista operativa de suscriptores', () => {
  test('CA-LO-05 conserva la cola y la vista lateral al recargar', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.goto('/dashboard/crm/subscribers');
    await page.getByRole('heading', { name: 'Suscriptores' }).waitFor();
    const searchRequest = page.waitForRequest((request) => {
      const requestUrl = new URL(request.url());
      return (
        requestUrl.pathname.endsWith('/crm/subscribers/search') &&
        request.postDataJSON()?.search === 'FIBRA'
      );
    });
    await page.getByRole('searchbox').fill('FIBRA');
    await searchRequest;
    await expect(page).not.toHaveURL(/search=/);
    await page.getByRole('button', { name: 'Suspendidos, 2 suscriptores' }).click();
    await expect(page).toHaveURL(/queue=suspended/);

    const firstRow = page.getByRole('row', { name: /Ana Sintética/ });
    await firstRow.locator('td').nth(1).click();
    await expect(page).toHaveURL(/queue=suspended/);
    await expect(page).toHaveURL(new RegExp(`peek=${SUBSCRIBER_IDS[0]}`));
    await expect(page.getByRole('dialog', { name: 'Ana Sintética' })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/queue=suspended/);
    await expect(page).toHaveURL(new RegExp(`peek=${SUBSCRIBER_IDS[0]}`));
    await expect(page.getByRole('dialog', { name: 'Ana Sintética' })).toBeVisible();
    await expect(page.getByText('Sede sintética')).toBeVisible();
  });

  test('CA-LO-07 recorre filas con flechas y devuelve el foco al cerrar', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.goto('/dashboard/crm/subscribers');
    const firstRow = page.getByRole('row', { name: /Ana Sintética/ });
    const secondRow = page.getByRole('row', { name: /Luis Operativo/ });
    await firstRow.waitFor();
    await firstRow.focus();
    await page.keyboard.press('ArrowDown');
    await expect(secondRow).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`peek=${SUBSCRIBER_IDS[1]}`));
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/peek=/);
    await expect(secondRow).toBeFocused();
  });

  test('CA-LO-06 suspende desde la vista lateral y actualiza fila y conteos sin recargar', async ({
    page,
  }) => {
    await seedSession(page);
    const { previewRequests, suspendRequests } = await setupMocks(page, { lifecycle: true });
    let documentRequests = 0;
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documentRequests += 1;
    });

    await page.goto('/dashboard/crm/subscribers');
    await page.getByRole('heading', { name: 'Suscriptores' }).waitFor();
    const row = page.getByRole('row', { name: /Ana Sintética/ });
    await expect(row.getByText('Activo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activos, 3 suscriptores' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspendidos, 2 suscriptores' })).toBeVisible();
    await row.locator('td').nth(1).click();
    await expect(page.getByRole('dialog', { name: 'Ana Sintética' })).toBeVisible();
    const documentRequestCount = documentRequests;

    await page.getByRole('button', { name: 'Suspender servicios' }).click();
    await expect(page.getByRole('dialog', { name: 'Suspender servicios' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Motivo *' }).click();
    await page.getByRole('option', { name: 'Mora en el pago' }).click();
    await page.getByRole('button', { name: 'Ver vista previa' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa el cambio' })).toBeVisible();
    await page.getByRole('button', { name: 'Suspender 1 servicio' }).click();

    await expect(row.getByText('Suspendido')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activos, 2 suscriptores' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspendidos, 3 suscriptores' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`peek=${SUBSCRIBER_IDS[0]}`));
    expect(previewRequests).toEqual([
      {
        id: SUBSCRIBER_IDS[0],
        payload: expect.objectContaining({ action: 'SUSPEND', reasonCode: 'MORA' }),
      },
    ]);
    expect(suspendRequests).toEqual([SUBSCRIBER_IDS[0]]);
    expect(documentRequests).toBe(documentRequestCount);
  });

  test('CA-LO-07 una tecla fuera de la tabla no abre la vista lateral ni filtros', async ({
    page,
  }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.goto('/dashboard/crm/subscribers');
    await page.getByRole('heading', { name: 'Suscriptores' }).waitFor();
    const filtersButton = page.getByRole('button', { name: 'Más filtros' });
    await filtersButton.focus();
    await page.keyboard.press('j');

    await expect(filtersButton).toBeFocused();
    await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page).not.toHaveURL(/peek=/);
    await expect(page.getByRole('row', { name: /Ana Sintética/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('CA-LO-08 no presenta datos personales ni servicios en la vista restringida', async ({
    page,
  }) => {
    await seedSession(page);
    const { contractRequests } = await setupMocks(page, { restricted: true });

    await page.goto('/dashboard/crm/subscribers');
    const row = page.getByRole('row', { name: /Datos bloqueados/ });
    await row.waitFor();
    await row.locator('td').nth(1).click();
    await expect(page.getByRole('dialog', { name: 'Datos bloqueados' })).toBeVisible();
    await expect(
      page.getByText(
        'La información personal está bloqueada y no se puede editar desde este perfil.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Contacto', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Servicios vigentes', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/CENTINELA/)).toHaveCount(0);
    expect(contractRequests).toEqual([]);
  });
});
