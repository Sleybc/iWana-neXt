import { expect, test, type Page } from '@playwright/test';

const BRANDING_FIXTURE = {
  displayName: 'ISP Demo',
  showTenantName: true,
  logoLightUrl: 'https://cdn.demo.co/branding/logo-light.svg',
  logoDarkUrl: 'https://cdn.demo.co/branding/logo-dark.svg',
  sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
  sealDarkUrl: 'https://cdn.demo.co/branding/seal-dark.svg',
  faviconLightUrl: 'https://cdn.demo.co/branding/favicon-light.svg',
  faviconDarkUrl: 'https://cdn.demo.co/branding/favicon-dark.svg',
  loginBackgroundLightUrl: 'https://cdn.demo.co/branding/login-bg-light.jpg',
  loginBackgroundDarkUrl: 'https://cdn.demo.co/branding/login-bg-dark.jpg',
};

async function setupLoginBrandingMocks(page: Page): Promise<{ requestedSlugs: string[] }> {
  const requestedSlugs: string[] = [];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'No autenticado' }),
      });
      return;
    }

    if (url.includes('/auth/refresh') && method === 'POST') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Refresh no disponible' }),
      });
      return;
    }

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      const slug = new URL(url).searchParams.get('slug') ?? '';
      requestedSlugs.push(slug);

      if (slug === 'isp-demo') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: BRANDING_FIXTURE }),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' }),
      });
      return;
    }

    await route.continue();
  });

  return { requestedSlugs };
}

test.describe('Portal login branding público', () => {
  test('resuelve branding por slug y aplica identidad visual', async ({ page }) => {
    const { requestedSlugs } = await setupLoginBrandingMocks(page);

    await page.goto('/auth/login');
    await page.getByPlaceholder('ejemplo: isp-demo').fill('isp-demo');

    await expect.poll(() => requestedSlugs.includes('isp-demo')).toBe(true);
    await expect(page.getByRole('heading', { name: 'Bienvenido a ISP Demo' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'ISP Demo' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.head
              .querySelector('link[data-iwana-login-favicon="icon"]')
              ?.getAttribute('href') ?? '',
        ),
      )
      .toContain('https://cdn.demo.co/branding/favicon-light.svg');
  });

  test('mantiene fallback de branding cuando el slug no existe', async ({ page }) => {
    const { requestedSlugs } = await setupLoginBrandingMocks(page);

    await page.goto('/auth/login');
    await page.getByPlaceholder('ejemplo: isp-demo').fill('tenant-inexistente');

    await expect.poll(() => requestedSlugs.includes('tenant-inexistente')).toBe(true);
    await expect(page.getByRole('heading', { name: 'Bienvenido al portal' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.head
              .querySelector('link[data-iwana-login-favicon="icon"]')
              ?.getAttribute('href') ?? '',
        ),
      )
      .toContain('/brand/iwiso6.png');
  });
});
