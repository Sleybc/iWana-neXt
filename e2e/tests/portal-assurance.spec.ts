/**
 * E2E — Mesa de ayuda / Service Assurance en el portal empresarial.
 *
 * Cubre el flujo observable de Fase 01 con mocks estables del contrato HTTP:
 * - SUPPORT crea un ticket desde el portal.
 * - SUPPORT comenta el ticket.
 * - SUPPORT lo mueve a IN_PROGRESS, solicita trabajo de campo y luego lo resuelve.
 * - El timeline refleja los hitos funcionales visibles.
 */

import { expect, test } from '@playwright/test';
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
const WORK_ORDER_ID = '33333333-3333-4333-8333-333333333333';

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: tickets,
          total: tickets.length,
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

    const ticketMatch = pathname.match(
      /\/assurance\/tickets\/([^/]+)(?:\/(comments|timeline|status|request-field-service|link-work-order))?$/,
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

      if (action === 'link-work-order' && method === 'POST') {
        const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        ticket.workOrderId = String(payload.workOrderId);
        ticket.fieldDecision = 'FIELD_SERVICE_REQUIRED';
        ticket.updatedAt = nowIso(6);
        appendTimeline(ticketId, 'WORK_ORDER_LINKED', {
          workOrderId: ticket.workOrderId,
          notes: typeof payload.notes === 'string' ? payload.notes : null,
        });

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(ticket),
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

  await page.goto('/dashboard/assurance', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Mesa de ayuda' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo ticket' }).first().click();

  await expect(page.getByRole('heading', { name: 'Crear ticket' })).toBeVisible();
  await page.getByLabel('Asunto operativo').fill('Intermitencia de acceso en sede principal');
  await page.getByLabel('Referencia del solicitante').fill('subscriber-001');
  await page.getByLabel('Referencia del objeto').fill('service-001');
  await page.getByRole('button', { name: 'Crear ticket' }).click();

  await expect(page.getByText('El ticket TK-20260509-001 fue creado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'TK-20260509-001' })).toBeVisible();

  await page.getByRole('button', { name: 'TK-20260509-001' }).click();
  await expect(page.getByRole('heading', { name: 'TK-20260509-001' })).toBeVisible();

  await page.getByRole('tab', { name: 'Comentarios' }).click();
  await page
    .getByLabel('Nuevo comentario')
    .fill('Se valida degradación y se requiere seguimiento.');
  await page.getByRole('button', { name: 'Agregar comentario' }).click();
  await expect(page.getByText('Comentario registrado.')).toBeVisible();
  await expect(page.getByText('Se valida degradación y se requiere seguimiento.')).toBeVisible();

  await page.getByRole('tab', { name: 'Acciones' }).click();
  await page.getByRole('combobox', { name: 'Nuevo estado' }).click();
  await page.getByRole('option', { name: 'En progreso', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar transición' }).click();
  await expect(page.getByText('Estado actualizado.')).toBeVisible();

  await page.getByLabel('Nota para WFM').fill('Validar potencia en sitio y estado de CPE.');
  await page.getByRole('button', { name: 'Solicitar trabajo de campo' }).click();
  await expect(page.getByText('Escalamiento a trabajo de campo registrado.')).toBeVisible();

  await page.getByLabel('Identificador de work order').fill(WORK_ORDER_ID);
  await page.getByRole('button', { name: 'Vincular work order' }).click();
  await expect(page.getByText('Work order vinculada al ticket.')).toBeVisible();

  await page.getByRole('combobox', { name: 'Nuevo estado' }).click();
  await page.getByRole('option', { name: 'Resuelto', exact: true }).click();
  await page.getByLabel('Nota operativa').fill('El caso queda resuelto tras coordinar visita.');
  await page.getByRole('button', { name: 'Aplicar transición' }).click();
  await expect(page.getByText('Estado actualizado.')).toBeVisible();

  await page.getByRole('tab', { name: 'Timeline' }).click();
  const timeline = page.locator('ol');
  await expect(timeline.getByText('Ticket creado', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Comentario agregado', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Trabajo de campo solicitado', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Work order vinculada', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow.getByText('TK-20260509-001', { exact: true })).toBeVisible();
  await expect(firstRow.getByText('Resuelto', { exact: true })).toBeVisible();
});
