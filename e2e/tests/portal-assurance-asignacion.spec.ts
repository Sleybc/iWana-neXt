/**
 * E2E — Asignación visible en Mesa de ayuda (spec 2026-11-20-mod10-asignacion-visible-ux.md).
 *
 * API simulada con page.route (patrón de portal-assurance.spec.ts); datos y nombres sintéticos.
 * - CA-4: iniciales completas en la bandeja y en la ficha del suscriptor; nombre accesible;
 *   en la bandeja el nombre visible junto a las iniciales.
 * - CA-5: reasignar desde la fila en dos clics, con nota opcional; «Dejar sin asignar» solo con
 *   responsable; sin permiso de gestión no hay control.
 * - CA-1: la reasignación aparece como línea en «Comentarios» del detalle.
 * - CA-9: teclado del popover (Tab, foco contenido, Escape devuelve el foco), axe claro/oscuro con
 *   el popover abierto y 375 px sin desplazamiento lateral.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-asignacion-sintetico';
const TENANT_ID = 'tenant-asignacion-001';
const SUPPORT_ID = '11111111-1111-4111-8111-111111111111';
const NOC_ID = '22222222-2222-4222-8222-222222222222';
const TECH_ID = '33333333-3333-4333-8333-333333333333';
const SUBSCRIBER_ID = '44444444-4444-4444-8444-444444444444';
const TICKET_ASSIGNED_ID = '55555555-5555-4555-8555-555555555551';
const TICKET_FREE_ID = '55555555-5555-4555-8555-555555555552';

// Nombre largo a propósito: las iniciales no deben cortarse aunque el nombre sí se trunque.
const NOC_FIRST = 'Maximiliana';
const NOC_LAST = 'Valderrama-Castellanos';
const NOC_NAME = `${NOC_FIRST} ${NOC_LAST}`;
const NOC_INITIALS = 'MV';
const SUPPORT_NAME = 'Paula Mesa';

type Role = 'SUPPORT' | 'TECHNICIAN';

function buildToken(role: Role, sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email: 'hash-sintetico',
      role,
      tenantId: TENANT_ID,
      schemaName: 'tenant_asignacion_001',
      jti: `jti-${role}`,
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');
  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

function iso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function buildUser(id: string, role: string, firstName: string, lastName: string) {
  return {
    id,
    email: `${role.toLowerCase()}@example.invalid`,
    role,
    status: 'ACTIVE',
    tenantId: TENANT_ID,
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: iso(-1000),
    updatedAt: iso(-1000),
    deletedAt: null,
    firstName,
    lastName,
    phone: null,
    jobTitle: null,
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

const USERS = [
  buildUser(SUPPORT_ID, 'SUPPORT', 'Paula', 'Mesa'),
  buildUser(NOC_ID, 'NOC', NOC_FIRST, NOC_LAST),
  buildUser(TECH_ID, 'TECHNICIAN', 'Tomás', 'Ruiz'),
];

function buildTicket(id: string, number: string, assignedUserId: string | null) {
  return {
    id,
    tenantId: TENANT_ID,
    ticketNumber: number,
    type: 'CUSTOMER_INCIDENT',
    status: assignedUserId ? 'ASSIGNED' : 'OPEN',
    priority: 'NORMAL',
    source: 'PORTAL',
    subject: `Intermitencia sintética ${number}`,
    description: 'Descripción sintética',
    requesterType: 'SUBSCRIBER',
    requesterRefId: SUBSCRIBER_ID,
    subjectType: null,
    subjectRefId: null,
    assignedUserId,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: iso(240),
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: 'OK',
    fieldDecision: 'NOT_REQUIRED',
    workOrderId: null,
    createdByUserId: SUPPORT_ID,
    createdAt: iso(-60),
    updatedAt: iso(-60),
  };
}

function buildSubscriber() {
  return {
    id: SUBSCRIBER_ID,
    tenantId: TENANT_ID,
    userId: null,
    partyId: null,
    privacyRestricted: false,
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
    createdAt: iso(-1000),
    updatedAt: iso(-1000),
    deletedAt: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    fiscalCompleteness: { complete: true, missing: [] },
    taxRegime: null,
    expedienteId: null,
  };
}

type Ticket = ReturnType<typeof buildTicket>;
type TimelineEvent = {
  id: string;
  ticketId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  occurredAt: string;
};

interface MockState {
  tickets: Ticket[];
  timeline: Map<string, TimelineEvent[]>;
  assignCalls: Array<{ ticketId: string; body: Record<string, unknown> }>;
}

async function setupMocks(
  page: Page,
  { role = 'SUPPORT' as Role, usersShape = 'nested' as 'flat' | 'nested' } = {},
): Promise<MockState> {
  const me = role === 'SUPPORT' ? SUPPORT_ID : TECH_ID;
  await seedPortalSession(page, { token: buildToken(role, me), tenantSlug: TENANT_SLUG });
  const permissions =
    role === 'SUPPORT'
      ? [
          'assurance.tickets.read',
          'assurance.tickets.manage',
          'crm.subscribers.read',
          'wfm.schedule.read',
        ]
      : ['assurance.tickets.read'];

  const state: MockState = {
    tickets: [
      buildTicket(TICKET_ASSIGNED_ID, 'TK-20261120-001', NOC_ID),
      buildTicket(TICKET_FREE_ID, 'TK-20261120-002', null),
    ],
    timeline: new Map(),
    assignCalls: [],
  };

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith('/tenants/public-branding')) {
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
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        json: {
          data: {
            sub: me,
            email: 'hash-sintetico',
            role,
            tenantId: TENANT_ID,
            schemaName: 'tenant_asignacion_001',
            jti: `jti-${role}`,
            type: 'tenant',
            passwordResetRequired: false,
          },
        },
      });
    }
    if (path.endsWith('/access-control/me/effective-permissions')) {
      return route.fulfill({
        json: {
          data: {
            userId: me,
            role,
            effectivePermissions: permissions,
            recoveryPermissions: [],
            profileSources: [],
          },
        },
      });
    }
    if (path.endsWith('/tenants/me/summary')) {
      return route.fulfill({
        json: {
          data: {
            id: TENANT_ID,
            slug: TENANT_SLUG,
            displayName: 'Empresa sintética',
            status: 'ACTIVE',
          },
        },
      });
    }
    if (path.endsWith('/tenants/me')) {
      return route.fulfill({
        json: {
          data: {
            id: TENANT_ID,
            name: 'Empresa sintética',
            slug: TENANT_SLUG,
            status: 'ACTIVE',
            contactEmail: 'empresa@example.invalid',
            showTenantName: true,
          },
        },
      });
    }
    const userMatch = path.match(/\/users\/([0-9a-f-]{36})$/);
    if (userMatch && method === 'GET') {
      const user = USERS.find((u) => u.id === userMatch[1]);
      return route.fulfill({ status: user ? 200 : 404, json: { data: user ?? null } });
    }
    if (path.endsWith('/users') && method === 'GET') {
      return route.fulfill({
        json:
          usersShape === 'flat'
            ? { data: USERS, meta: { nextCursor: null } }
            : {
                data: { data: USERS, meta: { nextCursor: null, total: USERS.length, limit: 100 } },
              },
      });
    }
    if (path.endsWith('/notifications')) {
      return route.fulfill({ json: { data: [], meta: { nextCursor: null, total: 0 } } });
    }
    if (path.endsWith(`/crm/subscribers/${SUBSCRIBER_ID}/360`)) {
      return route.fulfill({
        json: {
          data: {
            subscriber: buildSubscriber(),
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
    if (path.endsWith('/assurance/sla-policies')) return route.fulfill({ json: [] });
    if (path.endsWith('/assurance/dashboard/summary')) {
      return route.fulfill({
        json: {
          openCount: 1,
          assignedCount: 1,
          inProgressCount: 0,
          atRiskCount: 0,
          breachedCount: 0,
          resolvedTodayCount: 0,
          fieldServicePendingCount: 0,
          byPriority: { NORMAL: state.tickets.length },
          byType: { CUSTOMER_INCIDENT: state.tickets.length },
        },
      });
    }
    if (path.endsWith('/assurance/tickets') && method === 'GET') {
      return route.fulfill({
        json: {
          data: state.tickets,
          total: state.tickets.length,
          page: 1,
          limit: 20,
          meta: { page: 1, limit: 20, total: state.tickets.length, totalPages: 1, hasMore: false },
        },
      });
    }
    const ticketMatch = path.match(
      /\/assurance\/tickets\/([0-9a-f-]{36})(?:\/(comments|timeline|assign|attachments))?$/,
    );
    if (ticketMatch) {
      const [, id, action] = ticketMatch;
      const ticket = state.tickets.find((t) => t.id === id);
      if (!ticket) return route.fulfill({ status: 404, json: { message: 'No encontrado' } });
      if (!action && method === 'GET') return route.fulfill({ json: ticket });
      if (action === 'comments' && method === 'GET') return route.fulfill({ json: [] });
      if (action === 'attachments' && method === 'GET') return route.fulfill({ json: [] });
      if (action === 'timeline' && method === 'GET') {
        return route.fulfill({ json: state.timeline.get(id!) ?? [] });
      }
      if (action === 'assign' && method === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        expect((await request.allHeaders())['x-tenant-slug']).toBe(TENANT_SLUG);
        state.assignCalls.push({ ticketId: id!, body });
        ticket.assignedUserId = (body.assignedUserId as string | null) ?? null;
        ticket.updatedAt = iso(1);
        const events = state.timeline.get(id!) ?? [];
        events.push({
          id: `ev-${id}-${events.length + 1}`,
          ticketId: id!,
          tenantId: TENANT_ID,
          eventType: 'REASSIGNED',
          payload: { assignedUserId: ticket.assignedUserId, note: body.note ?? null },
          actorUserId: SUPPORT_ID,
          occurredAt: iso(1),
        });
        state.timeline.set(id!, events);
        return route.fulfill({ status: 201, json: ticket });
      }
    }
    if (path.includes('/wfm/')) {
      return route.fulfill({
        json: { items: [], total: 0, truncated: false, data: [], meta: { total: 0 } },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });

  return state;
}

function inboxRow(page: Page, ticketNumber: string): Locator {
  return page.getByRole('row').filter({ hasText: ticketNumber });
}

/** El círculo de iniciales (aria-hidden) muestra su texto completo, sin recorte ni elipsis. */
async function expectInitialsNotClipped(mark: Locator, initials: string) {
  const circle = mark.locator('> span[aria-hidden="true"]').first();
  await expect(circle).toHaveText(initials);
  const fits = await circle.evaluate(
    (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
  );
  expect(fits, `iniciales «${initials}» recortadas`).toBe(true);
}

async function openInbox(page: Page) {
  await page.goto('/dashboard/assurance?queue=all', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mesa de ayuda' })).toBeVisible();
  await expect(inboxRow(page, 'TK-20261120-001')).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'desplazamiento lateral a 375 px').toBeLessThanOrEqual(0);
}

test.describe('Mesa de ayuda — asignación visible', () => {
  test.setTimeout(120_000);

  test('CA-4 (bandeja): iniciales completas, nombre visible al lado y nombre completo accesible', async ({
    page,
  }) => {
    await setupMocks(page);
    await openInbox(page);

    const row = inboxRow(page, 'TK-20261120-001');
    const trigger = row.getByRole('button', {
      name: `Cambiar responsable de TK-20261120-001: ${NOC_NAME}`,
    });
    await expect(trigger).toBeVisible();
    const mark = trigger.getByTestId('assignee-mark');
    await expect(mark).toHaveAttribute('title', NOC_NAME);
    await expectInitialsNotClipped(mark, NOC_INITIALS);
    // Nombre visible (no sr-only) junto a las iniciales.
    const visibleName = mark.locator('span.truncate', { hasText: NOC_NAME });
    await expect(visibleName).toBeVisible();

    // Sin responsable: círculo vacío y «Sin asignar».
    const free = inboxRow(page, 'TK-20261120-002').getByRole('button', {
      name: 'Cambiar responsable de TK-20261120-002: Sin asignar',
    });
    await expect(free).toBeVisible();
    await expect(free.getByTestId('assignee-mark').locator('> span[aria-hidden]')).toHaveText('');
  });

  test('CA-4 (ficha del suscriptor): solo iniciales completas y el nombre como texto accesible', async ({
    page,
  }) => {
    await setupMocks(page, { usersShape: 'nested' });
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}?tab=soporte`);
    const item = page.locator('li', { hasText: 'TK-20261120-001' }).first();
    await expect(item).toBeVisible();
    const mark = item.getByTestId('assignee-mark').first();
    await expect(mark).toHaveAttribute('title', NOC_NAME);
    await expectInitialsNotClipped(mark, NOC_INITIALS);
    // El nombre no se pinta en la fila estrecha, pero llega al lector de pantalla.
    const srName = mark.locator('span.sr-only', { hasText: NOC_NAME });
    await expect(srName).toHaveCount(1);
    await expect(item).toContainText(NOC_NAME);
  });

  test('CA-5 + CA-1: reasigna desde la fila en dos clics con nota y la línea aparece en Comentarios', async ({
    page,
  }) => {
    const state = await setupMocks(page);
    await openInbox(page);

    const row = inboxRow(page, 'TK-20261120-002');
    // Clic 1: abre el popover (sin abrir el ticket).
    await row.getByRole('button', { name: /^Cambiar responsable de TK-20261120-002/ }).click();
    const popover = page.getByRole('dialog', { name: 'Cambiar responsable de TK-20261120-002' });
    await expect(popover).toBeVisible();
    // Sin responsable no se ofrece «Dejar sin asignar».
    await expect(popover.getByRole('button', { name: 'Dejar sin asignar' })).toHaveCount(0);
    await popover
      .getByLabel('Nota para el nuevo responsable (opcional)')
      .fill('Revisar la ONT sintética');
    // Clic 2: elegir guarda.
    await popover.getByRole('button', { name: `Asignar a ${NOC_NAME}` }).click();
    await expect(popover).toBeHidden();
    await expect(
      page.getByText(`El ticket TK-20261120-002 quedó asignado a ${NOC_NAME}.`),
    ).toBeVisible();
    expect(state.assignCalls).toEqual([
      {
        ticketId: TICKET_FREE_ID,
        body: { assignedUserId: NOC_ID, note: 'Revisar la ONT sintética' },
      },
    ]);
    await expect(
      row.getByRole('button', { name: `Cambiar responsable de TK-20261120-002: ${NOC_NAME}` }),
    ).toBeVisible();

    // CA-1: la línea de reasignación aparece en «Comentarios» (pestaña por defecto) con la nota.
    await page.getByRole('button', { name: 'TK-20261120-002', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'TK-20261120-002' }).last();
    await expect(dialog.getByRole('tab', { name: 'Comentarios', selected: true })).toBeVisible();
    await expect(
      dialog.getByText(new RegExp(`${SUPPORT_NAME} reasignó a .*${NOC_FIRST}`)),
    ).toBeVisible();
    await expect(dialog.getByText('Revisar la ONT sintética')).toBeVisible();
  });

  test('CA-5: «Dejar sin asignar» solo con responsable y sin nota no pide nada más', async ({
    page,
  }) => {
    const state = await setupMocks(page);
    await openInbox(page);
    const row = inboxRow(page, 'TK-20261120-001');
    await row.getByRole('button', { name: /^Cambiar responsable de TK-20261120-001/ }).click();
    const popover = page.getByRole('dialog', { name: 'Cambiar responsable de TK-20261120-001' });
    // El responsable actual no aparece como opción.
    await expect(popover.getByRole('button', { name: `Asignar a ${NOC_NAME}` })).toHaveCount(0);
    await popover.getByRole('button', { name: 'Dejar sin asignar' }).click();
    await expect(page.getByText('El ticket TK-20261120-001 quedó sin asignar.')).toBeVisible();
    expect(state.assignCalls).toEqual([
      { ticketId: TICKET_ASSIGNED_ID, body: { assignedUserId: null } },
    ]);
  });

  test('CA-5: sin permiso de gestión la fila muestra el responsable sin control', async ({
    page,
  }) => {
    await setupMocks(page, { role: 'TECHNICIAN' });
    await openInbox(page);
    const row = inboxRow(page, 'TK-20261120-001');
    await expect(row.getByRole('button', { name: /Cambiar responsable/ })).toHaveCount(0);
    const mark = row.getByTestId('assignee-mark');
    await expect(mark).toHaveAttribute('title', NOC_NAME);
    await expect(mark).toContainText(NOC_NAME);
  });

  test('CA-9: teclado del popover, axe claro/oscuro con el popover abierto y 375 px', async ({
    page,
  }) => {
    await setupMocks(page);
    await openInbox(page);
    const trigger = inboxRow(page, 'TK-20261120-001').getByRole('button', {
      name: /^Cambiar responsable de TK-20261120-001/,
    });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const popover = page.getByRole('dialog', { name: 'Cambiar responsable de TK-20261120-001' });
    await expect(popover).toBeVisible();

    // Tab recorre nota → «Dejar sin asignar» → opciones, y el foco no sale del popover.
    const focusInside = () => popover.evaluate((el) => el.contains(document.activeElement));
    const focusedNames: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInside(), `Tab ${i + 1} sacó el foco del popover`).toBe(true);
      focusedNames.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.tagName ??
            '',
        ),
      );
    }
    expect(focusedNames).toContain('Dejar sin asignar');
    expect(focusedNames).toContain(`Asignar a ${SUPPORT_NAME}`);

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      );
      const result = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .include('table')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = result.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(blocking, `axe popover (${theme}): ${blocking.map((v) => v.id).join(', ')}`).toEqual(
        [],
      );
    }
    await page.emulateMedia({ colorScheme: 'light' });

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();

    // 375 px: sin desplazamiento lateral con la bandeja y con el popover abierto.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(trigger).toBeVisible();
    await expectNoHorizontalScroll(page);
    await trigger.click();
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await expectNoHorizontalScroll(page);
  });
});
