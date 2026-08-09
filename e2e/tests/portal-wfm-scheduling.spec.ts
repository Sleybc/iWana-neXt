/**
 * E2E — Programacion / WFM en el portal empresarial.
 *
 * Cubre el flujo observable de Fase 01 sin depender del backend real:
 * - ADMIN crea un evento con orden de trabajo asociada.
 * - ADMIN reagenda el evento con motivo obligatorio.
 * - ADMIN completa el evento y cierra la orden de trabajo ligada.
 * - TECHNICIAN solo visualiza trabajos asignados a su usuario.
 *
 * Todas las llamadas HTTP se mockean con page.route() para mantener la suite estable.
 */

import { expect, test } from '@playwright/test';
import { seedPortalSession as seedPortalSessionByCookie } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'tenant-wfm-demo';
const TECHNICIAN_ID = '11111111-1111-4111-8111-111111111111';
const CRM_EXPEDIENTE_ID = 'fcda817a-6340-4b83-bdd3-8bb4caa6cae9';
const CRM_INSTALLATION_TICKET_ID = 'ticket-install-001';
const CRM_EXPEDIENTE_NAME = 'Empresa Demo SAS';
const PENDING_VISIT_DISPLAY_NAME = 'Cliente GPON Norte';
const PENDING_VISIT_TITLE = 'Instalación GPON barrio norte';
const MOCK_EVENT_TITLE = 'Instalacion inicial de fibra';

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

function parseInputDate(value: string): Date | null {
  const [yearPart, monthPart, dayPart] = value.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTriggerDate(value: string): Date | null {
  const [dayPart, monthPart, yearPart] = value.trim().split('/');
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPageListMeta(total: number, page = 1, limit = 100) {
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 0,
    hasMore: false,
    mode: 'page' as const,
    capabilities: { randomAccess: true, sortableFields: [] as string[] },
    sort: null,
  };
}

function buildListResponse<T>(data: T[], page = 1, limit = 100) {
  return {
    data,
    meta: buildPageListMeta(data.length, page, limit),
  };
}

async function selectDateFromPicker(
  page: import('@playwright/test').Page,
  scope: import('@playwright/test').Page | import('@playwright/test').Locator,
  label: string,
  value: string,
) {
  const targetDate = parseInputDate(value);
  if (!targetDate) {
    return;
  }

  const trigger = scope.getByLabel(label);
  const triggerText = (await trigger.textContent())?.trim() ?? '';
  const currentDate = parseTriggerDate(triggerText);

  await trigger.click();

  const popover = page.locator('[data-state="open"][data-side]').last();
  await expect(popover).toBeVisible();

  if (currentDate) {
    const monthDelta =
      (targetDate.getFullYear() - currentDate.getFullYear()) * 12 +
      (targetDate.getMonth() - currentDate.getMonth());

    if (monthDelta > 0) {
      for (let index = 0; index < monthDelta; index += 1) {
        await popover.getByRole('button', { name: /siguiente|next/i }).click();
      }
    }

    if (monthDelta < 0) {
      for (let index = 0; index < Math.abs(monthDelta); index += 1) {
        await popover.getByRole('button', { name: /anterior|previous/i }).click();
      }
    }
  }

  const targetLabel = targetDate.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const escapedLabel = escapeRegExp(targetLabel);
  const labelWithBoundaries = new RegExp(`\\b${escapedLabel}\\b`, 'i');
  await popover.getByRole('button', { name: labelWithBoundaries }).first().click();
}

function buildCrmInstallationExpediente() {
  return {
    id: CRM_EXPEDIENTE_ID,
    tenantId: 'tenant-wfm-001',
    status: 'LISTO_PARA_INSTALACION',
    previousStatus: 'EN_COTIZACION',
    assignedTo: 'admin-001',
    dataConsentRevoked: false,
    statusChangedAt: buildIsoAt(-1, 8),
    discardReason: null,
    fullName: CRM_EXPEDIENTE_NAME,
    documentType: 'NIT',
    documentNumberEncrypted: 'enc-documento-demo',
    personType: 'PERSONA_JURIDICA',
    firstName: null,
    lastName: null,
    primaryContactName: 'Laura Pérez',
    primaryContactRole: 'Administración',
    documentNumber: '900123456',
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
    completenessCommercial: 90,
    completenessLegal: 80,
    completenessTechnical: 85,
    completenessOperational: 80,
    completenessOverall: 82,
    pipelineProgress: 82,
    latitude: '4.7110',
    longitude: '-74.0721',
    technicalObservations: 'Coordinar instalación en horario AM.',
    specialAccessNotes: 'Portería 24 horas.',
    createdAt: buildIsoAt(-10, 10),
    updatedAt: buildIsoAt(-1, 11),
  };
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
type MockVisitRequest = {
  id: string;
  tenantId: string;
  status:
    | 'PENDING'
    | 'NEEDS_CONTEXT'
    | 'READY_TO_SCHEDULE'
    | 'SCHEDULED'
    | 'CANCELLED'
    | 'REJECTED'
    | 'EXPIRED';
  originContext: 'MANUAL' | 'CRM' | 'ASSURANCE' | 'PROVISIONING';
  originRef: string | null;
  originLabel: string | null;
  workType: 'INSTALLATION' | 'TECHNICAL_VISIT' | 'SUPPORT';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  title: string;
  description: string | null;
  customerDisplayName?: string | null;
  requestedWindowStartAt: string | null;
  requestedWindowEndAt: string | null;
  slaDueAt: string | null;
  address: string | null;
  municipality: string | null;
  sector: string | null;
  latitude: number | null;
  longitude: number | null;
  expedienteId: string | null;
  subscriberId: string | null;
  ticketId: string | null;
  contractId: string | null;
  scheduleEventId: string | null;
  workOrderId: string | null;
  requestedByUserId: string;
  scheduledByUserId: string | null;
  scheduledAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
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

function buildHighDensityEvent(index: number): MockScheduleEvent {
  const startHour = 6 + (index % 12);
  const routeNumber = index + 1;

  return {
    id: `evt-hd-${String(routeNumber).padStart(3, '0')}`,
    tenantId: 'tenant-wfm-001',
    workOrderId: null,
    type: 'INSTALLATION',
    status: 'SCHEDULED',
    title: `Instalación GPON ruta ${routeNumber}`,
    description: `Tarea adicional ${routeNumber} para validar lectura de alto volumen.`,
    scheduledStartAt: buildIsoAt(1, startHour),
    scheduledEndAt: buildIsoAt(1, startHour + 1),
    assignedUserId: TECHNICIAN_ID,
    assignedTeamId: null,
    address: `Cra ${routeNumber} # 10 - 10`,
    municipality: 'Bogotá',
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: `TK-HD-${String(routeNumber).padStart(3, '0')}`,
    contractId: null,
    createdBy: 'admin-001',
    updatedBy: 'admin-001',
    createdAt: buildIsoAt(0, 12),
    updatedAt: buildIsoAt(0, 12),
    deletedAt: null,
  };
}

function buildPendingVisitRequest(): MockVisitRequest {
  return {
    id: 'vr-001',
    tenantId: 'tenant-wfm-001',
    status: 'READY_TO_SCHEDULE',
    originContext: 'CRM',
    originRef: CRM_EXPEDIENTE_ID,
    originLabel: 'Oportunidad EXP-CRM-001',
    workType: 'INSTALLATION',
    priority: 'HIGH',
    title: 'Instalación GPON barrio norte',
    description: 'Cliente listo para ventana PM.',
    customerDisplayName: 'Cliente GPON Norte',
    requestedWindowStartAt: buildIsoAt(1, 13),
    requestedWindowEndAt: buildIsoAt(1, 18),
    slaDueAt: buildIsoAt(2, 23, 59),
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    sector: 'Chapinero',
    latitude: null,
    longitude: null,
    expedienteId: CRM_EXPEDIENTE_ID,
    subscriberId: null,
    ticketId: CRM_INSTALLATION_TICKET_ID,
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    requestedByUserId: 'admin-001',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: buildIsoAt(-1, 9),
    updatedAt: buildIsoAt(-1, 9),
    deletedAt: null,
  };
}

async function seedPortalSession(
  page: import('@playwright/test').Page,
  role: 'ADMIN' | 'TECHNICIAN',
  sub: string,
) {
  await seedPortalSessionByCookie(page, {
    token: buildToken(role, sub),
    tenantSlug: MOCK_TENANT_SLUG,
  });
}

async function setupSchedulingMocks(
  page: import('@playwright/test').Page,
  role: 'ADMIN' | 'TECHNICIAN',
  options?: { enableCrmInstallationFlow?: boolean; extraScheduledEvents?: number },
) {
  const technician = buildTechnicianUser();
  const events: MockScheduleEvent[] = [
    buildInitialEvent(),
    ...Array.from({ length: options?.extraScheduledEvents ?? 0 }, (_, index) =>
      buildHighDensityEvent(index),
    ),
  ];
  const workOrders: MockWorkOrder[] = [buildWorkOrder('evt-001')];
  const visitRequests: MockVisitRequest[] = [buildPendingVisitRequest()];
  const crmExpediente = buildCrmInstallationExpediente();
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
    pendingInbox: {
      totalOpen: visitRequests.filter((item) =>
        ['PENDING', 'NEEDS_CONTEXT', 'READY_TO_SCHEDULE'].includes(item.status),
      ).length,
      readyToScheduleCount: visitRequests.filter((item) => item.status === 'READY_TO_SCHEDULE')
        .length,
      needsContextCount: visitRequests.filter((item) => item.status === 'NEEDS_CONTEXT').length,
      overdueSlaCount: 0,
      highPriorityOpenCount: visitRequests.filter((item) =>
        ['HIGH', 'URGENT'].includes(item.priority),
      ).length,
    },
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

    if (pathname.endsWith('/wfm/eligible-assignees') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([technician]),
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

    if (pathname.endsWith('/wfm/operating-window/resolve') && method === 'POST') {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify({
                status: 'OPEN',
                source: 'SITE_HOURS',
                startTime: '08:00',
                endTime: '18:00',
                reason: null,
              })
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests') && method === 'POST') {
      const payload = request.postDataJSON() as {
        originContext: string;
        originRef: string;
        originLabel?: string;
        workType: string;
        title: string;
        description: string;
        address: string;
        municipality: string;
        sector: string;
        expedienteId: string;
        ticketId: string;
      };

      const createdVisitRequest = {
        id: `vr-${String(visitRequests.length + 1).padStart(3, '0')}`,
        tenantId: 'tenant-wfm-001',
        status: payload.address && payload.municipality ? 'READY_TO_SCHEDULE' : 'NEEDS_CONTEXT',
        originContext: payload.originContext,
        originRef: payload.originRef,
        originLabel: payload.originLabel ?? `Cliente ${CRM_EXPEDIENTE_NAME}`,
        workType: payload.workType,
        priority: 'NORMAL',
        title: payload.title,
        description: payload.description,
        requestedWindowStartAt: null,
        requestedWindowEndAt: null,
        slaDueAt: null,
        address: payload.address,
        municipality: payload.municipality,
        sector: payload.sector,
        latitude: null,
        longitude: null,
        expedienteId: payload.expedienteId,
        subscriberId: null,
        ticketId: payload.ticketId,
        contractId: null,
        scheduleEventId: null,
        workOrderId: null,
        requestedByUserId: 'admin-001',
        scheduledByUserId: null,
        scheduledAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancelReason: null,
        organizationSiteId: null,
        createdAt: buildIsoAt(0, 12),
        updatedAt: buildIsoAt(0, 12),
        deletedAt: null,
      };
      visitRequests.push(createdVisitRequest);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(createdVisitRequest),
      });
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests') && method === 'GET') {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify({
                items: visitRequests,
                meta: {
                  total: visitRequests.length,
                  page: 1,
                  limit: 20,
                  totalPages: 1,
                },
              })
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (pathname.endsWith('/wfm/visit-requests/filter-options') && method === 'GET') {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify({
                municipalities: [{ value: 'Bogotá', label: 'Bogotá', count: 1 }],
                sectors: [
                  {
                    value: 'Chapinero',
                    label: 'Chapinero',
                    municipality: 'Bogotá',
                    count: 1,
                  },
                ],
              })
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/visit-requests\/[^/]+\/context$/.test(pathname) && method === 'PATCH') {
      const visitRequestId = pathname.split('/').at(-2);
      const visitRequest = visitRequests.find((item) => item.id === visitRequestId);

      if (!visitRequest) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'Solicitud no encontrada' }),
        });
        return;
      }

      const payload = request.postDataJSON() as {
        description?: string;
        address?: string;
        municipality?: string;
        sector?: string;
        requestedWindowStartAt?: string;
        requestedWindowEndAt?: string;
      };

      visitRequest.description = payload.description ?? visitRequest.description;
      visitRequest.address = payload.address ?? visitRequest.address;
      visitRequest.municipality = payload.municipality ?? visitRequest.municipality;
      visitRequest.sector = payload.sector ?? visitRequest.sector;
      visitRequest.requestedWindowStartAt =
        payload.requestedWindowStartAt ?? visitRequest.requestedWindowStartAt;
      visitRequest.requestedWindowEndAt =
        payload.requestedWindowEndAt ?? visitRequest.requestedWindowEndAt;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(visitRequest),
      });
      return;
    }

    if (
      /\/api\/v1\/wfm\/visit-requests\/[^/]+\/schedule-recommendations$/.test(pathname) &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: role === 'ADMIN' ? 200 : 403,
        contentType: 'application/json',
        body:
          role === 'ADMIN'
            ? JSON.stringify([
                {
                  technicianId: TECHNICIAN_ID,
                  scheduledStartAt: buildIsoAt(1, 14),
                  scheduledEndAt: buildIsoAt(1, 16),
                  score: 91,
                  labels: ['Recomendado'],
                  scoreBreakdown: {
                    distance: 30,
                    municipality: 25,
                    sector: 20,
                    routeContinuity: 10,
                    load: 4,
                    earliest: 2,
                  },
                  distanceKm: 1.1,
                  nearestEventId: null,
                  totalScheduledMinutes: 120,
                  eventCount: 1,
                },
              ])
            : JSON.stringify({ code: 'FORBIDDEN', message: 'No autorizado' }),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/visit-requests\/[^/]+\/schedule$/.test(pathname) && method === 'POST') {
      const visitRequestId = pathname.split('/').at(-2);
      const visitRequest = visitRequests.find((item) => item.id === visitRequestId);

      if (!visitRequest) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'Solicitud no encontrada' }),
        });
        return;
      }

      const payload = request.postDataJSON() as {
        assignedUserId: string;
        scheduledStartAt: string;
        scheduledEndAt: string;
        createWorkOrder?: boolean;
        workOrderNotes?: string | null;
      };
      const nextEventId = `evt-visit-${events.length + 1}`;
      const nextWorkOrderId =
        payload.createWorkOrder === false ? null : `wo-visit-${workOrders.length + 1}`;

      events.push({
        id: nextEventId,
        tenantId: visitRequest.tenantId,
        workOrderId: nextWorkOrderId,
        type: 'INSTALLATION',
        status: 'SCHEDULED',
        title: visitRequest.title,
        description: visitRequest.description,
        scheduledStartAt: payload.scheduledStartAt,
        scheduledEndAt: payload.scheduledEndAt,
        assignedUserId: payload.assignedUserId,
        assignedTeamId: null,
        address: visitRequest.address,
        municipality: visitRequest.municipality,
        latitude: null,
        longitude: null,
        expedienteId: visitRequest.expedienteId,
        subscriberId: visitRequest.subscriberId,
        ticketId: visitRequest.ticketId,
        contractId: null,
        createdBy: 'admin-001',
        updatedBy: 'admin-001',
        createdAt: buildIsoAt(0, 12),
        updatedAt: buildIsoAt(0, 12),
        deletedAt: null,
      });

      if (nextWorkOrderId) {
        workOrders.push({
          id: nextWorkOrderId,
          tenantId: visitRequest.tenantId,
          code: `WO-PV-${String(workOrders.length + 1).padStart(3, '0')}`,
          type: 'INSTALLATION',
          status: 'OPEN',
          priority: visitRequest.priority,
          assignedUserId: payload.assignedUserId,
          scheduledEventId: nextEventId,
          sourceContext: visitRequest.originContext,
          sourceRef: visitRequest.originRef,
          summary: visitRequest.title,
          notes: payload.workOrderNotes ?? visitRequest.description,
          createdBy: 'admin-001',
          closedBy: null,
          closedAt: null,
          createdAt: buildIsoAt(0, 12),
          updatedAt: buildIsoAt(0, 12),
          deletedAt: null,
        });
      }

      visitRequest.status = 'SCHEDULED';
      visitRequest.scheduleEventId = nextEventId;
      visitRequest.workOrderId = nextWorkOrderId;
      visitRequest.scheduledByUserId = 'admin-001';
      visitRequest.scheduledAt = buildIsoAt(0, 12);
      visitRequest.updatedAt = buildIsoAt(0, 12);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(visitRequest),
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
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 100);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildListResponse(visibleWorkOrders, page, limit)),
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

    if (
      options?.enableCrmInstallationFlow &&
      pathname.endsWith(`/crm/expedientes/${CRM_EXPEDIENTE_ID}`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: crmExpediente,
          completeness: {
            overall: 82,
            installationReadiness: {
              canTransition: true,
            },
          },
          sectionCompleteness: [],
          installationReadiness: {
            canTransition: true,
          },
          missingRequirements: [],
          pipelineRecommendation: null,
        }),
      });
      return;
    }

    if (
      options?.enableCrmInstallationFlow &&
      pathname.endsWith('/assurance/tickets/find-or-create-installation') &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ticket: {
            id: CRM_INSTALLATION_TICKET_ID,
            code: 'TK-CRM-001',
          },
          created: false,
        }),
      });
      return;
    }

    if (
      options?.enableCrmInstallationFlow &&
      pathname.endsWith(`/assurance/tickets/${CRM_INSTALLATION_TICKET_ID}/link-work-order`) &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: CRM_INSTALLATION_TICKET_ID }),
      });
      return;
    }

    if (
      options?.enableCrmInstallationFlow &&
      pathname.endsWith(`/crm/expedientes/${CRM_EXPEDIENTE_ID}/installation-operational-refs`) &&
      method === 'PATCH'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: crmExpediente }),
      });
      return;
    }

    if (
      options?.enableCrmInstallationFlow &&
      pathname.endsWith(`/crm/expedientes/${CRM_EXPEDIENTE_ID}/status`) &&
      method === 'PATCH'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...crmExpediente,
            status: 'INSTALACION_AGENDADA',
          },
          completeness: { overall: 82 },
          sectionCompleteness: [],
          installationReadiness: { canTransition: true },
          missingRequirements: [],
          pipelineRecommendation: null,
          transitionWarning: null,
        }),
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
      const expedienteId = url.searchParams.get('expedienteId');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 100);

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
        if (expedienteId && event.expedienteId !== expedienteId) {
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
        body: JSON.stringify(buildListResponse(visibleEvents, page, limit)),
      });
      return;
    }

    if (/\/api\/v1\/wfm\/visit-requests\/[^/]+$/.test(pathname) && method === 'GET') {
      const visitRequestId = pathname.split('/').at(-1);
      const visitRequest = visitRequests.find((item) => item.id === visitRequestId);

      await route.fulfill({
        status: visitRequest ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          visitRequest ?? { code: 'NOT_FOUND', message: 'Solicitud no encontrada' },
        ),
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
        expedienteId: payload.expedienteId ?? null,
        subscriberId: null,
        ticketId: payload.ticketId ?? null,
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

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

test('admin crea, reagenda y completa un evento con orden de trabajo desde Programacion', async ({
  page,
}) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: new RegExp(`Evento ${MOCK_EVENT_TITLE}`, 'i') }).click();

  await expect(page.getByRole('heading', { name: MOCK_EVENT_TITLE })).toBeVisible();
  await expect(page.getByText('Siguiente acción')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mover a pendientes' })).toBeVisible();
  await expect(page.getByText('Resumen de la OT')).toBeVisible();
  await expect(page.getByText('Estado: Programado')).toBeVisible();
});

test('admin agenda instalación desde CRM vía recomendaciones (recommendation-first)', async ({
  page,
}) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN', { enableCrmInstallationFlow: true });

  await page.goto(`/dashboard/scheduling/pending-visits?expedienteId=${CRM_EXPEDIENTE_ID}`);

  const panel = page.getByText('Despacho de la solicitud');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#visit-request-dispatch-title')).toHaveText(CRM_EXPEDIENTE_NAME);

  const calculateButton = page.getByRole('button', {
    name: 'Calcular recomendaciones',
  });
  await expect(calculateButton).toBeEnabled({ timeout: 10000 });
  await calculateButton.click();

  const recommendationCard = page.getByText('Luisa Campos').first();
  await expect(recommendationCard).toBeVisible({ timeout: 10000 });

  const confirmButton = page.getByRole('button', {
    name: 'Confirmar franja seleccionada',
  });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  const confirmDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Confirmar agendamiento' }),
  });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText('Luisa Campos')).toBeVisible();
  await expect(confirmDialog.getByText(/Puntuación:|Score:/i)).toBeVisible();

  await confirmDialog.getByRole('button', { name: 'Confirmar agenda' }).click();

  await expect(
    page.getByText('El expediente quedó marcado como instalación agendada.'),
  ).toBeVisible({ timeout: 10000 });
});
test('admin confirma una visita pendiente desde la bandeja WFM', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/pending-visits');

  await expect(page.getByRole('heading', { name: 'Visitas pendientes' })).toBeVisible();
  await expect(page.getByText(PENDING_VISIT_DISPLAY_NAME).first()).toBeVisible();
  await pendingVisitDispatchButton(page).click();

  const stepTwoToggle = page.getByRole('button', { name: /Ajustes de contexto/i });
  await stepTwoToggle.click();
  await page.getByRole('textbox', { name: 'Dirección operativa' }).fill('Calle 45 # 12-30');
  await page.getByRole('textbox', { name: 'Municipio' }).fill('Bogotá');
  await page.getByRole('textbox', { name: 'Sector' }).fill('Chapinero');
  await page.getByRole('button', { name: 'Guardar contexto' }).click();

  await page.getByRole('combobox', { name: 'Duración estimada' }).click();
  await page.getByRole('option', { name: '2 h' }).click();
  const calculateRecommendationsButton = page.getByRole('button', {
    name: 'Calcular recomendaciones',
  });
  if (await calculateRecommendationsButton.isEnabled()) {
    await calculateRecommendationsButton.click();
  }

  const scoreBadge = page.getByText('Puntuación: 91');
  if ((await scoreBadge.count()) > 0) {
    await expect(scoreBadge.first()).toBeVisible();
  } else {
    const useSlotButton = page.getByRole('button', { name: /Usar esta franja/i });
    if ((await useSlotButton.count()) > 0) {
      await useSlotButton.first().click();
    }
  }

  const recommendationCardButton = page.getByRole('button', { name: /Puntuación/i });
  if ((await recommendationCardButton.count()) > 0) {
    await recommendationCardButton.first().click();
  }

  const confirmSlotButton = page.getByRole('button', { name: 'Confirmar franja seleccionada' });
  if (!(await confirmSlotButton.isEnabled())) {
    const useSlotButton = page.getByRole('button', { name: /Usar esta franja/i });
    if ((await useSlotButton.count()) > 0) {
      await useSlotButton.first().click();
    }
  }

  await expect(confirmSlotButton).toBeEnabled();

  await page.getByRole('button', { name: 'Confirmar franja seleccionada' }).click();
  await page
    .getByLabel('Notas para la orden de trabajo')
    .fill('Coordinar acceso con portería y validar materiales.');
  await page.getByRole('button', { name: 'Confirmar agenda' }).click();

  await expect(
    page.getByText('La solicitud Instalación GPON barrio norte quedó agendada correctamente.'),
  ).toBeVisible();
});

test('admin abre el formulario manual y valida campos obligatorios', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/pending-visits');

  await expect(page.getByRole('heading', { name: 'Visitas pendientes' })).toBeVisible();
  await expect(page.getByText(PENDING_VISIT_DISPLAY_NAME).first()).toBeVisible();
  await pendingVisitDispatchButton(page).click();

  await expect(page.getByRole('button', { name: /Prefiero agendar manualmente/i })).toBeVisible();
  await page.getByRole('button', { name: /Prefiero agendar manualmente/i }).click();

  await expect(page.getByLabel('Técnico')).toBeVisible();
  await expect(page.getByLabel('Fecha')).toBeVisible();
  await expect(page.getByLabel('Hora de inicio')).toBeVisible();
  await expect(page.getByLabel('Duración (min)')).toBeVisible();

  await page.getByLabel('Fecha').fill('');
  await page.getByLabel('Duración (min)').fill('');

  await page.getByRole('button', { name: 'Revisar agenda manual' }).click();

  await expect(page.getByText('Selecciona un técnico para continuar.')).toBeVisible();
  await expect(page.getByText('Define una fecha válida para la agenda manual.')).toBeVisible();
  await expect(
    page.getByText('Define una hora de inicio válida para la agenda manual.'),
  ).toBeVisible();
  await expect(page.getByText('La duración mínima es de 15 minutos.')).toBeVisible();
});

test('admin agenda manualmente sin pasar por recomendaciones', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/pending-visits');

  await expect(page.getByRole('heading', { name: 'Visitas pendientes' })).toBeVisible();
  await pendingVisitDispatchButton(page).click();

  await page.getByRole('button', { name: /Prefiero agendar manualmente/i }).click();

  await expect(page.getByLabel('Técnico')).toBeVisible();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  await page.getByRole('combobox', { name: 'Técnico' }).click();
  await page.getByRole('option', { name: /Luisa Campos/ }).click();

  await page.getByLabel('Fecha').fill(tomorrowIso);
  await page.getByLabel('Hora de inicio').fill('14:00');
  await page.getByLabel('Duración (min)').fill('120');

  const schedulePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/visit-requests/') &&
      response.url().includes('/schedule') &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Revisar agenda manual' }).click();
  await expect(page.getByText('Agenda manual validada')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agenda' }).click();

  const response = await schedulePromise;
  expect(response.status()).toBe(201);

  await expect(
    page.getByText('La solicitud Instalación GPON barrio norte quedó agendada correctamente.'),
  ).toBeVisible();
});

test('admin conserva la bandeja pura al cerrar el detalle de una solicitud', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/pending-visits');

  await expect(page.getByRole('heading', { name: 'Visitas pendientes' })).toBeVisible();
  await pendingVisitDispatchButton(page).click();

  await page.getByRole('combobox', { name: 'Duración estimada' }).click();
  await page.getByRole('option', { name: '2 h' }).click();
  await page.getByRole('button', { name: 'Calcular recomendaciones' }).click();
  await expect(page.getByText('Puntuación: 91').first()).toBeVisible();

  await page.locator('button[aria-label="Cerrar panel"]').click();

  await expect(page.getByText('Pendiente por agendar')).toBeVisible();
  await expect(page.getByText('Despacho de la solicitud')).toHaveCount(0);
  await expect(page.getByText('Matriz semanal')).toHaveCount(0);
  await expect(page.getByText('Capacidad por técnico')).toHaveCount(0);
});

test('technician solo visualiza trabajos asignados en su agenda', async ({ page }) => {
  await seedPortalSession(page, 'TECHNICIAN', TECHNICIAN_ID);
  await setupSchedulingMocks(page, 'TECHNICIAN');

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);

  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`Evento ${MOCK_EVENT_TITLE}`, 'i') }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear solicitud manual' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('gridcell', { name: 'Luisa Campos' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver detalle de/i })).toBeVisible();
});

test('admin conserva una agenda operativa usable en viewport movil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');

  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear solicitud manual' })).toBeVisible();

  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('button', { name: /Ver detalle de/i })).toBeVisible();

  await page
    .getByRole('button', { name: /Ver detalle de/i })
    .first()
    .click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();
});

test('admin visualiza resumen operativo y abre detalle desde la jornada', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling');

  await expect(page.getByRole('heading', { name: 'Programación' })).toBeVisible();
  await expect(page.getByText('Pendientes por agendar')).toBeVisible();
  await expect(page.getByText('Riesgos que requieren atención')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a agenda' })).toBeVisible();
  await page.goto('/dashboard/scheduling/pending-visits');
  await expect(page.getByRole('heading', { name: 'Visitas pendientes' })).toBeVisible();

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: new RegExp(`Evento ${MOCK_EVENT_TITLE}`, 'i') }).click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();
});

test('admin consulta agenda por rango diario, semanal y mensual', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');
  await page.getByRole('button', { name: 'Lista' }).click();
  await page.getByRole('button', { name: 'Hoy' }).click();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('Sin eventos en el rango')).toBeVisible();

  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByRole('button', { name: /Ver detalle de/i })).toBeVisible();

  await getAnalyticalViewButton(page, 'Mes').click();
  await expect(page.getByText('Lee carga y días críticos del mes.')).toBeVisible();
});

test('admin puede abrir detalle desde teclado en vista lista', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: 'Lista' }).click();

  const actionButton = page.getByRole('button', {
    name: 'Ver detalle de Instalacion inicial de fibra',
  });
  await actionButton.focus();
  await page.keyboard.press('Enter');

  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();
});

test('admin cierra drawer con Escape y regresa foco a la lista', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);
  await page.getByRole('button', { name: 'Lista' }).click();

  const actionButton = page.getByRole('button', {
    name: 'Ver detalle de Instalacion inicial de fibra',
  });
  await actionButton.click();

  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalacion inicial de fibra' }) }),
  ).toHaveCount(0);

  await expect(actionButton).toBeVisible();
});

async function shiftAgendaToMockEventDay(page: import('@playwright/test').Page) {
  // Los fixtures de agenda programan eventos en dayOffset +1 respecto al día actual.
  await page.getByRole('button', { name: 'Ir al rango siguiente' }).click();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
}

function pendingVisitDispatchButton(page: import('@playwright/test').Page) {
  return page
    .getByRole('button', {
      name: new RegExp(`Abrir despacho para ${escapeRegExp(PENDING_VISIT_DISPLAY_NAME)}`, 'i'),
    })
    .first();
}

function getOperationalViewButton(page: import('@playwright/test').Page, view: 'Día' | 'Lista') {
  return page
    .getByRole('group', { name: 'Vistas operativas' })
    .getByRole('button', { name: view, exact: true });
}

function getAnalyticalViewButton(page: import('@playwright/test').Page, view: 'Semana' | 'Mes') {
  return page
    .getByRole('group', { name: 'Vistas analíticas' })
    .getByRole('button', { name: view, exact: true });
}

test('admin arranca en vista Día al abrir control de agenda', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');

  await expect(page.getByRole('heading', { name: 'Control de agenda' })).toBeVisible();
  await expect(getOperationalViewButton(page, 'Día')).toHaveAttribute('aria-pressed', 'true');
});

test('admin ve recomendación de alto volumen en Día con 20+ tareas', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN', { extraScheduledEvents: 22 });

  await page.goto('/dashboard/scheduling/agenda');

  await shiftAgendaToMockEventDay(page);

  await expect(getOperationalViewButton(page, 'Día')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Jornada de alto volumen')).toBeVisible();
  await expect(
    page.getByText(
      'Para revisar todas las tareas del día, usa Lista. Vuelve a Día para despachar y ajustar la jornada visible.',
    ),
  ).toBeVisible();
});

test('admin cambia entre vistas sin auto-switch al refrescar la jornada densa', async ({
  page,
}) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN', { extraScheduledEvents: 22 });

  await page.goto('/dashboard/scheduling/agenda');

  await shiftAgendaToMockEventDay(page);

  await getOperationalViewButton(page, 'Lista').click();
  await expect(getOperationalViewButton(page, 'Lista')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Superficie recomendada activa')).toBeVisible();

  await getAnalyticalViewButton(page, 'Semana').click();
  await expect(getAnalyticalViewButton(page, 'Semana')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Lee capacidad, presión y huecos de la semana.')).toBeVisible();

  await getAnalyticalViewButton(page, 'Mes').click();
  await expect(getAnalyticalViewButton(page, 'Mes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Lee carga y días críticos del mes.')).toBeVisible();

  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(getAnalyticalViewButton(page, 'Mes')).toHaveAttribute('aria-pressed', 'true');

  await getOperationalViewButton(page, 'Día').click();
  await expect(getOperationalViewButton(page, 'Día')).toHaveAttribute('aria-pressed', 'true');
});

test('admin deriva desde Semana y Mes hacia Día con Abrir día', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN', { extraScheduledEvents: 4 });

  await page.goto('/dashboard/scheduling/agenda');

  await getAnalyticalViewButton(page, 'Semana').click();
  await expect(getAnalyticalViewButton(page, 'Semana')).toHaveAttribute('aria-pressed', 'true');

  const openDayFromWeek = page.getByRole('button', { name: /Abrir día/i }).first();
  await expect(openDayFromWeek).toBeVisible();
  await openDayFromWeek.click();

  await expect(getOperationalViewButton(page, 'Día')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Despacho diario' })).toBeVisible();

  await getAnalyticalViewButton(page, 'Mes').click();
  await expect(getAnalyticalViewButton(page, 'Mes')).toHaveAttribute('aria-pressed', 'true');

  const openDayFromMonth = page.getByRole('button', { name: /Abrir día/i }).first();
  await expect(openDayFromMonth).toBeVisible();
  await openDayFromMonth.click();

  await expect(getOperationalViewButton(page, 'Día')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Despacho diario' })).toBeVisible();
});

test('admin usa Lista para revisar una jornada de alto volumen sin recortes', async ({ page }) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN', { extraScheduledEvents: 22 });

  await page.goto('/dashboard/scheduling/agenda');

  await shiftAgendaToMockEventDay(page);

  await getOperationalViewButton(page, 'Lista').click();

  await expect(page.getByRole('heading', { name: 'Todo el volumen del rango' })).toBeVisible();
  await expect(page.getByText('Todo el rango, sin recortes')).toBeVisible();
  await expect(
    page.getByText(
      'Usa la tabla para revisar la jornada completa, ordenar prioridades y detectar excepciones sin perder detalle por tarea.',
    ),
  ).toBeVisible();
  await expect(page.getByText('23 tareas')).toBeVisible();
  await expect(page.getByText('Instalación GPON ruta 22')).toBeVisible();

  await page.getByRole('button', { name: 'Ver detalle de Instalación GPON ruta 22' }).click();

  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Instalación GPON ruta 22' }) }),
  ).toBeVisible();
});

test('admin arrastra pendiente a la grilla, ajusta borrador y confirma agenda', async ({
  page,
}) => {
  await seedPortalSession(page, 'ADMIN', 'admin-001');
  await setupSchedulingMocks(page, 'ADMIN');

  await page.goto('/dashboard/scheduling/agenda');
  await shiftAgendaToMockEventDay(page);

  await expect(page.getByRole('heading', { name: 'Despacho diario' })).toBeVisible();
  await expect(page.getByText(PENDING_VISIT_DISPLAY_NAME).first()).toBeVisible();

  const pendingCard = page
    .locator('[draggable="true"]')
    .filter({ hasText: 'Cliente GPON Norte' })
    .first();
  const dropTarget = page.getByRole('button', {
    name: /Crear evento para Luisa Campos a las 14:00/i,
  });

  await pendingCard.dragTo(dropTarget);

  await expect(page.getByLabel(new RegExp(PENDING_VISIT_TITLE, 'i'))).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agenda', exact: true }).click();

  const confirmDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Confirmar agendamiento' }),
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Confirmar agenda' }).click();

  await expect(
    page.getByText('La solicitud Instalación GPON barrio norte quedó agendada correctamente.'),
  ).toBeVisible();
});
