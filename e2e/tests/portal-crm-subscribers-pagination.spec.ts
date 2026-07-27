/**
 * E2E — ADR-065 Ola 4 · piloto Suscriptores (paginación numerada).
 *
 * Recorrido: página → tamaño → filtro → deep-link. Orden por columna queda
 * cubierto en unit cuando `sortableFields` no está vacío (hoy BE [] — Ola 2).
 *
 * HTTP mockeado — no requiere backend. Sin PII real.
 */

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-001',
      email: 'sha256:admin-hash-ficticio',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-001',
      schemaName: 'tenant_prueba',
      jti: 'jti-test-001',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const MOCK_TENANT = 'tenant-prueba';

const MOCK_ME = {
  sub: 'user-admin-uuid-001',
  email: 'sha256:admin-hash-ficticio',
  role: 'ADMIN',
  tenantId: 'tenant-uuid-001',
  schemaName: 'tenant_prueba',
  jti: 'jti-test-001',
  type: 'tenant',
  passwordResetRequired: false,
};

function buildSubscriber(id: string, firstName: string, lastName: string) {
  return {
    id,
    personType: 'NATURAL',
    firstName,
    lastName,
    businessName: null,
    commercialName: null,
    documentType: 'CC',
    documentNumber: id,
    nit: null,
    email: `${id}@prueba.local`,
    phone: null,
    customerSegment: 'RESIDENTIAL',
    vatTreatment: 'STANDARD',
    status: 'ACTIVE',
    city: 'Bogotá',
    department: 'Cundinamarca',
    stratum: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    externalId: null,
    createdBy: null,
  };
}

const PAGE1 = Array.from({ length: 20 }, (_, i) =>
  buildSubscriber(`sub-p1-${i}`, 'Ana', `PáginaUno${i}`),
);
const PAGE2 = Array.from({ length: 20 }, (_, i) =>
  buildSubscriber(`sub-p2-${i}`, 'Luis', `PáginaDos${i}`),
);
const PAGE3 = Array.from({ length: 5 }, (_, i) =>
  buildSubscriber(`sub-p3-${i}`, 'Eva', `PáginaTres${i}`),
);

function pageEnvelope(
  data: ReturnType<typeof buildSubscriber>[],
  page: number,
  limit: number,
  total: number,
) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    total,
    meta: {
      nextCursor: null,
      total,
      totalIsEstimate: false,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] as string[] },
      sort: null,
    },
  };
}

async function seedSession(page: Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, tenant }: { token: string; tenant: string }) => {
      window.localStorage.setItem('iwana.portal.access-token', token);
      window.localStorage.setItem('iwana.portal.tenant-slug', tenant);
    },
    { token: MOCK_TOKEN, tenant: MOCK_TENANT },
  );
}

async function setupMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'Tenant Prueba',
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

    if (url.includes('/tenants/me/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-001',
            slug: MOCK_TENANT,
            displayName: 'Tenant Prueba',
            status: 'ACTIVE',
          },
        }),
      });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_ME }),
      });
      return;
    }

    if (url.includes('/notifications') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { nextCursor: null, total: 0 } }),
      });
      return;
    }

    // Matcher tolerante a querystring (page/size/status) — no usar url === exacto.
    if (
      url.includes('/crm/subscribers') &&
      !url.includes('/crm/subscribers/') &&
      method === 'GET'
    ) {
      const parsed = new URL(url);
      const pageNum = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1;
      const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '20', 10) || 20;
      const status = parsed.searchParams.get('status');
      const search = parsed.searchParams.get('search');

      if (status === 'SUSPENDED' || search === 'sin-resultados') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(pageEnvelope([], 1, limit, 0)),
        });
        return;
      }

      const total = 45;
      let data = PAGE1;
      if (pageNum === 2) data = PAGE2;
      if (pageNum === 3) data = PAGE3;
      if (limit === 10 && pageNum === 1) {
        data = PAGE1.slice(0, 10);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pageEnvelope(data, pageNum, limit, total)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });
}

const evidenceDir = path.join(process.cwd(), 'docs/informes/evidence/adr065-ola4-subscribers');

/**
 * Conteo visible del pie (CA-PAG v2-08).
 * Excluye el anuncio `sr-only`/`aria-live` (v2-26) — lección piloto #4 / H-E2E-01.
 * No extraer a helper compartido hasta Ola 5 (cosecha).
 */
function visiblePagerCount(page: Page, text: string) {
  return page.locator('p:not([aria-live])').filter({ hasText: text });
}

test.describe('ADR-065 Ola 4 — Suscriptores paginación numerada', () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true });
  });

  test('recorrido página · tamaño · filtro · deep-link', async ({ page }) => {
    await seedSession(page);
    await setupMocks(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/crm/subscribers');

    await expect(page.getByRole('heading', { name: 'Suscriptores' })).toBeVisible();
    await expect(page.getByText('Ana PáginaUno0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 1–20 de 45 suscriptores')).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, '1280-page1-light.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Luis PáginaDos0')).toBeVisible();
    await expect(page.getByText('Ana PáginaUno0')).toHaveCount(0);
    await expect(visiblePagerCount(page, 'Mostrando 21–40 de 45 suscriptores')).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, '1280-page2-light.png'),
      fullPage: true,
    });

    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByText('Ana PáginaUno0')).toBeVisible();

    await page.getByRole('combobox', { name: 'Filas por página' }).click();
    await page.getByRole('option', { name: '10' }).click();
    await expect(page).toHaveURL(/size=10/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(visiblePagerCount(page, 'Mostrando 1–10 de 45 suscriptores')).toBeVisible();

    await page.getByRole('combobox', { name: 'Estado' }).click();
    await page.getByRole('option', { name: /Suspendido/i }).click();
    await expect(page).toHaveURL(/status=SUSPENDED/);
    await expect(page.getByText('No hay suscriptores con estos filtros.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, '1280-empty-filtered-light.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await page.goto('/dashboard/crm/subscribers?page=3');
    await expect(page.getByText('Eva PáginaTres0')).toBeVisible();
    await expect(visiblePagerCount(page, 'Mostrando 41–45 de 45 suscriptores')).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, '1280-page3-partial-light.png'),
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      path: path.join(evidenceDir, '1280-page3-partial-dark.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dashboard/crm/subscribers?page=2');
    await expect(page.getByText('Luis PáginaDos0')).toBeVisible();
    // Exacto: el aria-live anuncia «Página 2 de 3. Mostrando…» (mismo choque H-E2E-01).
    await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(evidenceDir, '375-page2-light.png'),
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      path: path.join(evidenceDir, '375-page2-dark.png'),
      fullPage: true,
    });
  });
});
