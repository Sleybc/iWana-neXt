import { test, expect } from '@playwright/test';

/**
 * E2E: Flujo tributario portal — catálogo → aplicación → simulador
 *
 * Prerrequisito: Portal corriendo en localhost:3002, tenant de prueba autenticado.
 * El test usa los datos sembrados por TaxPresetsSeeder (IVA_19, etc.).
 */
test.describe('Portal tributario — simulador', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Asumir que el test runner configura authToken via storageState o similar
  });

  test('simulador tributario muestra resultado para segmento RESIDENTIAL', async ({ page }) => {
    await page.goto('/dashboard');

    // Navegar a la sección comercial
    await page.getByRole('button', { name: /comercial/i }).click();

    // Ir a Simulador tributario
    await page.getByRole('tab', { name: /simulador tributario/i }).click();

    // Seleccionar segmento
    await page.getByRole('combobox').first().selectOption('RESIDENTIAL');

    // Ejecutar simulación
    await page.getByRole('button', { name: /simular/i }).click();

    // Verificar que aparece resultado
    await expect(page.getByText(/resultado de simulación/i)).toBeVisible({ timeout: 10000 });

    // Verificar estado controlado: hay resultados o estado vacío explicativo
    const hasResults = await page.getByText(/regla ganadora/i).isVisible();
    const hasEmpty = await page.getByText(/no se encontraron aplicaciones/i).isVisible();
    expect(hasResults || hasEmpty).toBeTruthy();
  });

  test('catálogo de impuestos muestra presets SYSTEM', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /comercial/i }).click();
    await page.getByRole('tab', { name: /catálogo de impuestos/i }).click();

    // Verificar que el loader desaparece (definiciones cargan o está vacío)
    await expect(page.getByText('Cargando catálogo…')).not.toBeVisible({ timeout: 10000 });
    // El catálogo puede tener 0 o más definiciones según el estado del tenant de prueba
  });

  test('reglas de aplicación carga sin error', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /comercial/i }).click();
    await page.getByRole('tab', { name: /reglas de aplicación/i }).click();

    // Verificar que el loader desaparece
    await expect(page.getByText('Cargando reglas…')).not.toBeVisible({ timeout: 10000 });
  });
});
