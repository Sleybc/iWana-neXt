import { expect, test } from '@playwright/test';
import { seedSession, setupMocks } from './helpers/consola-ot-fixtures';

test.describe('B0 expediente por momento (HTTP simulado)', () => {
  test('preinicio: requisitos de lectura, sin captura ni custodia montadas', async ({ page }) => {
    await setupMocks(page);
    await seedSession(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-b0-prestart');
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('region', { name: 'Requisitos', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Iniciar ejecución' })).toBeVisible();
    await expect(drawer.locator('form,input[type="file"]')).toHaveCount(0);
    await expect(drawer.getByText('En custodia del ejecutor')).toHaveCount(0);
  });
  test('progreso: índice, acto de actividad inline y Escape devuelve foco', async ({ page }) => {
    await setupMocks(page);
    await seedSession(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');
    const trigger = drawer.getByRole('button', { name: /^Registrar actividad para / });
    await expect(trigger).toBeVisible();
    await expect(drawer.getByText('No puedes iniciar esta orden')).toHaveCount(0);
    await expect(drawer.getByLabel('Descripción de la actividad')).toHaveCount(0);
    await trigger.click();
    await expect(drawer.getByLabel('Descripción de la actividad')).toBeVisible();
    await expect(drawer.getByLabel('Tipo de actividad')).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await drawer.getByLabel('Descripción de la actividad').press('Escape');
    await expect(drawer.getByLabel('Descripción de la actividad')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(drawer).toBeVisible();
  });
});
