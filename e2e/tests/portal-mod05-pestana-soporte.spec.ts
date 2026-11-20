import AxeBuilder from '@axe-core/playwright';
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

// QA3 (2026-11-20): respuesta con la forma del contrato v1.0 de
// GET /wfm/subscribers/:id/upcoming-visits ({ items, total, truncated }), un origen por fila.
const UPCOMING_TICKET_VISIT_ID = '00000000-0000-4000-8000-000000000710';
const UPCOMING_CONTRACT_VISIT_ID = '00000000-0000-4000-8000-000000000711';
const UPCOMING_OPPORTUNITY_VISIT_ID = '00000000-0000-4000-8000-000000000712';

function buildUpcomingVisits() {
  const base = {
    kind: 'REQUEST' as const,
    scheduleEventId: null,
    status: 'READY_TO_SCHEDULE',
    workType: 'TECHNICAL_VISIT',
    scheduledAt: null,
    requestedWindowStartAt: null,
    // Longitud realista (QA3, tercera pasada): una dirección de ficha real, no un texto corto.
    address: 'Carrera 45 # 120-35, Conjunto Residencial Los Almendros, Torre 3, Apartamento 1402',
    createdAt: '2026-10-20T10:00:00.000Z',
  };
  const origin = { ticketId: null, ticketNumber: null, expedienteId: null, contractId: null };
  return {
    items: [
      {
        ...base,
        key: `REQUEST:${UPCOMING_TICKET_VISIT_ID}`,
        id: UPCOMING_TICKET_VISIT_ID,
        visitRequestId: UPCOMING_TICKET_VISIT_ID,
        origin: { ...origin, type: 'TICKET', ticketId: TICKET_ID, ticketNumber: 'TK-2026-0701' },
      },
      {
        ...base,
        key: `REQUEST:${UPCOMING_OPPORTUNITY_VISIT_ID}`,
        id: UPCOMING_OPPORTUNITY_VISIT_ID,
        visitRequestId: UPCOMING_OPPORTUNITY_VISIT_ID,
        workType: 'INSTALLATION',
        origin: {
          ...origin,
          type: 'OPPORTUNITY',
          expedienteId: '00000000-0000-4000-8000-000000000713',
        },
      },
      {
        ...base,
        key: `REQUEST:${UPCOMING_CONTRACT_VISIT_ID}`,
        id: UPCOMING_CONTRACT_VISIT_ID,
        visitRequestId: UPCOMING_CONTRACT_VISIT_ID,
        requestedWindowStartAt: '2026-10-23T14:00:00.000Z',
        origin: { ...origin, type: 'CONTRACT', contractId: '00000000-0000-4000-8000-000000000714' },
      },
    ],
    total: 3,
    truncated: false,
  };
}

function buildDenseTickets(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const day = String(10 + i).padStart(2, '0');
    return buildTicket({
      id: `00000000-0000-4000-8000-0000000008${n}`,
      ticketNumber: `TK-2026-08${n}`,
      // Textos de longitud realista para que CA-17 no pase solo por ser cortos.
      subject: `Sin servicio de internet desde la madrugada en todo el conjunto, caso ${n}`,
      description:
        'El cliente reporta que el módem enciende la luz roja de PON, ya reinició el equipo dos veces y el problema persiste en todas las habitaciones.',
      priority: i % 3 === 0 ? 'HIGH' : 'NORMAL',
      assignedUserId: '00000000-0000-4000-8000-000000000799',
      createdAt: `2026-10-${day}T10:00:00.000Z`,
      updatedAt: `2026-10-${day}T10:00:00.000Z`,
    });
  });
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: TENANT_SLUG });
}

async function setupMocks(
  page: Page,
  options: {
    permissions?: string[];
    privacyRestricted?: boolean;
    tickets?: Array<ReturnType<typeof buildTicket>>;
    upcomingVisits?: ReturnType<typeof buildUpcomingVisits>;
  } = {},
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
    upcomingVisits: [] as string[],
    creates: [] as Record<string, unknown>[],
  };
  let tickets = options.tickets ?? [buildTicket()];

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
    // QA3: el resto de tickets de la lista (lista densa) responde detalle, comentarios e historial.
    const otherTicket = /\/assurance\/tickets\/([0-9a-f-]{36})(\/comments|\/timeline)?$/u.exec(
      pathname,
    );
    if (otherTicket && method === 'GET') {
      const found = tickets.find((item) => item.id === otherTicket[1]);
      if (found) return route.fulfill({ json: otherTicket[2] ? [] : found });
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
    // QA3: upcoming-visits con la forma del contrato (sin sobre data: el cliente usa returnFullResponse); sin opción, vacío explícito (no el fallback { data: [] }).
    if (
      pathname.endsWith(`/wfm/subscribers/${SUBSCRIBER_ID}/upcoming-visits`) &&
      method === 'GET'
    ) {
      calls.upcomingVisits.push(pathname);
      return route.fulfill({
        json: options.upcomingVisits ?? { items: [], total: 0, truncated: false },
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
    // Spec 2026-11-20 §3 A: desde 1280 px la pestaña entra en vista dividida, sin «Cerrar».
    // Este flujo cubre el panel lateral de siempre, por debajo del corte.
    await page.setViewportSize({ width: 1279, height: 720 });
    await seedSession(page);
    const calls = await setupMocks(page);

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    const supportTab = page.getByRole('tab', { name: 'Soporte', exact: true });
    await expect(supportTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
    // P3 (2026-11-20): «Visitas» pasa a «Historial de visitas», plegado por defecto.
    await expect(
      page.getByRole('heading', { name: 'Historial de visitas', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir ticket TK-2026-0701: Intermitencia sintética' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Historial de visitas', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ver detalle de visita: Soporte, Pendiente' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver detalle de visita: Visita técnica, Programado' }),
    ).toBeVisible();

    expect(calls.tickets).toEqual([`?subscriberId=${SUBSCRIBER_ID}&limit=100&order=urgency`]);
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

    // Tras recargar, el historial vuelve plegado.
    await page.getByRole('button', { name: 'Historial de visitas', exact: true }).click();
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
    // Spec §8 (H14): el suscriptor va en el encabezado, no como campo.
    await expect(
      dialog.getByRole('heading', { name: 'Crear ticket para Ada Sintética' }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Suscriptor')).toHaveCount(0);
    await dialog.getByLabel('Asunto', { exact: true }).fill('Solicitud sintética vinculada');
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

  test('Vista dividida CA-2/CA-3/CA-4/CA-7: a 1440 abre el ticket de entrada en la columna, lo deja en la URL y pasa axe claro/oscuro', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSession(page);
    const calls = await setupMocks(page);
    const unknownId = '00000000-0000-4000-8000-0000000007ff';
    const unknownRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/assurance/tickets/${unknownId}`))
        unknownRequests.push(request.url());
    });

    // CA-4: un id que no está en la lista del suscriptor no se abre ni se consulta.
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte&ticket=${unknownId}`);
    const pane = page.getByRole('region', { name: 'Ticket abierto' });
    await expect(pane.getByRole('heading', { name: 'TK-2026-0701', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ticket=${TICKET_ID}`));
    expect(unknownRequests).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(0);

    // CA-7: la fila del ticket abierto se anuncia con aria-current y se alcanza con teclado.
    const row = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0701: Intermitencia sintética',
    });
    await expect(row).toHaveAttribute('aria-current', 'true');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toBeFocused();

    // CA-3: recargar conserva el ticket.
    await page.reload();
    await expect(pane.getByRole('heading', { name: 'TK-2026-0701', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`tab=soporte&ticket=${TICKET_ID}`));
    expect(calls.tickets.length).toBeGreaterThanOrEqual(2);

    // CA-8: el historial de visitas sigue en la pestaña, bajo la grilla (P3: renombrado y plegable).
    await expect(
      page.getByRole('heading', { name: 'Historial de visitas', exact: true }),
    ).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      );
      const result = await new AxeBuilder({ page })
        .include('[aria-label="Ticket abierto"]')
        .include('ul:has([aria-current="true"])')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = result.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking,
        `axe vista dividida (${theme}): ${blocking.map((v) => v.id).join(', ')}`,
      ).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('MOD09 adjuntos CA-4: la lista de tickets marca con un clip los que tienen adjuntos', async ({
    page,
  }) => {
    await seedSession(page);
    await setupMocks(page, {
      tickets: [
        buildTicket({ attachmentCount: 3 }),
        buildTicket({
          id: '00000000-0000-4000-8000-000000000706',
          ticketNumber: 'TK-2026-0706',
          subject: 'Consulta sin archivos',
          attachmentCount: 0,
        }),
      ],
    });

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    const withFiles = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0701: Intermitencia sintética, Abierto, prioridad normal, con 3 adjuntos',
    });
    await expect(withFiles).toBeVisible();
    const clip = withFiles.getByTestId('ticket-attachment-clip');
    await expect(clip).toBeVisible();
    await expect(clip).toHaveAttribute('title', 'Con 3 adjuntos');
    await expect(clip).toContainText('3');

    const withoutFiles = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0706: Consulta sin archivos, Abierto, prioridad normal',
      exact: true,
    });
    await expect(withoutFiles).toBeVisible();
    await expect(withoutFiles.getByTestId('ticket-attachment-clip')).toHaveCount(0);
  });

  test('CA-9/CA-10 (pantalla): sin descripción, la fila muestra el extracto y el conteo que envía la API', async ({
    page,
  }) => {
    await seedSession(page);
    await setupMocks(page, {
      tickets: [
        buildTicket({
          description: '',
          commentCount: 2,
          firstCommentExcerpt: 'Relato sintético del primer comentario visible',
        }),
        buildTicket({
          id: '00000000-0000-4000-8000-000000000707',
          ticketNumber: 'TK-2026-0707',
          subject: 'Con descripción propia',
          description: 'Descripción sintética propia',
          commentCount: 0,
          firstCommentExcerpt: null,
        }),
      ],
    });

    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    const withStory = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0701: Intermitencia sintética, Abierto, prioridad normal, con 2 comentarios',
    });
    await expect(withStory).toBeVisible();
    await expect(withStory).toContainText('Relato sintético del primer comentario visible');
    await expect(withStory).toContainText('Con 2 comentarios');

    const own = page.getByRole('button', {
      name: 'Abrir ticket TK-2026-0707: Con descripción propia, Abierto, prioridad normal',
      exact: true,
    });
    await expect(own).toContainText('Descripción sintética propia');
    await expect(own).not.toContainText('comentarios');
  });

  test('QA3 CA-13/CA-14/CA-16: la franja muestra las tres visitas, cada una lleva a su origen con un clic y el historial queda a un clic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSession(page);
    const calls = await setupMocks(page, { upcomingVisits: buildUpcomingVisits() });
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);

    const heading = page.getByRole('heading', { name: 'Próximas visitas' });
    const strip = page.getByRole('list', { name: 'Visitas pendientes' });
    await expect(heading).toBeVisible();
    // Franja de una línea (P3, quinta pasada): con la lista de visitas por debajo de 1100 px
    // (así a 1440 en vista dividida) se ve 1 visita y «+2 más».
    await expect(strip.getByRole('listitem')).toHaveCount(1);
    const more = page.getByRole('button', { name: 'Ver 2 visitas pendientes más' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(strip.getByRole('listitem')).toHaveCount(3);
    expect(calls.upcomingVisits).toHaveLength(1);

    // CA-16: la franja entra en la ventana de 1440×900 sin desplazar.
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);

    // CA-14: contrato y oportunidad abren la agenda; la visita del ticket abre el ticket en la pestaña.
    await expect(
      strip.getByRole('link', { name: /^Abrir en Agendamiento: visita .*contrato/i }),
    ).toBeVisible();
    await expect(
      strip.getByRole('link', { name: /^Abrir en Agendamiento: visita .*oportunidad/i }),
    ).toBeVisible();
    await strip.getByRole('button', { name: /^Ver ticket TK-2026-0701: visita/ }).click();
    await expect(
      page
        .getByRole('region', { name: 'Ticket abierto' })
        .getByRole('heading', { name: 'TK-2026-0701', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ticket=${TICKET_ID}`));

    // CA-16 (historial a un clic) y CA-14 (ninguna visita duplicada entre franja e historial).
    const history = page.getByRole('button', { name: 'Historial de visitas', exact: true });
    await history.click();
    await expect(history).toHaveAttribute('aria-expanded', 'true');
    for (const id of [
      UPCOMING_TICKET_VISIT_ID,
      UPCOMING_CONTRACT_VISIT_ID,
      UPCOMING_OPPORTUNITY_VISIT_ID,
    ]) {
      await expect(page.locator(`a[href*="${id}"]`)).toHaveCount(
        id === UPCOMING_TICKET_VISIT_ID ? 0 : 1,
      );
    }
  });

  test('QA3 CA-17/CA-18: con la franja presente, a 1440×900 se ven al menos 5 filas y la fila pedida por URL queda visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSession(page);
    const tickets = buildDenseTickets(12);
    await setupMocks(page, { tickets, upcomingVisits: buildUpcomingVisits() });
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    await expect(
      page.getByRole('list', { name: 'Visitas pendientes' }).getByRole('listitem'),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Ver 2 visitas pendientes más' })).toBeVisible();

    const ticketList = page.getByRole('list', { name: 'Tickets vinculados' });
    const rows = ticketList.locator(':scope > li');
    await expect(rows.first()).toBeVisible();
    const visibleRows = await rows.evaluateAll(
      (items) =>
        items.filter((li) => {
          const r = li.getBoundingClientRect();
          const list = li.closest('ul')?.getBoundingClientRect();
          return (
            r.height > 0 &&
            r.top >= 0 &&
            r.bottom <= window.innerHeight &&
            (!list || r.bottom <= list.bottom + 1)
          );
        }).length,
    );
    expect(visibleRows, 'filas visibles a 1440×900 con la franja').toBeGreaterThanOrEqual(5);

    // CA-18: el ticket pedido por URL está al final de la lista; su fila queda en vista sola.
    const last = tickets[tickets.length - 1];
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte&ticket=${last.id}`);
    const selected = ticketList.locator('[aria-current="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeInViewport();
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
