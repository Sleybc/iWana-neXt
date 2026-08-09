import type { Page } from '@playwright/test';

/**
 * Siembra de sesión del portal por cookie httpOnly (ADR-081, condición C-9).
 *
 * Los nombres y opciones de la cookie son el contrato congelado por OLA1-b
 * (C-5): el backend los emite en `apps/api/src/modules/auth/session-cookies.constants.ts`
 * y `auth.controller.ts` (ACCESS_COOKIE_OPTIONS). La siembra usa el mismo nombre,
 * `Path=/`, `httpOnly` y `SameSite=Strict`, con dominio `127.0.0.1` (el baseURL
 * de la suite portal) y `Secure` desactivado en desarrollo (COOKIE_SECURE=false).
 *
 * Punto de no retorno alcanzado (C-9): el cliente ya no lee tokens de
 * localStorage; la siembra es exclusivamente por cookie. El slug de tenant no es
 * un token (C-3 no lo cubre) y el cliente lo sigue resolviendo desde
 * `iwana.portal.tenant-slug` en localStorage.
 */

/** Nombre de la cookie de access del portal (audiencia tenant). */
export const PORTAL_ACCESS_TOKEN_COOKIE = 'portalAccessToken';

/** Dominio de la cookie: el baseURL de `e2e/playwright.portal.config.ts`. */
export const PORTAL_COOKIE_DOMAIN = '127.0.0.1';

/** Path mínimo que cubre toda la ruta del API (decisión 4 del ADR-081). */
export const PORTAL_COOKIE_PATH = '/';

export interface PortalSessionSeed {
  /** Access token sintético (JWT de prueba, sin firma válida ni PII real). */
  token?: string;
  /** Slug del tenant de prueba; el cliente lo resuelve desde localStorage (no es token). */
  tenantSlug: string;
}

/**
 * Siembra una sesión de portal en el contexto del test:
 * emite la cookie `portalAccessToken` con las opciones reales de producción
 * (httpOnly, SameSite=Strict, Path=/) y deja el slug de tenant en localStorage.
 */
export async function seedPortalSession(page: Page, seed: PortalSessionSeed): Promise<void> {
  if (seed.token) {
    await page.context().addCookies([
      {
        name: PORTAL_ACCESS_TOKEN_COOKIE,
        value: seed.token,
        domain: PORTAL_COOKIE_DOMAIN,
        path: PORTAL_COOKIE_PATH,
        httpOnly: true,
        sameSite: 'Strict',
        secure: false,
      },
    ]);
  }

  await page.addInitScript(
    ({ tenantSlug }: PortalSessionSeed) => {
      window.localStorage.setItem('iwana.portal.tenant-slug', tenantSlug);
    },
    { token: seed.token, tenantSlug: seed.tenantSlug },
  );
}
