/**
 * D-4…D-6 — Historial de cambios (`/audit-logs`).
 * Selectores por rol/nombre. Capturas sin PII.
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAsPlatformAdmin, setupWebApiMocks } from './helpers/web-api-mocks';

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/quality/evidence-web-audit-logs');

async function openHistorialViaSidebar(page: Page) {
  await loginAsPlatformAdmin(page);
  await page.getByRole('link', { name: 'Historial de cambios' }).click();
  await expect(page).toHaveURL(/\/audit-logs/);
  await expect(
    page.getByRole('heading', { name: 'Historial de cambios', exact: true }),
  ).toBeVisible();
}

test.describe('Web Historial — audit-logs alineación', () => {
  test.beforeEach(
    setupWebApiMocks({
      onUnhandledApiRoute: '404',
    }),
  );

  test('D-4: sidebar → H1, tabs, chrome Lectura/Descargar, picker empresa', async ({ page }) => {
    await openHistorialViaSidebar(page);

    await expect(page.getByRole('tab', { name: 'Cambios de plataforma' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cambios por empresa' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Lectura', pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Detalle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver detalle' })).toBeVisible();

    await expect(page.getByText('Técnico', { exact: true })).toHaveCount(0);
    await expect(page.getByText('CSV', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Exportar CSV')).toHaveCount(0);
    await expect(page.getByText('Básico', { exact: true })).toHaveCount(0);

    await expect(page.getByText('Administrador plataforma', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Cambios por empresa' }).click();
    await expect(page.getByRole('button', { name: 'Seleccionar empresa' })).toBeVisible();
    await expect(page.getByText('Operador demo', { exact: true })).toBeVisible();
  });

  test('D-5: 375 H1 + tabs + resumen + tabla', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsPlatformAdmin(page);
    await page.goto('/audit-logs');
    await expect(
      page.getByRole('heading', { name: 'Historial de cambios', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Administrador plataforma', { exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'Cambios de plataforma' })).toBeVisible();
    await expect(page.getByText('Cambios críticos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Últimas 24 h' })).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '375.png'),
      fullPage: true,
    });
  });

  test('D-5: 1280 chrome Lectura y señales en fila', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsPlatformAdmin(page);
    await page.goto('/audit-logs');
    await expect(
      page.getByRole('heading', { name: 'Historial de cambios', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Administrador plataforma', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Lectura', pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();
    await expect(page.getByText('Empresas con cambios')).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, '1280.png'),
      fullPage: true,
    });
  });

  test('D-6: axe wcag2a+wcag2aa en /audit-logs y cero tr[role=button]', async ({ page }) => {
    await loginAsPlatformAdmin(page);
    await page.goto('/audit-logs');
    await expect(
      page.getByRole('heading', { name: 'Historial de cambios', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Administrador plataforma', { exact: true })).toBeVisible();

    await expect(page.locator('tr[role="button"]')).toHaveCount(0);

    const auditA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(auditA11y.violations).toEqual([]);
  });

  test('FR smoke: chip lote del resumen + Quitar filtro (CA-FR-12/13)', async ({ page }) => {
    await loginAsPlatformAdmin(page);
    await page.goto('/audit-logs');
    await expect(
      page.getByRole('heading', { name: 'Historial de cambios', exact: true }),
    ).toBeVisible();

    // Mock platform audit está a −2d → fuera de 24 h; 7d habilita CTA de seguridad.
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    await page.getByRole('button', { name: 'Ver seguridad' }).click();

    await expect(page.getByText(/Mostrando: Acceso y seguridad · lote del resumen/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quitar filtro' })).toBeVisible();
    // Pager oculto con preset (DS v1.2)
    await expect(page.getByRole('button', { name: /Anterior/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Siguiente/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Quitar filtro' }).click();
    await expect(page.getByText(/Mostrando: Acceso y seguridad · lote del resumen/)).toHaveCount(0);
  });
});
