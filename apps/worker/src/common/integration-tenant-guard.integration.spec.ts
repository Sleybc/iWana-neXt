/**
 * B(a): la configuración de integración instala la guarda que impide registrar empresas fuera
 * de una base desechable (`packages/database/test/integration-tenant-guard.js`, setupFiles).
 * No se conecta: el alta se rechaza antes de enviarse.
 */
import { Client } from 'pg';

describe('guarda de integración instalada por la configuración', () => {
  it('un alta de empresa contra dbiw falla de inmediato', async () => {
    expect(
      (Client.prototype as unknown as Record<symbol, unknown>)[
        Symbol.for('iwana.integrationTenantGuard')
      ],
    ).toBe(true);
    const client = new Client({ database: 'dbiw', host: '127.0.0.1', port: 1 });
    await expect(
      client.query(`INSERT INTO public.tenants (id) VALUES ($1)`, [
        '00000000-0000-4000-8000-000000000000',
      ]),
    ).rejects.toThrow('[BLOCKED]');
  });
});
