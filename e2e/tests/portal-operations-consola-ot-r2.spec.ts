import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { seedSession, setupMocks } from './helpers/consola-ot-fixtures';

// R2 (Ola 2b) — evidencia y firma de la consola de OT en el navegador.
//
// QUÉ ES REAL: el portal del dev server en 127.0.0.1:3002, un Chromium auténtico
// (el lienzo, `toBlob` y los eventos de puntero son los del navegador) y el PNG
// que produce el lienzo, que se inspecciona byte a byte.
// QUÉ ESTÁ SIMULADO: el backend (`page.route`): la carga, el sondeo del análisis
// y el registro. Esto NO mide la latencia real del análisis (BullMQ): la
// condición del plan sobre el p95 se mide por otra vía y se declara aparte.
//
// R2_SCREENSHOT_DIR (opcional) guarda capturas; sin ella no se escribe nada.

const SHOT_DIR = process.env.R2_SCREENSHOT_DIR;
const EXPIRES_AT = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Backend {
  uploads: Buffer[];
  polls: number;
  registers: Array<Record<string, unknown>>;
}

/** Simula carga, sondeo y registro; `pendingPolls` lecturas devuelven PENDING_ANALYSIS. */
async function mockEvidenceBackend(
  page: Page,
  options: { pendingPolls: number; pollDelayMs?: number; resumeAfterTimeout?: boolean },
): Promise<Backend> {
  const backend: Backend = { uploads: [], polls: 0, registers: [] };
  const receipt = (status: string) => ({
    intentId: 'intent-r2',
    mediaAssetId: 'asset-r2',
    status,
    expiresAt: EXPIRES_AT,
  });
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    /\/tasks\/execution-orders\/[^/]+\/evidence-assets(\/[^/?]+)?(\?.*)?$/,
    async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        backend.uploads.push(request.postDataBuffer() ?? Buffer.alloc(0));
        return json(route, receipt('PENDING_ANALYSIS'), 202);
      }
      backend.polls += 1;
      if (options.pollDelayMs)
        await new Promise((resolve) => setTimeout(resolve, options.pollDelayMs));
      return json(
        route,
        receipt(backend.polls <= options.pendingPolls ? 'PENDING_ANALYSIS' : 'AVAILABLE'),
      );
    },
  );
  await page.route(/\/tasks\/execution-orders\/[^/]+\/evidence(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    backend.registers.push(request.postDataJSON() as Record<string, unknown>);
    return json(route, { id: 'ev-r2', mediaAssetId: 'asset-r2', status: 'AVAILABLE' }, 201);
  });
  return backend;
}

async function openConsole(page: Page) {
  await setupMocks(page);
  await seedSession(page);
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, name) });
}

async function sign(page: Page) {
  const surface = page.getByRole('img', { name: 'Área de firma' });
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
}

const SIGNATURE_TRIGGER = /^Capturar firma del cliente para /;

test.describe('R2 evidencia y firma (backend simulado, navegador real)', () => {
  test('firma: lienzo, análisis y registro SIGNATURE con la clave del requisito', async ({
    page,
  }) => {
    await openConsole(page);
    const backend = await mockEvidenceBackend(page, { pendingPolls: 2, pollDelayMs: 600 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');
    const trigger = drawer.getByRole('button', { name: SIGNATURE_TRIGGER });

    await trigger.click();
    await expect(
      drawer.getByRole('heading', { level: 4, name: 'Capturar firma del cliente' }),
    ).toBeFocused();
    await expect(
      drawer.getByText(/Pide al cliente que firme el acta de conformidad/),
    ).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Limpiar' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Guardar firma' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Cancelar' })).toHaveCount(1);
    await expect(drawer.locator('input[type="file"]')).toHaveCount(0);

    // Sin trazo no hay firma: ni nombre escrito ni envío.
    await drawer.getByRole('button', { name: 'Guardar firma' }).click();
    await expect(
      drawer.getByRole('alert').filter({ hasText: 'Dibuja la firma antes de guardarla.' }),
    ).toBeVisible();
    expect(backend.uploads).toHaveLength(0);

    await sign(page);
    await expect(drawer.getByText('Firma dibujada. Puedes guardarla o limpiarla.')).toBeVisible();
    await shot(page, 'r2-navegador-firma-trazo.png');

    await drawer.getByRole('button', { name: 'Guardar firma' }).click();
    await expect(drawer.getByText('Analizando archivo')).toBeVisible();
    await shot(page, 'r2-navegador-firma-analizando.png');

    await expect(drawer.getByRole('img', { name: 'Área de firma' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(drawer.getByText('Firma guardada')).toBeVisible();
    await shot(page, 'r2-navegador-firma-guardada.png');

    // Un solo envío; el PNG es un PNG real del lienzo.
    expect(backend.uploads).toHaveLength(1);
    const body = backend.uploads[0]!;
    const text = body.toString('latin1');
    expect(text).toContain('filename="firma-cliente.png"');
    expect(text).toContain('Content-Type: image/png');
    const pngStart = body.indexOf(PNG_MAGIC);
    expect(pngStart).toBeGreaterThan(0);
    expect(body.readUInt32BE(pngStart + 16)).toBe(800);
    expect(body.readUInt32BE(pngStart + 20)).toBe(320);

    expect(backend.polls).toBe(3);
    expect(backend.registers).toEqual([
      {
        mediaAssetId: 'asset-r2',
        evidenceType: 'SIGNATURE',
        requirementKey: 'CUSTOMER_SIGNATURE',
        expiresAt: EXPIRES_AT,
      },
    ]);
  });

  test('firma: teclado y foco de Limpiar, Guardar firma y Cancelar', async ({ page }) => {
    await openConsole(page);
    const backend = await mockEvidenceBackend(page, { pendingPolls: 0 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');
    const trigger = drawer.getByRole('button', { name: SIGNATURE_TRIGGER });
    await trigger.click();
    await sign(page);

    await drawer.getByRole('heading', { level: 4 }).focus();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: 'Limpiar' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: 'Guardar firma' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: 'Cancelar' })).toBeFocused();

    // Limpiar con el teclado deja el lienzo vacío y lo anuncia.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('button', { name: 'Limpiar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(drawer.getByText('Firma limpiada. Puedes volver a firmar.')).toBeVisible();

    // Cancelar con Escape cierra la hoja sin cerrar el drawer y devuelve el foco.
    await drawer.getByRole('button', { name: 'Cancelar' }).focus();
    await page.keyboard.press('Escape');
    await expect(drawer.getByRole('img', { name: 'Área de firma' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(drawer).toBeVisible();
    expect(backend.uploads).toHaveLength(0);
  });

  test('firma: si el análisis no termina conserva el trazo y reanuda el mismo asset sin subir de nuevo', async ({
    page,
  }) => {
    await openConsole(page);
    // El primer intento agota las 6 lecturas; la lectura siguiente ya es AVAILABLE.
    const backend = await mockEvidenceBackend(page, { pendingPolls: 6 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: SIGNATURE_TRIGGER }).click();
    await sign(page);

    await drawer.getByRole('button', { name: 'Guardar firma' }).click();
    await expect(
      drawer.getByText(/La firma sigue en revisión y aún no se guardó/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, 'r2-navegador-firma-en-revision.png');
    expect(backend.registers).toHaveLength(0);
    await expect(drawer.getByRole('img', { name: 'Área de firma' })).toBeVisible();

    await expect(drawer.getByRole('button', { name: 'Guardar firma' })).toBeEnabled();
    await drawer.getByRole('button', { name: 'Guardar firma' }).click();
    await expect(drawer.getByRole('img', { name: 'Área de firma' })).toHaveCount(0);

    expect(backend.uploads).toHaveLength(1);
    expect(backend.registers).toHaveLength(1);
    expect(backend.registers[0]).toMatchObject({
      mediaAssetId: 'asset-r2',
      evidenceType: 'SIGNATURE',
      requirementKey: 'CUSTOMER_SIGNATURE',
    });
  });

  test('foto: publica la clave y el tipo del requisito y no ofrece arrastre', async ({ page }) => {
    await openConsole(page);
    const backend = await mockEvidenceBackend(page, { pendingPolls: 1 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');

    await drawer.getByRole('button', { name: /^Añadir fotos del trabajo para / }).click();
    await expect(drawer.getByText('Selecciona una foto.')).toBeVisible();
    await expect(drawer.getByText(/arrastra/i)).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Seleccionar foto' })).toBeVisible();
    await expect(drawer.locator('canvas')).toHaveCount(0);

    await drawer.getByLabel('Archivo de evidencia').setInputFiles({
      name: 'trabajo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
    });
    await expect.poll(() => backend.registers.length, { timeout: 15_000 }).toBe(1);
    expect(backend.registers[0]).toMatchObject({
      mediaAssetId: 'asset-r2',
      evidenceType: 'PHOTO',
      requirementKey: 'work-photo',
    });
  });
});

test.describe('R2 firma en móvil y tema oscuro (backend simulado, navegador real)', () => {
  test.use({ colorScheme: 'dark' });

  test('firma: sin desborde horizontal, objetivos de 44 px y trazo visible sobre el lienzo claro', async ({
    page,
  }) => {
    await setupMocks(page);
    await seedSession(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await mockEvidenceBackend(page, { pendingPolls: 0 });
    await page.goto('/dashboard/operations/execution-orders?executionOrderId=eo-audit');
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: SIGNATURE_TRIGGER }).click();
    const surface = drawer.getByRole('img', { name: 'Área de firma' });
    await surface.scrollIntoViewIfNeeded();
    await sign(page);

    const box = (await surface.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.width / box.height).toBeCloseTo(2.5, 1);
    for (const name of ['Limpiar', 'Guardar firma', 'Cancelar']) {
      const button = await drawer.getByRole('button', { name }).boundingBox();
      expect(button!.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // El lienzo es blanco aunque el tema sea oscuro: el trazo oscuro se distingue en ambos.
    const pixels = await surface.evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink += 1;
      return { ink, background: getComputedStyle(canvas).backgroundColor };
    });
    expect(pixels.ink).toBeGreaterThan(200);
    expect(pixels.background).toBe('rgb(255, 255, 255)');
    await shot(page, 'r2-navegador-firma-movil-oscuro.png');
  });
});
