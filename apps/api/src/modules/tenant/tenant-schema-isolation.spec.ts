/**
 * Smoke test de aislamiento de schema por tenant.
 *
 * Verifica que runInTenantSchema:
 * 1. Emite SET LOCAL search_path correcto para cada tenant de forma independiente
 * 2. Rechaza nombres de schema invalidos ANTES de ejecutar cualquier SQL (SQL injection prevention)
 * 3. Ejecuta rollback + release en finally cuando el callback lanza un error
 * 4. En llamadas concurrentes usa QueryRunners independientes (sin contaminacion cruzada)
 *
 * NOTA: Esta spec importa la implementacion REAL de runInTenantSchema desde @iwana/db
 * para validar el comportamiento de produccion — NO usa el mock del modulo.
 *
 * ADR-017: Multi-tenant schema-per-tenant isolation
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2
 */

import { DataSource } from 'typeorm';
// Importar la implementacion real (no el mock global si lo hubiera)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runInTenantSchema, isValidSchemaName } = jest.requireActual<
  typeof import('@iwana/db')
>('@iwana/db');

// ---------------------------------------------------------------------------
// Helper: construye un QueryRunner mock que registra todas las queries emitidas
// ---------------------------------------------------------------------------

interface MockQueryRunner {
  queries: string[];
  connect: jest.Mock;
  startTransaction: jest.Mock;
  query: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
  manager: Record<string, jest.Mock>;
}

function buildMockQueryRunner(
  callbackResult: unknown = { ok: true },
  throwOnCallback = false,
): MockQueryRunner {
  const queries: string[] = [];

  return {
    queries,
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation((sql: string) => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      find: jest.fn().mockResolvedValue(throwOnCallback ? (() => { throw new Error('callback error'); })() : callbackResult),
    },
  };
}

function buildDataSource(qr: MockQueryRunner): DataSource {
  return {
    createQueryRunner: jest.fn().mockReturnValue(qr),
  } as unknown as DataSource;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('runInTenantSchema — aislamiento de schema', () => {

  // -------------------------------------------------------------------------
  // 1. SET LOCAL search_path correcto para cada tenant
  // -------------------------------------------------------------------------

  it('emite SET LOCAL search_path con el schema correcto para tenant_a', async () => {
    const qr = buildMockQueryRunner('result-a');
    const ds = buildDataSource(qr);

    await runInTenantSchema(ds, 'tenant_a', async () => 'result-a');

    expect(qr.query).toHaveBeenCalledWith('SET LOCAL search_path TO "tenant_a"');
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.release).toHaveBeenCalledTimes(1);
  });

  it('emite SET LOCAL search_path con el schema correcto para tenant_b', async () => {
    const qr = buildMockQueryRunner('result-b');
    const ds = buildDataSource(qr);

    await runInTenantSchema(ds, 'tenant_b', async () => 'result-b');

    expect(qr.query).toHaveBeenCalledWith('SET LOCAL search_path TO "tenant_b"');
  });

  it('dos llamadas secuenciales no contaminan el search_path entre si', async () => {
    const qrA = buildMockQueryRunner('result-a');
    const qrB = buildMockQueryRunner('result-b');
    // DataSource devuelve qrA en la primera llamada y qrB en la segunda
    const ds = {
      createQueryRunner: jest.fn().mockReturnValueOnce(qrA).mockReturnValueOnce(qrB),
    } as unknown as DataSource;

    await runInTenantSchema(ds, 'tenant_a', async () => 'result-a');
    await runInTenantSchema(ds, 'tenant_b', async () => 'result-b');

    // qrA nunca debe haber visto el search_path de tenant_b
    const queriesA = qrA.queries.join(' ');
    expect(queriesA).toContain('tenant_a');
    expect(queriesA).not.toContain('tenant_b');

    // qrB nunca debe haber visto el search_path de tenant_a
    const queriesB = qrB.queries.join(' ');
    expect(queriesB).toContain('tenant_b');
    expect(queriesB).not.toContain('tenant_a');
  });

  // -------------------------------------------------------------------------
  // 2. Rechazo de nombres invalidos ANTES de cualquier SQL (SQL injection prevention)
  // -------------------------------------------------------------------------

  const invalidSchemas = [
    'public',
    'information_schema',
    'pg_catalog',
    'tenant_; DROP SCHEMA tenant_test --',
    'tenant with spaces',
    'TENANT_UPPER',
    'other_prefix',
    '',
    'tenant_', // prefix sin nombre
  ];

  it.each(invalidSchemas)(
    'rechaza schema invalido "%s" sin emitir SQL',
    async (badSchema) => {
      const qr = buildMockQueryRunner();
      const ds = buildDataSource(qr);

      await expect(runInTenantSchema(ds, badSchema, async () => null)).rejects.toThrow(
        /schema name invalido/i,
      );

      // No debe haber creado ningun QueryRunner — la validacion ocurre antes
      expect(ds.createQueryRunner as jest.Mock).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // 3. Rollback + release cuando el callback lanza un error
  // -------------------------------------------------------------------------

  it('llama rollbackTransaction y release cuando el callback lanza un error', async () => {
    const qr = buildMockQueryRunner();
    const ds = buildDataSource(qr);

    const callbackError = new Error('error simulado en callback');

    await expect(
      runInTenantSchema(ds, 'tenant_test', async () => {
        throw callbackError;
      }),
    ).rejects.toThrow('error simulado en callback');

    // rollback obligatorio ante error
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    // release siempre en finally
    expect(qr.release).toHaveBeenCalledTimes(1);
    // commit NO debe haberse llamado
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });

  it('propaga el error original al caller tras rollback', async () => {
    const qr = buildMockQueryRunner();
    const ds = buildDataSource(qr);

    const originalError = new Error('error original');

    const thrown = await runInTenantSchema(ds, 'tenant_xyz', async () => {
      throw originalError;
    }).catch((e: unknown) => e);

    expect(thrown).toBe(originalError); // misma referencia
  });

  // -------------------------------------------------------------------------
  // 4. Llamadas concurrentes usan QueryRunners independientes
  // -------------------------------------------------------------------------

  it('llamadas concurrentes usan QueryRunners independientes sin contaminacion', async () => {
    const qrA = buildMockQueryRunner('result-a');
    const qrB = buildMockQueryRunner('result-b');
    let callCount = 0;

    const ds = {
      createQueryRunner: jest.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? qrA : qrB;
      }),
    } as unknown as DataSource;

    const [resA, resB] = await Promise.all([
      runInTenantSchema(ds, 'tenant_alpha', async () => 'result-a'),
      runInTenantSchema(ds, 'tenant_beta', async () => 'result-b'),
    ]);

    expect(resA).toBe('result-a');
    expect(resB).toBe('result-b');

    // Cada QueryRunner debe haber recibido solo su propio search_path
    expect(qrA.queries.some((q: string) => q.includes('tenant_alpha'))).toBe(true);
    expect(qrA.queries.some((q: string) => q.includes('tenant_beta'))).toBe(false);

    expect(qrB.queries.some((q: string) => q.includes('tenant_beta'))).toBe(true);
    expect(qrB.queries.some((q: string) => q.includes('tenant_alpha'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5. isValidSchemaName — validacion de nombres de schema
  // -------------------------------------------------------------------------

  describe('isValidSchemaName()', () => {
    const validCases = [
      'tenant_a',
      'tenant_abc',
      'tenant_mi_isp_colombia',
      'tenant_abc123', // letras despues del prefijo, digitos validos en posicion no inicial
    ];

    it.each(validCases)('acepta schema valido: "%s"', (schema) => {
      expect(isValidSchemaName(schema)).toBe(true);
    });

    const invalidCases = [
      ['public', 'schema del sistema'],
      ['tenant_', 'prefijo sin nombre'],
      ['tenant_A', 'mayusculas'],
      ['tenant_-bad', 'guion en lugar de guion_bajo'],
      ['other_tenant', 'prefijo incorrecto'],
      ['', 'cadena vacia'],
    ];

    it.each(invalidCases)('rechaza schema invalido: "%s" (%s)', (schema) => {
      expect(isValidSchemaName(schema)).toBe(false);
    });
  });
});
