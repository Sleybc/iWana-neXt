/**
 * E2E de navegador — MOD11 Consola de OT · Ola 1 · Regresión C5 (AI-SR-QA).
 *
 * Cubre la evidencia en navegador exigida por el stop/go sobre la OT de la
 * auditoría `OTE-20260828-001`: checklist con estado real (instalación
 * cumplida + 2 pendientes con razón) y sin la alerta falsa
 * "No puedes iniciar esta orden" en `IN_PROGRESS`.
 *
 * HTTP mockeado (sin backend): resuelve la limitación L1 de fe-platform
 * (sin sesión tenant en su superficie) con datos equivalentes al seed 118 +
 * `requirements[]` realista. Sin PII real.
 *
 * Casos del prompt §3 que fija en navegador: 7 (sin alerta en IN_PROGRESS),
 * 4/5 (checklist con estado real), 9 (degradación visible sin requirements[]).
 */

import { expect, test } from '@playwright/test';

import { setupMocks, seedSession } from './helpers/consola-ot-fixtures';

test.describe('Consola OT OLA1 — evidencia en navegador OTE-20260828-001', () => {
  test('IN_PROGRESS: checklist con estado real y sin alerta falsa (+ captura)', async ({
    page,
  }) => {
    await setupMocks(page);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');

    // El drawer abre sobre la OT de la auditoría.
    await expect(page.getByRole('heading', { name: 'OTE-20260828-001' })).toBeVisible();

    // Checklist con estado real: instalación cumplida + 2 pendientes con razón.
    const checklist = page.getByRole('region', { name: 'Requisitos' });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Cumplido', { exact: true })).toBeVisible();
    await expect(checklist.getByText('Evidencia fotográfica', { exact: true })).toBeVisible();
    await expect(checklist.getByText('Firma del cliente', { exact: true })).toBeVisible();
    await expect(
      checklist.getByText('Adjunta la evidencia fotográfica antes de cerrar la orden.'),
    ).toBeVisible();
    await expect(
      checklist.getByText('Adjunta la firma del cliente antes de cerrar la orden.'),
    ).toBeVisible();

    // Caso 7 (CA-03): la alerta falsa no se renderiza en IN_PROGRESS.
    await expect(page.getByText('No puedes iniciar esta orden')).toHaveCount(0);

    // Evidencia en navegador (stop/go C5): captura del drawer con el checklist.
    await checklist.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/quality/evidencia-OTE-20260828-001.png',
    });
  });

  test('sin requirements[]: degradación visible, nunca bloque vacío', async ({ page }) => {
    await setupMocks(page);
    await seedSession(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      '/dashboard/operations/execution-orders?executionOrderId=eo-audit-sin-requisitos',
    );

    await expect(page.getByRole('heading', { name: 'OTE-20260828-001' })).toBeVisible();

    const checklist = page.getByRole('region', { name: 'Requisitos' });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Estado de requisitos no disponible')).toBeVisible();
    await expect(checklist.getByText('Actividad de instalación')).toBeVisible();
    await expect(page.getByText('No puedes iniciar esta orden')).toHaveCount(0);
  });
});
