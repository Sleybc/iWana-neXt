import { expect, test } from '@playwright/test';

const TOKEN_PAYLOAD = Buffer.from(
  JSON.stringify({
    sub: 'qa-user',
    role: 'ADMIN',
    tenantId: 'qa-tenant',
    schemaName: 'tenant_qa',
    type: 'tenant',
    exp: Math.floor(Date.now() / 1000) + 900,
  }),
).toString('base64url');
const ACCESS_TOKEN = `eyJhbGciOiJSUzI1NiJ9.${TOKEN_PAYLOAD}.synthetic`;

const subscriber = {
  id: 'qa-subscriber',
  personType: 'NATURAL',
  customerSegment: 'RESIDENTIAL',
  firstName: 'Suscriptor',
  lastName: 'Sintético',
  status: 'ACTIVE',
  stratum: 3,
  privacyRestricted: false,
  contactPending: false,
  privacyMarks: [],
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

test('AuthReadyGate cierra SSR y muestra la ficha después de validar la sesión', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];

    if (url.pathname.endsWith('/auth/refresh')) {
      data = { accessToken: ACCESS_TOKEN };
    } else if (url.pathname.endsWith('/auth/me')) {
      data = {
        sub: 'qa-user',
        role: 'ADMIN',
        tenantId: 'qa-tenant',
        schemaName: 'tenant_qa',
        type: 'tenant',
      };
    } else if (url.pathname.endsWith('/access-control/me/effective-permissions')) {
      data = {
        effectivePermissions: ['crm.subscribers.read', 'crm.subscribers.manage', 'privacy.read'],
        isAdmin: true,
      };
    } else if (url.pathname.endsWith('/users/qa-user')) {
      data = { id: 'qa-user', firstName: 'Usuario', lastName: 'Sintético', role: 'ADMIN' };
    } else if (url.pathname.endsWith('/tenants/me')) {
      data = { id: 'qa-tenant', name: 'Tenant sintético', slug: 'qa-tenant', status: 'ACTIVE' };
    } else if (url.pathname.endsWith('/crm/subscribers/qa-subscriber/360')) {
      data = {
        subscriber,
        contacts: [],
        contracts: [],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        timelineSeed: [],
        expedienteSummary: null,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        meta: { total: 0, page: 1, limit: 20, totalPages: 0, nextCursor: null },
      }),
    });
  });

  await page.context().addCookies([
    {
      name: 'portalAccessToken',
      value: ACCESS_TOKEN,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
  await page.addInitScript(() => localStorage.setItem('iwana.portal.tenant-slug', 'qa-tenant'));

  const response = await page.goto('/dashboard/crm/subscribers/qa-subscriber');
  expect(response?.status()).toBe(200);
  const initialHtml = await response?.text();
  expect(initialHtml).not.toContain('Suscriptor Sintético');

  await expect(page.getByRole('tab', { name: 'Vista general', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Datos', exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
