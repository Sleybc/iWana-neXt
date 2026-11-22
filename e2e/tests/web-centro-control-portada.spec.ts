/**
 * Centro de control «Pulso de plataforma» — Fase 1 (CA-PP-01…08) y Fase 2 (CA-PP2-01…06).
 * Encargos: docs/prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md §C y
 * PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0.md §C. La Fase 2 sustituye CA-PP-01/05/07:
 * B2 pasa a ser la tendencia, P1 y P3 se montan y el lima se permite en avance.
 * Fase 3 (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0.md §D, CA-PP3-01…05): P2 se monta;
 * la celda de salud del pulso pasa a ser «Disponibilidad, 30 días» y se añade Colas de trabajo.
 * Selectores por rol y texto del catálogo `PLATFORM_UI_COPY.dashboard`. Sin PII.
 */
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { evidenceDir } from './helpers/evidence';
import {
  AUDIT_SESSION_ACTIONS,
  AuditAction,
  buildHealthHistoryMock,
  buildIsoAt,
  buildMonthlyMock,
  type MonthlyMockValue,
  buildPlatformUsersSummaryMock,
  buildTenantSummaryMock,
  loginToDashboard,
  setupWebApiMocks,
  submitPlatformLogin,
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

/** 12 meses de altas y bajas (52 y 14); el mes en curso (último) da neto +3. */
const MONTHLY_VALUES: ReadonlyArray<readonly [number, number]> = [
  [4, 1],
  [6, 0],
  [3, 2],
  [7, 1],
  [2, 0],
  [5, 3],
  [8, 1],
  [1, 1],
  [9, 2],
  [1, 0],
  [1, 1],
  [5, 2],
];

/** Cifras de tres dígitos que no colisionan con fechas ni con el total. */
const SUMMARY = buildTenantSummaryMock(TENANTS, {
  monthly: buildMonthlyMock(MONTHLY_VALUES),
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
  audit('a1', AuditAction.LOGIN, 23),
  audit('a2', 'TENANT_ACTIVATED', 22),
  audit('a3', AuditAction.REFRESH, 21),
  audit('a4', 'TENANT_SUSPENDED', 20),
  audit('a5', 'TENANT_CREATED', 19),
  audit('a6', AuditAction.LOGOUT, 18),
  audit('a7', 'TENANT_UPDATED', 17),
  audit('a8', 'TENANT_ACTIVATED', 16),
  audit('a9', AuditAction.LOGIN_FAILED, 15),
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
    trend: page.getByRole('region', { name: 'Tendencia' }),
    users: page.getByRole('region', { name: 'Usuarios internos' }),
  };
}

/** Gráfica de barras «Altas y bajas» de la tendencia (su leyenda dice «Bajas»). */
function flowFigure(trend: Locator): Locator {
  return trend.locator('figure').filter({ hasText: 'Bajas' });
}

/** Gráfica de línea «Activas al cierre» de la tendencia. */
function activeFigure(trend: Locator): Locator {
  return trend.locator('figure').filter({ hasText: 'Activas al cierre' });
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

  test('CA-PP2-06: a 1440 × 900 B0, B1 y B2 (tendencia y cola) completos sin desplazar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginToPulse(page);
    const { pulse, queue, trend } = blocks(page);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const [name, block] of [
      ['B0', page.getByRole('heading', { name: 'Centro de control', level: 1 })],
      ['B1', pulse],
      ['B2 tendencia', trend],
      ['B2 cola', queue],
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

  // Fase 4 (ADR-114 §6): la visibilidad de P4 por rol la cubre web-centro-control-uso-empresa.spec.ts.
  test('CA-PP3-05: P2 (disponibilidad) se monta, sin comparativos de periodo', async ({ page }) => {
    await loginToPulse(page);
    await expect(
      blocks(page).pulse.getByText('Disponibilidad, 30 días', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main').getByText(/vs\.? (semana|mes) anterior/i)).toHaveCount(0);
    // Las únicas gráficas de la portada son las dos de la tendencia (P1, v1.2): la línea de
    // activas al cierre y las barras de altas y bajas.
    const trend = blocks(page).trend;
    await expect(page.locator('.recharts-wrapper')).toHaveCount(2);
    await expect(trend.locator('.recharts-wrapper')).toHaveCount(2);
    await expect(activeFigure(trend).locator('.recharts-wrapper')).toHaveCount(1);
    await expect(flowFigure(trend).locator('.recharts-wrapper')).toHaveCount(1);
  });

  test('CA-PP2-01: la tendencia muestra los 12 meses del contrato con altas y bajas', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { trend } = blocks(page);
    await expect(trend.getByRole('img', { name: /52 altas y 14 bajas en total/ })).toBeVisible();
    const flow = flowFigure(trend);
    await flow.getByRole('button', { name: 'Ver como tabla' }).click();
    const rows = flow.locator('tbody tr');
    await expect(rows).toHaveCount(12);
    const cells = await rows.evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim())),
    );
    expect(cells).toEqual(MONTHLY_VALUES.map(([c, r]) => [String(c), String(r)]));
    await expect(rows.last().locator('th')).toContainText('(en curso)');
  });

  test('CA-PP2-02: neto positivo del mes en lima; altas en curso con su antigüedad', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { pulse } = blocks(page);
    const active = pulse.getByRole('link', { name: 'Empresas activas' });
    const delta = active.getByText('+3 este mes', { exact: true });
    await expect(delta).toBeVisible();
    await expect(delta).toHaveClass(/iwana-secondary/);
    await expect(active).toContainText('5 altas · 2 bajas este mes');
    await expect(pulse.getByRole('link', { name: 'Altas en curso' })).toContainText(
      'La más antigua empezó',
    );
  });

  test('CA-PP2-03: Equipo interno y Usuarios internos con los conteos de P3', async ({ page }) => {
    await loginToPulse(page);
    const { pulse, users } = blocks(page);
    const team = pulse.getByRole('link', { name: 'Equipo interno' });
    await expect(team).toContainText('9');
    await expect(team).toContainText('2 sin verificación en dos pasos');
    await expect(team.getByRole('progressbar')).toHaveAttribute('value', '78');
    await expect(users.getByRole('definition')).toHaveText(['3', '6', '2', '1']);
    await expect(users.getByRole('link', { name: 'Ver usuarios' })).toHaveAttribute(
      'href',
      '/platform-users',
    );
  });

  test('CA-PP-06 / CA-PP2-04: actividad pedida sin sesión al servidor, máx. 5 y con <time>', async ({
    page,
  }) => {
    const auditRequest = page.waitForRequest(
      (req) => req.method() === 'GET' && req.url().includes('/platform-audit-logs'),
    );
    await loginToPulse(page);
    const params = new URL((await auditRequest).url()).searchParams;
    expect(params.get('excludeSessionEvents')).toBe('true');
    expect(params.get('limit')).toBe('5');
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

  test('CA-PP-07 (Fase 2): lima solo en el delta positivo y en la barra de dos pasos', async ({
    page,
  }) => {
    await loginToPulse(page);
    // Contenido de la pantalla; el lima del menú activo vive en el shell (`nav`).
    const offenders = await page.getByRole('main').evaluate((main) => {
      const found: string[] = [];
      for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
        const cls = typeof el.className === 'string' ? el.className : '';
        const allowed =
          el.tagName === 'PROGRESS' || /^\+\d+ este mes$/.test(el.textContent?.trim() ?? '');
        if (/iwana-secondary|(^|\s|-)lime(\s|-|$)/.test(cls) && !allowed) found.push(cls);
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
      platformUsersSummary: buildPlatformUsersSummaryMock({ withoutMfa: 0 }),
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

  test('degrada solo el área de salud, con Reintentar; la celda P2 no depende de ella', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { pulse, companies, health } = blocks(page);
    // Fase 3: la celda del pulso es P2 (historia), no la lectura instantánea de /health.
    await expect(pulse.getByText('No disponible', { exact: true })).toHaveCount(0);
    await expect(pulse).toContainText('100 %');
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
      delaySourcesMs: {
        summary: 4_000,
        health: 4_000,
        tenants: 4_000,
        audit: 4_000,
        users: 4_000,
        healthHistory: 4_000,
      },
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

test.describe('Centro de control — neto negativo del mes (CA-PP2-02)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: buildTenantSummaryMock(TENANTS, {
        monthly: buildMonthlyMock([...MONTHLY_VALUES.slice(0, 11), [1, 3]]),
      }),
      onUnhandledApiRoute: '404',
    }),
  );

  test('el delta negativo no usa lima', async ({ page }) => {
    await loginToPulse(page);
    const delta = blocks(page)
      .pulse.getByRole('link', { name: 'Empresas activas' })
      .getByText('-2 este mes', { exact: true });
    await expect(delta).toBeVisible();
    await expect(delta).not.toHaveClass(/iwana-secondary|lime/);
  });
});

test.describe('Centro de control — tendencia sin eventos (CA-PP2-01)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: buildTenantSummaryMock(TENANTS, { monthly: buildMonthlyMock() }),
      onUnhandledApiRoute: '404',
    }),
  );

  test('12 meses sin altas ni bajas: línea de activas y barras vacías, sin delta', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { trend, pulse } = blocks(page);
    // Regla AI-EM-ARCH (2026-11-22): con activas al cierre conocidas se dibuja la línea y solo
    // las barras dicen el vacío; el vacío único es para activas y flujos en 0.
    await expect(trend.getByText('Sin altas ni bajas en los últimos 12 meses')).toBeVisible();
    await expect(
      trend.getByText('Sin empresas activas, altas ni bajas en los últimos 12 meses'),
    ).toHaveCount(0);
    await expect(
      activeFigure(trend).getByRole('img', { name: /Empresas activas al cierre de cada mes/ }),
    ).toBeVisible();
    await expect(flowFigure(trend).locator('.recharts-wrapper, table')).toHaveCount(0);
    await expect(
      pulse.getByRole('link', { name: 'Empresas activas' }).getByText(/^[+-]\d+ este mes$/),
    ).toHaveCount(0);
  });
});

test.describe('Centro de control — P1 en error (CA-PP2-01)', () => {
  test.beforeEach(
    setupWebApiMocks({ tenants: TENANTS, failSources: ['summary'], onUnhandledApiRoute: '404' }),
  );

  test('la tendencia muestra su error con Reintentar y no pinta serie', async ({ page }) => {
    await loginToPulse(page);
    const { trend } = blocks(page);
    await expect(trend.getByText('No pudimos cargar la tendencia.')).toBeVisible();
    await expect(trend.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(trend.locator('.recharts-wrapper, table')).toHaveCount(0);
  });
});

test.describe('Centro de control — P3 en error (CA-PP2-03)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      platformAuditData: AUDIT,
      failSources: ['users'],
      onUnhandledApiRoute: '404',
    }),
  );

  test('degradan solo Equipo interno y Usuarios internos; el resto conserva su dato', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { pulse, users, trend, activity } = blocks(page);
    await expect(pulse.getByText('No disponible', { exact: true })).toHaveCount(1);
    await expect(pulse).not.toContainText('sin verificación en dos pasos');
    await expect(pulse.getByRole('link', { name: 'Empresas activas' })).toContainText('247');
    await expect(users.getByText('No pudimos cargar el equipo interno.')).toBeVisible();
    await expect(users.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(users.getByRole('definition')).toHaveCount(0);
    await expect(trend.locator('.recharts-wrapper')).toHaveCount(2);
    await expect(activeFigure(trend).locator('.recharts-wrapper')).toHaveCount(1);
    await expect(flowFigure(trend).locator('.recharts-wrapper')).toHaveCount(1);
    await expect(activity.getByRole('listitem')).toHaveCount(5);
  });
});

test.describe('Centro de control — el cliente no filtra la actividad (CA-PP2-04)', () => {
  test.beforeEach(
    setupWebApiMocks({ tenants: TENANTS, tenantSummary: SUMMARY, onUnhandledApiRoute: '404' }),
  );

  test('pinta lo que entrega el servidor aunque incluya un evento de sesión', async ({ page }) => {
    // Servidor que ignora el filtro: si el cliente filtrara en local, quedarían 4.
    await page.route('**/api/v1/platform-audit-logs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: AUDIT.slice(0, 5), nextCursor: null, total: 5 }),
      }),
    );
    await loginToPulse(page);
    await expect(blocks(page).activity.getByRole('listitem')).toHaveCount(5);
  });
});

/** Días 0–2 sin muestras; día 10 con fallas en la base de datos; tres colas, una desconocida. */
const HISTORY = buildHealthHistoryMock({
  availabilityByDay: {
    0: { api: null, db: null, redis: null },
    1: { api: null, db: null, redis: null },
    2: { api: null, db: null, redis: null },
    10: { db: 0.5 },
  },
  queues: [
    { name: 'tenant-provisioning', waiting: 437, failed: 0, oldestWaitingSeconds: 7_200 },
    { name: 'crm-contract-pdf', waiting: 0, failed: 389, oldestWaitingSeconds: null },
    { name: 'cola-interna-sin-catalogo', waiting: 0, failed: 0, oldestWaitingSeconds: null },
  ],
});
const PERCENT = /\d+([,.]\d+)? %/;

test.describe('Centro de control — disponibilidad y colas P2 (CA-PP3-01/02/03)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: HISTORY,
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-PP3-01: un día sin muestras se pinta «sin dato», nunca como disponible', async ({
    page,
  }) => {
    await loginToPulse(page);
    const tracker = blocks(page).health.getByRole('img', {
      name: /Disponibilidad diaria de los últimos 30 días/,
    });
    await expect(tracker).toHaveAccessibleName(/26 sin fallas, 1 con fallas, 3 sin dato/);
    const dayNoData = tracker.locator(`[title="${HISTORY.days[0]!.date}: sin dato"]`);
    await expect(dayNoData).toHaveAttribute('data-tone', 'neutral');
    await expect(tracker.locator('[data-tone="success"]')).toHaveCount(26);
    await expect(blocks(page).pulse).toContainText('3 días sin dato');
  });

  test('CA-PP3-02: el % sale solo de muestras reales (peor componente)', async ({ page }) => {
    await loginToPulse(page);
    // db: 26 días a 1 y uno a 0,5, 288 muestras cada uno → 26,5/27 = 98,148 %, redondeado a 98,15 %
    // (F3-D6, redondeo decidido por el CTO). Si los días sin muestras contaran como disponibles daría
    // 29,5/30 = 98,33 %.
    const pulse = blocks(page).pulse;
    await expect(pulse).toContainText('98,15 %');
    await expect(pulse).not.toContainText('98,33 %');
    // Por debajo de 99 % es rojo (CTO, dirección §8): rótulo grave y variante de error del Badge,
    // que no expone `data-tone`; «Con fallas» (ámbar) no debe aparecer.
    const critical = pulse.getByText('Con fallas graves', { exact: true });
    await expect(critical).toBeVisible();
    await expect(critical).toHaveClass(/(^|\s)bg-error-50(\s|$)/);
    await expect(pulse.getByText('Con fallas', { exact: true })).toHaveCount(0);
  });

  test('CA-PP3-03: colas con espera, fallidos y antigüedad, nombres en español', async ({
    page,
  }) => {
    await loginToPulse(page);
    const area = page.getByRole('region', { name: 'Colas de trabajo' });
    const table = area.getByRole('table', { name: 'Colas de trabajo' });
    for (const header of ['Cola', 'En espera', 'Fallidos (72 h)', 'Más antiguo']) {
      await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }
    const provisioning = table.getByRole('row', { name: /Puesta en marcha de empresas/ });
    await expect(provisioning).toContainText('437');
    await expect(provisioning).not.toContainText('Sin espera');
    const pdf = table.getByRole('row', { name: /Documentos de contrato/ });
    await expect(pdf).toContainText('389');
    await expect(pdf).toContainText('Sin espera');
    // Solo colas con novedad; la cola en cero queda tras «Ver todas».
    await expect(table.getByRole('row', { name: /Proceso interno/ })).toHaveCount(0);
    await expect(area).toContainText('1 cola sin novedad');
    await area.getByRole('button', { name: 'Ver todas' }).click();
    await expect(table.getByRole('row', { name: /Proceso interno/ })).toBeVisible();
    for (const technical of ['tenant-provisioning', 'crm-contract-pdf', 'cola-interna']) {
      await expect(area).not.toContainText(technical);
    }
    // Hay fallidos: el rótulo es «Con fallos» y la cola de atención enlaza al bloque.
    await expect(area.getByText('Con fallos', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: /389 trabajos fallidos en 72 h\. Colas de trabajo · 2 colas/,
      }),
    ).toHaveAttribute('href', '#colas-de-trabajo');
  });
});

test.describe('Centro de control — historia P2 sin muestras (CA-PP3-01)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: buildHealthHistoryMock({
        availabilityByDay: Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [i, { api: null, db: null, redis: null }]),
        ),
        queues: [],
        queuesSampledAt: null,
      }),
      onUnhandledApiRoute: '404',
    }),
  );

  test('30 días sin muestras: sin %, sin verde y colas vacías', async ({ page }) => {
    await loginToPulse(page);
    const { pulse, health } = blocks(page);
    await expect(pulse).toContainText('Sin muestras en 30 días');
    await expect(pulse).not.toContainText(PERCENT);
    await expect(pulse).not.toContainText('Operativa');
    await expect(
      health.getByRole('img', { name: /0 sin fallas, 0 con fallas, 30 sin dato/ }),
    ).toBeVisible();
    await expect(health.getByRole('img').locator('[data-tone="success"]')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Colas de trabajo' })
        .getByText('Aún no hay muestras de las colas.'),
    ).toBeVisible();
  });
});

test.describe('Centro de control — historia P2 en error (CA-PP3-02)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      failSources: ['healthHistory'],
      onUnhandledApiRoute: '404',
    }),
  );

  test('celda y colas en error con Reintentar; nunca pinta %; el resto conserva su dato', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { pulse, health } = blocks(page);
    await expect(pulse.getByText('No disponible', { exact: true })).toHaveCount(1);
    await expect(pulse).not.toContainText(PERCENT);
    await expect(pulse.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(pulse.getByRole('link', { name: 'Empresas activas' })).toContainText('247');
    await expect(health).toContainText('No pudimos cargar la disponibilidad de 30 días.');
    const queues = page.getByRole('region', { name: 'Colas de trabajo' });
    await expect(queues).toContainText('No pudimos cargar las colas de trabajo.');
    await expect(queues.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

test.describe('Centro de control — historia P2 durante la carga (CA-PP3-02)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: HISTORY,
      delaySourcesMs: { healthHistory: 4_000 },
      onUnhandledApiRoute: '404',
    }),
  );

  test('mientras carga no pinta % ni tabla de colas', async ({ page }) => {
    await loginToDashboard(page);
    const { pulse } = blocks(page);
    await expect(pulse.getByRole('link', { name: 'Empresas activas' })).toContainText('247');
    await expect(pulse).not.toContainText('%');
    await expect(
      page.getByRole('region', { name: 'Colas de trabajo' }).getByRole('table'),
    ).toHaveCount(0);
    await loginToPulse(page);
    await expect(pulse).toContainText('98,15 %');
  });
});

test.describe('Centro de control — axe WCAG 2.2 AA (CA-PP-08)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: HISTORY,
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

test.describe('Centro de control — fixture de sesión (F2-D7)', () => {
  test('la fixture de actividad cubre cada acción de sesión del contrato', () => {
    // Si `AUDIT_SESSION_ACTIONS` crece, CA-PP2-04 debe probar también la nueva acción.
    const actions = new Set(AUDIT.map((entry) => entry.action));
    for (const sessionAction of AUDIT_SESSION_ACTIONS) {
      expect(actions.has(sessionAction), `falta ${sessionAction} en AUDIT`).toBe(true);
    }
  });
});

/**
 * Llegada desordenada a propósito. Orden del API (createdAt DESC, id DESC):
 * Uno, Dos, Tres, Cuatro (ord-d2) y Cinco (ord-d1, mismo instante que ord-d2); Seis y Siete
 * quedan fuera del corte de 5.
 */
const LATEST_SHUFFLED: WebTenantMock[] = [
  tenant('ord-g', 'Orden Siete', 'ACTIVE', 7),
  tenant('ord-d1', 'Orden Cinco', 'ACTIVE', 4),
  tenant('ord-b', 'Orden Dos', 'ACTIVE', 2),
  tenant('ord-f', 'Orden Seis', 'ACTIVE', 6),
  tenant('ord-a', 'Orden Uno', 'ACTIVE', 1),
  tenant('ord-d2', 'Orden Cuatro', 'ACTIVE', 4),
  tenant('ord-c', 'Orden Tres', 'ACTIVE', 3),
];

test.describe('Centro de control — orden de «Últimas empresas» (F1-D7)', () => {
  test.beforeEach(setupWebApiMocks({ tenants: LATEST_SHUFFLED, onUnhandledApiRoute: '404' }));

  test('pide 5 y muestra las altas más recientes en el orden del servidor', async ({ page }) => {
    const latestRequest = page.waitForRequest(
      (req) => req.method() === 'GET' && /\/api\/v1\/tenants(\?|$)/.test(req.url()),
    );
    await loginToPulse(page);
    const params = new URL((await latestRequest).url()).searchParams;
    expect(params.get('limit')).toBe('5');

    const names = blocks(page).latest.locator('tbody').getByRole('link');
    await expect(names).toHaveText([
      'Orden Uno',
      'Orden Dos',
      'Orden Tres',
      'Orden Cuatro',
      'Orden Cinco',
    ]);
    await expect(blocks(page).latest).not.toContainText('Orden Seis');
    await expect(blocks(page).latest).not.toContainText('Orden Siete');
  });
});

test.describe('Centro de control — sesión expirada (F3-D6)', () => {
  test.beforeEach(
    setupWebApiMocks({ tenants: TENANTS, tenantSummary: SUMMARY, onUnhandledApiRoute: '404' }),
  );

  test('401 en la historia y renovación rechazada: vuelve al inicio de sesión con el motivo', async ({
    page,
  }) => {
    let historyRejected = false;
    await page.route('**/api/v1/platform/health/history**', async (route) => {
      historyRejected = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token expirado' }),
      });
    });
    // Solo se rechaza la renovación que sigue al 401: el ingreso previo no depende de ella.
    await page.route('**/api/v1/auth/refresh', async (route) => {
      if (!historyRejected) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Sesión expirada' }),
      });
    });

    await page.goto('/auth/login');
    await submitPlatformLogin(page);

    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fdashboard&reason=session-expired$/);
    expect(historyRejected).toBe(true);
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  });

  test('401 en la historia con renovación aceptada: reintenta y sigue en la portada', async ({
    page,
  }) => {
    let historyCalls = 0;
    await page.route('**/api/v1/platform/health/history**', async (route) => {
      historyCalls += 1;
      if (historyCalls > 1) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Token expirado' }),
      });
    });
    const refreshed = page.waitForResponse(
      (res) => res.url().endsWith('/api/v1/auth/refresh') && res.status() === 200,
    );

    await loginToPulse(page);
    await refreshed;

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      blocks(page).health.getByRole('img', {
        name: /Disponibilidad diaria de los últimos 30 días/,
      }),
    ).toBeVisible();
    // El primer pedido recibió 401; los siguientes (reintento tras renovar) respondieron.
    expect(historyCalls).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Centro de control — tendencia todo en 0 (regla AI-EM-ARCH)', () => {
  const ZERO_TENANTS = TENANTS.map((t) => ({ ...t, status: 'SUSPENDED' }));
  test.beforeEach(
    setupWebApiMocks({
      tenants: ZERO_TENANTS,
      tenantSummary: buildTenantSummaryMock(ZERO_TENANTS, {
        monthly: buildMonthlyMock(),
        byStatus: {
          ACTIVE: 0,
          PROVISIONING: 0,
          PROVISIONING_FAILED: 0,
          SUSPENDED: 7,
          INACTIVE: 0,
          MARKED_FOR_DELETION: 0,
        },
      }),
      onUnhandledApiRoute: '404',
    }),
  );

  test('activas al cierre y flujos en 0: un solo estado vacío, sin gráficas', async ({ page }) => {
    await loginToPulse(page);
    const { trend } = blocks(page);
    await expect(
      trend.getByText('Sin empresas activas, altas ni bajas en los últimos 12 meses'),
    ).toBeVisible();
    await expect(trend.locator('figure')).toHaveCount(0);
  });
});

/** Activas al cierre con dos meses sin historia reconstruible (null) y el resto conocido. */
const ACTIVE_WITH_GAPS: MonthlyMockValue[] = MONTHLY_VALUES.map(([created, removed], index) =>
  index === 2 || index === 3 ? [created, removed, null] : [created, removed],
);

test.describe('Centro de control — línea «Activas al cierre» (contrato v1.2)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: buildTenantSummaryMock(TENANTS, {
        ...SUMMARY,
        monthly: buildMonthlyMock(ACTIVE_WITH_GAPS),
      }),
      onUnhandledApiRoute: '404',
    }),
  );

  test('visible, mes en curso = empresas activas y «Sin dato» en los meses null', async ({
    page,
  }) => {
    await loginToPulse(page);
    const active = activeFigure(blocks(page).trend);
    await expect(
      active.getByRole('img', { name: /Empresas activas al cierre de cada mes/ }),
    ).toBeVisible();
    await expect(blocks(page).trend.getByText('Sin dato en algunos meses.')).toBeVisible();
    await active.getByRole('button', { name: 'Ver como tabla' }).click();
    const table = active.getByRole('table', { name: 'Empresas activas al cierre de cada mes' });
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(12);
    await expect(rows.nth(2).locator('td')).toHaveText('Sin dato');
    await expect(rows.nth(3).locator('td')).toHaveText('Sin dato');
    // Mes en curso = byStatus.ACTIVE del resumen (247).
    await expect(rows.last().locator('td')).toHaveText('247');
    await expect(rows.last().locator('th')).toContainText('(en curso)');
    const known = await rows.locator('td').allTextContents();
    expect(known.filter((text) => text === 'Sin dato')).toHaveLength(2);
  });
});

test.describe('Centro de control — selector de periodo (contrato v1.2)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      onUnhandledApiRoute: '404',
    }),
  );

  test('«24 meses» pide months=24, fija ?periodo=24m, pinta 24 puntos y sobrevive a la recarga', async ({
    page,
  }) => {
    await loginToPulse(page);
    const { trend } = blocks(page);
    const period = trend.getByRole('group', { name: 'Periodo' });
    await expect(period.getByRole('button', { name: '12 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const summary24 = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        new URL(req.url()).pathname.endsWith('/tenants/summary') &&
        new URL(req.url()).searchParams.get('months') === '24',
    );
    await period.getByRole('button', { name: '24 meses' }).click();
    await summary24;
    await expect(page).toHaveURL(/[?&]periodo=24m(&|$)/);
    await expect(period.getByRole('button', { name: '24 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(trend.getByText('Empresas por mes, últimos 24 meses')).toBeVisible();
    const flow = flowFigure(trend);
    await flow.getByRole('button', { name: 'Ver como tabla' }).click();
    await expect(flow.locator('tbody tr')).toHaveCount(24);

    const reloaded = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        new URL(req.url()).pathname.endsWith('/tenants/summary') &&
        new URL(req.url()).searchParams.get('months') === '24',
    );
    await page.reload();
    await reloaded;
    await expect(page).toHaveURL(/[?&]periodo=24m(&|$)/);
    await expect(
      blocks(page).trend.getByRole('group', { name: 'Periodo' }).getByRole('button', {
        name: '24 meses',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(blocks(page).trend.getByText('Empresas por mes, últimos 24 meses')).toBeVisible();
  });
});

/** Fallidos recientes menores que el total: el aviso cuenta 72 h y la tabla muestra el total. */
const HISTORY_RECENT = buildHealthHistoryMock({
  queues: [
    {
      name: 'crm-contract-pdf',
      waiting: 0,
      failed: 389,
      failedRecent: 12,
      oldestWaitingSeconds: null,
    },
  ],
});

/** Solo fallidos históricos: la cola no es novedad. */
const HISTORY_ONLY_OLD = buildHealthHistoryMock({
  queues: [
    {
      name: 'crm-contract-pdf',
      waiting: 0,
      failed: 389,
      failedRecent: 0,
      oldestWaitingSeconds: null,
    },
  ],
});

test.describe('Centro de control — fallidos en 72 h menores que el total (§8.0)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: HISTORY_RECENT,
      onUnhandledApiRoute: '404',
    }),
  );

  test('el aviso dice 12 en 72 h y la fila muestra «389 en total»', async ({ page }) => {
    await loginToPulse(page);
    await expect(
      page.getByRole('link', {
        name: /12 trabajos fallidos en 72 h\. Colas de trabajo · 1 cola/,
      }),
    ).toHaveAttribute('href', '#colas-de-trabajo');
    await expect(page.getByRole('link', { name: /389 trabajos fallidos/ })).toHaveCount(0);
    const area = page.getByRole('region', { name: 'Colas de trabajo' });
    const row = area
      .getByRole('table', { name: 'Colas de trabajo' })
      .getByRole('row', { name: /Documentos de contrato/ });
    await expect(row.getByRole('cell').nth(1)).toHaveText(/^12389 en total$/);
    await expect(row.getByText('389 en total', { exact: true })).toBeVisible();
    await expect(area.getByText('Con fallos', { exact: true })).toBeVisible();
  });
});

test.describe('Centro de control — solo fallidos históricos (§8.0)', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: TENANTS,
      tenantSummary: SUMMARY,
      healthHistory: HISTORY_ONLY_OLD,
      onUnhandledApiRoute: '404',
    }),
  );

  test('failedRecent 0 con failed > 0: «Sin novedad» y sin fila de atención', async ({ page }) => {
    await loginToPulse(page);
    const area = page.getByRole('region', { name: 'Colas de trabajo' });
    await expect(area.getByText('Sin novedad en la única cola.', { exact: true })).toBeVisible();
    await expect(area.getByText('Con fallos', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /trabajos? fallidos?/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Colas de trabajo ·/ })).toHaveCount(0);
  });
});
