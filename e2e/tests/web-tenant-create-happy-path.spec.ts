import { randomUUID } from 'node:crypto';
import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { loginAsPlatformAdmin } from './helpers/web-api-mocks';
import { platformAccessToken } from '../../scripts/lib/platform-session.mjs';

const platformEmail = process.env['E2E_PLATFORM_EMAIL'];
const platformPassword = process.env['E2E_PLATFORM_PASSWORD'];
const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3000';
const API_PREFIX = '/api/v1';

// Prefijo de prueba (patrón `srqa-<área>-<RUN_ID>` de las E2E reales): el barrido de
// limpieza solo toca slugs con esta forma exacta.
const SLUG_PREFIX = 'srqa-web-alta-';
const SLUG_PATTERN = /^srqa-web-alta-[a-f0-9]{12}$/u;
const RUN_ID = randomUUID().replace(/-/gu, '').slice(0, 12);
/** El barrido previo no toca altas recientes: pueden ser de otra corrida en curso. */
const STALE_AFTER_MS = 30 * 60_000;

// Cómo correrla: API levantado con DB_NAME=test y
// `E2E_ALLOW_REAL_TENANT_CREATE=1 pnpm exec playwright test -c e2e/playwright.web.config.ts --workers=1 e2e/tests/web-tenant-create-happy-path.spec.ts`.
const allowRealTenantCreate = process.env['E2E_ALLOW_REAL_TENANT_CREATE'] === '1';

test.skip(
  !allowRealTenantCreate,
  'Crea una empresa real que R7 no puede purgar antes de 30 días: solo con E2E_ALLOW_REAL_TENANT_CREATE=1 y un API con DB_NAME=test.',
);

test.skip(
  !platformEmail || !platformPassword,
  'Configura E2E_PLATFORM_EMAIL y E2E_PLATFORM_PASSWORD para ejecutar contra infraestructura real.',
);

// El diálogo final muestra una contraseña temporal real: sin traza, captura ni video.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

let api: APIRequestContext | undefined;
let platformToken: string | undefined;

/**
 * Marca para eliminación (DELETE lógico) las empresas de prueba; R7 purga el esquema.
 * `olderThanMs` deja fuera las creadas hace menos de ese tiempo.
 */
async function cleanupTestTenants(olderThanMs = 0): Promise<void> {
  if (!api || !platformToken) return;
  const headers = { Authorization: `Bearer ${platformToken}` };
  const listed = await api.get(`${API_PREFIX}/tenants?search=${SLUG_PREFIX}&limit=100&offset=0`, {
    headers,
  });
  expect(listed.status()).toBe(200);
  const { data } = (await listed.json()) as {
    data: Array<{ id: string; slug: string; status: string; createdAt: string }>;
  };
  const cutoff = Date.now() - olderThanMs;
  for (const tenant of data.filter((candidate) => SLUG_PATTERN.test(candidate.slug))) {
    if (tenant.status === 'MARKED_FOR_DELETION') continue;
    if (Date.parse(tenant.createdAt) > cutoff) continue;
    const deleted = await api.delete(`${API_PREFIX}/tenants/${tenant.id}`, { headers });
    expect(deleted.status()).toBe(204);
  }
}

test.describe('Web tenant create happy path real', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    api = await request.newContext({ baseURL: API_BASE_URL });
    platformToken = await platformAccessToken({
      apiUrl: `${API_BASE_URL}${API_PREFIX}`,
      email: platformEmail!,
      password: platformPassword!,
    });
    // Restos de corridas abortadas antes de su afterAll.
    await cleanupTestTenants(STALE_AFTER_MS);
  });

  test.afterAll(async () => {
    try {
      await cleanupTestTenants();
    } finally {
      await api?.dispose();
    }
  });

  test('SYSTEM_ADMIN crea empresa, espera provisioning y emite la credencial del administrador', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const tenantName = `Empresa E2E ${RUN_ID}`;
    const tenantSlug = `${SLUG_PREFIX}${RUN_ID}`;
    // Correo propio por corrida: desde 48e2a7be el ADMIN ya no es una cuenta compartida.
    const adminEmail = `srqa-web-alta-admin-${RUN_ID}@example.invalid`;

    await loginAsPlatformAdmin(page, {
      email: platformEmail!,
      password: platformPassword!,
    });

    await page.getByRole('link', { name: 'Empresas', exact: true }).click();
    await page.getByRole('link', { name: 'Nueva empresa' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva empresa' })).toBeVisible();

    await page.getByLabel('Nombre comercial').fill(tenantName);
    await page.getByLabel('Identificador (slug)').fill(tenantSlug);
    await page.getByLabel('Email de contacto').fill(`srqa-web-alta-${RUN_ID}@example.invalid`);
    await page.getByLabel('Email del administrador').fill(adminEmail);

    await page.getByRole('button', { name: 'Crear empresa' }).click();

    await expect(page.getByText(new RegExp(`${tenantName}.*activa y lista`, 'i'))).toBeVisible({
      timeout: 120_000,
    });

    // «Ver acceso inicial» desapareció con su endpoint (48e2a7be): la credencial se emite.
    await expect(page.getByRole('button', { name: 'Ver acceso inicial' })).toHaveCount(0);

    // Playwright escribe `error-context.md` (instantánea ARIA) al fallar aunque captura, traza
    // y video estén apagados: salir de la página en `finally` evita que guarde la contraseña.
    try {
      await page.getByRole('button', { name: 'Emitir credenciales de acceso' }).click();
      const credentialsDialog = page.getByRole('dialog', {
        name: 'Acceso del administrador inicial',
      });

      await expect(credentialsDialog).toBeVisible();
      // El ADMIN es el correo escrito en el alta, nunca la cuenta compartida retirada.
      await expect(credentialsDialog.getByText(adminEmail)).toBeVisible();
      // Conteo y no `toContainText`: un fallo no imprime el texto del diálogo.
      await expect(credentialsDialog.getByText('admin@iwana.co')).toHaveCount(0);
      await expect(credentialsDialog.getByText('Contraseña temporal:')).toBeVisible();
    } finally {
      await page.goto('about:blank');
    }
  });
});
