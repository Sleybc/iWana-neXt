/**
 * E2E — MOD14 Facturación Fase 01 contra la API real (HLD §10, V1).
 *
 * Solo pruebas, sin código de producto. Un rojo que apunte a producción es
 * hallazgo y se reporta sin corregirlo.
 *
 * Nivel A (siempre): guardas sin autenticación — 401 en documentos, pagos,
 * estado de cuenta, política, vista previa y agenda.
 * La lectura autenticada y el flujo con mutación viven en
 * `portal-billing-flow.spec.ts` (V1-R), con tenant efímero y limpieza al final.
 *
 * Ejecución:
 *   pnpm exec playwright test e2e/tests/api/mod14-facturacion.spec.ts \
 *     --config e2e/playwright.api.config.ts
 */

import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const API_PREFIX = `${API_BASE}/api/v1`;
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

test.describe('MOD14 Facturación — guardas de la API (nivel A)', () => {
  const cases: Array<{ method: 'get' | 'post'; path: string; headers?: Record<string, string> }> = [
    { method: 'get', path: '/billing/policy' },
    { method: 'get', path: '/billing/documents' },
    { method: 'get', path: `/billing/documents/${NIL_UUID}` },
    { method: 'get', path: `/billing/documents/${NIL_UUID}/pdf` },
    { method: 'get', path: '/billing/payments' },
    { method: 'get', path: `/billing/payments/${NIL_UUID}` },
    { method: 'get', path: `/billing/subscribers/${NIL_UUID}/statement` },
    { method: 'post', path: '/billing/policy/preview' },
    { method: 'post', path: '/billing/documents/generate' },
    { method: 'post', path: '/billing/documents/issue' },
    {
      method: 'post',
      path: '/billing/payments',
      headers: { 'Idempotency-Key': 'e2e-sin-sesion' },
    },
    {
      method: 'get',
      path: '/crm/billing-cycles/cutoff-agenda',
    },
  ];

  for (const { method, path, headers } of cases) {
    test(`${method.toUpperCase()} ${path} sin sesión responde 401`, async ({ request }) => {
      const res =
        method === 'get'
          ? await request.get(`${API_PREFIX}${path}`)
          : await request.post(`${API_PREFIX}${path}`, { headers });
      expect(res.status()).toBe(401);
    });
  }
});
