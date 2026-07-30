/**
 * E2E — Flujo cableado portal Assurance → OT → inventario cliente.
 *
 * Cobertura mínima viable del Task 8 con mocks HTTP stateful:
 * - SUPPORT crea ticket Assurance con trabajo de campo.
 * - Se crea solicitud de visita SUPPORT y queda disponible una OT vinculada.
 * - En Operaciones se registra un ítem INSTALLED_AT_CUSTOMER.
 * - El cierre de la OT exige firma del cliente antes de acreditar el saldo.
 */

import { expect, test } from '@playwright/test';

const MOCK_TENANT_SLUG = 'tenant-field-flow-demo';
const SUPPORT_USER_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = 'ticket-field-001';
const VISIT_REQUEST_ID = 'vr-field-001';
const SCHEDULE_EVENT_ID = 'se-field-001';
const EXECUTION_ORDER_ID = 'eo-field-001';
const SUBSCRIBER_ID = 'subscriber-001';
const ITEM_ID = 'ONT-HG8245';
const TECH_CUSTODY_ID = 'MOV-001';
const TECH_LOCATION_ID = 'loc-tech-001';
const CUSTOMER_SITE_LOCATION_ID = 'loc-customer-001';

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function buildToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: SUPPORT_USER_ID,
      email: 'support@field-flow.local',
      role: 'SUPPORT',
      tenantId: 'tenant-field-flow-001',
      schemaName: 'tenant_field_flow_001',
      jti: 'jti-field-flow-support',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

type JsonRecord = Record<string, unknown>;

type FlowState = {
  requestFieldServiceCalls: number;
  visitRequestCreateCalls: number;
  closeAttempts: number;
  inventoryApplied: boolean;
  ticket: JsonRecord | null;
  visitRequest: JsonRecord | null;
  scheduleEvent: JsonRecord | null;
  executionOrder: JsonRecord;
  executionOrderActivities: JsonRecord[];
  executionOrderItemUsage: JsonRecord[];
  executionOrderEvidences: JsonRecord[];
  locations: JsonRecord[];
  balances: JsonRecord[];
  tasks: JsonRecord[];
};

function createFlowState(): FlowState {
  return {
    requestFieldServiceCalls: 0,
    visitRequestCreateCalls: 0,
    closeAttempts: 0,
    inventoryApplied: false,
    ticket: null,
    visitRequest: null,
    scheduleEvent: {
      id: SCHEDULE_EVENT_ID,
      tenantId: 'tenant-field-flow-001',
      visitRequestId: VISIT_REQUEST_ID,
      executionOrderId: EXECUTION_ORDER_ID,
      workOrderId: 'wo-field-001',
      status: 'SCHEDULED',
      title: 'Soporte en sitio - cableado',
      type: 'INSTALLATION',
      scheduledStartAt: nowIso(60),
      scheduledEndAt: nowIso(120),
      assignedUserId: SUPPORT_USER_ID,
      assignedTeamId: null,
      address: 'Cra 10 # 10-10',
      municipality: 'Bogotá',
      sector: 'Centro',
      latitude: null,
      longitude: null,
      expedienteId: null,
      subscriberId: SUBSCRIBER_ID,
      organizationSiteId: null,
      ticketId: TICKET_ID,
      contractId: null,
      createdBy: SUPPORT_USER_ID,
      updatedBy: SUPPORT_USER_ID,
      createdAt: nowIso(-10),
      updatedAt: nowIso(-10),
    },
    executionOrder: {
      id: EXECUTION_ORDER_ID,
      number: 'OT-0001',
      version: 1,
      status: 'ASSIGNED',
      result: null,
      workType: 'SUPPORT',
      template: {
        id: 'template-field-001',
        key: 'SOPORTE_CABLEADO',
        version: 1,
        label: 'Soporte de cableado',
      },
      schedule: {
        eventId: SCHEDULE_EVENT_ID,
        window: { startAt: nowIso(60), endAt: nowIso(120) },
        plannedResource: { type: 'TECHNICIAN', id: SUPPORT_USER_ID },
      },
      assignee: {
        type: 'TECHNICIAN',
        id: SUPPORT_USER_ID,
        displayLabel: 'Paula Mesa',
      },
      site: {
        id: CUSTOMER_SITE_LOCATION_ID,
        label: 'Sitio cliente subscriber-001',
        address: 'Cra 10 # 10-10',
      },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: [
        'START',
        'REGISTER_ACTIVITY',
        'REGISTER_ITEM_USAGE',
        'REGISTER_EVIDENCE',
        'CLOSE',
      ],
      createdAt: nowIso(-10),
      updatedAt: nowIso(-10),
    },
    executionOrderActivities: [],
    executionOrderItemUsage: [],
    executionOrderEvidences: [
      {
        id: 'evidence-signature-001',
        executionOrderId: EXECUTION_ORDER_ID,
        mediaAssetId: 'media-signature-001',
        evidenceType: 'SIGNATURE',
        requirementKey: 'CUSTOMER_SIGNATURE',
        capturedAt: nowIso(-5),
        receivedAt: nowIso(-5),
        status: 'AVAILABLE',
        createdAt: nowIso(-5),
      },
    ],
    locations: [
      {
        id: TECH_LOCATION_ID,
        tenantId: 'tenant-field-flow-001',
        code: TECH_CUSTODY_ID,
        name: 'Custodia técnico soporte',
        type: 'MOBILE_TECHNICIAN',
        status: 'ACTIVE',
        responsibleRefId: SUPPORT_USER_ID,
        createdAt: nowIso(-20),
        updatedAt: nowIso(-20),
      },
      {
        id: CUSTOMER_SITE_LOCATION_ID,
        tenantId: 'tenant-field-flow-001',
        code: 'CLI-001',
        name: `Sitio cliente ${SUBSCRIBER_ID}`,
        type: 'CUSTOMER_SITE',
        status: 'ACTIVE',
        responsibleRefId: SUBSCRIBER_ID,
        createdAt: nowIso(-20),
        updatedAt: nowIso(-20),
      },
    ],
    balances: [
      {
        id: 'bal-tech-001',
        tenantId: 'tenant-field-flow-001',
        itemId: ITEM_ID,
        locationId: TECH_LOCATION_ID,
        condition: 'NEW',
        quantityOnHand: '1',
        quantityReserved: '0',
        createdAt: nowIso(-20),
        updatedAt: nowIso(-20),
      },
      {
        id: 'bal-customer-001',
        tenantId: 'tenant-field-flow-001',
        itemId: ITEM_ID,
        locationId: CUSTOMER_SITE_LOCATION_ID,
        condition: 'NEW',
        quantityOnHand: '0',
        quantityReserved: '0',
        createdAt: nowIso(-20),
        updatedAt: nowIso(-20),
      },
    ],
    tasks: [
      {
        id: 'task-field-001',
        tenantId: 'tenant-field-flow-001',
        taskNumber: 'TSK-0001',
        title: 'Atender ticket de soporte cableado',
        description: 'Tarea originada desde Assurance para trabajo en sitio.',
        type: 'FIELD_SERVICE',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        originContext: 'ASSURANCE',
        originRefId: TICKET_ID,
        ticketId: TICKET_ID,
        responsibleType: 'INTERNAL_USER',
        responsibleRefId: SUPPORT_USER_ID,
        recipientType: 'SUBSCRIBER',
        recipientRefId: SUBSCRIBER_ID,
        recipientLabel: 'Suscriptor demo',
        queueName: 'support-area',
        executionMode: 'FIELD_SERVICE',
        dueAt: null,
        scheduledRequired: true,
        scheduleEventId: SCHEDULE_EVENT_ID,
        workOrderId: 'wo-field-001',
        createdByUserId: SUPPORT_USER_ID,
        resolvedAt: null,
        closedAt: null,
        createdAt: nowIso(-10),
        updatedAt: nowIso(-10),
      },
    ],
  };
}

async function seedPortalSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }: { token: string; slug: string }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildToken(), slug: MOCK_TENANT_SLUG },
  );
}

async function selectComboboxOption(
  page: import('@playwright/test').Page,
  label: string,
  optionName: string | RegExp,
) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function fulfillJson(route: import('@playwright/test').Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupTask8Mocks(page: import('@playwright/test').Page, state: FlowState) {
  const users = [
    {
      id: SUPPORT_USER_ID,
      email: 'support@field-flow.local',
      role: 'SUPPORT',
      status: 'ACTIVE',
      tenantId: 'tenant-field-flow-001',
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
      isOperationalResource: true,
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await fulfillJson(route, {
        data: {
          displayName: 'Portal Flow Demo',
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
      });
      return;
    }

    if (pathname.endsWith('/auth/refresh') && method === 'POST') {
      await fulfillJson(route, { data: { accessToken: buildToken() } });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await fulfillJson(route, {
        data: {
          sub: SUPPORT_USER_ID,
          email: 'support@field-flow.local',
          role: 'SUPPORT',
          tenantId: 'tenant-field-flow-001',
          schemaName: 'tenant_field_flow_001',
          jti: 'jti-field-flow-support',
          type: 'tenant',
        },
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await fulfillJson(route, {
        data: {
          id: 'tenant-field-flow-001',
          name: 'Portal Flow Demo',
          slug: MOCK_TENANT_SLUG,
          status: 'ACTIVE',
          contactEmail: 'tenant@field-flow.local',
          legalName: 'Portal Flow Demo SAS',
          city: 'Bogotá',
          department: 'Cundinamarca',
          countryCode: 'CO',
          brandingProductName: 'iWana Empresa',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'iWana Empresa',
          brandingMetadataDescription: 'Portal empresarial tenant-aware',
          showTenantName: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await fulfillJson(route, {
        data: {
          data: users,
          meta: { nextCursor: null, total: users.length },
        },
      });
      return;
    }

    if (pathname.endsWith(`/users/${SUPPORT_USER_ID}`) && method === 'GET') {
      await fulfillJson(route, {
        data: users[0],
      });
      return;
    }

    if (pathname.endsWith('/assurance/sla-policies') && method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'sla-001',
          tenantId: 'tenant-field-flow-001',
          name: 'SLA soporte general',
          appliesToType: 'CUSTOMER_INCIDENT',
          appliesToPriority: 'NORMAL',
          firstResponseMinutes: 60,
          resolutionMinutes: 240,
          isActive: true,
          createdAt: nowIso(-200),
          updatedAt: nowIso(-200),
        },
      ]);
      return;
    }

    if (pathname.endsWith('/assurance/dashboard/summary') && method === 'GET') {
      await fulfillJson(route, {
        openCount: state.ticket ? 0 : 0,
        assignedCount: state.ticket ? 0 : 0,
        inProgressCount: 0,
        atRiskCount: 0,
        breachedCount: 0,
        resolvedTodayCount: 0,
        fieldServicePendingCount: state.ticket ? 1 : 0,
        byPriority: state.ticket ? { NORMAL: 1 } : {},
        byType: state.ticket ? { CUSTOMER_INCIDENT: 1 } : {},
      });
      return;
    }

    if (pathname.endsWith('/assurance/tickets') && method === 'GET') {
      const tickets = state.ticket ? [state.ticket] : [];
      await fulfillJson(route, {
        data: tickets,
        total: tickets.length,
        page: 1,
        limit: 20,
      });
      return;
    }

    if (pathname.endsWith('/assurance/tickets') && method === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}') as JsonRecord;
      state.ticket = {
        id: TICKET_ID,
        tenantId: 'tenant-field-flow-001',
        ticketNumber: 'TK-0001',
        type: payload.type ?? 'CUSTOMER_INCIDENT',
        status: 'FIELD_SERVICE_REQUESTED',
        priority: payload.priority ?? 'NORMAL',
        source: payload.source ?? 'PORTAL',
        subject: payload.subject ?? 'Soporte cableado',
        description: payload.description ?? null,
        requesterType: payload.requesterType ?? 'SUBSCRIBER',
        requesterRefId: payload.requesterRefId ?? SUBSCRIBER_ID,
        subjectType: payload.subjectType ?? 'SERVICE',
        subjectRefId: payload.subjectRefId ?? 'service-001',
        assignedUserId: null,
        queueName: null,
        slaPolicyId: null,
        slaFirstResponseAt: nowIso(60),
        slaResolveByAt: nowIso(240),
        firstRespondedAt: null,
        resolvedAt: null,
        closedAt: null,
        slaBreachStatus: 'OK',
        fieldDecision: payload.fieldDecision ?? 'FIELD_SERVICE_REQUIRED',
        workOrderId: 'wo-field-001',
        createdByUserId: SUPPORT_USER_ID,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await fulfillJson(route, state.ticket, 201);
      return;
    }

    const ticketActionMatch = pathname.match(/\/assurance\/tickets\/([^/]+)\/([^/]+)$/);
    if (ticketActionMatch && method === 'POST') {
      const [, ticketId, action] = ticketActionMatch;
      if (ticketId === TICKET_ID && action === 'request-field-service' && state.ticket) {
        state.requestFieldServiceCalls += 1;
        state.ticket.status = 'FIELD_SERVICE_REQUESTED';
        state.ticket.fieldDecision = 'FIELD_SERVICE_REQUIRED';
        state.ticket.updatedAt = nowIso();
        await fulfillJson(route, state.ticket, 201);
        return;
      }
    }

    if (pathname.endsWith('/wfm/eligible-assignees') && method === 'GET') {
      await fulfillJson(route, users);
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests') && method === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}') as JsonRecord;
      state.visitRequestCreateCalls += 1;
      state.visitRequest = {
        id: VISIT_REQUEST_ID,
        tenantId: 'tenant-field-flow-001',
        originContext: payload.originContext ?? 'ASSURANCE',
        originRef: payload.originRef ?? TICKET_ID,
        originLabel: payload.originLabel ?? `Ticket ${TICKET_ID}`,
        workType: payload.workType ?? 'SUPPORT',
        priority: payload.priority ?? 'NORMAL',
        title: payload.title ?? 'Soporte técnico por falla de cableado',
        description: payload.description ?? null,
        status: 'PENDING_SCHEDULING',
        ticketId: payload.ticketId ?? TICKET_ID,
        subscriberId: SUBSCRIBER_ID,
        municipality: 'Bogotá',
        sector: 'Centro',
        address: 'Cra 10 # 10-10',
        executionOrderId: EXECUTION_ORDER_ID,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await fulfillJson(route, state.visitRequest, 201);
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests') && method === 'GET') {
      await fulfillJson(route, {
        items: state.visitRequest ? [state.visitRequest] : [],
        meta: { total: state.visitRequest ? 1 : 0, page: 1, limit: 20, totalPages: 1 },
      });
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests/filter-options') && method === 'GET') {
      await fulfillJson(route, {
        municipalities: ['Bogotá'],
        sectors: ['Centro'],
      });
      return;
    }

    const visitRequestMatch = pathname.match(/\/wfm\/visit-requests\/([^/]+)$/);
    if (visitRequestMatch && method === 'GET') {
      await fulfillJson(route, state.visitRequest ?? {});
      return;
    }

    if (pathname.endsWith('/wfm/events') && method === 'GET') {
      await fulfillJson(route, {
        data: state.scheduleEvent ? [state.scheduleEvent] : [],
        meta: {
          page: 1,
          limit: 100,
          total: state.scheduleEvent ? 1 : 0,
          totalPages: 1,
          hasMore: false,
        },
      });
      return;
    }

    if (pathname.endsWith('/wfm/work-orders') && method === 'GET') {
      await fulfillJson(route, {
        data: [],
        meta: { page: 1, limit: 100, total: 0, totalPages: 1, hasMore: false },
      });
      return;
    }

    if (pathname.endsWith(`/wfm/events/${SCHEDULE_EVENT_ID}`) && method === 'GET') {
      await fulfillJson(route, state.scheduleEvent);
      return;
    }

    if (pathname.endsWith('/tasks') && method === 'GET') {
      await fulfillJson(route, {
        data: state.tasks,
        total: state.tasks.length,
        page: 1,
        limit: 20,
      });
      return;
    }

    if (pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}`) && method === 'GET') {
      await fulfillJson(route, state.executionOrder);
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/activities`) &&
      method === 'GET'
    ) {
      await fulfillJson(route, {
        data: state.executionOrderActivities,
        meta: {
          page: 1,
          limit: 25,
          total: state.executionOrderActivities.length,
          totalPages: 1,
          hasMore: false,
        },
      });
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/item-usage`) &&
      method === 'GET'
    ) {
      await fulfillJson(route, {
        data: state.executionOrderItemUsage,
        meta: {
          page: 1,
          limit: 25,
          total: state.executionOrderItemUsage.length,
          totalPages: 1,
          hasMore: false,
        },
      });
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/evidences`) &&
      method === 'GET'
    ) {
      await fulfillJson(route, {
        data: state.executionOrderEvidences,
        meta: {
          page: 1,
          limit: 25,
          total: state.executionOrderEvidences.length,
          totalPages: 1,
          hasMore: false,
        },
      });
      return;
    }

    if (
      pathname.endsWith('/tasks/execution-order-templates/template-field-001/versions') &&
      method === 'GET'
    ) {
      await fulfillJson(route, {
        data: [
          {
            id: 'template-version-field-001',
            templateId: 'template-field-001',
            key: 'SOPORTE_CABLEADO',
            version: 1,
            label: 'Soporte de cableado',
            workType: 'SUPPORT',
            status: 'PUBLISHED',
            requirements: [],
            reasonCatalogs: [],
          },
        ],
        meta: { page: 1, limit: 25, total: 1, totalPages: 1, hasMore: false },
      });
      return;
    }

    if (pathname.endsWith('/inventory/items') && method === 'GET') {
      await fulfillJson(route, {
        data: [
          {
            id: ITEM_ID,
            sku: ITEM_ID,
            name: 'ONT Huawei HG8245',
            status: 'ACTIVE',
          },
        ],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
      });
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/start`) &&
      method === 'POST'
    ) {
      state.executionOrder.status = 'IN_PROGRESS';
      state.executionOrder.startedAt = nowIso();
      state.executionOrder.updatedAt = nowIso();
      await fulfillJson(route, state.executionOrder, 201);
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/item-usage`) &&
      method === 'POST'
    ) {
      const payload = JSON.parse(request.postData() ?? '{}') as JsonRecord;
      const usage = {
        id: `usage-${state.executionOrderItemUsage.length + 1}`,
        executionOrderId: EXECUTION_ORDER_ID,
        itemId: payload.itemId ?? ITEM_ID,
        quantity: Number(payload.quantity ?? 1),
        serial: payload.serialNumber ?? null,
        action: payload.action ?? 'INSTALL',
        finalDisposition: payload.finalDisposition ?? 'INSTALLED_AT_CUSTOMER',
        inventoryRequestId: 'inventory-request-001',
        movementStatus: 'CONFIRMED',
        createdAt: nowIso(),
      };
      state.executionOrderItemUsage.push(usage);
      await fulfillJson(route, usage, 201);
      return;
    }

    if (
      pathname.endsWith(`/tasks/execution-orders/${EXECUTION_ORDER_ID}/close`) &&
      method === 'POST'
    ) {
      state.closeAttempts += 1;
      const payload = JSON.parse(request.postData() ?? '{}') as JsonRecord;
      const requiresSignature = state.executionOrderItemUsage.some(
        (usage) => usage.finalDisposition === 'INSTALLED_AT_CUSTOMER',
      );
      const customerAcceptance =
        payload.customerAcceptance && typeof payload.customerAcceptance === 'object'
          ? (payload.customerAcceptance as JsonRecord)
          : null;
      const customerSignatureRef =
        typeof customerAcceptance?.artifactId === 'string'
          ? customerAcceptance.artifactId.trim()
          : '';

      if (requiresSignature && customerSignatureRef.length === 0) {
        await fulfillJson(
          route,
          {
            code: 'CUSTOMER_SIGNATURE_REQUIRED',
            message:
              'La OT requiere evidencia de firma del cliente cuando hay instalación en sitio.',
          },
          400,
        );
        return;
      }

      state.executionOrder.status = 'COMPLETED';
      state.executionOrder.result = payload.result ?? 'EXECUTED';
      state.executionOrder.completion = { progress: 100, closedAt: nowIso() };
      state.executionOrder.customerAcceptance = customerSignatureRef || null;
      state.executionOrder.updatedAt = nowIso();
      state.executionOrder.allowedActions = ['OPEN', 'CREATE_FOLLOW_UP'];

      if (requiresSignature && !state.inventoryApplied) {
        const techBalance = state.balances.find(
          (entry) => entry.locationId === TECH_LOCATION_ID && entry.itemId === ITEM_ID,
        );
        const customerBalance = state.balances.find(
          (entry) => entry.locationId === CUSTOMER_SITE_LOCATION_ID && entry.itemId === ITEM_ID,
        );

        if (techBalance) {
          techBalance.quantityOnHand = '0';
          techBalance.updatedAt = nowIso();
        }
        if (customerBalance) {
          customerBalance.quantityOnHand = '1';
          customerBalance.updatedAt = nowIso();
        }
        state.inventoryApplied = true;
      }

      await fulfillJson(route, state.executionOrder, 201);
      return;
    }

    if (pathname.endsWith('/inventory/locations') && method === 'GET') {
      await fulfillJson(route, {
        data: state.locations,
        meta: { page: 1, limit: 100, total: state.locations.length, totalPages: 1, hasMore: false },
      });
      return;
    }

    if (pathname.endsWith('/inventory/balances') && method === 'GET') {
      await fulfillJson(route, state.balances);
      return;
    }

    await fulfillJson(route, { data: null });
  });
}

async function gotoAuthedDashboard(page: import('@playwright/test').Page, path: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1_500);
    }
  }

  throw lastError;
}

async function runOperationsCloseFlow(page: import('@playwright/test').Page, state: FlowState) {
  await gotoAuthedDashboard(page, `/dashboard/operations?executionOrderId=${EXECUTION_ORDER_ID}`);
  await expect(page.getByRole('heading', { name: 'Operaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OT-0001' })).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar ejecución' }).click();
  await expect(
    page.getByRole('region', { name: 'Compromiso' }).getByText('En progreso', { exact: true }),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'Ítem' }).click();
  await page.getByRole('option', { name: new RegExp(ITEM_ID) }).click();
  await selectComboboxOption(page, 'Custodia de origen', 'Custodia técnico soporte');
  await page.getByLabel('Serial o lote').fill('ONT-SN-001');
  await selectComboboxOption(page, 'Acción', 'Instalar');
  await selectComboboxOption(page, 'Destino', 'Instalado en cliente');
  await page.getByRole('button', { name: 'Registrar material' }).click();

  await expect(page.getByText('ONT-SN-001', { exact: true })).toBeVisible();
  await expect(page.getByText(/Cantidad: 1/)).toBeVisible();
  await expect(page.getByLabel('Referencia de evidencia')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar OT' })).toBeDisabled();

  await selectComboboxOption(page, 'Referencia de evidencia', /Firma del cliente/);
  await selectComboboxOption(page, 'Forma de aceptación', 'Firma');
  await page
    .getByLabel('Resumen de cierre')
    .fill('Instalación finalizada con validación del cliente.');
  await page.getByRole('button', { name: 'Cerrar OT' }).click();
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();

  await expect(
    page.getByRole('region', { name: 'Cierre' }).getByText('Ejecutada', { exact: true }),
  ).toBeVisible();
  expect(state.closeAttempts).toBe(1);
  expect(state.executionOrder.customerAcceptance).toBe('media-signature-001');
  expect(
    state.balances.find(
      (entry) => entry.locationId === TECH_LOCATION_ID && entry.itemId === ITEM_ID,
    )?.quantityOnHand,
  ).toBe('0');
  expect(
    state.balances.find(
      (entry) => entry.locationId === CUSTOMER_SITE_LOCATION_ID && entry.itemId === ITEM_ID,
    )?.quantityOnHand,
  ).toBe('1');
}

test('escenario operaciones — cierre OT con firma e inventario en sitio cliente', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const state = createFlowState();
  await setupTask8Mocks(page, state);
  await seedPortalSession(page);

  await runOperationsCloseFlow(page, state);

  // Intake Assurance → visita SUPPORT queda cubierto por unit tests (portal + worker).
  expect(state.executionOrder.site).toEqual(
    expect.objectContaining({ id: CUSTOMER_SITE_LOCATION_ID }),
  );
});

test('agenda abre el resumen de la OT y conserva una sola CTA hacia ejecución', async ({
  page,
}) => {
  const state = createFlowState();
  await setupTask8Mocks(page, state);
  await seedPortalSession(page);

  await gotoAuthedDashboard(page, '/dashboard/scheduling/agenda');
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await page.getByRole('button', { name: 'Soporte en sitio - cableado' }).click();

  const eventDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Soporte en sitio - cableado' }),
  });
  await expect(eventDialog).toBeVisible();
  await expect(eventDialog.getByText('Resumen de la OT')).toBeVisible();
  await expect(eventDialog.getByRole('button', { name: 'Abrir OT' })).toHaveCount(1);

  await eventDialog.getByRole('button', { name: 'Abrir OT' }).click();
  await expect(page).toHaveURL(/\/dashboard\/operations\?executionOrderId=eo-field-001/);
  await expect(page.getByRole('heading', { name: 'OT-0001' })).toBeVisible();
});
