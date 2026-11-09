/**
 * UI-TOKENS-FUENTE-UNICA — guion de capturas visuales (B3-pre «antes» / B3 «después»).
 *
 * Vive junto a las capturas y NO forma parte de la suite e2e/ del repo.
 * 4 pantallas × 2 temas = 8 capturas PNG:
 *   01-login-portal            apps/portal  /auth/login            (LoginExperience)
 *   02-login-plataforma        apps/web     /auth/login            (PlatformAuthExperience)
 *   03-recuperacion-sesion     apps/portal  SessionRecoveryModal   (sobre /dashboard/settings/branding)
 *   04-section-accordion       apps/portal  /dashboard/settings/branding (BrandingForm → SectionAccordion)
 *
 * Sin credenciales: la API se simula con page.route (mismo criterio que la suite portal);
 * la sesión del portal es un JWT sintético sin firma válida. No toca la API ni la base de datos.
 *
 * Requisitos: portal en http://127.0.0.1:3002 y web en http://127.0.0.1:3001 (dev), y Chrome
 * de Playwright instalado (ms-playwright).
 *   - OBLIGATORIO: PW_CHANNEL=chrome ($env:PW_CHANNEL='chrome' en PowerShell). Con el Chromium
 *     de Playwright el antialiasing de los bordes de texto difiere (hasta 73 niveles) y las 8
 *     parejas «antes»/«después» dejan de ser comparables. Las capturas versionadas son de Chrome.
 *   - portal: pnpm --filter @iwana/portal dev   (sin IWANA_DISABLE_CACHE_COMPONENTS: con él el dashboard no compila)
 *   - web:    $env:NEXT_PUBLIC_WEB_API_URL='';        pnpm --filter @iwana/web dev
 *
 * Uso (desde la raíz del repo):
 *   node docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs [carpeta-de-salida]
 * Sin argumento escribe junto al guion («antes»). Para B3: pasar la carpeta «despues».
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.argv[2] ?? SCRIPT_DIR);
const PORTAL = process.env.PORTAL_URL ?? 'http://127.0.0.1:3002';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3001';
const VIEWPORT = { width: 1440, height: 900 };
const THEMES = ['light', 'dark'];

const TENANT_SLUG = 'isp-demo';
const TENANT_ID = 'tenant-uuid-test';
const USER_ID = 'user-uuid-admin-test';

const json = (route, data, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

function accessToken() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      email: 'aabbccdd11223344',
      role: 'ADMIN',
      tenantId: TENANT_ID,
      schemaName: 'tenant_test_isp',
      jti: 'jti-capturas',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

const tenantProfile = {
  id: TENANT_ID,
  name: 'ISP Prueba Colombia',
  slug: TENANT_SLUG,
  status: 'ACTIVE',
  contactEmail: 'contacto@test-isp.co',
  legalName: null,
  nit: null,
  nitDv: null,
  city: 'Medellin',
  department: 'Antioquia',
  countryCode: 'CO',
  phone: null,
  website: null,
  createdAt: '2026-01-15T00:00:00.000Z',
  logoLightUrl: null,
  logoLightAssetId: null,
  logoDarkUrl: null,
  logoDarkAssetId: null,
  sealLightUrl: null,
  sealLightAssetId: null,
  sealDarkUrl: null,
  sealDarkAssetId: null,
  faviconLightUrl: null,
  faviconLightAssetId: null,
  faviconDarkUrl: null,
  faviconDarkAssetId: null,
  loginBackgroundLightUrl: null,
  loginBackgroundLightAssetId: null,
  loginBackgroundDarkUrl: null,
  loginBackgroundDarkAssetId: null,
  showTenantName: true,
};
const tenantSettings = {
  timezone: 'America/Bogota',
  currency: 'COP',
  language: 'es-CO',
  country: 'CO',
  fiberInstallationThresholdMeters: 120,
  features: { billing: false, mfa_required_all: false },
};
const settingsSections = [
  {
    key: 'branding',
    label: 'Marca',
    description: 'Gestiona identidad visual y activos corporativos del tenant autenticado.',
    ownerModule: 'Tenant / Branding',
    status: 'AVAILABLE',
    route: '/dashboard/settings/branding',
    requiredPermissions: ['settings.read'],
  },
];

/** Simula toda la API del portal. Determinista: sin fechas relativas visibles. */
async function mockPortalApi(page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method !== 'GET') return json(route, {});
    if (url.includes('/tenants/public-branding')) {
      return json(route, {
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
    }
    if (url.includes('/auth/me')) {
      return json(route, {
        data: {
          sub: USER_ID,
          email: 'aabbccdd11223344',
          role: 'ADMIN',
          tenantId: TENANT_ID,
          schemaName: 'tenant_test_isp',
          jti: 'jti-capturas',
          type: 'tenant',
        },
      });
    }
    if (url.includes(`/users/${USER_ID}`)) {
      return json(route, {
        data: {
          id: USER_ID,
          role: 'ADMIN',
          status: 'ACTIVE',
          firstName: 'Ana',
          lastName: 'Prueba',
          phone: '+573001234567',
          jobTitle: 'Operaciones',
          avatarUrl: null,
          mfaEnabled: false,
          emailVerified: true,
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      });
    }
    if (/\/access-control\/users\/[^/]+\/effective-permissions$/.test(url)) {
      return json(route, {
        data: {
          userId: USER_ID,
          role: 'ADMIN',
          effectivePermissions: ['settings.read', 'settings.update'],
          recoveryPermissions: [],
          profileSources: [],
        },
      });
    }
    if (url.includes('/configuration/settings-sections'))
      return json(route, { data: settingsSections });
    if (url.includes('/audit-logs')) return json(route, { data: [] });
    if (url.includes('/tenants/me/settings')) return json(route, { data: tenantSettings });
    if (url.includes('/tenants/me/summary')) {
      return json(route, {
        data: {
          tenant: tenantProfile,
          settings: tenantSettings,
          metrics: {
            configuredUsers: 5,
            mfaCoverage: null,
            pendingAlerts: 1,
            auditEventsLast7d: 12,
          },
          alerts: [],
        },
      });
    }
    if (url.includes('/tenants/me')) return json(route, { data: tenantProfile });
    return json(route, { code: 'NOT_MOCKED', message: 'sin simulación' }, 404);
  });
}

/** Fija el tema antes del primer paint y congela animaciones para capturas deterministas. */
async function prepare(context, theme) {
  await context.addInitScript(
    ({ theme: t, slug }) => {
      localStorage.setItem('iwana-theme', t);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { theme, slug: TENANT_SLUG },
  );
}

async function settle(page) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shot(page, theme, name, fullPage = false) {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (isDark !== (theme === 'dark')) throw new Error(`${name}: el tema ${theme} no quedó aplicado`);
  const file = resolve(OUT_DIR, `${name}-${theme === 'light' ? 'claro' : 'oscuro'}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`OK ${file}`);
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: 'reduce',
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
    });
    await prepare(context, theme);

    // 01 · login del portal
    {
      const page = await context.newPage();
      await mockPortalApi(page);
      await page.goto(`${PORTAL}/auth/login?tenant=${TENANT_SLUG}`, { waitUntil: 'networkidle' });
      await page
        .getByRole('button', { name: /ingresar|iniciar sesi/i })
        .first()
        .waitFor();
      await settle(page);
      await shot(page, theme, '01-login-portal');
      await page.close();
    }

    // 02 · login de plataforma (apps/web)
    {
      const page = await context.newPage();
      await page.goto(`${WEB}/auth/login`, { waitUntil: 'networkidle' });
      await page
        .getByRole('button', { name: /ingresar|iniciar sesi|acceder/i })
        .first()
        .waitFor();
      await settle(page);
      await shot(page, theme, '02-login-plataforma', true);
      await page.close();
    }

    // 03 y 04 · sesión sintética del portal en /dashboard/settings/branding
    {
      await context.addCookies([
        {
          name: 'portalAccessToken',
          value: accessToken(),
          url: PORTAL,
          httpOnly: true,
          sameSite: 'Strict',
          secure: false,
        },
      ]);
      const page = await context.newPage();
      await mockPortalApi(page);
      await page.goto(`${PORTAL}/dashboard/settings/branding`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await settle(page);
      // 03 · SessionRecoveryModal: se abre por el mismo CustomEvent que usa la app.
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('iwana:session-recovery-open')),
      );
      await page.getByRole('dialog').waitFor();
      await settle(page);
      await shot(page, theme, '03-recuperacion-sesion');
      await page.close();

      // 04 · página nueva (el modal no se cierra sin re-login): el SectionAccordion (variante card)
      // de BrandingForm queda a la vista, con sus ítems cerrados.
      const page2 = await context.newPage();
      await mockPortalApi(page2);
      await page2.goto(`${PORTAL}/dashboard/settings/branding`, { waitUntil: 'networkidle' });
      await page2.getByRole('heading', { level: 1 }).first().waitFor();
      await page2.getByRole('heading', { name: 'Nombres e identidad' }).scrollIntoViewIfNeeded();
      await page2.evaluate(() => window.scrollBy(0, 200));
      await page2.mouse.move(0, 0);
      await settle(page2);
      await shot(page2, theme, '04-section-accordion');

      await page2.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
