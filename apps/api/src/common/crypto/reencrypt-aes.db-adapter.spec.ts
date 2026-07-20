/**
 * `TypeOrmReencryptDbAdapter` es la pieza del recifrado que toca la base: si se
 * equivoca de schema o de tabla, reescribe ciphertext ajeno. Estaba al 0% de
 * cobertura mientras el orquestador que la usa estaba al 91%.
 *
 * Se prueba contra dobles de `DataSource` / `QueryRunner`, no contra Postgres:
 * lo que hay que fijar aquí es **qué SQL se emite y con qué parámetros** —
 * calificación `public."tabla"` frente a tabla desnuda bajo `search_path`,
 * parametrización, y la validación de nombre de schema antes de interpolar.
 *
 * `runInTenantSchema` se usa real (viene de `@iwana/db`) para que el test cubra
 * también el `SET LOCAL search_path` y el ciclo transacción/rollback/release,
 * que es donde vive el riesgo de fuga entre tenants.
 */
import { DataSource, QueryRunner } from 'typeorm';

import { TypeOrmReencryptDbAdapter } from './reencrypt-aes.db-adapter';
import { EncryptedColumnTarget } from './reencrypt-aes.targets';

type QueryCall = { sql: string; params: unknown[] | undefined };

const TENANT_TARGET: EncryptedColumnTarget = {
  entityType: 'user.mfaSecret',
  scope: 'tenant',
  table: 'users',
  column: 'mfa_secret',
  idColumn: 'id',
  requireCiphertextShape: true,
};

const PUBLIC_TARGET: EncryptedColumnTarget = {
  entityType: 'platform_user.mfaSecret',
  scope: 'public',
  table: 'platform_users',
  column: 'mfa_secret',
  idColumn: 'id',
  requireCiphertextShape: true,
};

/** Normaliza espacios para poder afirmar sobre SQL multilínea sin ser frágil. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createHarness(runnerRows: unknown[] = []) {
  const dataSourceCalls: QueryCall[] = [];
  const runnerCalls: QueryCall[] = [];
  const lifecycle: string[] = [];

  const queryRunner = {
    connect: jest.fn(async () => {
      lifecycle.push('connect');
    }),
    startTransaction: jest.fn(async () => {
      lifecycle.push('start');
    }),
    commitTransaction: jest.fn(async () => {
      lifecycle.push('commit');
    }),
    rollbackTransaction: jest.fn(async () => {
      lifecycle.push('rollback');
    }),
    release: jest.fn(async () => {
      lifecycle.push('release');
    }),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      runnerCalls.push({ sql, params });
      if (sql.startsWith('SET LOCAL')) {
        return [];
      }
      return runnerRows;
    }),
  } as unknown as QueryRunner;

  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      dataSourceCalls.push({ sql, params });
      return runnerRows;
    }),
  } as unknown as DataSource;

  return {
    adapter: new TypeOrmReencryptDbAdapter(dataSource),
    dataSource,
    queryRunner,
    dataSourceCalls,
    runnerCalls,
    lifecycle,
  };
}

describe('TypeOrmReencryptDbAdapter', () => {
  describe('listActiveTenantSchemas', () => {
    it('devuelve solo los schemas de tenants ACTIVE, ordenados', async () => {
      const h = createHarness([{ schema_name: 'tenant_alfa' }, { schema_name: 'tenant_beta' }]);

      await expect(h.adapter.listActiveTenantSchemas()).resolves.toEqual([
        'tenant_alfa',
        'tenant_beta',
      ]);

      const sql = flat(h.dataSourceCalls[0]!.sql);
      expect(sql).toContain('FROM public.tenants');
      expect(sql).toContain("WHERE status = 'ACTIVE'");
      expect(sql).toContain('ORDER BY schema_name ASC');
    });

    it('devuelve lista vacía cuando no hay tenants activos', async () => {
      const h = createHarness([]);

      await expect(h.adapter.listActiveTenantSchemas()).resolves.toEqual([]);
    });
  });

  describe('tableExists', () => {
    it('parametriza schema y tabla en vez de interpolarlos', async () => {
      const h = createHarness([{ ok: 1 }]);

      await expect(h.adapter.tableExists('tenant_alfa', 'users')).resolves.toBe(true);

      expect(h.dataSourceCalls[0]!.params).toEqual(['tenant_alfa', 'users']);
      expect(flat(h.dataSourceCalls[0]!.sql)).toContain('FROM information_schema.tables');
      // El nombre no debe aparecer incrustado en el texto del SQL.
      expect(h.dataSourceCalls[0]!.sql).not.toContain('tenant_alfa');
    });

    it('es false cuando la tabla no está en el schema', async () => {
      const h = createHarness([]);

      await expect(h.adapter.tableExists('tenant_alfa', 'inexistente')).resolves.toBe(false);
    });
  });

  describe('fetchEncryptedBatch — schema public', () => {
    it('califica la tabla como public."tabla" y no abre transacción de tenant', async () => {
      const h = createHarness([{ id: 'id-1', value: 'v1' }]);

      await expect(h.adapter.fetchEncryptedBatch('public', PUBLIC_TARGET, 20, 10)).resolves.toEqual(
        [{ id: 'id-1', value: 'v1' }],
      );

      expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();

      const call = h.dataSourceCalls[0]!;
      expect(flat(call.sql)).toContain('FROM public."platform_users"');
      expect(call.params).toEqual([20, 10]);
    });

    it('descarta NULL y cadenas en blanco en el propio SQL', async () => {
      const h = createHarness([]);

      await h.adapter.fetchEncryptedBatch('public', PUBLIC_TARGET, 0, 50);

      const sql = flat(h.dataSourceCalls[0]!.sql);
      expect(sql).toContain('"mfa_secret" IS NOT NULL');
      expect(sql).toContain(`TRIM("mfa_secret"::text) <> ''`);
    });

    it('normaliza a string los valores que Postgres devuelva con otro tipo', async () => {
      const h = createHarness([{ id: 42, value: 7 }]);

      await expect(h.adapter.fetchEncryptedBatch('public', PUBLIC_TARGET, 0, 1)).resolves.toEqual([
        { id: '42', value: '7' },
      ]);
    });
  });

  describe('fetchEncryptedBatch — schema tenant', () => {
    it('fija search_path y consulta la tabla sin calificar', async () => {
      const h = createHarness([{ id: 'id-1', value: 'v1' }]);

      await expect(
        h.adapter.fetchEncryptedBatch('tenant_alfa', TENANT_TARGET, 0, 100),
      ).resolves.toEqual([{ id: 'id-1', value: 'v1' }]);

      expect(h.runnerCalls[0]!.sql).toBe('SET LOCAL search_path TO "tenant_alfa"');

      const select = flat(h.runnerCalls[1]!.sql);
      expect(select).toContain('FROM "users"');
      expect(select).not.toContain('public.');
      expect(h.runnerCalls[1]!.params).toEqual([0, 100]);
    });

    it('confirma y libera la transacción', async () => {
      const h = createHarness([]);

      await h.adapter.fetchEncryptedBatch('tenant_alfa', TENANT_TARGET, 0, 10);

      expect(h.lifecycle).toEqual(['connect', 'start', 'commit', 'release']);
    });

    it('rechaza un schema que no cumple el patrón tenant_*', async () => {
      const h = createHarness([]);

      await expect(
        h.adapter.fetchEncryptedBatch('otro_schema', TENANT_TARGET, 0, 10),
      ).rejects.toThrow(/Schema name invalido/);

      expect(h.runnerCalls).toHaveLength(0);
    });

    it('revierte y libera si la consulta falla', async () => {
      const h = createHarness([]);
      (h.queryRunner.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.startsWith('SET LOCAL')) return [];
        throw new Error('boom');
      });

      await expect(
        h.adapter.fetchEncryptedBatch('tenant_alfa', TENANT_TARGET, 0, 10),
      ).rejects.toThrow('boom');

      expect(h.lifecycle).toEqual(['connect', 'start', 'rollback', 'release']);
    });
  });

  describe('updateEncryptedValue — schema public', () => {
    it('actualiza public."tabla" con ciphertext e id parametrizados', async () => {
      const h = createHarness([]);

      await h.adapter.updateEncryptedValue('public', PUBLIC_TARGET, 'id-9', 'nuevo-ciphertext');

      expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();

      const call = h.dataSourceCalls[0]!;
      expect(flat(call.sql)).toBe(
        'UPDATE public."platform_users" SET "mfa_secret" = $1 WHERE "id" = $2',
      );
      expect(call.params).toEqual(['nuevo-ciphertext', 'id-9']);
    });
  });

  describe('updateEncryptedValue — schema tenant', () => {
    it('actualiza bajo search_path, sin calificar la tabla', async () => {
      const h = createHarness([]);

      await h.adapter.updateEncryptedValue('tenant_alfa', TENANT_TARGET, 'id-9', 'nuevo');

      expect(h.runnerCalls[0]!.sql).toBe('SET LOCAL search_path TO "tenant_alfa"');
      expect(flat(h.runnerCalls[1]!.sql)).toBe(
        'UPDATE "users" SET "mfa_secret" = $1 WHERE "id" = $2',
      );
      expect(h.runnerCalls[1]!.params).toEqual(['nuevo', 'id-9']);
      expect(h.lifecycle).toEqual(['connect', 'start', 'commit', 'release']);
    });

    it('rechaza el schema invalido ANTES de abrir la transacción', async () => {
      const h = createHarness([]);

      await expect(
        h.adapter.updateEncryptedValue('public_ojo', TENANT_TARGET, 'id-9', 'nuevo'),
      ).rejects.toThrow(/Schema name invalido: public_ojo/);

      expect(h.dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(h.lifecycle).toEqual([]);
    });

    it('revierte si el UPDATE falla, sin dejar la conexión tomada', async () => {
      const h = createHarness([]);
      (h.queryRunner.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.startsWith('SET LOCAL')) return [];
        throw new Error('conflicto');
      });

      await expect(
        h.adapter.updateEncryptedValue('tenant_alfa', TENANT_TARGET, 'id-9', 'nuevo'),
      ).rejects.toThrow('conflicto');

      expect(h.lifecycle).toEqual(['connect', 'start', 'rollback', 'release']);
    });
  });
});
