/**
 * E2E — Programacion / WFM en el portal empresarial.
 *
 * Cubre el flujo observable de Fase 01 sin depender del backend real:
 * - ADMIN crea un evento con work order embebida.
 * - ADMIN reagenda el evento con motivo obligatorio.
 * - ADMIN completa el evento y cierra la work order ligada.
 * - TECHNICIAN solo visualiza trabajos asignados a su usuario.
 *
 * Todas las llamadas HTTP se mockean con page.route() para mantener la suite estable.
 */

import { expect, test } from '@playwright/test';

const MOCK_TENANT_SLUG = 'tenant-wfm-demo';
const TECHNICIAN_ID = '11111111-1111-4111-8111-111111111111';

function buildIsoAt(dayOffset: number, hour: number, minute = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function buildDateInput(dayOffset: number): string {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildToken(role: 'ADMIN' | 'TECHNICIAN', sub: string): string {
  return (
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    btoa(
      JSON.stringify({
        sub,
        email: `hash-${role.toLowerCase()}`,
        role,
        tenantId: 'tenant-wfm-001',
        schemaName: 'tenant_wfm_001',
        jti: `jti-${role.toLowerCase()}`,
        type: 'tenant',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ) +
    '.fakesig'
  );
}

type MockScheduleEvent = {
  id: string;
  tenantId: string;
  workOrderId: string | null;
  type: 'INSTALLATION' | 'TECHNICAL_VISIT';
  status:
    | 'DRAFT'
    | 'SCHEDULED'
    | 'EN_ROUTE'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'RESCHEDULED'
    | 'NO_SHOW';
  title: string;
  description: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  assignedUserId: string;
  assignedTeamId: string | null;
  address: string | null;
  municipality: string | null;
  latitude: string | null;
  longitude: string | null;
  expedienteId: string | null;
  subscriberId: string | null;
  ticketId: string | null;
  contractId: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type MockWorkOrder = {
  id: string;
  tenantId: string;
  code: string;
  type: 'INSTALLATION' | 'TECHNICAL_VISIT';
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignedUserId: string;
  scheduledEventId: string | null;
  sourceContext: 'MANUAL' | 'CRM' | 'ASSURANCE' | 'PROVISIONING';
  sourceRef: string | null;
  summary: string;
  notes: string | null;
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function buildTechnicianUser() {
  return {
    id: TECHNICIAN_ID,
    email: 'tecnico@wfm.local',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: 'tenant-wfm-001',
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnica de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

function buildWorkOrder(eventId: string): MockWorkOrder {
  return {
    id: 'wo-001',
    tenantId: 'tenant-wfm-001',
    code: 'WO-20260506-001',
    type: 'INSTALLATION',
    status: 'OPEN',
    priority: 'NORMAL',
    assignedUserId: TECHNICIAN_ID,
    scheduledEventId: eventId,
    sourceContext: 'MANUAL',
    sourceRef: null,
    summary: 'Instalacion inicial de fibra',
    notes: 'Llevar equipo ONU.',
    createdBy: 'admin-001',
    closedBy: null,
    closedAt: null,
    createdAt: buildIsoAt(0, 12),
    updatedAt: buildIsoAt(0, 12),
    deletedAt: null,
  };
}

function buildInitialEvent(): MockScheduleEvent {
  return {
    id: 'evt-001',
    tenantId: 'tenant-wfm-001',
    workOrderId: 'wo-001',
    type: 'INSTALLATION',
    status: 'SCHEDULED',
    title: 'Instalacion inicial de fibra',
    description: 'Cliente listo para visita.',
    scheduledStartAt: buildIsoAt(1, 8),
    scheduledEndAt: buildIsoAt(1, 10),
    assignedUserId: TECHNICIAN_ID,
    assignedTeamId: null,
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: 'TK-001',
    contractId: null,
    createdBy: 'admin-001',
    updatedBy: 'admin-001',
    createdAt: buildIsoAt(0, 12),
    updatedAt: buildIsoAt(0, 12),
    deletedAt: null,
  };
}

async function seedPortalSession(
  page: import('@playwright/test').Page,
  role: 'ADMIN' | 'TECHNICIAN',
  sub: string,
) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }: { token: string; slug: string }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildToken(role, sub), slug: MOCK_TENANT_SLUG },
  );
}

async function setupSchedulingMocks(
  page: import('@playwright/test').Page,
  role: 'ADMIN' | 'TECHNICIAN',
) {
  const technician = buildTechnicianUser();
  const events: MockScheduleEvent[] = [buildInitialEvent()];
  const workOrders: MockWorkOrder[] = [buildWorkOrder('evt-001')];
  const availability = [
    {
      id: 'availability-001',
      tenantId: 'tenant-wfm-001',
      userId: TECHNICIAN_ID,
      type: 'AVAILABLE',
      startsAt: buildIsoAt(1, 8),
      endsAt: buildIsoAt(1, 18),
      reason: 'Turno de campo',
      createdBy: 'admin-001',
      createdAt: buildIsoAt(0, 0),
      updatedAt: buildIsoAt(0, 0),
    },
  ];

  const buildSummary = () => ({
    todayCount: events.filter((event) =>
      ['DRAFT', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS'].includes(event.status),
    ).length,
    overdueCount: 0,
    upcomingCount: events.length,
    activeCount: events.filter((event) =>
      ['DRAFT', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS'].includes(event.status),
    ).length,
    enRouteCount: events.filter((event) => event.status === 'EN_ROUTE').length,
    atRiskCount: 0,
    alerts: [],
    technicianLoad: [
      {
        assignedUserId: TECHNICIAN_ID,
        todayCount: events.length,
        overdueCount: 0,
        totalScheduledMinutes: events.length * 120,
        utilizationPercent: Math.min(100, Math.round((events.length * 120 * 100) / 480)),
        riskLevel: events.length >= 4 ? 'HIGH' : 'LOW',
      },
    ],
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: role === 'ADMIN' ? 'admin-001' : TECHNICIAN_ID,
            email: `hash-${role.toLowerCase()}`,
            role,
            tenantId: 'tenant-wfm-001',
            schemaName: 'tenant_wfm_001',
            jti: `jti-${role.toLowerCase()}`,
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
            id: 'tenant-wfm-001',
            name: 'Tenant WFM Demo',
            slug: MOCK_TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'tenant@wfm.local',
            legalName: 'Tenant WFM Demo SAS',
            nit: null,
            nitDv: null,
            city: 'Bogota',
            department: 'Cundinamarca',
            countryCode: 'CO',
            phone: null,
            website: null,
            createdAt: buildIsoAt(-30, 9),
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

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant WFM Demo',
            productName: 'iWana Empresa',
            surfaceName: 'Portal empresarial',
            metadataTitle: 'iWana Empresa',
            metadataDescription: 'Portal empresarial tenant-aware',
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

    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (/\/api\/v1\/users\/[^/]+$/.test(pathname) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: role === 'ADMIN' ? 'admin-001' : TECHNICIAN_ID,
            email: role === 'ADMIN' ? 'admin@wfm.local' : 'tecnico@wfm.local',
            role,
            status: 'ACTIVE',
            firstName: role === 'ADMIN' ? 'Andrea' : 'Luisa',
            lastName: role === 'ADMIN' ? 'Operaciones' : 'Campos',
            phone: null,
            jobTitle: role === 'ADMIN' ? 'Administrador' : 'Técnica de campo',
            avatarUrl: null,
            mfaEnabled: true,
            emailVerified: true,
            createdAt: '2026-05-01T00:00:00.000Z',
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
          data: {
            data: [technician],
            meta: { nextCursor: null, total: 1 },
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/dashboard/summary') && method === 'GET') {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify(buildSummary())
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/technicians/availability') && method === 'GET') {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify(availability)
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/work-orders') && method === 'GET') {
      const visibleWorkOrders =
        role === 'TECHNICIAN'
          ? workOrders.filter((workOrder) => workOrder.assignedUserId === TECHNICIAN_ID)
          : workOrders;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(visibleWorkOrders),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/work-orders\/[^/]+\/status$/.test(pathname) && method === 'PATCH') {
      const workOrderId = pathname.split('/').at(-2);
      const payload = request.postDataJSON() as { status: MockWorkOrder['status'] };
      const workOrder = workOrders.find((item) => item.id === workOrderId);

      if (!workOrder) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'OT no encontrada' }),
        });
        return;
      }

      workOrder.status = payload.status;
      workOrder.updatedAt = '2026-05-07T16:00:00.000Z';
      if (payload.status === 'DONE') {
        workOrder.closedBy = role === 'ADMIN' ? 'admin-001' : TECHNICIAN_ID;
        workOrder.closedAt = '2026-05-07T16:00:00.000Z';
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workOrder),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/work-orders\/[^/]+$/.test(pathname) && method === 'GET') {
      const workOrderId = pathname.split('/').at(-1);
      const workOrder = workOrders.find((item) => item.id === workOrderId);

      await route.fulfill({
        status: workOrder ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(workOrder ?? { code: 'NOT_FOUND', message: 'OT no encontrada' }),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/events\/[^/]+\/status$/.test(pathname) && method === 'PATCH') {
      const eventId = pathname.split('/').at(-2);
      const payload = request.postDataJSON() as { status: MockScheduleEvent['status'] };
      const event = events.find((item) => item.id === eventId);

      if (!event) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'Evento no encontrado' }),
        });
        return;
      }

      event.status = payload.status;
      event.updatedBy = role === 'ADMIN' ? 'admin-001' : TECHNICIAN_ID;
      event.updatedAt = '2026-05-07T16:00:00.000Z';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(event),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/events\/[^/]+\/reschedule$/.test(pathname) && method === 'POST') {
      const eventId = pathname.split('/').at(-2);
      const payload = request.postDataJSON() as {
        scheduledStartAt: string;
        scheduledEndAt: string;
        reason: string;
      };
      const event = events.find((item) => item.id === eventId);

      if (!event) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'Evento no encontrado' }),
        });
        return;
      }

      event.scheduledStartAt = payload.scheduledStartAt;
      event.scheduledEndAt = payload.scheduledEndAt;
      event.status = 'RESCHEDULED';
      event.updatedBy = 'admin-001';
      event.updatedAt = '2026-05-07T15:00:00.000Z';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(event),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/events\/[^/]+$/.test(pathname) && method === 'GET') {
      const eventId = pathname.split('/').at(-1);
      const event = events.find((item) => item.id === eventId);

      await route.fulfill({
        status: event ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(event ?? { code: 'NOT_FOUND', message: 'Evento no encontrado' }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/events') && method === 'GET') {
      const assignedUserId = url.searchParams.get('assignedUserId');
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      const visibleEvents = events.filter((event) => {
        if (role === 'TECHNICIAN' && event.assignedUserId !== TECHNICIAN_ID) {
          return false;
        }
        if (assignedUserId && event.assignedUserId !== assignedUserId) {
          return false;
        }
        if (status && event.status !== status) {
          return false;
        }
        if (type && event.type !== type) {
          return false;
        }
        if (from && new Date(event.scheduledStartAt) < new Date(from)) {
          return false;
        }
        if (to && new Date(event.scheduledEndAt) > new Date(to)) {
          return false;
        }
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(visibleEvents),
      });
      return;
    }

    if (pathname.endsWith('/wfm/events') && method === 'POST') {
      const payload = request.postDataJSON() as {
        type: MockScheduleEvent['type'];
        title: string;
        description?: string;
        scheduledStartAt: string;
        scheduledEndAt: string;
        assignedUserId: string;
        address?: string;
        municipality?: string;
        workOrder?: {
          summary: string;
          priority?: MockWorkOrder['priority'];
          type?: MockWorkOrder['type'];
          sourceContext?: MockWorkOrder['sourceContext'];
          sourceRef?: string;
          notes?: string;
        };
      };

      const nextEventId = `evt-00${events.length + 1}`;
      const createdEvent: MockScheduleEvent = {
        id: nextEventId,
        tenantId: 'tenant-wfm-001',
        workOrderId: payload.workOrder ? `wo-00${workOrders.length + 1}` : null,
        type: payload.type,
        status: 'DRAFT',
        title: payload.title,
        description: payload.description ?? null,
        scheduledStartAt: payload.scheduledStartAt,
        scheduledEndAt: payload.scheduledEndAt,
        assignedUserId: payload.assignedUserId,
        assignedTeamId: null,
        address: payload.address ?? null,
        municipality: payload.municipality ?? null,
        latitude: null,
        longitude: null,
        expedienteId: null,
        subscriberId: null,
        ticketId: null,
        contractId: null,
        createdBy: 'admin-001',
        updatedBy: 'admin-001',
        createdAt: '2026-05-07T14:00:00.000Z',
        updatedAt: '2026-05-07T14:00:00.000Z',
        deletedAt: null,
      };
      events.push(createdEvent);

      if (payload.workOrder && createdEvent.workOrderId) {
        workOrders.push({
          id: createdEvent.workOrderId,
          tenantId: 'tenant-wfm-001',
          code: `WO-20260507-00${workOrders.length + 1}`,
          type: payload.workOrder.type ?? payload.type,
          status: 'OPEN',
          priority: payload.workOrder.priority ?? 'NORMAL',
          assignedUserId: payload.assignedUserId,
          scheduledEventId: createdEvent.id,
          sourceContext: payload.workOrder.sourceContext ?? 'MANUAL',
          sourceRef: payload.workOrder.sourceRef ?? null,
          summary: payload.workOrder.summary,
          notes: payload.workOrder.notes ?? null,
          createdBy: 'admin-001',
          closedBy: null,
          closedAt: null,
          createdAt: '2026-05-07T14:00:00.000Z',
          updatedAt: '2026-05-07T14:00:00.000Z',
          deletedAt: null,
        });
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(createdEvent),
      });
      return;
    }

    await route.continue();
  });
}

test('admin crea, reagenda y completa un evento con work order desde Programacion', async ({
  page,
}) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling');

  await expect(page.getByRole('heading', { name: 'Programacion' })).toBeVisible();
  await page.getByRole('button', { name: 'Calendario' }).click();
  await expect(page.getByRole('button', { name: 'Instalacion inicial de fibra' })).toBeVisible();

  await page.getByRole('button', { name: 'Crear evento' }).click();
  await expect(page.getByText('Crear evento operativo')).toBeVisible();

  await page.getByRole('combobox', { name: 'Tipo de trabajo' }).click();
  await page.getByRole('option', { name: 'Instalación' }).click();
  await page.getByRole('combobox', { name: 'Técnico responsable' }).click();
  await page.getByRole('option', { name: 'Luisa Campos' }).click();
  await page.getByLabel('Título operativo').fill('Alta fibra barrio sur');
  await page.getByLabel('Inicio programado').fill('2026-06-03T08:00');
  await page.getByLabel('Fin programado').fill('2026-06-03T10:00');
  await page.locator('label').filter({ hasText: 'Crear work order embebida' }).click();
  await expect(page.getByLabel('Resumen operativo')).toBeVisible();
  await page.getByLabel('Resumen operativo').fill('Instalacion residencial nueva');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear evento' }).click();

  await expect(page.getByText('Operación aplicada')).toBeVisible();
  await expect(page.getByText('Alta fibra barrio sur')).toBeVisible();

  await page.getByRole('button', { name: 'Reagendar' }).click();
  await expect(page.getByText('Reagendar evento')).toBeVisible();
  await page.getByLabel('Nuevo inicio').fill('2026-06-03T09:00');
  await page.getByLabel('Nuevo cierre').fill('2026-06-03T11:00');
  await page.getByLabel('Motivo').fill('Cliente solicitó mover la visita');
  await page.getByRole('button', { name: 'Guardar nueva franja' }).click();

  const detailDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Alta fibra barrio sur' }),
  });
  await expect(
    page.getByText('El evento se reagendó correctamente dentro de la nueva franja.'),
  ).toBeVisible();
  await expect(detailDialog.getByText('Reagendado')).toBeVisible();

  await detailDialog.getByRole('combobox', { name: 'Transición del evento' }).click();
  await page.getByRole('option', { name: 'Completado' }).click();
  await detailDialog.getByRole('button', { name: 'Aplicar estado' }).click();
  await expect(page.getByText('El evento pasó a estado completado.')).toBeVisible();

  await detailDialog.getByRole('combobox', { name: 'Transición de la work order' }).click();
  await page.getByRole('option', { name: 'Cerrada' }).click();
  await detailDialog.getByRole('button', { name: 'Actualizar OT' }).click();
  await expect(page.getByText('La work order quedó en estado done.')).toBeVisible();
});

test('technician solo visualiza trabajos asignados en su agenda', async ({ page }) => {
  await seedPortalSession(page, 'TECHNICIAN', TECHNICIAN_ID);
  await setupSchedulingMocks(page, 'TECHNICIAN');

  await page.goto('/dashboard/scheduling');

  await expect(page.getByRole('heading', { name: 'Programacion' })).toBeVisible();
  await expect(page.getByText('Command center')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Instalacion inicial de fibra' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear evento' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('cell', { name: 'Luisa Campos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver detalle' })).toBeVisible();
});

test('admin conserva una agenda operativa usable en viewport movil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling');

  await expect(page.getByRole('heading', { name: 'Programacion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear evento' })).toBeVisible();

  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('button', { name: 'Ver detalle' })).toBeVisible();

  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();
});

test('admin visualiza command center y abre detalle desde timeline', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling');

  await expect(page.getByText('Command center')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calendario' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lista' })).toBeVisible();

  await page.getByLabel('Desde').fill(buildDateInput(1));
  await page.getByLabel('Hasta').fill(buildDateInput(1));
  await page.getByRole('button', { name: 'Actualizar' }).click();

  await page.getByRole('button', { name: 'Abrir evento Instalacion inicial de fibra' }).click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();
});

test('admin consulta agenda por rango diario, semanal y mensual', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling');
  await page.getByRole('button', { name: 'Lista' }).click();

  await page.getByLabel('Desde').fill(buildDateInput(0));
  await page.getByLabel('Hasta').fill(buildDateInput(0));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('Sin eventos en el rango')).toBeVisible();

  await page.getByLabel('Desde').fill(buildDateInput(0));
  await page.getByLabel('Hasta').fill(buildDateInput(6));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('button', { name: 'Ver detalle' })).toBeVisible();

  await page.getByLabel('Hasta').fill(buildDateInput(30));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('cell', { name: /Luisa Campos/ })).toBeVisible();
});
