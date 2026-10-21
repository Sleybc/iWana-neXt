import { expect, test, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-soporte-sintetico';
const SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000701';
const TICKET_ID = '00000000-0000-4000-8000-000000000702';
const VISIT_ID = '00000000-0000-4000-8000-000000000703';
const EVENT_ID = '00000000-0000-4000-8000-000000000704';
const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-soporte-sintetico',
      email: 'sha256:operador-sintetico',
      role: 'SUPPORT',
      tenantId: 'tenant-id-soporte',
      schemaName: 'tenant_soporte_sintetico',
      jti: 'jti-soporte-sintetico',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_ME = {
  sub: 'user-soporte-sintetico',
  email: 'sha256:operador-sintetico',
  role: 'SUPPORT',
  tenantId: 'tenant-id-soporte',
  schemaName: 'tenant_soporte_sintetico',
  jti: 'jti-soporte-sintetico',
  type: 'tenant',
  passwordResetRequired: false,
};

const EMPTY_META = { page: 1, limit: 100, total: 0, totalPages: 1, hasMore: false };

function buildTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-id-soporte',
    ticketNumber: 'TK-2026-0701',
    type: 'CUSTOMER_INCIDENT',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'PORTAL',
    subject: 'Intermitencia sintética',
    description: 'Descripción sintética',
    requesterType: 'SUBSCRIBER',
    requesterRefId: SUBSCRIBER_ID,
    subjectType: null,
    subjectRefId: null,
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: '2026-10-22T15:00:00.000Z',
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: 'OK',
    fieldDecision: 'NOT_REQUIRED',
    workOrderId: null,
    createdByUserId: 'user-soporte-sintetico',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

function buildVisitRequest() {
  return {
    id: VISIT_ID,
    tenantId: 'tenant-id-soporte',
    status: 'PENDING',
    originContext: 'CRM',
    originRef: 'expediente-sintetico',
    originLabel: null,
    workType: 'SUPPORT',
    priority: 'NORMAL',
    title: 'Visita sintética',
    description: null,
    requestedWindowStartAt: null,
    requestedWindowEndAt: null,
    slaDueAt: null,
    address: 'Dirección sintética',
    municipality: 'Ciudad sintética',
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: 'expediente-sintetico',
    subscriberId: SUBSCRIBER_ID,
    ticketId: null,
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    requestedByUserId: 'user-soporte-sintetico',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    deletedAt: null,
  };
}

function buildScheduleEvent() {
  return {
    id: EVENT_ID,
    tenantId: 'tenant-id-soporte',
    workOrderId: null,
    type: 'TECHNICAL_VISIT',
    status: 'SCHEDULED',
    title: 'Evento sintético',
    description: null,
    scheduledStartAt: '2026-10-23T15:00:00.000Z',
    scheduledEndAt: '2026-10-23T16:00:00.000Z',
    assignedUserId: 'user-soporte-sintetico',
    assignedTeamId: null,
    address: 'Dirección sintética',
    municipality: 'Ciudad sintética',
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: 'expediente-sintetico',
    subscriberId: SUBSCRIBER_ID,
    organizationSiteId: null,
    ticketId: null,
    contractId: null,
    createdBy: 'user-soporte-sintetico',
    updatedBy: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    deletedAt: null,
  };
}

function buildSubscriber(privacyRestricted = false) {
  return {
    id: SUBSCRIBER_ID,
    tenantId: 'tenant-id-soporte',
    userId: null,
    partyId: null,
    privacyRestricted,
    anonymizedAt: null,
    anonymizedRequestId: null,
    status: 'ACTIVE',
    personType: 'NATURAL',
    customerSegment: 'RESIDENTIAL',
    documentType: 'CC',
    documentNumber: 'DOC-SINTETICO',
    firstName: 'Ada',
    lastName: 'Sintética',
    stratum: 3,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    altContactName: null,
    altContactPhone: null,
    email: 'persona@example.invalid',
    phone: '0000000000',
    contactPending: false,
    whatsapp: null,
    vatTreatment: 'STANDARD',
    address: null,
    neighborhood: null,
    city: 'Ciudad sintética',
    department: 'Departamento sintético',
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    manualOverrideReason: null,
    externalId: null,
    createdBy: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    deletedAt: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    fiscalCompleteness: { complete: true, missing: [] },
    taxRegime: null,
    expedienteId: null,
  };
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: TENANT_SLUG });
}

async function setupMocks(
  page: Page,
  options: { permissions?: string[]; privacyRestricted?: boolean } = {},
) {
  const permissions = options.permissions ?? [
    'crm.subscribers.read',
    'crm.subscribers.manage',
    'assurance.tickets.read',
    'assurance.tickets.manage',
    'wfm.schedule.read',
  ];
  const calls = {
    tickets: [] as string[],
    visitRequests: [] as string[],
    events: [] as string[],
    creates: [] as Record<string, unknown>[],
  };
  let tickets = [buildTicket()];

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
        json: { data: { effectivePermissions: permissions, isAdmin: false } },
      });
    }
    if (pathname.endsWith('/users/user-soporte-sintetico') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            id: MOCK_ME.sub,
            email: 'operador@example.invalid',
            role: 'SUPPORT',
            status: 'ACTIVE',
            tenantId: 'tenant-id-soporte',
            mfaEnabled: true,
            mfaRequired: false,
            emailVerified: true,
            passwordResetRequired: false,
            firstName: 'Operador',
            lastName: 'Sintético',
            phone: null,
            jobTitle: 'Soporte',
            documentType: null,
            documentNumber: null,
            avatarUrl: null,
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
            deletedAt: null,
          },
        },
      });
    }
    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            id: 'tenant-id-soporte',
            slug: TENANT_SLUG,
            displayName: 'Empresa sintética',
            status: 'ACTIVE',
          },
        },
      });
    }
    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            id: 'tenant-id-soporte',
            name: 'Empresa sintética',
            slug: TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'empresa@example.invalid',
            showTenantName: true,
          },
        },
      });
    }
    if (pathname.endsWith('/notifications') && method === 'GET') {
      return route.fulfill({ json: { data: [], meta: { nextCursor: null, total: 0 } } });
    }
    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      return route.fulfill({ json: { data: [] } });
    }
    if (pathname.endsWith(`/crm/subscribers/${SUBSCRIBER_ID}/360`) && method === 'GET') {
      return route.fulfill({
        json: {
          data: {
            subscriber: buildSubscriber(options.privacyRestricted),
            contacts: [],
            contracts: [],
            quotes: [],
            habeasData: [],
            arcoRequests: [],
            privacyMarks: [],
            expedienteSummary: null,
            timelineSeed: [],
          },
        },
      });
    }
    if (pathname.endsWith('/assurance/sla-policies') && method === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (pathname.endsWith('/users') && method === 'GET') {
      return route.fulfill({
        json: { data: { data: [], meta: { nextCursor: null, total: 0, limit: 100 } } },
      });
    }
    if (pathname.endsWith('/assurance/tickets') && method === 'GET') {
      calls.tickets.push(url.search);
      return route.fulfill({
        json: { data: tickets, meta: { ...EMPTY_META, total: tickets.length } },
      });
    }
    if (pathname.endsWith('/assurance/tickets') && method === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      calls.creates.push(payload);
      const created = buildTicket({
        id: '00000000-0000-4000-8000-000000000705',
        ticketNumber: 'TK-2026-0702',
        subject: String(payload.subject),
        requesterType: payload.requesterType,
        requesterRefId: payload.requesterRefId,
        createdAt: '2026-10-20T11:00:00.000Z',
        updatedAt: '2026-10-20T11:00:00.000Z',
      });
      tickets = [created, ...tickets];
      return route.fulfill({ status: 201, json: created });
    }
    if (pathname.endsWith(`/assurance/tickets/${TICKET_ID}/comments`) && method === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (pathname.endsWith(`/assurance/tickets/${TICKET_ID}/timeline`) && method === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (pathname.endsWith(`/assurance/tickets/${TICKET_ID}`) && method === 'GET') {
      return route.fulfill({ json: tickets[0] });
    }
    if (pathname.endsWith('/wfm/visit-requests') && method === 'GET') {
      calls.visitRequests.push(url.search);
      return route.fulfill({
        json: {
          items: [buildVisitRequest()],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        },
      });
    }
    if (pathname.endsWith('/wfm/events') && method === 'GET') {
      calls.events.push(url.search);
      return route.fulfill({
        json: { data: [buildScheduleEvent()], meta: { ...EMPTY_META, total: 1 } },
      });
    }

    return route.fulfill({ json: { data: [] } });
  });

  return calls;
}

test.describe('MOD05 · pestaña Soporte', () => {
  test('CA-SO-04/06: consulta módulos por separado, persiste la pestaña, abre detalles y crea un ticket fijado', async ({
    page,
  }) => {
    await seedSession(page);
    const calls = await setupMocks(page);

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    const supportTab = page.getByRole('tab', { name: 'Soporte', exact: true });
    await expect(supportTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Visitas', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir ticket TK-2026-0701: Intermitencia sintética' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver detalle de visita: Soporte, Pendiente' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver detalle de visita: Visita técnica, Programado' }),
    ).toBeVisible();

    expect(calls.tickets).toEqual([`?subscriberId=${SUBSCRIBER_ID}&limit=100`]);
    expect(calls.visitRequests).toEqual([
      `?subscriberId=${SUBSCRIBER_ID}&page=1&limit=100&scope=all`,
    ]);
    expect(calls.events).toEqual([`?subscriberId=${SUBSCRIBER_ID}&page=1&limit=100`]);

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Soporte', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const ticketRow = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0701: Intermitencia sintética',
    });
    await ticketRow.click();
    await expect(page.getByRole('heading', { name: 'TK-2026-0701', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

    const visitRow = page.getByRole('button', {
      name: 'Ver detalle de visita: Soporte, Pendiente',
    });
    await visitRow.click();
    await expect(page.getByRole('heading', { name: 'Detalle de la visita' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir en Agendamiento' })).toHaveAttribute(
      'href',
      new RegExp(`visitRequestId=${VISIT_ID}`),
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Detalle de la visita' })).toHaveCount(0);
    await expect(visitRow).toBeFocused();

    await page.getByRole('button', { name: 'Crear ticket', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Suscriptor')).toHaveValue('Ada Sintética');
    await expect(dialog.getByLabel('Suscriptor')).toHaveAttribute('readonly', '');
    await dialog.getByLabel('Asunto operativo').fill('Solicitud sintética vinculada');
    await dialog.getByRole('button', { name: 'Crear ticket', exact: true }).click();

    await expect.poll(() => calls.creates.length).toBe(1);
    expect(calls.creates[0]).toMatchObject({
      requesterType: 'SUBSCRIBER',
      requesterRefId: SUBSCRIBER_ID,
      subject: 'Solicitud sintética vinculada',
    });
    await expect(
      page.getByText('Ticket creado y vinculado al suscriptor', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Abrir ticket TK-2026-0702: Solicitud sintética vinculada',
      }),
    ).toBeVisible();
    expect(calls.tickets.length).toBeGreaterThanOrEqual(3);
    expect(calls.visitRequests).toHaveLength(2);
    expect(calls.events).toHaveLength(2);
  });

  test('CA-SO-03: cada aviso de permiso evita su petición de lectura', async ({ page }) => {
    await seedSession(page);
    const calls = await setupMocks(page, {
      permissions: ['crm.subscribers.read', 'crm.subscribers.manage'],
    });

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    await expect(page.getByText('No tienes acceso a los tickets')).toBeVisible();
    await expect(page.getByText('No tienes acceso a las visitas')).toBeVisible();
    expect(calls.tickets).toEqual([]);
    expect(calls.visitRequests).toEqual([]);
    expect(calls.events).toEqual([]);
    await expect(page.getByRole('button', { name: 'Crear ticket', exact: true })).toHaveCount(0);
  });

  test('RF-SO-14: el perfil restringido no muestra Soporte ni solicita datos de los módulos', async ({
    page,
  }) => {
    await seedSession(page);
    const calls = await setupMocks(page, { privacyRestricted: true });

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    await expect(page.getByRole('tab', { name: 'Soporte', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Datos bloqueados' })).toBeVisible();
    expect(calls.tickets).toEqual([]);
    expect(calls.visitRequests).toEqual([]);
    expect(calls.events).toEqual([]);
  });
});
