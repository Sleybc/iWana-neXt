/**
 * UI-ANILLO-FOCO-AUTH — guion de capturas visuales (B3-pre «antes» / B3 «después»).
 * Derivado de docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs.
 *
 * Vive junto a las capturas y NO forma parte de la suite e2e/ del repo.
 * 5 pantallas × 2 temas = 10 capturas PNG, cada una con su primer campo enfocado con la tecla Tab
 * (nunca element.focus()): el anillo que se ve es el de :focus por teclado.
 *   01-login-portal            apps/portal  /auth/login            (LoginForm)
 *   02-recuperacion-sesion     apps/portal  SessionRecoveryModal   (sobre /dashboard/settings/branding)
 *   03-login-plataforma        apps/web     /auth/login            (LoginForm de plataforma)
 *   04-forgot-password         apps/portal  /auth/forgot-password
 *   05-verify-email            apps/portal  /auth/verify-email?tenant=isp-demo
 *
 * Además vuelca el CSS generado de portal y web (spec §8.5) en css/:
 *   <app>.css                  hojas de estilo que carga /auth/login, concatenadas (sin sourceMappingURL)
 *   <app>-reglas-iwana.txt     selectores de clase únicos que contienen «iwana», ordenados
 *   resumen.json               bytes del CSS, hojas y número de selectores iwana por app
 *
 * Sin credenciales: la API se simula con page.route; la sesión del portal es un JWT sintético sin
 * firma válida. Datos ficticios: correo con dominio .test y teléfono ficticio. No toca API ni BD.
 *
 * Requisitos: portal en http://127.0.0.1:3002 y web en http://127.0.0.1:3001 (dev) y Chrome estable.
 *   - OBLIGATORIO: PW_CHANNEL=chrome ($env:PW_CHANNEL='chrome' en PowerShell); el guion aborta sin él.
 *   - portal: pnpm --filter @iwana/portal dev
 *   - web:    $env:NEXT_PUBLIC_WEB_API_URL='';        pnpm --filter @iwana/web dev
 *
 * Uso (desde la raíz del repo):
 *   node docs/informes/evidence/ui-anillo-foco-auth/antes/capturas.mjs [carpeta-de-salida]
 * Sin argumento escribe junto al guion («antes»). Para B3: pasar la carpeta «despues».
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

if (process.env.PW_CHANNEL !== 'chrome') {
  console.error('PW_CHANNEL=chrome es obligatorio (ver cabecera).');
  process.exit(2);
}

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
  contactEmail: 'contacto@isp-prueba.test',
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
          phone: '+570000000000',
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

/** Fija el tema antes del primer paint. */
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

/**
 * Lleva el foco al primer campo de texto con la tecla Tab, desde el inicio del documento o desde
 * donde el diálogo deja el foco. Devuelve cuántas pulsaciones hicieron falta y el campo alcanzado.
 */
async function tabToFirstField(page, scope = 'body') {
  await page.mouse.move(0, 0);
  if (scope === 'body') {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  }
  const isField = () =>
    page.evaluate((sel) => {
      const el = document.activeElement;
      if (!el || !['INPUT', 'TEXTAREA'].includes(el.tagName)) return false;
      if (['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type)) return false;
      return sel === 'body' || !!el.closest(sel);
    }, scope);
  for (let i = 1; i <= 40; i += 1) {
    await page.keyboard.press('Tab');
    if (await isField()) {
      const name = await page.evaluate(
        () =>
          document.activeElement.getAttribute('aria-label') ||
          document.activeElement.labels?.[0]?.textContent?.trim() ||
          document.activeElement.name ||
          document.activeElement.type,
      );
      await page.waitForTimeout(200);
      return `${i}×Tab → «${name}»`;
    }
  }
  throw new Error('no se alcanzó un campo con Tab en 40 pulsaciones');
}

async function shot(page, theme, name, how, fullPage = false) {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (isDark !== (theme === 'dark')) throw new Error(`${name}: el tema ${theme} no quedó aplicado`);
  const file = resolve(OUT_DIR, `${name}-${theme === 'light' ? 'claro' : 'oscuro'}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`OK ${file}  (${how})`);
}

/** Vuelca las hojas de estilo que carga la página y el listado de selectores iwana-*. */
async function dumpCss(page, app) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).sort(),
  );
  let css = '';
  for (const href of hrefs) {
    const res = await page.request.get(href);
    css += (await res.text()).replace(/\/\*# sourceMappingURL=.*?\*\//g, '') + '\n';
  }
  const selectors = new Set();
  for (const m of css.matchAll(/\.((?:\\.|[\w-])*iwana(?:\\.|[\w-])*)/g)) {
    selectors.add(m[1].replace(/\\(.)/g, '$1'));
  }
  const list = [...selectors].sort();
  const dir = resolve(OUT_DIR, 'css');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${app}.css`), css);
  writeFileSync(resolve(dir, `${app}-reglas-iwana.txt`), list.join('\n') + '\n');
  const bytes = Buffer.byteLength(css);
  console.log(`CSS ${app}: ${bytes} bytes, ${hrefs.length} hojas, ${list.length} selectores iwana`);
  return { bytes, hojas: hrefs.length, selectoresIwana: list.length };
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const cssSummary = {};
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
      if (theme === 'light') cssSummary.portal = await dumpCss(page, 'portal');
      const how = await tabToFirstField(page);
      await shot(page, theme, '01-login-portal', how);
      await page.close();
    }

    // 03 · login de plataforma (apps/web)
    {
      const page = await context.newPage();
      await page.goto(`${WEB}/auth/login`, { waitUntil: 'networkidle' });
      await page
        .getByRole('button', { name: /ingresar|iniciar sesi|acceder/i })
        .first()
        .waitFor();
      await settle(page);
      if (theme === 'light') cssSummary.web = await dumpCss(page, 'web');
      const how = await tabToFirstField(page);
      await shot(page, theme, '03-login-plataforma', how, true);
      await page.close();
    }

    // 04 · forgot-password
    {
      const page = await context.newPage();
      await mockPortalApi(page);
      await page.goto(`${PORTAL}/auth/forgot-password`, { waitUntil: 'networkidle' });
      await page.locator('input').first().waitFor();
      await settle(page);
      const how = await tabToFirstField(page);
      await shot(page, theme, '04-forgot-password', how);
      await page.close();
    }

    // 05 · verify-email (sin token en la URL: formulario de código)
    {
      const page = await context.newPage();
      await mockPortalApi(page);
      await page.goto(`${PORTAL}/auth/verify-email?tenant=${TENANT_SLUG}`, {
        waitUntil: 'networkidle',
      });
      await page.locator('input').first().waitFor();
      await settle(page);
      const how = await tabToFirstField(page);
      await shot(page, theme, '05-verify-email', how);
      await page.close();
    }

    // 02 · SessionRecoveryModal sobre una sesión sintética del portal
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
      // Se abre por el mismo CustomEvent que usa la app.
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('iwana:session-recovery-open')),
      );
      await page.getByRole('dialog').waitFor();
      await settle(page);
      const how = await tabToFirstField(page, '[role="dialog"]');
      await shot(
        page,
        theme,
        '02-recuperacion-sesion',
        `evento iwana:session-recovery-open; ${how}`,
      );
      await page.close();
    }
    await context.close();
  }
  writeFileSync(
    resolve(OUT_DIR, 'css', 'resumen.json'),
    JSON.stringify(cssSummary, null, 2) + '\n',
  );
} finally {
  await browser.close();
}
