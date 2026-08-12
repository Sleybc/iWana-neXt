/**
 * D-4…D-6 — directorio Empresas (`/tenants`).
 * Selectores por rol/nombre. Capturas sin PII.
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupWebApiMocks, submitPlatformLogin } from './helpers/web-api-mocks';

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-web-empresas-directorio');

const DIRECTORY_CHIPS = ['Activas', 'En configuración', 'Requieren atención'] as const;

const DIRECTORIO_TENANTS = [
  {
    id: 'tenant-1',
    name: 'Demo ISP',
    slug: 'demo-isp',
    schemaName: 'tenant_demo_isp',
    status: 'ACTIVE',
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
  {
    id: 'tenant-3',
    name: 'Alta Andina',
    slug: 'alta-andina',
    schemaName: 'tenant_alta_andina',
    status: 'PROVISIONING',
    contactEmail: 'hash:contact-3',
    maxSubscribers: 800,
    settings: {},
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-13T08:00:00.000Z',
  },
];

async function loginToControlCenter(page: Page) {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await submitPlatformLogin(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
}

async function openEmpresasDirectory(page: Page) {
  await loginToControlCenter(page);
  await page.getByRole('link', { name: 'Ver empresas en configuración' }).click();
  await expect(page).toHaveURL(/\/tenants\?status=PROVISIONING/);
  await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible();
  await expect(page.getByText('Cargando el directorio')).toHaveCount(0);
}

async function measureBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'boundingBox disponible').toBeTruthy();
  return box!;
}

test.describe('Web Empresas — directorio', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: DIRECTORIO_TENANTS,
      onUnhandledApiRoute: '404',
    }),
  );

  test('D-4: centro → En configuración → heading, filtro y búsqueda', async ({ page }) => {
    await openEmpresasDirectory(page);

    await expect(page.getByLabel('Filtrar por estado')).toHaveText(/En configuración/);
    await expect(
      page
        .getByRole('region', { name: 'Directorio' })
        .getByText('En configuración', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Configurando', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Configuración fallida')).toHaveCount(0);
    await expect(page.getByText('En puesta en marcha')).toHaveCount(0);

    await page.getByRole('button', { name: 'Limpiar filtro' }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar empresa' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar empresa' }).fill('Fibernet');

    await expect(page.getByRole('cell', { name: /Fibernet Colombia/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Demo ISP/ })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: /Alta Andina/ })).toHaveCount(0);
  });

  test('D-5: 375 H1 + chips + tabla en una columna, sin H2', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginToControlCenter(page);
    await page.goto('/tenants');
    await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Fibernet Colombia/ })).toBeVisible();

    const heading = page.getByRole('heading', { name: 'Empresas', exact: true });
    const chips = page.getByRole('region', { name: 'Directorio' });
    const table = page.getByRole('table', { name: 'Lista de empresas' });

    await expect(heading).toBeVisible();
    await expect(chips).toBeVisible();
    await expect(table).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);

    const headingBox = await measureBox(heading);
    const chipsBox = await measureBox(chips);
    const tableBox = await measureBox(table);

    expect(chipsBox.y, 'chips debajo del H1').toBeGreaterThan(headingBox.y);
    expect(tableBox.y, 'tabla debajo de chips').toBeGreaterThan(chipsBox.y + chipsBox.height - 8);
    expect(Math.abs(chipsBox.x - tableBox.x), 'una columna chips/tabla').toBeLessThan(24);

    const chipBoxes = [];
    for (const label of DIRECTORY_CHIPS) {
      chipBoxes.push(await measureBox(chips.getByText(label, { exact: true })));
    }
    for (let index = 1; index < chipBoxes.length; index += 1) {
      expect(chipBoxes[index].y, `chip ${index} debajo en 375`).toBeGreaterThan(
        chipBoxes[index - 1].y,
      );
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375.png'),
      fullPage: true,
    });
  });

  test('D-5: 1280 chips en fila', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginToControlCenter(page);
    await page.goto('/tenants');
    await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Fibernet Colombia/ })).toBeVisible();

    const chips = page.getByRole('region', { name: 'Directorio' });
    await expect(chips).toBeVisible();

    const chipBoxes = [];
    for (const label of DIRECTORY_CHIPS) {
      chipBoxes.push(await measureBox(chips.getByText(label, { exact: true })));
    }
    const chipYs = chipBoxes.map((box) => box.y);
    const chipRowSpread = Math.max(...chipYs) - Math.min(...chipYs);
    expect(chipRowSpread, 'chips en una fila').toBeLessThan(24);
    for (let index = 1; index < chipBoxes.length; index += 1) {
      expect(chipBoxes[index].x, `chip ${index} a la derecha`).toBeGreaterThan(
        chipBoxes[index - 1].x,
      );
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1280.png'),
      fullPage: true,
    });
  });

  test('D-6: axe wcag2a+wcag2aa en /tenants y aria-sort en th', async ({ page }) => {
    await loginToControlCenter(page);
    await page.goto('/tenants');
    await expect(page.getByRole('heading', { name: 'Empresas', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Fibernet Colombia/ })).toBeVisible();

    const sortedHeaders = page.locator('th[aria-sort]');
    await expect(sortedHeaders).not.toHaveCount(0);
    await expect(page.locator('th[aria-sort]:not([aria-sort="none"])')).toHaveCount(1);

    const tenantsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(tenantsA11y.violations).toEqual([]);
  });
});
