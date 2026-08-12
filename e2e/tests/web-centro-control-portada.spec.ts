/**
 * D-7 — layout real de la portada de señal (CA-PS-09).
 * Mide cajas (y/top), no clases Tailwind. Capturas sin PII.
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { setupWebApiMocks, submitPlatformLogin } from './helpers/web-api-mocks';

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-web-centro-control-portada');

const SIGNAL_CHIP_LABELS = [
  'Activas',
  'En configuración',
  'Requieren atención',
  'Cambios esta semana',
] as const;

async function loginToPortada(page: Page) {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await submitPlatformLogin(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen operativo' })).toBeVisible();
  await expect(page.getByText('Cargando el centro de control')).toHaveCount(0);
}

async function measureBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'boundingBox disponible').toBeTruthy();
  return box!;
}

function portadaRegions(page: Page) {
  return {
    signal: page.getByRole('region', { name: 'Resumen operativo' }),
    monitoring: page.getByTestId('control-center-monitoring'),
    distribution: page.getByTestId('control-center-distribution'),
    activity: page.getByRole('region', { name: 'Actividad reciente' }),
  };
}

test.describe('Web centro de control — portada de señal', () => {
  test.beforeEach(
    setupWebApiMocks({
      tenants: [
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
      ],
      onUnhandledApiRoute: '404',
    }),
  );

  test('CA-PS-09: 375 una columna S → Monitoreo → D → A', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginToPortada(page);

    const { signal, monitoring, distribution, activity } = portadaRegions(page);
    await expect(page.getByText('Monitoreo')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Empresas por estado' })).toBeVisible();
    await expect(activity).toBeVisible();

    const signalBox = await measureBox(signal);
    const monitoringBox = await measureBox(monitoring);
    const distributionBox = await measureBox(distribution);
    const activityBox = await measureBox(activity);

    expect(monitoringBox.y, 'Monitoreo debajo de chips').toBeGreaterThanOrEqual(signalBox.y);
    expect(distributionBox.y, 'D debajo de Monitoreo').toBeGreaterThanOrEqual(
      monitoringBox.y + monitoringBox.height - 8,
    );
    expect(activityBox.y, 'Actividad debajo de D').toBeGreaterThanOrEqual(
      distributionBox.y + distributionBox.height - 8,
    );

    expect(Math.abs(monitoringBox.x - distributionBox.x), 'una columna M/D').toBeLessThan(24);
    expect(distributionBox.x, 'D no al lado de M').toBeLessThan(monitoringBox.x + 48);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375.png'),
      fullPage: true,
    });
  });

  test('CA-PS-09: 1280 chips en fila, M|D lado a lado, A a ancho completo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginToPortada(page);

    const { signal, monitoring, distribution, activity } = portadaRegions(page);
    await expect(page.getByText('Monitoreo')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Empresas por estado' })).toBeVisible();
    await expect(activity).toBeVisible();

    const chipBoxes = [];
    for (const label of SIGNAL_CHIP_LABELS) {
      chipBoxes.push(await measureBox(signal.getByText(label, { exact: true })));
    }
    const chipYs = chipBoxes.map((box) => box.y);
    const chipRowSpread = Math.max(...chipYs) - Math.min(...chipYs);
    expect(chipRowSpread, 'chips en una fila').toBeLessThan(24);
    for (let index = 1; index < chipBoxes.length; index += 1) {
      expect(chipBoxes[index].x, `chip ${index} a la derecha`).toBeGreaterThan(
        chipBoxes[index - 1].x,
      );
    }

    const monitoringBox = await measureBox(monitoring);
    const distributionBox = await measureBox(distribution);
    const activityBox = await measureBox(activity);

    expect(Math.abs(monitoringBox.y - distributionBox.y), 'M y D en la misma fila').toBeLessThan(
      24,
    );
    expect(distributionBox.x, 'D a la derecha de M').toBeGreaterThan(
      monitoringBox.x + monitoringBox.width * 0.5,
    );

    expect(activityBox.y, 'A debajo del split').toBeGreaterThan(
      Math.max(monitoringBox.y, distributionBox.y),
    );
    expect(activityBox.width, 'A a ancho completo').toBeGreaterThan(monitoringBox.width + 80);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1280.png'),
      fullPage: true,
    });
  });
});
