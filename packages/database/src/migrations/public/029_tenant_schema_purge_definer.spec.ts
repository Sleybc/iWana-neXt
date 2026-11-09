import { readFileSync } from 'fs';
import { join } from 'path';
import type { QueryRunner } from 'typeorm';

import { TenantSchemaPurgeDefiner1784419217000 } from './029_tenant_schema_purge_definer';

/**
 * Migración pública 029 (R7, ADR-108) — comprobaciones sin base de datos.
 * El comportamiento contra PostgreSQL real está en la integrada del mismo nombre.
 */
describe('Migración pública 029 — purga definer', () => {
  function capture(direction: 'up' | 'down'): Promise<string[]> {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new TenantSchemaPurgeDefiner1784419217000();
    return migration[direction](runner).then(() => statements);
  }

  it('la expresión del nombre de esquema es la misma que isValidSchemaName', () => {
    const dataSource = readFileSync(join(__dirname, '..', '..', 'data-source.ts'), 'utf8');
    const match = /return \/(\^tenant_[^/]+)\/\.test\(schemaName\)/.exec(dataSource);
    expect(match).not.toBeNull();
    const migration = readFileSync(join(__dirname, '029_tenant_schema_purge_definer.ts'), 'utf8');
    expect(migration).toContain(`!~ '${match?.[1]}'`);
  });

  it('up crea las dos funciones definer con search_path fijo y revoca PUBLIC', async () => {
    const sql = (await capture('up')).join('\n');
    for (const fn of ['iwana_list_purge_candidates', 'iwana_purge_tenant_schema']) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql.match(/SET search_path = pg_catalog, public, pg_temp/g)).toHaveLength(3);
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.iwana_purge_tenant_schema(uuid, integer) FROM PUBLIC',
    );
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.iwana_list_purge_candidates(integer, integer) FROM PUBLIC',
    );
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("schema_name = 'tenant_iwana'");
  });

  it('down retira el trigger y las tres funciones que crea up', async () => {
    const sql = (await capture('down')).join('\n');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_tenants_deletion_clock ON public.tenants');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.iwana_tenants_deletion_clock()');
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.iwana_purge_tenant_schema(uuid, integer)',
    );
    expect(sql).toContain(
      'DROP FUNCTION IF EXISTS public.iwana_list_purge_candidates(integer, integer)',
    );
  });
});
