/**
 * Guarda de las suites de integración (B(a)): registrar empresas solo en bases desechables.
 */
const { installIntegrationTenantGuard, isDisposableIntegrationDatabase, isTenantRegistration } =
  require('../test/integration-tenant-guard') as {
    installIntegrationTenantGuard: (pg?: unknown) => void;
    isDisposableIntegrationDatabase: (name: unknown) => boolean;
    isTenantRegistration: (sql: unknown) => boolean;
  };

/** Módulo `pg` de mentira: registra lo que llega a la base sin conectarse. */
function fakePg() {
  const sent: string[] = [];
  class Client {
    constructor(readonly database: string) {}
    query(config: string | { text: string }, ..._rest: unknown[]): Promise<string> {
      sent.push(typeof config === 'string' ? config : config.text);
      return Promise.resolve('ok');
    }
  }
  installIntegrationTenantGuard({ Client });
  return { Client, sent };
}

const INSERT = `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
  VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`;

describe('guarda de integración: empresas solo en bases desechables', () => {
  it('reconoce el alta de empresas en sus formas (con y sin comillas ni schema)', () => {
    expect(isTenantRegistration(INSERT)).toBe(true);
    expect(isTenantRegistration('insert into "public"."tenants"("id") values ($1)')).toBe(true);
    expect(isTenantRegistration('INSERT INTO tenants (id) VALUES ($1)')).toBe(true);
    expect(isTenantRegistration('SELECT * FROM public.tenants')).toBe(false);
    expect(isTenantRegistration('INSERT INTO public.tenant_usage_snapshots VALUES ($1)')).toBe(
      false,
    );
    expect(isTenantRegistration('UPDATE public.tenants SET status = $1')).toBe(false);
  });

  it('solo `test` y los clones iwana_it_* de la CI son desechables', () => {
    expect(isDisposableIntegrationDatabase('test')).toBe(true);
    expect(isDisposableIntegrationDatabase('iwana_it_g7_test_w2')).toBe(true);
    expect(isDisposableIntegrationDatabase('dbiw')).toBe(false);
    expect(isDisposableIntegrationDatabase('iwana')).toBe(false);
    expect(isDisposableIntegrationDatabase(undefined)).toBe(false);
  });

  it('en dbiw el alta falla de inmediato y no llega a la base (promesa y callback)', async () => {
    const { Client, sent } = fakePg();
    const client = new Client('dbiw');

    await expect(client.query(INSERT)).rejects.toThrow('[BLOCKED]');
    const viaCallback = await new Promise<unknown>((resolve) => {
      client.query(INSERT, [], (error: unknown) => resolve(error));
    });
    expect(String(viaCallback)).toContain('[BLOCKED]');
    expect(sent).toEqual([]);
  });

  it('en test el alta pasa, y en dbiw las demás consultas pasan', async () => {
    const { Client, sent } = fakePg();
    await expect(new Client('test').query(INSERT)).resolves.toBe('ok');
    await expect(new Client('dbiw').query('SELECT 1')).resolves.toBe('ok');
    expect(sent).toEqual([INSERT, 'SELECT 1']);
  });

  it('con el pg real: un Pool contra dbiw rechaza el alta sin conectarse', async () => {
    installIntegrationTenantGuard();
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({ database: 'dbiw', host: '127.0.0.1', port: 1 });
    await expect(client.query(INSERT, [])).rejects.toThrow('[BLOCKED]');
  });
});
