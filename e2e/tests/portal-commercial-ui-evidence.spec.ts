import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'hash-admin-test',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-test-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const EVIDENCE_DIR = path.join(
  process.cwd(),
  'docs',
  'informes',
  'evidence',
  'portal-commercial-ui-2026-07-11',
);

async function setAuthSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_ACCESS_TOKEN, tenantSlug: MOCK_TENANT_SLUG });
}

async function setupCommercialEvidenceMocks(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();
    const method = route.request().method();
    const url = new URL(requestUrl);
    const pathname = url.pathname;

    const json = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      await json({
        data: {
          displayName: 'ISP Prueba Colombia',
          showTenantName: true,
          logoLightUrl: null,
          logoDarkUrl: null,
          sealLightUrl: null,
          sealDarkUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          loginBackgroundLightUrl: null,
          loginBackgroundDarkUrl: null,
        },
      });
      return;
    }

    if (pathname.endsWith('/auth/me') && method === 'GET') {
      await json({
        data: {
          sub: 'user-uuid-admin-test',
          email: 'hash-admin-test',
          role: 'ADMIN',
          tenantId: 'tenant-uuid-test',
          schemaName: 'tenant_test_isp',
          jti: 'jti-test-1',
          type: 'tenant',
        },
      });
      return;
    }

    if (pathname.match(/\/users\/[^/]+$/) && method === 'GET') {
      await json({
        data: {
          id: 'user-uuid-admin-test',
          email: 'admin@test-isp.co',
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          mfaEnabled: true,
          emailVerified: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      await json({
        data: {
          id: 'tenant-uuid-test',
          name: 'ISP Prueba Colombia',
          slug: MOCK_TENANT_SLUG,
          showTenantName: true,
        },
      });
      return;
    }

    if (pathname.endsWith('/audit-logs') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      await json({
        plansCount: 2,
        activePlansCount: 2,
        productsCount: 3,
        activeProductsCount: 2,
        servicesCount: 1,
        activeServicesCount: 1,
        bundlesCount: 1,
        activeBundlesCount: 1,
        promotionsCount: 2,
        activePromotionsCount: 1,
        compatibilityRulesCount: 4,
        activeCompatibilityRulesCount: 3,
        taxRulesCount: 5,
        activeTaxRulesCount: 4,
        attentionItems: [],
        recentChanges: [],
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      const type = url.searchParams.get('type');
      if (type === 'PLAN') {
        await json({
          data: [
            {
              id: 'plan-fibra-500',
              type: 'PLAN',
              name: 'Plan Fibra 500',
              description: 'Plan residencial de referencia',
              taxClassificationId: null,
              retentionApplicable: false,
              isActive: true,
              technology: 'GPON',
              installationRule: 'ON_DEMAND',
              downloadSpeedMbps: 500,
              uploadSpeedMbps: 500,
              currentPrice: '109900.00',
              installationFee: '0.00',
            },
          ],
          meta: { total: 1 },
        });
        return;
      }

      if (type === 'PRODUCT') {
        await json({
          data: [
            {
              id: 'prod-router',
              type: 'PRODUCT',
              name: 'Router WiFi 6',
              description: 'Router principal para hogar',
              taxClassificationId: null,
              retentionApplicable: false,
              isActive: true,
              category: 'CPE',
              isLoan: true,
              requiresInventory: true,
            },
          ],
          meta: { total: 1 },
        });
        return;
      }

      if (type === 'SERVICE') {
        await json({
          data: [
            {
              id: 'srv-ip-publica',
              type: 'SERVICE',
              name: 'IP pública fija',
              description: 'Dirección IPv4 pública dedicada',
              taxClassificationId: null,
              retentionApplicable: false,
              isActive: true,
              chargeType: 'RECURRING',
              currentPrice: '25000.00',
              installationFee: '10000.00',
            },
          ],
          meta: { total: 1 },
        });
        return;
      }
    }

    if (pathname.endsWith('/taxation/definitions') && method === 'GET') {
      await json({
        data: [
          {
            id: 'tax-def-iva-19',
            code: 'IVA_19',
            name: 'IVA general',
            category: 'VAT',
            jurisdictionLevel: 'NATIONAL',
            baseRate: 19,
            treatment: 'STANDARD',
            context: 'BOTH',
            isActive: true,
            isSystemPreset: true,
            notes: null,
          },
        ],
      });
      return;
    }

    if (pathname.endsWith('/commercial/tax-rules') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/tax-rule-applications') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/bundles') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/promotions') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/dashboard/summary') && method === 'GET') {
      await json({
        plansCount: 2,
        activePlansCount: 2,
        productsCount: 3,
        activeProductsCount: 2,
        servicesCount: 1,
        activeServicesCount: 1,
        bundlesCount: 1,
        activeBundlesCount: 1,
        promotionsCount: 2,
        activePromotionsCount: 1,
        compatibilityRulesCount: 4,
        activeCompatibilityRulesCount: 3,
        taxRulesCount: 5,
        activeTaxRulesCount: 4,
      });
      return;
    }

    if (pathname.endsWith('/commercial/compatibility-rules') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    if (pathname.endsWith('/commercial/compatibility/rules') && method === 'GET') {
      await json({ data: [] });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });
}

async function captureCommercialEvidence(page: Page, viewport: 'desktop' | 'mobile') {
  if (viewport === 'mobile') {
    await page.setViewportSize({ width: 390, height: 844 });
  } else {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  const shots: Array<{ route: string; filename: string }> = [
    { route: '/dashboard/commercial', filename: `commercial-summary-${viewport}.png` },
    { route: '/dashboard/commercial?tab=plans', filename: `commercial-plans-${viewport}.png` },
    {
      route: '/dashboard/commercial?tab=products',
      filename: `commercial-products-${viewport}.png`,
    },
    {
      route: '/dashboard/commercial?tab=taxation/tax-simulator',
      filename: `commercial-tax-simulator-${viewport}.png`,
    },
  ];

  for (const shot of shots) {
    await page.goto(shot.route);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: 'Comercial', exact: true }).first(),
    ).toBeVisible();
    if (!existsSync(EVIDENCE_DIR)) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
    await captureEvidenceScreenshot(page, shot.filename);
  }
}

/**
 * Captura evidencia con reintento ante errores transitorios de escritura en
 * Windows (open UNKNOWN). Los screenshots son artefacto de documentación, no
 * aserciones; un fallo transitorio no debe tumbar el recorrido.
 */
async function captureEvidenceScreenshot(
  page: Page,
  filename: string,
  maxAttempts = 3,
): Promise<void> {
  const target = path.join(EVIDENCE_DIR, filename);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.screenshot({ path: target, fullPage: true });
      return;
    } catch (screenshotError) {
      if (attempt === maxAttempts) {
        throw screenshotError;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

test.describe('Portal Comercial — evidencia visual UI alineada', () => {
  test.beforeAll(() => {
    if (!existsSync(EVIDENCE_DIR)) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupCommercialEvidenceMocks(page);
    await setAuthSession(page);
  });

  test('captura desktop y mobile del módulo comercial compacto', async ({ page }) => {
    await captureCommercialEvidence(page, 'desktop');
    await captureCommercialEvidence(page, 'mobile');
  });
});
