import { expect, type Page } from '@playwright/test';

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

interface SetupWebApiMocksOptions {
  tenants?: WebTenantMock[];
  platformAuditData?: WebPlatformAuditEntryMock[];
  tenantAuditDataBySlug?: Record<string, WebTenantAuditEntryMock[]>;
  onUnhandledApiRoute?: 'continue' | '404';
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
              role: 'system_admin',
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

      if (url.includes('/tenants') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: tenants }),
        });
        return;
      }

      if (url.includes('/platform-audit-logs') && method === 'GET') {
        const searchParams = new URL(url).searchParams;
        const fromParam = searchParams.get('fromDate');
        const toParam = searchParams.get('toDate');

        let filtered = platformAuditData;
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

      if (url.includes('/health') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            db: 'ok',
            redis: 'ok',
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
