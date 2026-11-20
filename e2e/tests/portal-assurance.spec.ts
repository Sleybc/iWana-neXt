/**
 * E2E — Mesa de ayuda / Service Assurance en el portal empresarial.
 *
 * Cubre el flujo observable de Fase 01 con mocks estables del contrato HTTP:
 * - SUPPORT crea un ticket desde el portal.
 * - SUPPORT comenta el ticket.
 * - SUPPORT lo mueve a IN_PROGRESS, solicita una visita técnica, vincula una orden de trabajo
 *   buscándola por número (MOD10 D4) y luego lo resuelve.
 * - El timeline refleja los hitos funcionales visibles.
 */

import { expect, test } from '@playwright/test';
import { mockEffectivePermissions } from './helpers/effective-permissions';
import { seedPortalSession as seedPortalSessionByCookie } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'tenant-assurance-demo';

/**
 * Aserción de cabecera de tenant, portada de
 * portal-settings-federated-shell.spec.ts:105-114: el cliente siempre
 * transporta el slug resuelto en X-Tenant-Slug.
 */
async function assertTenantHeader(route: import('@playwright/test').Route) {
  const headers = await route.request().allHeaders();
  expect(headers['x-tenant-slug']).toBe(MOCK_TENANT_SLUG);
}
const SUPPORT_USER_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE_ID = '22222222-2222-4222-8222-222222222222';
const SUBSCRIBER_ID = '44444444-4444-4444-8444-444444444444';
// MOD10 D4: el vínculo manual es de la orden de ejecución (OTE), buscada por su número.
const EXECUTION_ORDER_ID = '33333333-3333-4333-8333-333333333333';
const EXECUTION_ORDER_NUMBER = 'OTE-20260509-001';

function buildToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: SUPPORT_USER_ID,
      email: 'hash-support',
      role: 'SUPPORT',
      tenantId: 'tenant-assurance-001',
      schemaName: 'tenant_assurance_001',
      jti: 'jti-support',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

/** OTE sintética que devuelven la búsqueda por número y el vínculo (contrato `TicketExecutionOrder`). */
function buildExecutionOrder(): MockExecutionOrder {
  return {
    id: EXECUTION_ORDER_ID,
    number: EXECUTION_ORDER_NUMBER,
    status: 'ASSIGNED',
    result: null,
    closedAt: null,
  };
}

type MockTicket = {
  id: string;
  tenantId: string;
  ticketNumber: string;
  type: string;
  status: string;
  priority: string;
  source: string;
  subject: string;
  description: string | null;
  requesterType: string;
  requesterRefId: string | null;
  subjectType: string | null;
  subjectRefId: string | null;
  assignedUserId: string | null;
  queueName: string | null;
  slaPolicyId: string | null;
  slaFirstResponseAt: string | null;
  slaResolveByAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaBreachStatus: string;
  fieldDecision: string;
  workOrderId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  // MOD10 paso 2 (§5 datos): orden de ejecución vinculada, que el riel muestra con su número.
  executionOrder?: MockExecutionOrder | null;
  executionOrderCount?: number | null;
};

type MockExecutionOrder = {
  id: string;
  number: string;
  status: string;
  result: string | null;
  closedAt: string | null;
};

type MockComment = {
  id: string;
  ticketId: string;
  tenantId: string;
  body: string;
  isInternal: boolean;
  authorUserId: string;
  createdAt: string;
};

type MockTimelineEvent = {
  id: string;
  ticketId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  occurredAt: string;
};

async function seedPortalSession(page: import('@playwright/test').Page) {
  await seedPortalSessionByCookie(page, { token: buildToken(), tenantSlug: MOCK_TENANT_SLUG });
  await mockEffectivePermissions(page, {
    userId: SUPPORT_USER_ID,
    role: 'SUPPORT',
    effectivePermissions: [
      'assurance.tickets.read',
      'assurance.tickets.manage',
      'crm.subscribers.read',
      // MOD10 §3 L: el buscador de la orden exige ver órdenes de trabajo.
      'operations.execution_orders.read',
    ],
  });
}

async function setupAssuranceMocks(page: import('@playwright/test').Page) {
  const users = [
    {
      id: SUPPORT_USER_ID,
      email: 'support@assurance.local',
      role: 'SUPPORT',
      status: 'ACTIVE',
      tenantId: 'tenant-assurance-001',
      mfaEnabled: true,
      mfaRequired: false,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: nowIso(-1000),
      updatedAt: nowIso(-1000),
      deletedAt: null,
      firstName: 'Paula',
      lastName: 'Mesa',
      phone: null,
      jobTitle: 'Agente de soporte',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
    {
      id: ASSIGNEE_ID,
      email: 'noc@assurance.local',
      role: 'NOC',
      status: 'ACTIVE',
      tenantId: 'tenant-assurance-001',
      mfaEnabled: true,
      mfaRequired: false,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: nowIso(-900),
      updatedAt: nowIso(-900),
      deletedAt: null,
      firstName: 'Luis',
      lastName: 'Montero',
      phone: null,
      jobTitle: 'NOC',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ];

  const slaPolicies = [
    {
      id: 'sla-001',
      tenantId: 'tenant-assurance-001',
      name: 'SLA soporte general',
      appliesToType: 'CUSTOMER_INCIDENT',
      appliesToPriority: 'NORMAL',
      firstResponseMinutes: 60,
      resolutionMinutes: 240,
      isActive: true,
      createdAt: nowIso(-500),
      updatedAt: nowIso(-500),
    },
  ];

  const tickets: MockTicket[] = [];
  const commentsByTicket = new Map<string, MockComment[]>();
  const timelineByTicket = new Map<string, MockTimelineEvent[]>();

  const buildSummary = () => ({
    openCount: tickets.filter((ticket) => ticket.status === 'OPEN').length,
    assignedCount: tickets.filter((ticket) => ticket.status === 'ASSIGNED').length,
    inProgressCount: tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length,
    atRiskCount: 0,
    breachedCount: 0,
    resolvedTodayCount: tickets.filter((ticket) => ticket.status === 'RESOLVED').length,
    fieldServicePendingCount: tickets.filter(
      (ticket) => ticket.status === 'FIELD_SERVICE_REQUESTED',
    ).length,
    byPriority: tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[ticket.priority] = (acc[ticket.priority] ?? 0) + 1;
      return acc;
    }, {}),
    byType: tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[ticket.type] = (acc[ticket.type] ?? 0) + 1;
      return acc;
    }, {}),
  });

  const appendTimeline = (
    ticketId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) => {
    const current = timelineByTicket.get(ticketId) ?? [];
    current.push({
      id: `timeline-${ticketId}-${current.length + 1}`,
      ticketId,
      tenantId: 'tenant-assurance-001',
      eventType,
      payload,
      actorUserId: SUPPORT_USER_ID,
      occurredAt: nowIso(current.length + 1),
    });
    timelineByTicket.set(ticketId, current);
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant Assurance Demo',
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

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: SUPPORT_USER_ID,
            email: 'hash-support',
            role: 'SUPPORT',
            tenantId: 'tenant-assurance-001',
            schemaName: 'tenant_assurance_001',
            jti: 'jti-support',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-assurance-001',
            name: 'Tenant Assurance Demo',
            slug: MOCK_TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'tenant@assurance.local',
            legalName: 'Tenant Assurance Demo SAS',
            city: 'Bogota',
            department: 'Cundinamarca',
            countryCode: 'CO',
            phone: null,
            website: null,
            createdAt: nowIso(-10000),
            logoLightUrl: null,
            logoLightAssetId: null,
            logoDarkUrl: null,
            logoDarkAssetId: null,
            sealLightUrl: null,
            sealLightAssetId: null,
            sealDarkUrl: null,
            sealDarkAssetId: null,
            faviconLightUrl: null,
            faviconLightAssetId: null,
            faviconDarkUrl: null,
            faviconDarkAssetId: null,
            loginBackgroundLightUrl: null,
            loginBackgroundLightAssetId: null,
            loginBackgroundDarkUrl: null,
            loginBackgroundDarkAssetId: null,
            showTenantName: true,
            brandingProductName: 'iWana Empresa',
            brandingSurfaceName: 'Portal empresarial',
            brandingMetadataTitle: 'iWana Empresa',
            brandingMetadataDescription: 'Portal empresarial tenant-aware',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: users,
          meta: { nextCursor: null },
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/subscribers/search') && method === 'POST') {
      await assertTenantHeader(route);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: SUBSCRIBER_ID,
              personType: 'NATURAL',
              commercialName: null,
              businessName: null,
              firstName: 'Ada',
              lastName: 'Sintética',
              city: 'Bogotá',
              email: null,
              documentNumber: null,
            },
          ],
          total: 1,
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      });
      return;
    }

    if (pathname.endsWith(`/users/${SUPPORT_USER_ID}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: SUPPORT_USER_ID,
            email: 'support@assurance.local',
            role: 'SUPPORT',
            status: 'ACTIVE',
            firstName: 'Paula',
            lastName: 'Mesa',
            phone: null,
            jobTitle: 'Agente de soporte',
            avatarUrl: null,
            mfaEnabled: true,
            emailVerified: true,
            createdAt: nowIso(-1000),
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/assurance/sla-policies') && method === 'GET') {
      await assertTenantHeader(route);
      expect(method).toBe('GET');
      expect(route.request().url()).toContain('/assurance/sla-policies');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(slaPolicies),
      });
      return;
    }

    if (pathname.endsWith('/assurance/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSummary()),
      });
      return;
    }

    if (pathname.endsWith('/assurance/tickets') && method === 'GET') {
      // Bandeja 2026-11-18 §3 J (paso 2, QA2): la cola va al servidor como `workQueue`; el mock
      // la respeta como el API (`ticket-list-sql.ts`): «Míos» = activos asignados a quien consulta
      // (sub del JWT), «Todos» = solo activos (D1). Así la cola por defecto no se aprueba sola.
      const params = new URL(request.url()).searchParams;
      const workQueue = params.get('workQueue');
      const assignedUserId = params.get('assignedUserId');
      const status = params.get('status');
      const isActive = (entry: MockTicket) =>
        !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(entry.status);
      const listed = tickets.filter(
        (entry) =>
          (!assignedUserId || entry.assignedUserId === assignedUserId) &&
          (!status || entry.status === status) &&
          (workQueue !== 'mine' || (isActive(entry) && entry.assignedUserId === SUPPORT_USER_ID)) &&
          (workQueue !== 'all' || isActive(entry)),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: listed,
          total: listed.length,
          page: 1,
          limit: 20,
        }),
      });
      return;
    }

    if (pathname.endsWith('/assurance/tickets') && method === 'POST') {
      await assertTenantHeader(route);
      expect(method).toBe('POST');
      expect(route.request().url()).toContain('/assurance/tickets');
      const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      expect(payload).toHaveProperty('type');
      expect(payload).toHaveProperty('subject');
      expect(payload.requesterType).toBe('SUBSCRIBER');
      expect(payload.requesterRefId).toBe(SUBSCRIBER_ID);
      const ticketId = `ticket-${tickets.length + 1}`;
      const ticket: MockTicket = {
        id: ticketId,
        tenantId: 'tenant-assurance-001',
        ticketNumber: `TK-20260509-00${tickets.length + 1}`,
        type: String(payload.type),
        status: payload.assignedUserId ? 'ASSIGNED' : 'OPEN',
        priority: String(payload.priority ?? 'NORMAL'),
        source: String(payload.source ?? 'PORTAL'),
        subject: String(payload.subject),
        description: typeof payload.description === 'string' ? payload.description : null,
        requesterType: String(payload.requesterType),
        requesterRefId: typeof payload.requesterRefId === 'string' ? payload.requesterRefId : null,
        subjectType: typeof payload.subjectType === 'string' ? payload.subjectType : null,
        subjectRefId: typeof payload.subjectRefId === 'string' ? payload.subjectRefId : null,
        assignedUserId: typeof payload.assignedUserId === 'string' ? payload.assignedUserId : null,
        queueName: typeof payload.queueName === 'string' ? payload.queueName : null,
        slaPolicyId: typeof payload.slaPolicyId === 'string' ? payload.slaPolicyId : null,
        slaFirstResponseAt: nowIso(60),
        slaResolveByAt: nowIso(240),
        firstRespondedAt: null,
        resolvedAt: null,
        closedAt: null,
        slaBreachStatus: 'OK',
        fieldDecision: String(payload.fieldDecision ?? 'NOT_REQUIRED'),
        workOrderId: null,
        createdByUserId: SUPPORT_USER_ID,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      tickets.unshift(ticket);
      commentsByTicket.set(ticketId, []);
      timelineByTicket.set(ticketId, [
        {
          id: `timeline-${ticketId}-1`,
          ticketId,
          tenantId: 'tenant-assurance-001',
          eventType: 'CREATED',
          payload: { ticketNumber: ticket.ticketNumber, type: ticket.type },
          actorUserId: SUPPORT_USER_ID,
          occurredAt: nowIso(),
        },
      ]);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(ticket),
      });
      return;
    }

    // MOD10 D4: búsqueda exacta de la orden de ejecución por número.
    if (pathname.endsWith('/assurance/execution-orders/lookup') && method === 'GET') {
      await assertTenantHeader(route);
      const params = new URL(request.url()).searchParams;
      if (params.get('number') !== EXECUTION_ORDER_NUMBER) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Orden no encontrada' }),
        });
        return;
      }
      const linkedTicket = tickets.find((item) => item.executionOrder?.id === EXECUTION_ORDER_ID);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...buildExecutionOrder(),
          linkedTicket: !linkedTicket
            ? 'NONE'
            : linkedTicket.id === params.get('ticketId')
              ? 'THIS'
              : 'OTHER',
        }),
      });
      return;
    }

    const ticketMatch = pathname.match(
      /\/assurance\/tickets\/([^/]+)(?:\/(comments|timeline|status|request-field-service|link-execution-order))?$/,
    );
    if (ticketMatch) {
      const [, ticketId, action] = ticketMatch;
      const ticket = tickets.find((item) => item.id === ticketId);

      if (!ticket) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Ticket no encontrado' }),
        });
        return;
      }

      if (!action && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ticket),
        });
        return;
      }

      if (action === 'comments' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(commentsByTicket.get(ticketId) ?? []),
        });
        return;
      }

      if (action === 'timeline' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(timelineByTicket.get(ticketId) ?? []),
        });
        return;
      }

      if (action === 'comments' && method === 'POST') {
        const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        const nextComment: MockComment = {
          id: `comment-${(commentsByTicket.get(ticketId) ?? []).length + 1}`,
          ticketId,
          tenantId: 'tenant-assurance-001',
          body: String(payload.body),
          isInternal: Boolean(payload.isInternal),
          authorUserId: SUPPORT_USER_ID,
          createdAt: nowIso(2),
        };
        commentsByTicket.set(ticketId, [...(commentsByTicket.get(ticketId) ?? []), nextComment]);
        appendTimeline(ticketId, 'COMMENT_ADDED', {
          commentId: nextComment.id,
          isInternal: nextComment.isInternal,
        });
        ticket.updatedAt = nowIso(2);

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(nextComment),
        });
        return;
      }

      if (action === 'status' && method === 'PATCH') {
        const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        const previousStatus = ticket.status;
        ticket.status = String(payload.status);
        if (ticket.status === 'IN_PROGRESS' && !ticket.firstRespondedAt) {
          ticket.firstRespondedAt = nowIso(3);
        }
        if (ticket.status === 'RESOLVED') {
          ticket.resolvedAt = nowIso(4);
        }
        ticket.updatedAt = nowIso(4);
        appendTimeline(ticketId, 'STATUS_CHANGED', {
          from: previousStatus,
          to: ticket.status,
          notes: typeof payload.notes === 'string' ? payload.notes : null,
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ticket),
        });
        return;
      }

      if (action === 'request-field-service' && method === 'POST') {
        ticket.status = 'FIELD_SERVICE_REQUESTED';
        ticket.fieldDecision = 'FIELD_SERVICE_REQUIRED';
        ticket.updatedAt = nowIso(5);
        appendTimeline(ticketId, 'FIELD_SERVICE_REQUESTED', {
          notes: JSON.parse(request.postData() ?? '{}').notes ?? null,
        });

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(ticket),
        });
        return;
      }

      // MOD10 D4: el vínculo envía el identificador de la OTE encontrada; `workOrderId` no cambia.
      if (action === 'link-execution-order' && method === 'POST') {
        await assertTenantHeader(route);
        const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        expect(payload.executionOrderId).toBe(EXECUTION_ORDER_ID);
        expect(payload).not.toHaveProperty('workOrderId');
        const order = buildExecutionOrder();
        ticket.executionOrder = order;
        ticket.executionOrderCount = 1;
        ticket.updatedAt = nowIso(6);
        appendTimeline(ticketId, 'WORK_ORDER_LINKED', {
          executionOrderId: order.id,
          executionOrderNumber: order.number,
          notes: typeof payload.notes === 'string' ? payload.notes : null,
        });

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ...order, outcome: 'LINKED' }),
        });
        return;
      }
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

test('support can create, comment, escalate to field service and resolve a ticket', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setupAssuranceMocks(page);
  await seedPortalSession(page);

  // Bandeja §3 B/D2 + H: soporte entra en «Míos», con su id y orden de urgencia en el listado.
  const firstList = page.waitForRequest(
    (request) =>
      request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/assurance/tickets'),
  );
  await page.goto('/dashboard/assurance', { waitUntil: 'domcontentloaded' });
  const firstListParams = new URL((await firstList).url()).searchParams;
  // P2 (§3 J): «Míos» ya no manda `assignedUserId`; pide la cola y el API usa el sub del JWT.
  expect(firstListParams.get('workQueue')).toBe('mine');
  expect(firstListParams.get('assignedUserId')).toBeNull();
  expect(firstListParams.get('order')).toBe('urgency');

  await expect(page.getByRole('heading', { name: 'Mesa de ayuda' })).toBeVisible();
  const queues = page.getByRole('group', { name: 'Colas de trabajo' });
  await expect(queues.getByRole('button', { name: /^Míos/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();

  await expect(page.getByRole('heading', { name: 'Crear ticket' })).toBeVisible();
  const subscriberPicker = page.getByRole('combobox', { name: 'Suscriptor' });
  await subscriberPicker.fill('Ada');
  await page.getByRole('option', { name: 'Ada Sintética — Bogotá' }).click();
  await page
    .getByLabel('Asunto', { exact: true })
    .fill('Intermitencia de acceso en sede principal');
  await page.getByLabel('Referencia', { exact: true }).fill('SRV-001');
  await page.getByRole('button', { name: 'Crear ticket' }).click();

  await expect(page.getByText('El ticket TK-20260509-001 fue creado.')).toBeVisible();
  // D2: el ticket nuevo no queda asignado a quien lo crea, así que no está en «Míos»;
  // se pasa a «Todos» (`?queue=all`), que es donde el API real lo devuelve.
  await queues.getByRole('button', { name: /^Todos/ }).click();
  await expect(page).toHaveURL(/[?&]queue=all/);
  await expect(page.getByRole('button', { name: 'TK-20260509-001', exact: true })).toBeVisible();

  // §3 D: la fila entera abre el ticket (clic en el asunto, no en el número).
  await page
    .getByRole('row')
    .filter({ hasText: 'TK-20260509-001' })
    .getByText('Intermitencia de acceso en sede principal', { exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'TK-20260509-001' })).toBeVisible();

  await page.getByRole('tab', { name: 'Comentarios' }).click();
  await page
    .getByLabel('Nuevo comentario')
    .fill('Se valida degradación y se requiere seguimiento.');
  await page.getByRole('button', { name: 'Agregar comentario' }).click();
  await expect(page.getByText('Comentario registrado.')).toBeVisible();
  await expect(page.getByText('Se valida degradación y se requiere seguimiento.')).toBeVisible();

  // MOD10 paso 1 (spec §3 B): Estado vive en la cabecera del panel, sin pestaña «Acciones».
  await page.getByRole('combobox', { name: 'Nuevo estado' }).click();
  await page.getByRole('option', { name: 'En progreso', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(page.getByText('Estado actualizado.')).toBeVisible();

  // MOD10 paso 2 (§3 J): las acciones de visita y orden viven en la tarjeta «Visita y orden de
  // trabajo» del riel «Datos del caso»; Estado sigue en la cabecera, fuera del riel.
  const caseData = page.getByRole('region', { name: 'Datos del caso' });
  await expect(caseData.getByRole('combobox', { name: 'Nuevo estado' })).toHaveCount(0);
  const fieldCard = caseData.getByRole('region', { name: 'Visita y orden de trabajo' });

  // §3 E: «Solicitar visita» despliega su formulario en línea; §4: nota para el equipo de campo.
  await fieldCard.getByRole('button', { name: 'Solicitar visita' }).click();
  await fieldCard
    .getByRole('textbox', { name: 'Nota para el equipo de campo' })
    .fill('Validar potencia en sitio y estado de CPE.');
  await fieldCard.getByRole('button', { name: 'Confirmar solicitud' }).click();
  await expect(page.getByText('Solicitud de visita técnica registrada.')).toBeVisible();

  // §3 L + D4: la orden se busca por número; «Confirmar vínculo» solo aparece con una OTE
  // encontrada y libre, y envía su identificador (ya no se escribe un identificador a mano).
  await fieldCard.getByRole('button', { name: 'Vincular orden de trabajo' }).click();
  await expect(fieldCard.getByRole('button', { name: 'Confirmar vínculo' })).toHaveCount(0);
  await fieldCard
    .getByRole('textbox', { name: 'Orden de trabajo', exact: true })
    .fill(EXECUTION_ORDER_NUMBER);
  await fieldCard.getByRole('button', { name: 'Buscar orden' }).click();
  const foundOrder = fieldCard.getByRole('status', { name: 'Orden encontrada' });
  await expect(foundOrder).toContainText(EXECUTION_ORDER_NUMBER);
  await expect(foundOrder).toContainText('Asignada');
  await fieldCard.getByRole('textbox', { name: 'Nota de vínculo' }).fill('Orden de la visita.');
  await fieldCard.getByRole('button', { name: 'Confirmar vínculo' }).click();
  await expect(page.getByText('Orden de trabajo vinculada al caso.')).toBeVisible();
  // §3 L: tras recargar el detalle, el riel muestra la OTE con su número.
  await expect(fieldCard).toContainText(EXECUTION_ORDER_NUMBER);

  await page.getByRole('combobox', { name: 'Nuevo estado' }).click();
  await page.getByRole('option', { name: 'Resuelto', exact: true }).click();
  // §4: «Nota operativa» → «Nota»; exact para no tomar «Nota de vínculo» ni la del equipo de campo.
  await page
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('El caso queda resuelto tras coordinar visita.');
  await page.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(page.getByText('Estado actualizado.')).toBeVisible();

  // §3 F + §4: filtro «Historial» (antes pestaña «Timeline») con su lista nombrada.
  await page.getByRole('tab', { name: 'Historial' }).click();
  const timeline = page.getByRole('list', { name: 'Historial del caso' });
  await expect(timeline.getByText('Ticket creado', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Comentario agregado', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Visita técnica solicitada', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Orden de trabajo vinculada', { exact: true })).toBeVisible();
  // D4: el evento del vínculo nombra la OTE por su número, no por un identificador.
  await expect(
    timeline.getByText(`Orden de trabajo ${EXECUTION_ORDER_NUMBER} vinculada al caso.`, {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  // §3 H: con `order=urgency` la primera fila no es necesariamente la del ticket; se busca la
  // fila por su número. Cerrar conserva `?queue=all`. P2 (§3 J, D1): «Todos» es solo activos, así
  // que el resuelto sale de esa cola; sin cola (`?status=RESOLVED`, CA-4) se lista como Resuelto.
  await expect(page).toHaveURL(/[?&]queue=all/);
  await expect(page.getByRole('row').filter({ hasText: 'TK-20260509-001' })).toHaveCount(0);
  await page.goto('/dashboard/assurance?status=RESOLVED', { waitUntil: 'domcontentloaded' });
  const ticketRow = page.getByRole('row').filter({ hasText: 'TK-20260509-001' });
  await expect(ticketRow.getByText('TK-20260509-001', { exact: true })).toBeVisible();
  await expect(ticketRow.getByText('Resuelto', { exact: true })).toBeVisible();
});

test('Soporte CA-11: Anterior/Siguiente recorre la lista de la cola sin cerrar el panel y conserva las columnas', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setupAssuranceMocks(page);
  await seedPortalSession(page);
  await page.goto('/dashboard/assurance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mesa de ayuda' })).toBeVisible();

  for (const subject of ['Recorrido sintético uno', 'Recorrido sintético dos']) {
    await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();
    await expect(page.getByRole('heading', { name: 'Crear ticket' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Suscriptor' }).fill('Ada');
    await page.getByRole('option', { name: 'Ada Sintética — Bogotá' }).click();
    await page.getByLabel('Asunto', { exact: true }).fill(subject);
    await page.getByRole('button', { name: 'Crear ticket' }).click();
    await expect(page.getByText(/El ticket TK-20260509-00\d fue creado\./)).toBeVisible();
  }

  const queues = page.getByRole('group', { name: 'Colas de trabajo' });
  await queues.getByRole('button', { name: /^Todos/ }).click();
  await expect(page).toHaveURL(/[?&]queue=all/);
  const headers = page.getByRole('columnheader');
  const columnsBefore = await headers.allInnerTexts();
  expect(columnsBefore.length).toBeGreaterThan(0);

  const rows = page.getByRole('row').filter({ hasText: /TK-20260509-00\d/ });
  await expect(rows).toHaveCount(2);
  const order = (await rows.allInnerTexts()).map((text) => text.match(/TK-20260509-00\d/)?.[0]);
  await page.getByRole('button', { name: order[0]!, exact: true }).click();

  const dialog = page.getByRole('dialog');
  const nav = dialog.getByRole('navigation', { name: 'Recorrer tickets de la lista' });
  await expect(nav).toContainText('1 de 2');
  await expect(dialog.getByRole('heading', { name: order[0]! })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Anterior' })).toBeDisabled();

  await nav.getByRole('button', { name: 'Siguiente' }).click();
  await expect(nav).toContainText('2 de 2');
  await expect(dialog.getByRole('heading', { name: order[1]! })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await expect(page).toHaveURL(/[?&]queue=all/);

  await nav.getByRole('button', { name: 'Anterior' }).click();
  await expect(nav).toContainText('1 de 2');
  await expect(dialog).toBeVisible();
  expect(await headers.allInnerTexts()).toEqual(columnsBefore);
});
