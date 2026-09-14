/**
 * E2E de navegador — MOD11 Consola de OT · Ola 1 · Regresión C5 (AI-SR-QA).
 *
 * Cubre la evidencia en navegador exigida por el stop/go sobre la OT de la
 * auditoría `OTE-20260828-001`: checklist con estado real (instalación
 * cumplida + 2 pendientes con razón) y sin la alerta falsa
 * "No puedes iniciar esta orden" en `IN_PROGRESS`.
 *
 * HTTP mockeado (sin backend): resuelve la limitación L1 de fe-platform
 * (sin sesión tenant en su superficie) con datos equivalentes al seed 118 +
 * `requirements[]` realista. Sin PII real.
 *
 * Casos del prompt §3 que fija en navegador: 7 (sin alerta en IN_PROGRESS),
 * 4/5 (checklist con estado real), 9 (degradación visible sin requirements[]).
 */

import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

// ────────────────────────────────────────────────────────────────
// Fixtures de sesión
// ────────────────────────────────────────────────────────────────

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-tech-uuid-consola-ola1',
      email: 'sha256:tech-hash-consola-ola1',
      role: 'TECHNICIAN',
      tenantId: 'tenant-uuid-consola-ola1',
      schemaName: 'tenant_consola_ola1',
      jti: 'jti-consola-ola1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_TENANT = 'tenant-consola-ola1';

const MOCK_ME = {
  sub: 'user-tech-uuid-consola-ola1',
  email: 'sha256:tech-hash-consola-ola1',
  role: 'TECHNICIAN',
  tenantId: 'tenant-uuid-consola-ola1',
  schemaName: 'tenant_consola_ola1',
  jti: 'jti-consola-ola1',
  type: 'tenant',
  passwordResetRequired: false,
};

const CONSOLE_PERMISSIONS = [
  'operations.execution_orders.read',
  'operations.execution_orders.execute',
  'operations.tasks.read',
  'settings.read',
];

// ────────────────────────────────────────────────────────────────
// OT de la auditoría (seed 118 + requirements[] realista)
// ────────────────────────────────────────────────────────────────

const TEMPLATE_SNAPSHOT = {
  id: 'tpl-seed',
  key: 'INSTALACION_ESTANDAR',
  version: 1,
  label: 'Instalación estándar v1',
  requirements: [
    {
      key: 'installation-activity',
      label: 'Actividad de instalación',
      required: true,
      kind: 'ACTIVITY',
      activityType: 'INSTALLATION',
    },
    {
      key: 'work-photo',
      label: 'Evidencia fotográfica',
      required: true,
      kind: 'EVIDENCE',
      evidenceType: 'PHOTO',
    },
    {
      key: 'CUSTOMER_SIGNATURE',
      label: 'Firma del cliente',
      required: true,
      kind: 'EVIDENCE',
      evidenceType: 'SIGNATURE',
    },
  ],
};

const AUDIT_REQUIREMENTS = [
  {
    requirementId: 'installation-activity',
    label: 'Actividad de instalación',
    kind: 'ACTIVITY',
    satisfied: true,
  },
  {
    requirementId: 'work-photo',
    label: 'Evidencia fotográfica',
    kind: 'EVIDENCE',
    satisfied: false,
    reason: 'Adjunta la evidencia fotográfica antes de cerrar la orden.',
  },
  {
    requirementId: 'CUSTOMER_SIGNATURE',
    label: 'Firma del cliente',
    kind: 'EVIDENCE',
    satisfied: false,
    reason: 'Adjunta la firma del cliente antes de cerrar la orden.',
  },
];

function auditDetail(orderId: string, withRequirements: boolean) {
  return {
    id: orderId,
    number: 'OTE-20260828-001',
    version: 1,
    status: 'IN_PROGRESS',
    workType: 'INSTALLATION',
    template: TEMPLATE_SNAPSHOT,
    schedule: {
      eventId: 'event-audit-001',
      window: {
        startAt: '2026-08-28T14:00:00.000Z',
        endAt: '2026-08-28T16:00:00.000Z',
      },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Técnico de campo' },
    site: { id: 'site-001', label: 'Sitio auditoría' },
    completion: withRequirements
      ? { progress: 33, completed: 1, total: 3, requirements: AUDIT_REQUIREMENTS }
      : { progress: 0, completed: 0, total: 3 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [
      'REGISTER_ACTIVITY',
      'REGISTER_ITEM_USAGE',
      'REGISTER_EVIDENCE',
      'BLOCK',
      'CLOSE',
    ],
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
  };
}

function pageMeta(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: MOCK_TENANT });
}

async function setupMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    const method = request.method();

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      return json({
        data: {
          displayName: 'Tenant Consola OLA1',
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
    }

    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return json({
        data: {
          id: 'tenant-uuid-consola-ola1',
          slug: MOCK_TENANT,
          displayName: 'Tenant Consola OLA1',
          status: 'ACTIVE',
        },
      });
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return json({
        data: {
          id: 'tenant-uuid-consola-ola1',
          name: 'Tenant Consola OLA1',
          slug: MOCK_TENANT,
          status: 'ACTIVE',
          contactEmail: 'contacto@consola-ola1.test',
          showTenantName: true,
        },
      });
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      return json({ data: MOCK_ME });
    }

    if (pathname.endsWith('/access-control/me/effective-permissions') && method === 'GET') {
      return json({
        data: {
          userId: MOCK_ME.sub,
          role: 'TECHNICIAN',
          effectivePermissions: CONSOLE_PERMISSIONS,
          recoveryPermissions: [],
          profileSources: [],
        },
      });
    }

    if (pathname.endsWith('/notifications') && method === 'GET') {
      return json({ data: [], meta: { nextCursor: null, total: 0 } });
    }

    if (pathname.endsWith('/dashboard/summary') && method === 'GET') {
      return json({
        data: {
          tenantName: 'Tenant Consola OLA1',
          activeSubscribers: 0,
          pendingInstallations: 0,
          overdueInvoices: 0,
          uptimePercent: 99.9,
          alerts: [],
        },
      });
    }

    if (pathname.endsWith('/configuration/settings-sections') && method === 'GET') {
      return json({ data: [] });
    }

    if (pathname.endsWith('/auth/logout') && method === 'POST') {
      return json({});
    }

    if (pathname.endsWith('/auth/refresh') && method === 'POST') {
      return json({ data: { accessToken: MOCK_TOKEN } });
    }

    if (pathname.endsWith('/users/search') && method === 'GET') {
      return json({ data: [], total: 0 });
    }

    if (/\/users\/[^/]+$/.test(pathname) && method === 'GET') {
      return json({
        data: {
          id: MOCK_ME.sub,
          email: 'tech@consola-ola1.test',
          role: 'TECHNICIAN',
          status: 'ACTIVE',
          firstName: 'Técnico',
          lastName: 'Prueba',
          phone: null,
          jobTitle: 'Técnico de campo',
          avatarUrl: null,
          mfaEnabled: false,
          emailVerified: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }

    if (pathname.endsWith('/organization/sites') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    if (pathname.endsWith('/inventory/custody') && method === 'GET') {
      return json({
        location: null,
        assets: { items: [], meta: pageMeta(1, 25, 0) },
        balances: { items: [], meta: pageMeta(1, 25, 0) },
      });
    }

    if (pathname.endsWith('/inventory/items') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    if (pathname.endsWith('/inventory/locations') && method === 'GET') {
      return json({ data: [], meta: pageMeta(1, 100, 0) });
    }

    // Bandeja mínima: una sola OT (la de la auditoría).
    if (pathname.endsWith('/tasks/execution-orders') && method === 'GET') {
      return json({
        data: [
          {
            id: 'eo-audit',
            number: 'OTE-20260828-001',
            status: 'IN_PROGRESS',
            result: null,
            workType: 'INSTALLATION',
            schedule: {
              eventId: 'event-audit-001',
              window: {
                startAt: '2026-08-28T14:00:00.000Z',
                endAt: '2026-08-28T16:00:00.000Z',
              },
            },
            assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Técnico de campo' },
            customerDisplayLabel: 'Sitio auditoría',
            municipality: 'Bogotá',
            ticketId: null,
            taskId: null,
            visitRequestId: null,
            createdAt: '2026-08-28T12:00:00.000Z',
            updatedAt: '2026-08-28T12:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        meta: pageMeta(1, 20, 1),
      });
    }

    // Detalle: `eo-audit` con requirements[] real; `eo-audit-sin-requisitos`
    // degrada de forma visible (caso 9).
    if (/\/tasks\/execution-orders\/[^/]+$/.test(pathname) && method === 'GET') {
      const orderId = pathname.split('/').pop() ?? 'eo-audit';
      if (orderId === 'eo-audit-sin-requisitos') {
        return json(auditDetail(orderId, false));
      }
      return json(auditDetail('eo-audit', true));
    }

    if (
      /\/tasks\/execution-orders\/[^/]+\/(activities|item-usage|evidences)$/.test(pathname) &&
      method === 'GET'
    ) {
      return json({ data: [], meta: pageMeta(1, 25, 0) });
    }

    if (pathname.endsWith('/tasks') && method === 'GET') {
      return json({ data: [], total: 0, page: 1, limit: 20, meta: pageMeta(1, 20, 0) });
    }

    return json({ data: null });
  });
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

test.describe('Consola OT OLA1 — evidencia en navegador OTE-20260828-001', () => {
  test('IN_PROGRESS: checklist con estado real y sin alerta falsa (+ captura)', async ({
    page,
  }) => {
    await setupMocks(page);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');

    // El drawer abre sobre la OT de la auditoría.
    await expect(page.getByRole('heading', { name: 'OTE-20260828-001' })).toBeVisible();

    // Checklist con estado real: instalación cumplida + 2 pendientes con razón.
    const checklist = page.getByRole('region', { name: 'Checklist de instalación' });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Cumplido', { exact: true })).toBeVisible();
    await expect(checklist.getByText('Evidencia fotográfica', { exact: true })).toBeVisible();
    await expect(checklist.getByText('Firma del cliente', { exact: true })).toBeVisible();
    await expect(
      checklist.getByText('Pendiente: Adjunta la evidencia fotográfica antes de cerrar la orden.'),
    ).toBeVisible();
    await expect(
      checklist.getByText('Pendiente: Adjunta la firma del cliente antes de cerrar la orden.'),
    ).toBeVisible();

    // Caso 7 (CA-03): la alerta falsa no se renderiza en IN_PROGRESS.
    await expect(page.getByText('No puedes iniciar esta orden')).toHaveCount(0);

    // Evidencia en navegador (stop/go C5): captura del drawer con el checklist.
    await checklist.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/quality/evidencia-OTE-20260828-001.png',
    });
  });

  test('sin requirements[]: degradación visible, nunca bloque vacío', async ({ page }) => {
    await setupMocks(page);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      '/dashboard/operations/execution-orders?executionOrderId=eo-audit-sin-requisitos',
    );

    await expect(page.getByRole('heading', { name: 'OTE-20260828-001' })).toBeVisible();

    const checklist = page.getByRole('region', { name: 'Checklist de instalación' });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Estado de requisitos no disponible')).toBeVisible();
    await expect(checklist.getByText('Actividad de instalación')).toBeVisible();
    await expect(page.getByText('No puedes iniciar esta orden')).toHaveCount(0);
  });
});
