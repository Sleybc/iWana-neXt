import type { Page, Route } from '@playwright/test';

interface EffectivePermissionsMockOptions {
  userId: string;
  role: string;
  effectivePermissions: readonly string[];
}

export async function mockEffectivePermissions(
  page: Page,
  options: EffectivePermissionsMockOptions,
): Promise<void> {
  await page.route('**/api/v1/access-control/me/effective-permissions', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userId: options.userId,
          role: options.role,
          effectivePermissions: options.effectivePermissions,
          recoveryPermissions: [],
          profileSources: [],
        },
      }),
    });
  });
}
