import { expect, type Page } from '@playwright/test';
import type {
  PlatformHealthComponent,
  PlatformHealthDay,
  PlatformHealthHistory,
  PlatformQueueSnapshot,
  PlatformUsersSummary,
  TenantStatusSummary,
  TenantUsage,
  TenantUsageItem,
} from '@iwana/shared';

export interface WebTenantMock {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: string;
  contactEmail: string;
  maxSubscribers: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WebAuditActorMock {
  id: string | null;
  type: 'tenant' | 'platform' | 'system' | 'unknown';
  displayName: string;
  role?: string;
  status?: string;
  isDeleted?: boolean;
}

export interface WebPlatformAuditEntryMock {
  id: string;
  userId: string | null;
  actor?: WebAuditActorMock | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface WebTenantAuditEntryMock {
  id: string;
  tenantId: string;
  userId: string | null;
  actor?: WebAuditActorMock | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

type TenantStatusKey = keyof TenantStatusSummary['byStatus'];

/** Estados de TenantStatus v1.0; espejo literal para no exigir el build de @iwana/shared. */
const TENANT_STATUS_KEYS = [
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'MARKED_FOR_DELETION',
  'PROVISIONING_FAILED',
] as const satisfies readonly TenantStatusKey[];

/** Orden de severidad de `attention` según el contrato TenantStatusSummary v1.0. */
const ATTENTION_SEVERITY = ['PROVISIONING_FAILED', 'MARKED_FOR_DELETION', 'SUSPENDED'] as const;

export type WebHealthLevel = 'ok' | 'degraded' | 'down';

export interface WebHealthMockOptions {
  /** `error` responde 503 sin cuerpo útil. */
  mode?: 'ok' | 'partial' | 'error';
  db?: WebHealthLevel;
  redis?: WebHealthLevel;
}

/** Acciones de sesión que filtra `excludeSessionEvents=true` (espejo de `AUDIT_SESSION_ACTIONS`). */
const AUDIT_SESSION_ACTION_KEYS = ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'REFRESH'] as const;

/** `YYYY-MM` de `date` desplazado `offset` meses (calendario local del runner). */
function monthKey(date: Date, offset: number): string {
  const value = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Serie de 12 meses (antiguo → actual) de `TenantStatusSummary` v1.1. `values[i]`
 * es `[altas, bajas]` del mes i; si faltan valores, el mes queda en 0.
 */
export function buildMonthlyMock(
  values: ReadonlyArray<readonly [number, number]> = [],
): TenantStatusSummary['monthly'] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const [created, removed] = values[index] ?? [0, 0];
    return { month: monthKey(now, index - 11), created, removed };
  });
}

/** Resumen de usuarios internos `PlatformUsersSummary` v1.0. Solo conteos, sin PII. */
export function buildPlatformUsersSummaryMock(
  overrides: Partial<PlatformUsersSummary> = {},
): PlatformUsersSummary {
  return {
    total: 9,
    byRole: { SYSTEM_ADMIN: 3, IWANA_SUPPORT: 6 },
    withoutMfa: 2,
    withoutAccess30d: 1,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Resumen por estado derivado de una lista de empresas, con la forma de
 * `TenantStatusSummary` v1.1. `overrides` permite fijar cifras mayores que la lista.
 * Por defecto la serie cuenta las altas de `tenants` por mes de `createdAt`.
 */
export function buildTenantSummaryMock(
  tenants: WebTenantMock[],
  overrides: Partial<TenantStatusSummary> = {},
): TenantStatusSummary {
  const byStatus = Object.fromEntries(TENANT_STATUS_KEYS.map((key) => [key, 0])) as Record<
    TenantStatusKey,
    number
  >;
  for (const tenant of tenants) {
    const key = tenant.status as TenantStatusKey;
    if (key in byStatus) byStatus[key] += 1;
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const attention = tenants
    .filter((tenant) => (ATTENTION_SEVERITY as readonly string[]).includes(tenant.status))
    .sort((a, b) => {
      const bySeverity =
        ATTENTION_SEVERITY.indexOf(a.status as (typeof ATTENTION_SEVERITY)[number]) -
        ATTENTION_SEVERITY.indexOf(b.status as (typeof ATTENTION_SEVERITY)[number]);
      return bySeverity !== 0 ? bySeverity : b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, 5)
    .map(({ id, name, status, updatedAt }) => ({
      id,
      name,
      status: status as TenantStatusSummary['attention'][number]['status'],
      updatedAt,
    }));
  const monthly = buildMonthlyMock();
  for (const tenant of tenants) {
    const created = new Date(tenant.createdAt);
    const key = monthKey(created, 0);
    const month = monthly.find((entry) => entry.month === key);
    if (month) month.created += 1;
  }
  const provisioning = tenants
    .filter((tenant) => tenant.status === 'PROVISIONING')
    .map((tenant) => tenant.createdAt)
    .sort();
  const effectiveMonthly = overrides.monthly ?? monthly;
  return {
    total: tenants.length,
    period: effectiveMonthly[effectiveMonthly.length - 1]!,
    monthly: effectiveMonthly,
    oldestProvisioningAt: provisioning[0] ?? null,
    byStatus: byStatus as TenantStatusSummary['byStatus'],
    updatedLast7Days: tenants.filter((tenant) => new Date(tenant.updatedAt).getTime() >= weekAgo)
      .length,
    attention,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Empresas de la portada compartidas por los specs de `/dashboard` (Q17). Sin PII. */
export const DASHBOARD_TENANTS: WebTenantMock[] = [
  {
    id: 'tenant-1',
    name: 'Demo ISP',
    slug: 'demo-isp',
    schemaName: 'tenant_demo_isp',
    status: 'PROVISIONING_FAILED',
    contactEmail: 'hash:contact-1',
    maxSubscribers: 500,
    settings: {},
    createdAt: '2026-03-12T09:00:00.000Z',
    updatedAt: '2026-03-13T10:00:00.000Z',
  },
  {
    id: 'tenant-2',
    name: 'Fibernet Colombia',
    slug: 'fibernet-col',
    schemaName: 'tenant_fibernet_col',
    status: 'ACTIVE',
    contactEmail: 'hash:contact-2',
    maxSubscribers: 1200,
    settings: {},
    createdAt: '2026-03-11T10:00:00.000Z',
    updatedAt: '2026-03-13T09:30:00.000Z',
  },
];

interface SetupWebApiMocksOptions {
  tenants?: WebTenantMock[];
  /** Resumen de `/tenants/summary`; por defecto, derivado de `tenants`. */
  tenantSummary?: TenantStatusSummary;
  health?: WebHealthMockOptions;
  platformAuditData?: WebPlatformAuditEntryMock[];
  tenantAuditDataBySlug?: Record<string, WebTenantAuditEntryMock[]>;
  /** Resumen de `/platform-users/summary` (P3). */
  platformUsersSummary?: PlatformUsersSummary;
  onUnhandledApiRoute?: 'continue' | '404';
  /** Fuentes de la portada que responden 500 (CA-PP-04). */
  failSources?: readonly DashboardSource[];
  /** Retraso por fuente en ms, para observar el estado de carga (CA-PP-04). */
  delaySourcesMs?: Partial<Record<DashboardSource, number>>;
  /** Historia de salud P2 (`/platform/health/history`, Fase 3). */
  healthHistory?: PlatformHealthHistory;
  /** Uso por empresa P4 (`/tenants/usage`, Fase 4). */
  tenantUsage?: TenantUsage;
  /** Rol de `/auth/me` (`PlatformRole`, mayúsculas como el API real); por defecto `SYSTEM_ADMIN`. */
  platformRole?: string;
}

/**
 * Uso P4 por empresa (ADR-114). `minutesAgo: null` = sin medición (`measuredAt` y
 * `activeSubscribers` en `null`). Solo conteos, sin PII.
 */
export function buildTenantUsageMock(
  rows: ReadonlyArray<{
    tenantId: string;
    name: string;
    activeSubscribers: number | null;
    maxSubscribers: number | null;
    minutesAgo: number | null;
  }>,
): TenantUsage {
  const now = Date.now();
  const items: TenantUsageItem[] = rows.map((row) => ({
    tenantId: row.tenantId,
    name: row.name,
    activeSubscribers: row.minutesAgo === null ? null : row.activeSubscribers,
    maxSubscribers: row.maxSubscribers,
    measuredAt:
      row.minutesAgo === null ? null : new Date(now - row.minutesAgo * 60_000).toISOString(),
  }));
  return { items, generatedAt: new Date(now).toISOString() };
}

/** Fuentes de `/dashboard` (Fase 1 + `users` de la Fase 2, P3). */
export type DashboardSource =
  | 'summary'
  | 'tenants'
  | 'audit'
  | 'health'
  | 'users'
  | 'healthHistory'
  | 'tenantUsage';

/**
 * Historia P2 de 30 días (antiguo → actual). `availability` por día y componente;
 * `null` deja el día sin muestras (CA-PP3-01). Por defecto, todo al 100 %.
 */
export function buildHealthHistoryMock(
  overrides: {
    availabilityByDay?: Record<number, Partial<Record<PlatformHealthComponent, number | null>>>;
    queues?: PlatformQueueSnapshot[];
    queuesSampledAt?: string | null;
  } = {},
): PlatformHealthHistory {
  const today = new Date();
  const days: PlatformHealthDay[] = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const byComponent = overrides.availabilityByDay?.[index] ?? {};
    const component = (key: PlatformHealthComponent) => {
      const availability = key in byComponent ? (byComponent[key] ?? null) : 1;
      return { samples: availability === null ? 0 : 288, availability };
    };
    return {
      date: date.toISOString().slice(0, 10),
      components: { api: component('api'), db: component('db'), redis: component('redis') },
    };
  });
  return {
    days,
    queues: overrides.queues ?? [],
    queuesSampledAt:
      overrides.queuesSampledAt === undefined ? today.toISOString() : overrides.queuesSampledAt,
    generatedAt: today.toISOString(),
  };
}

export function buildMockJwt(expirationSecondsFromNow = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expirationSecondsFromNow }),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.signature`;
}

export function buildIsoAt(dayOffset: number, hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function buildDefaultTenants(): WebTenantMock[] {
  return [
    {
      id: 'tenant-1',
      name: 'Demo ISP',
      slug: 'demo-isp',
      schemaName: 'tenant_demo_isp',
      status: 'ACTIVE',
      contactEmail: 'hash:contact-1',
      maxSubscribers: 500,
      settings: {},
      createdAt: buildIsoAt(-10, 9),
      updatedAt: buildIsoAt(-1, 10),
    },
    {
      id: 'tenant-2',
      name: 'Fibernet Colombia',
      slug: 'fibernet-col',
      schemaName: 'tenant_fibernet_col',
      status: 'ACTIVE',
      contactEmail: 'hash:contact-2',
      maxSubscribers: 1200,
      settings: {},
      createdAt: buildIsoAt(-12, 8),
      updatedAt: buildIsoAt(-2, 9),
    },
  ];
}

function buildDefaultPlatformAuditData(): WebPlatformAuditEntryMock[] {
  return [
    {
      id: 'platform-audit-1',
      userId: 'platform-user-1',
      actor: {
        id: 'platform-user-1',
        type: 'platform',
        displayName: 'Administrador plataforma',
      },
      action: 'TENANT_ACTIVATED',
      entityType: 'tenant',
      entityId: 'tenant-1',
      oldValue: null,
      newValue: { status: 'ACTIVE' },
      ipAddress: '127.0.0.1',
      userAgent: 'Playwright',
      requestId: 'req-platform-1',
      createdAt: buildIsoAt(-2, 10),
    },
  ];
}

function buildDefaultTenantAuditDataBySlug(): Record<string, WebTenantAuditEntryMock[]> {
  return {
    'demo-isp': [
      {
        id: 'tenant-audit-demo-1',
        tenantId: 'tenant-1',
        userId: 'tenant-user-1',
        actor: {
          id: 'tenant-user-1',
          type: 'tenant',
          displayName: 'Operador demo',
        },
        action: 'UPDATE',
        entityType: 'subscriber',
        entityId: 'subscriber-1',
        oldValue: { plan: 'BASICO' },
        newValue: { plan: 'PREMIUM' },
        ipAddress: '127.0.0.1',
        userAgent: 'Playwright',
        requestId: 'req-tenant-demo-1',
        createdAt: buildIsoAt(-1, 15),
      },
    ],
    'fibernet-col': [
      {
        id: 'tenant-audit-fibernet-1',
        tenantId: 'tenant-2',
        userId: 'tenant-user-2',
        actor: {
          id: 'tenant-user-2',
          type: 'tenant',
          displayName: 'Operador fibernet',
        },
        action: 'UPDATE',
        entityType: 'subscriber',
        entityId: 'subscriber-2',
        oldValue: { plan: 'FIBER_300' },
        newValue: { plan: 'FIBER_500' },
        ipAddress: '127.0.0.1',
        userAgent: 'Playwright',
        requestId: 'req-tenant-fibernet-1',
        createdAt: buildIsoAt(-6, 15),
      },
    ],
  };
}

export function setupWebApiMocks(options: SetupWebApiMocksOptions = {}) {
  const tenants = options.tenants ?? buildDefaultTenants();
  const platformAuditData = options.platformAuditData ?? buildDefaultPlatformAuditData();
  const tenantAuditDataBySlug =
    options.tenantAuditDataBySlug ?? buildDefaultTenantAuditDataBySlug();
  const onUnhandledApiRoute = options.onUnhandledApiRoute ?? 'continue';
  const tenantSummary = options.tenantSummary ?? buildTenantSummaryMock(tenants);
  const health = options.health ?? {};
  const platformUsersSummary = options.platformUsersSummary ?? buildPlatformUsersSummaryMock();
  const failSources = new Set(options.failSources ?? []);
  const delaySourcesMs = options.delaySourcesMs ?? {};
  const healthHistory = options.healthHistory ?? buildHealthHistoryMock();
  const tenantUsage = options.tenantUsage ?? buildTenantUsageMock([]);
  const platformRole = options.platformRole ?? 'SYSTEM_ADMIN';

  return async ({ page }: { page: import('@playwright/test').Page }) => {
    let isLoggedIn = false;

    // Mock central para flujos web de plataforma sin backend real.
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (url.endsWith('/auth/platform/login') && method === 'POST') {
        isLoggedIn = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              accessToken: buildMockJwt(),
            },
          }),
        });
        return;
      }

      if (url.endsWith('/auth/me') && method === 'GET') {
        if (!isLoggedIn) {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              sub: '8f145de2-1111-4abc-9e08-3b768a194001',
              email: 'sha256:admin-hash',
              role: platformRole,
              tenantId: null,
              schemaName: null,
              jti: 'jti-123',
              type: 'platform',
            },
          }),
        });
        return;
      }

      if (url.endsWith('/auth/logout') && method === 'POST') {
        isLoggedIn = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { message: 'Sesion cerrada correctamente.' } }),
        });
        return;
      }

      if (url.endsWith('/auth/refresh') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { accessToken: buildMockJwt() } }),
        });
        return;
      }

      const source: DashboardSource | null =
        method !== 'GET'
          ? null
          : new URL(url).pathname.endsWith('/tenants/usage')
            ? 'tenantUsage'
            : new URL(url).pathname.endsWith('/tenants/summary')
              ? 'summary'
              : new URL(url).pathname.endsWith('/platform-users/summary')
                ? 'users'
                : new URL(url).pathname.endsWith('/platform/health/history')
                  ? 'healthHistory'
                  : url.includes('/platform-audit-logs')
                    ? 'audit'
                    : url.includes('/health')
                      ? 'health'
                      : /\/api\/v1\/tenants(\?|$)/.test(url)
                        ? 'tenants'
                        : null;
      if (source && delaySourcesMs[source]) {
        await new Promise((resolve) => setTimeout(resolve, delaySourcesMs[source]));
      }
      if (source && failSources.has(source)) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Fallo simulado' }),
        });
        return;
      }

      if (new URL(url).pathname.endsWith('/platform-users/summary') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: platformUsersSummary }),
        });
        return;
      }

      if (new URL(url).pathname.endsWith('/tenants/usage') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: tenantUsage }),
        });
        return;
      }

      if (new URL(url).pathname.endsWith('/tenants/summary') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: tenantSummary }),
        });
        return;
      }

      if (url.includes('/tenants') && method === 'GET') {
        const searchParams = new URL(url).searchParams;
        const status = searchParams.get('status');
        const search = searchParams.get('search')?.trim().toLowerCase();
        // Orden del servidor: alta más reciente primero.
        let filtered = [...tenants].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (status) {
          filtered = filtered.filter((tenant) => tenant.status === status);
        }
        if (search) {
          filtered = filtered.filter((tenant) => {
            const haystack = [tenant.name, tenant.slug, tenant.contactEmail]
              .join(' ')
              .toLowerCase();
            return haystack.includes(search);
          });
        }

        const tenantLimit = Number(searchParams.get('limit'));
        if (Number.isInteger(tenantLimit) && tenantLimit > 0) {
          filtered = filtered.slice(0, tenantLimit);
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: filtered }),
        });
        return;
      }

      if (url.includes('/platform-audit-logs') && method === 'GET') {
        const searchParams = new URL(url).searchParams;
        const fromParam = searchParams.get('fromDate');
        const toParam = searchParams.get('toDate');

        let filtered = platformAuditData;
        if (searchParams.get('excludeSessionEvents') === 'true') {
          filtered = filtered.filter(
            (entry) => !(AUDIT_SESSION_ACTION_KEYS as readonly string[]).includes(entry.action),
          );
        }
        if (fromParam) {
          const fromDate = new Date(fromParam);
          filtered = filtered.filter((entry) => new Date(entry.createdAt) >= fromDate);
        }
        if (toParam) {
          const toDate = new Date(toParam);
          filtered = filtered.filter((entry) => new Date(entry.createdAt) <= toDate);
        }
        const limitParam = Number(searchParams.get('limit'));
        const page =
          Number.isInteger(limitParam) && limitParam > 0 ? filtered.slice(0, limitParam) : filtered;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: page,
            nextCursor: page.length < filtered.length ? (page[page.length - 1]?.id ?? null) : null,
            total: filtered.length,
          }),
        });
        return;
      }

      if (source === 'healthHistory') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: healthHistory }),
        });
        return;
      }

      if (url.includes('/health') && method === 'GET') {
        if (health.mode === 'error') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Sin lectura' }),
          });
          return;
        }
        const toPublicLevel = (level: WebHealthLevel) => (level === 'ok' ? 'ok' : 'error');
        const db = toPublicLevel(health.db ?? (health.mode === 'partial' ? 'degraded' : 'ok'));
        const redis = toPublicLevel(health.redis ?? 'ok');
        const healthy = db === 'ok' && redis === 'ok';
        // PublicHealth v1.0: 503 con el mismo cuerpo si db o redis fallan; sin relay.
        await route.fulfill({
          status: healthy ? 200 : 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: healthy ? 'ok' : 'degraded',
            db,
            redis,
            timestamp: new Date().toISOString(),
          }),
        });
        return;
      }

      if (url.includes('/audit-logs') && method === 'GET') {
        const tenantSlug = (await request.headerValue('x-tenant-slug')) ?? '';
        const fallbackData = tenantAuditDataBySlug['demo-isp'] ?? [];
        const data = tenantAuditDataBySlug[tenantSlug] ?? fallbackData;

        const searchParams = new URL(url).searchParams;
        const fromParam = searchParams.get('fromDate');
        const toParam = searchParams.get('toDate');

        let filtered = data;
        if (fromParam) {
          const fromDate = new Date(fromParam);
          filtered = filtered.filter((entry) => new Date(entry.createdAt) >= fromDate);
        }
        if (toParam) {
          const toDate = new Date(toParam);
          filtered = filtered.filter((entry) => new Date(entry.createdAt) <= toDate);
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: filtered,
            nextCursor: null,
            total: filtered.length,
          }),
        });
        return;
      }

      if (onUnhandledApiRoute === '404') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'NOT_FOUND', message: 'Mock no implementado' }),
        });
        return;
      }

      await route.continue();
    });
  };
}

export async function submitPlatformLogin(
  page: Page,
  credentials: { email: string; password: string } = {
    email: 'admin@iwana.local',
    password: 'Password123!',
  },
): Promise<void> {
  await page.locator('input[type="email"]').first().fill(credentials.email);
  await page.getByPlaceholder('••••••••').fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export async function loginAsPlatformAdmin(
  page: Page,
  credentials?: { email: string; password: string },
): Promise<void> {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await submitPlatformLogin(page, credentials);
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Login de plataforma hasta la portada «Centro de control» (compartido, Q17). */
export async function loginToDashboard(page: Page): Promise<void> {
  await loginAsPlatformAdmin(page);
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
}
