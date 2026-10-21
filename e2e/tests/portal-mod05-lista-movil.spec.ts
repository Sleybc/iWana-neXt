import { expect, test, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-lista-movil-sintetica';
const SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000201';

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-lista-movil-sintetica',
      email: 'sha256:operador-sintetico',
      role: 'ADMIN',
      tenantId: 'tenant-id-sintetico',
      schemaName: 'tenant_lista_movil_sintetica',
      jti: 'jti-lista-movil-sintetica',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_ME = {
  sub: 'user-lista-movil-sintetica',
  email: 'sha256:operador-sintetico',
  role: 'ADMIN',
  tenantId: 'tenant-id-sintetico',
  schemaName: 'tenant_lista_movil_sintetica',
  jti: 'jti-lista-movil-sintetica',
  type: 'tenant',
  passwordResetRequired: false,
};

function subscriber() {
  return {
    id: SUBSCRIBER_ID,
    tenantId: 'tenant-id-sintetico',
    partyId: null,
    userId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    status: 'ACTIVE',
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
    firstName: 'Ana',
    lastName: 'Sintética',
    businessName: null,
    commercialName: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    contactPending: false,
    hasLiveContracts: true,
    primaryService: {
      contractId: '00000000-0000-4000-8000-000000000202',
      planName: 'Fibra sintética',
      status: 'ACTIVE',
      city: 'Bogotá',
      alias: null,
    },
    otherLiveServicesCount: 1,
    documentNumber: 'DOCUMENTO-SINTÉTICO-201',
    phone: '3001234567',
    altContactPhone: '3012345678',
    whatsapp: '3001234567',
    city: 'Bogotá',
    department: 'Cundinamarca',
  };
}

function subscriberDetail() {
  return {
    ...subscriber(),
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    altContactName: null,
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

function contract() {
  return {
    id: '00000000-0000-4000-8000-000000000202',
    tenantId: 'tenant-id-sintetico',
    quoteId: null,
    subscriberId: SUBSCRIBER_ID,
    planId: 'plan-sintetico',
    planSnapshotJson: { name: 'Fibra sintética' },
    status: 'ACTIVE',
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias: 'Sede sintética',
    installationAddress: null,
    installationCity: 'Bogotá',
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

async function setupMocks(page: Page) {
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
    if (pathname.endsWith('/users/user-lista-movil-sintetica') && method === 'GET') {
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
    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return route.fulfill({ json: { data: { countryCode: 'CO' } } });
    }
    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return route.fulfill({
        json: { data: { id: 'tenant-id-sintetico', slug: TENANT_SLUG, status: 'ACTIVE' } },
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
            active: 1,
            suspended: 0,
            contactPending: 0,
            fiscalIncomplete: 0,
            withoutLiveServices: 0,
          },
        },
      });
    }
    if (pathname.endsWith('/crm/subscribers') && method === 'GET') {
      return route.fulfill({
        json: {
          data: [subscriber()],
          total: 1,
          meta: {
            nextCursor: null,
            total: 1,
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
    if (pathname.endsWith(`/crm/subscribers/${SUBSCRIBER_ID}/contracts`) && method === 'GET') {
      return route.fulfill({ json: { data: [contract()] } });
    }
    if (pathname.endsWith(`/crm/subscribers/${SUBSCRIBER_ID}`) && method === 'GET') {
      return route.fulfill({ json: { data: subscriberDetail() } });
    }

    return route.fulfill({ status: 404, json: { code: 'E2E_UNMOCKED' } });
  });
}

test.describe('MOD05 Fase 08 · lista móvil de suscriptores', () => {
  test('CA-MV-08 muestra tarjetas y contacto seguro a 375 px; al cambiar el ancho no repite la lista', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => {
      window.localStorage.setItem('iwana-theme', 'light');
    });
    await seedSession(page);
    let phase = 'initial';
    const listEvents: Array<{
      phase: string;
      direction: 'request' | 'response' | 'failure';
      endpoint: string;
      status?: number;
    }> = [];
    const requestPhases = new WeakMap<object, string>();
    const endpointFor = (request: { url(): string }) => {
      const url = new URL(request.url());
      const allowedQueryKeys = [
        'page',
        'limit',
        'size',
        'sortBy',
        'sortDir',
        'status',
        'personType',
        'customerSegment',
        'stratum',
        'queue',
        'contactPending',
        'fiscalIncomplete',
        'withoutLiveServices',
      ];
      const safeQuery = new URLSearchParams();
      for (const key of allowedQueryKeys) {
        const value = url.searchParams.get(key);
        if (value !== null) safeQuery.set(key, value);
      }
      if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.includes(key))) {
        safeQuery.set('other', 'redacted');
      }
      return `${url.pathname}${safeQuery.size ? `?${safeQuery.toString()}` : ''}`;
    };
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/crm/subscribers')) {
        requestPhases.set(request, phase);
        listEvents.push({ phase, direction: 'request', endpoint: endpointFor(request) });
      }
    });
    page.on('response', (response) => {
      const request = response.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/crm/subscribers')) {
        listEvents.push({
          phase: requestPhases.get(request) ?? phase,
          direction: 'response',
          endpoint: endpointFor(request),
          status: response.status(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/api/v1/crm/subscribers')) {
        listEvents.push({
          phase: requestPhases.get(request) ?? phase,
          direction: 'failure',
          endpoint: endpointFor(request),
        });
      }
    });
    await setupMocks(page);

    await page.goto('/dashboard/crm/subscribers');

    const cards = page.getByRole('list', { name: 'Suscriptores' });
    const card = page.getByRole('listitem').filter({ hasText: 'Ana Sintética' });
    const summaryButton = card.getByRole('button', { name: 'Abrir resumen de Ana Sintética' });
    await expect(summaryButton).toBeVisible();
    await expect(page.getByRole('link', { name: 'Llamar a Ana Sintética' })).toHaveAttribute(
      'href',
      'tel:+573001234567',
    );
    const whatsapp = page.getByRole('link', { name: 'Escribir por WhatsApp a Ana Sintética' });
    await expect(whatsapp).toHaveAttribute('href', 'https://wa.me/573001234567');
    await expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(whatsapp).toHaveAttribute('target', '_blank');
    await expect(cards).toContainText('Fibra sintética');
    expect(await card.innerText()).not.toContain('3001234567');
    await expect(page).toHaveURL(/dashboard\/crm\/subscribers$/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('375-light.png'),
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({
      path: testInfo.outputPath('375-dark.png'),
      fullPage: true,
      animations: 'disabled',
    });

    const initialListEvents = [
      {
        phase: 'initial',
        direction: 'request',
        endpoint: '/api/v1/crm/subscribers?page=1&limit=20',
      },
      {
        phase: 'initial',
        direction: 'response',
        endpoint: '/api/v1/crm/subscribers?page=1&limit=20',
        status: 200,
      },
    ];
    expect(listEvents).toEqual(initialListEvents);

    phase = 'peek-open';
    await summaryButton.click();
    await expect(page.getByRole('dialog', { name: 'Ana Sintética' })).toBeVisible();
    expect(listEvents).toEqual(initialListEvents);
    phase = 'peek-close';
    await page.keyboard.press('Escape');
    await expect(summaryButton).toBeFocused();
    expect(listEvents).toEqual(initialListEvents);

    phase = 'resize-768';
    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.getByRole('table', { name: 'Listado de suscriptores' })).toBeVisible();
    await expect(card).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('768-light.png'),
      fullPage: true,
      animations: 'disabled',
    });
    expect(listEvents).toEqual(initialListEvents);

    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({
      path: testInfo.outputPath('768-dark.png'),
      fullPage: true,
      animations: 'disabled',
    });

    phase = 'resize-375';
    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(summaryButton).toBeVisible();
    expect(listEvents).toEqual(initialListEvents);
  });
});
