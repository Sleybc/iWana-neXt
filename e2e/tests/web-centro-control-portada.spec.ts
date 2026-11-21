/**
 * Centro de control «Pulso de plataforma» — Fase 1 (CA-PP-01…08).
 * Encargo: docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md §C.
 * Selectores por rol y texto del catálogo `PLATFORM_UI_COPY.dashboard`. Sin PII.
 */
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { evidenceDir } from './helpers/evidence';
import {
  buildIsoAt,
  buildTenantSummaryMock,
  loginToDashboard,
  setupWebApiMocks,
  type WebPlatformAuditEntryMock,
  type WebTenantMock,
} from './helpers/web-api-mocks';

const EVIDENCE_DIR = evidenceDir('quality/evidence-web-centro-control-portada');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

function tenant(id: string, name: string, status: string, day: number): WebTenantMock {
  return {
    id,
    name,
    slug: id,
    schemaName: `tenant_${id.replace(/-/g, '_')}`,
    status,
    contactEmail: `hash:${id}`,
    maxSubscribers: 100,
    settings: {},
    createdAt: buildIsoAt(-day - 10, 9),
    updatedAt: buildIsoAt(-day, 9),
  };
}

/** Orden de llegada mezclado a propósito: la cola debe poner En riesgo primero. */
const TENANTS: WebTenantMock[] = [
  tenant('emp-a', 'Empresa Alfa', 'SUSPENDED', 1),
  tenant('emp-b', 'Empresa Beta', 'PROVISIONING_FAILED', 2),
  tenant('emp-c', 'Empresa Gama', 'ACTIVE', 3),
  tenant('emp-d', 'Empresa Delta', 'MARKED_FOR_DELETION', 4),
  tenant('emp-e', 'Empresa Épsilon', 'PROVISIONING', 5),
  tenant('emp-f', 'Empresa Zeta', 'ACTIVE', 6),
  tenant('emp-g', 'Empresa Eta', 'ACTIVE', 7),
];

/** Cifras de tres dígitos que no colisionan con fechas ni con el total. */
const SUMMARY = buildTenantSummaryMock(TENANTS, {
  total: 498,
  byStatus: {
    ACTIVE: 247,
    PROVISIONING: 138,
    PROVISIONING_FAILED: 61,
    SUSPENDED: 52,
    INACTIVE: 0,
    MARKED_FOR_DELETION: 0,
  },
});

function audit(id: string, action: string, hour: number): WebPlatformAuditEntryMock {
  return {
    id,
    userId: 'platform-user-1',
    actor: { id: 'platform-user-1', type: 'platform', displayName: 'Administrador plataforma' },
    action,
    entityType: action.startsWith('TENANT_') ? 'tenant' : 'platform_user',
    entityId: 'emp-c',
    oldValue: null,
    newValue: null,
    ipAddress: null,
    userAgent: null,
    requestId: null,
    createdAt: buildIsoAt(-1, hour),
  };
}

/** 4 de sesión intercaladas + 7 de negocio: se ven exactamente 5 y ninguna de sesión. */
const AUDIT: WebPlatformAuditEntryMock[] = [
  audit('a1', 'LOGIN', 23),
  audit('a2', 'TENANT_ACTIVATED', 22),
  audit('a3', 'REFRESH', 21),
  audit('a4', 'TENANT_SUSPENDED', 20),
  audit('a5', 'TENANT_CREATED', 19),
  audit('a6', 'LOGOUT', 18),
  audit('a7', 'TENANT_UPDATED', 17),
  audit('a8', 'TENANT_ACTIVATED', 16),
  audit('a9', 'LOGIN_FAILED', 15),
  audit('a10', 'TENANT_CREATED', 14),
  audit('a11', 'TENANT_UPDATED', 13),
];

/** Bloque = la `Card` (rounded-2xl, R3) que contiene el encabezado. */
function blockOf(page: Page, heading: string): Locator {
  return page
    .getByRole('heading', { name: heading, exact: true })
    .locator('xpath=ancestor::*[contains(@class,"rounded-2xl")][1]');
}

function blocks(page: Page) {
  return {
    pulse: page.getByRole('region', { name: 'Pulso de plataforma' }),
    queue: blockOf(page, 'Requiere tu atención'),
    companies: blockOf(page, 'Empresas'),
    health: page.locator('#salud-de-plataforma'),
    latest: blockOf(page, 'Últimas empresas'),
    activity: page.getByRole('region', { name: 'Actividad reciente' }),
  };
}

async function loginToPulse(page: Page) {
  await loginToDashboard(page);
  await expect(page.getByRole('region', { name: 'Pulso de plataforma' })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test.describe('Centro de control — pulso de plataforma (datos completos)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      platformAuditData: AUDIT,
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-PP-01: a 1440 × 900 B0, B1 y B2 se ven completos sin desplazar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginToPulse(page);
    const { pulse, queue, companies, health } = blocks(page);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const [name, block] of [
      ['B0', page.getByRole('heading', { name: 'Centro de control', level: 1 })],
      ['B1', pulse],
      ['B2 cola', queue],
      ['B2 Empresas', companies],
      ['B2 Salud', health],
    ] as const) {
      const box = await block.boundingBox();
      expect(box, `${name} renderizado`).toBeTruthy();
      expect(box!.y, `${name} arranca dentro del viewport`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${name} termina dentro de 900 px`).toBeLessThanOrEqual(900);
    }
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '1440-primer-viewport.png') });
  });

  test('CA-PP-02: cada conteo por estado sale en el pulso y en Empresas, y en ningún otro bloque', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { pulse, queue, companies, health, latest, activity } = blocks(page);

    await expect(pulse.getByRole('link', { name: 'Empresas activas' })).toContainText('247');
    await expect(pulse.getByRole('link', { name: 'Altas en curso' })).toContainText('138');
    for (const value of ['247', '138', '61', '52']) {
      await expect(companies, `Empresas muestra ${value}`).toContainText(value);
    }
    const counts = /\b(247|138|113)\b/;
    for (const [name, block] of [
      ['cola', queue],
      ['salud', health],
      ['últimas empresas', latest],
      ['actividad', activity],
    ] as const) {
      await expect(block, `${name} sin conteos por estado`).not.toContainText(counts);
    }
    // Sin chips ni indicador viejos (los sustituyen el pulso y la cola).
    await expect(page.getByText('Cambios esta semana')).toHaveCount(0);
    await expect(page.getByText('Atención operativa')).toHaveCount(0);
  });

  test('CA-PP-03: la cola ordena En riesgo antes que Atención y cada fila abre su empresa', async ({
    page,
  }) => {
    await loginToPulse(page);
    const rows = blocks(page).queue.getByRole('listitem').getByRole('link');
    const labels = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(6);
    const firstAttention = labels.findIndex((label) => label?.startsWith('Atención:'));
    const lastAtRisk = labels.map((l) => l?.startsWith('En riesgo:')).lastIndexOf(true);
    expect(lastAtRisk, 'hay al menos una fila En riesgo').toBeGreaterThanOrEqual(0);
    expect(firstAttention, 'hay al menos una fila Atención').toBeGreaterThan(lastAtRisk);
    expect(labels[0]).toContain('Empresa Beta');

    await expect(rows.first()).toHaveAttribute('href', '/tenants/emp-b/settings');
    await expect(
      blocks(page).queue.getByRole('link', { name: /^Atención: .*Empresa Alfa/ }),
    ).toHaveAttribute('href', '/tenants/emp-a/settings');
  });

  test('CA-PP-05: ningún bloque de P1–P4 está montado', async ({ page }) => {
    await loginToPulse(page);
    for (const text of [
      /tendencia/i,
      /disponibilidad/i,
      /equipo interno/i,
      /uso por empresa/i,
      /vs\.? (semana|mes) anterior/i,
    ]) {
      await expect(page.getByRole('main').getByText(text)).toHaveCount(0);
    }
    await expect(page.locator('canvas, .recharts-wrapper')).toHaveCount(0);
  });

  test('CA-PP-06: actividad con máx. 5 entradas, sin sesión y con <time dateTime>', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { activity } = blocks(page);
    const items = activity.getByRole('listitem');
    await expect(items).toHaveCount(5);
    await expect(activity).not.toContainText(/sesi[oó]n|inici[oó]|cerr[oó]|renov/i);
    const times = activity.locator('time[datetime]');
    await expect(times).toHaveCount(5);
    for (const value of await times.evaluateAll((els) =>
      els.map((el) => el.getAttribute('datetime')),
    )) {
      expect(Number.isNaN(Date.parse(value ?? ''))).toBe(false);
    }
  });

  test('CA-PP-07: lima solo en la barra del ítem activo; sin degradado azul→lima', async ({
    page,
  }) => {
    await loginToPulse(page);
    // Contenido de la pantalla; el lima del menú activo vive en el shell (`nav`).
    const offenders = await page.getByRole('main').evaluate((main) => {
      const found: string[] = [];
      for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
        const cls = typeof el.className === 'string' ? el.className : '';
        if (/iwana-secondary|(^|\s|-)lime(\s|-|$)/.test(cls)) found.push(cls);
        const bg = getComputedStyle(el).backgroundImage;
        if (/gradient/.test(bg)) found.push(`gradient:${cls}`);
      }
      return found;
    });
    expect(offenders).toEqual([]);
  });
});

test.describe('Centro de control — cola vacía', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: [tenant('emp-c', 'Empresa Gama', 'ACTIVE', 3)],
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-PP-03: sin filas la cola dice «Todo al día»', async ({ page }) => {
    await loginToPulse(page);
    const { queue } = blocks(page);
    await expect(queue.getByText('Todo al día', { exact: true })).toBeVisible();
    await expect(queue.getByRole('listitem')).toHaveCount(0);
  });
});

test.describe('Centro de control — fuente de empresas en error (CA-PP-04)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      platformAuditData: AUDIT,
      failSources: ['summary'],
      onUnhandledApiRoute: '404',
    }),
  );

  test('degrada solo pulso de empresas, Empresas y cola; nunca pinta 0', async ({ page }) => {
    await loginToPulse(page);
    const { pulse, queue, companies, health, latest, activity } = blocks(page);

    await expect(pulse.getByText('No disponible', { exact: true })).toHaveCount(3);
    await expect(pulse.getByRole('button', { name: 'Reintentar' }).first()).toBeVisible();
    await expect(pulse).not.toContainText(/(^|\s)0(\s|$)/);
    await expect(companies.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(queue.getByText('No pudimos revisar todas las fuentes.')).toBeVisible();
    await expect(queue.getByText('Todo al día')).toHaveCount(0);

    // Las demás fuentes siguen con su dato.
    await expect(health.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(latest.getByText('Empresa Alfa')).toBeVisible();
    await expect(activity.getByRole('listitem')).toHaveCount(5);
  });
});

test.describe('Centro de control — salud en error (CA-PP-04)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      failSources: ['health'],
      onUnhandledApiRoute: '404',
    }),
  );

  test('degrada solo la celda y el área de salud, con Reintentar', async ({ page }) => {
    await loginToPulse(page);
    const { pulse, companies, health } = blocks(page);
    await expect(pulse.getByText('No disponible', { exact: true })).toHaveCount(1);
    await expect(pulse.getByRole('link', { name: 'Empresas activas' })).toContainText('247');
    await expect(health.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(companies).toContainText('247');
  });
});

test.describe('Centro de control — durante la carga (CA-PP-04)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      delaySourcesMs: { summary: 4_000, health: 4_000, tenants: 4_000, audit: 4_000 },
      onUnhandledApiRoute: '404',
    }),
  );

  test('mientras carga no pinta 0 ni filas', async ({ page }) => {
    await loginToDashboard(page);
    const { pulse, queue } = blocks(page);
    // Las cuatro fuentes tardan 4 s: lo que sigue ocurre con todas pendientes.
    await expect(pulse).toBeVisible();
    await expect(pulse).not.toContainText(/\d/);
    await expect(queue).toHaveAttribute('aria-busy', 'true');
    await expect(queue.getByRole('listitem')).toHaveCount(0);
    await expect(queue.getByText('Todo al día')).toHaveCount(0);
  });
});

test.describe('Centro de control — axe WCAG 2.2 AA (CA-PP-08)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      platformAuditData: AUDIT,
      onUnhandledApiRoute: '404',
    }),
  );

  for (const width of [375, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`/dashboard sin violaciones a ${width} px, tema ${theme}`, async ({ page }) => {
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
