/**
 * Centro de control — Fase 4, P4 «Uso por empresa» (CA-PP4-01…04, ADR-114).
 * Encargo: docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4-v1.0.md §C.
 * El área solo se monta para `PLATFORM_TENANT_USAGE_ROLES` (hoy `SYSTEM_ADMIN`);
 * los mocks devuelven `SYSTEM_ADMIN` por defecto, como el API real; aquí se fija explícito.
 * Selectores por rol y texto de `PLATFORM_UI_COPY.dashboard`. Sin PII.
 */
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { evidenceDir } from './helpers/evidence';
import { buildTenantUsageMock, loginToDashboard, setupWebApiMocks } from './helpers/web-api-mocks';

const EVIDENCE_DIR = evidenceDir('quality/evidence-web-centro-control-uso-empresa');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const STALE = 'Desactualizada';

/** Gama 92 % reciente, Zeta sin medición, Eta medida hace 3 h, Omega sin cupo. */
const USAGE = buildTenantUsageMock([
  {
    tenantId: 'emp-c',
    name: 'Empresa Gama',
    activeSubscribers: 92,
    maxSubscribers: 100,
    minutesAgo: 10,
  },
  {
    tenantId: 'emp-f',
    name: 'Empresa Zeta',
    activeSubscribers: null,
    maxSubscribers: 100,
    minutesAgo: null,
  },
  {
    tenantId: 'emp-g',
    name: 'Empresa Eta',
    activeSubscribers: 40,
    maxSubscribers: 100,
    minutesAgo: 180,
  },
  {
    tenantId: 'emp-h',
    name: 'Empresa Omega',
    activeSubscribers: 7,
    maxSubscribers: null,
    minutesAgo: 30,
  },
]);

function usageArea(page: Page): Locator {
  return page.getByRole('region', { name: 'Uso por empresa' });
}

function usageRow(page: Page, name: string): Locator {
  return usageArea(page).getByRole('listitem').filter({ hasText: name });
}

function trackUsageRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/tenants/usage')) seen.push(request.url());
  });
  return seen;
}

async function loginToPulse(page: Page) {
  await loginToDashboard(page);
  await expect(page.getByRole('region', { name: 'Pulso de plataforma' })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test.describe('Uso por empresa — SYSTEM_ADMIN (CA-PP4-01…03)', () => {
  test.beforeEach(
    setupWebApiMocks({
      platformRole: 'SYSTEM_ADMIN',
      tenantUsage: USAGE,
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-PP4-01: SYSTEM_ADMIN ve el área con una fila por empresa', async ({ page }) => {
    const requests = trackUsageRequests(page);
    await loginToPulse(page);
    await expect(usageArea(page)).toBeVisible();
    await expect(usageArea(page).getByRole('listitem')).toHaveCount(4);
    expect(requests.length).toBeGreaterThanOrEqual(1);
    await expect(usageRow(page, 'Empresa Gama')).toContainText('92 %');
    await expect(usageRow(page, 'Empresa Omega')).toContainText('7 suscriptores');
  });

  test('CA-PP4-02: empresa sin medición se pinta «Sin dato», nunca 0', async ({ page }) => {
    await loginToPulse(page);
    const row = usageRow(page, 'Empresa Zeta');
    await expect(row).toContainText('Sin dato');
    await expect(row).not.toContainText(/\b0\b|%/);
    await expect(row.getByText(STALE, { exact: true })).toHaveCount(0);
  });

  test('CA-PP4-03: medición de más de 2 h se marca desactualizada; la reciente no', async ({
    page,
  }) => {
    await loginToPulse(page);
    await expect(usageRow(page, 'Empresa Eta').getByText(STALE, { exact: true })).toBeVisible();
    for (const name of ['Empresa Gama', 'Empresa Omega']) {
      await expect(usageRow(page, name).getByText(STALE, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Uso por empresa — IWANA_SUPPORT (CA-PP4-01)', () => {
  test.beforeEach(
    setupWebApiMocks({
      platformRole: 'IWANA_SUPPORT',
      tenantUsage: USAGE,
      onUnhandledApiRoute: '404',
    }),
  );

  test('IWANA_SUPPORT no ve el área ni la pide', async ({ page }) => {
    const requests = trackUsageRequests(page);
    await loginToPulse(page);
    await expect(page.getByRole('region', { name: 'Tendencia' })).toBeVisible();
    await expect(usageArea(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(/uso por empresa/i)).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});

test.describe('Uso por empresa — en error (CA-PP4-04)', () => {
  test.beforeEach(
    setupWebApiMocks({
      platformRole: 'SYSTEM_ADMIN',
      tenantUsage: USAGE,
      failSources: ['tenantUsage'],
      onUnhandledApiRoute: '404',
    }),
  );

  test('degrada solo el área, con Reintentar; el resto de la portada no', async ({ page }) => {
    await loginToPulse(page);
    const area = usageArea(page);
    await expect(area.getByText('No pudimos cargar el uso por empresa.')).toBeVisible();
    await expect(area.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(area.getByRole('listitem')).toHaveCount(0);
    await expect(area).not.toContainText(/\d+ %|Sin dato/);
    // Único Reintentar de la portada: ninguna otra área degradó.
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(1);
    // La tendencia conserva sus dos gráficas (v1.2, contrato DS §7ter.7): activas y altas/bajas.
    const trend = page.getByRole('region', { name: 'Tendencia' });
    await expect(trend.locator('.recharts-wrapper')).toHaveCount(2);
    await expect(
      trend.locator('figure').filter({ hasText: 'Activas al cierre' }).locator('.recharts-wrapper'),
    ).toHaveCount(1);
    await expect(
      trend.locator('figure').filter({ hasText: 'Bajas' }).locator('.recharts-wrapper'),
    ).toHaveCount(1);
  });
});

test.describe('Uso por empresa — durante la carga (CA-PP4-04)', () => {
  test.beforeEach(
    setupWebApiMocks({
      platformRole: 'SYSTEM_ADMIN',
      tenantUsage: USAGE,
      delaySourcesMs: { tenantUsage: 4_000 },
      onUnhandledApiRoute: '404',
    }),
  );

  test('mientras carga no pinta filas, «Sin dato» ni 0; luego llegan', async ({ page }) => {
    await loginToDashboard(page);
    const area = usageArea(page);
    await expect(area).toBeVisible();
    await expect(area.getByRole('listitem')).toHaveCount(0);
    await expect(area).not.toContainText(/Sin dato|\b0\b|%/);
    await expect(area.getByRole('listitem')).toHaveCount(4, { timeout: 10_000 });
  });
});

test.describe('Uso por empresa — axe WCAG 2.2 AA', () => {
  test.beforeEach(
    setupWebApiMocks({
      platformRole: 'SYSTEM_ADMIN',
      tenantUsage: USAGE,
      onUnhandledApiRoute: '404',
    }),
  );

  for (const width of [375, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`/dashboard con P4 sin violaciones a ${width} px, tema ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => {
          try {
            window.localStorage.setItem('iwana-theme', value);
          } catch {
            /* sin almacenamiento: la aserción de clase lo detecta */
          }
        }, theme);
        await page.emulateMedia({ colorScheme: theme });
        await loginToPulse(page);
        await expect(usageArea(page).getByRole('listitem')).toHaveCount(4);
        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
        }
        const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(result.violations).toEqual([]);
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `${width}-${theme}.png`),
          fullPage: true,
        });
      });
    }
  }
});
