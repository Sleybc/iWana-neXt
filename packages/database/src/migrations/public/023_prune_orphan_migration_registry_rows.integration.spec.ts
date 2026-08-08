import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import {
  LEGACY_ORPHAN_MIGRATION_NAMES,
  PruneOrphanMigrationRegistryRows1784419211000,
} from './023_prune_orphan_migration_registry_rows';

/**
 * Ejercita la rama de BORRADO de la 023 sobre PostgreSQL real, que el bootstrap
 * limpio del 2026-08-06 no pudo ejercitar (registro vacío → corrió como no-op).
 *
 * Complementa la evidencia estática de `023_….spec.ts` (doble del QueryRunner)
 * con una prueba de idempotencia real: inserta las siete filas legacy sintéticas
 * de la lista cerrada, ejecuta el `up()` y verifica que informa cuántas retiró
 * y que las retira; lo vuelve a ejecutar y verifica que la segunda pasada no
 * encuentra nada. Todo dentro de una transacción con rollback: no ensucia el
 * registro real de `public.typeorm_migrations` (ni siquiera el `id` — se
 * insertan ids explícitos altos para no consumir la secuencia).
 *
 * `pnpm --filter @iwana/db test:integration`. Sin DB alcanzable,
 * `test/integration-db-probe.js` deja `IWANA_DB_INTEGRATION_AVAILABLE !== 'true'`
 * y esta suite hace `describe.skip` con warning (no verde silencioso).
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  console.warn(
    '[023-integration] describe.skip activo — sin PostgreSQL real; la rama de borrado de la 023 no se valida contra una base.',
  );
}

/**
 * Ids explícitos y altos para las filas sintéticas: fuera del rango del registro
 * real y, al ir en una transacción con rollback, ni siquiera tocan la secuencia.
 */
const SYNTHETIC_ID_BASE = 9_000_000;

describeWithDb('023 prune orphan migration registry rows — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  const legacyNames = [...LEGACY_ORPHAN_MIGRATION_NAMES];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    runner = dataSource.createQueryRunner();
    await runner.connect();
  });

  afterAll(async () => {
    if (runner) {
      await runner.release();
    }

    if (!dataSource?.isInitialized) return;
    await dataSource.destroy();
  });

  async function countRows(): Promise<number> {
    const rows = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM "public"."typeorm_migrations"`,
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async function countLegacyRows(): Promise<number> {
    const rows = (await runner.query(
      `SELECT COUNT(*)::int AS total
       FROM "public"."typeorm_migrations"
       WHERE "name" = ANY($1::text[])`,
      [legacyNames],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  it('up retira las filas legacy sintéticas, informa cuántas y es idempotente', async () => {
    // Precondición: el registro real no contiene ya nombres legacy (un entorno
    // con residuo real falsearía el conteo de la primera pasada).
    expect(await countLegacyRows()).toBe(0);

    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const totalBefore = await countRows();

      await runner.startTransaction();
      try {
        // Filas legacy sintéticas — placeholders, sin datos reales.
        for (const [index, name] of legacyNames.entries()) {
          await runner.query(
            `INSERT INTO "public"."typeorm_migrations" ("id", "timestamp", "name")
             VALUES ($1, $2, $3)`,
            [SYNTHETIC_ID_BASE + index, 1_700_000_000_000 + index, name],
          );
        }

        expect(await countLegacyRows()).toBe(legacyNames.length);
        expect(await countRows()).toBe(totalBefore + legacyNames.length);

        // Primera pasada: borra las siete y lo informa.
        const migration = new PruneOrphanMigrationRegistryRows1784419211000();
        await migration.up(runner);

        const removedMessage = stderr.mock.calls.map((call) => String(call[0])).join('');
        expect(removedMessage).toContain(`retiradas ${legacyNames.length} fila(s)`);
        expect(removedMessage).toContain('legacy huérfana(s)');

        expect(await countLegacyRows()).toBe(0);
        expect(await countRows()).toBe(totalBefore);

        // Segunda pasada: idempotente — nada que retirar, sin error.
        stderr.mockClear();
        await migration.up(runner);

        const secondMessage = stderr.mock.calls.map((call) => String(call[0])).join('');
        expect(secondMessage).toContain('no hay filas legacy huérfanas');
        expect(secondMessage).not.toContain('retiradas');

        expect(await countLegacyRows()).toBe(0);
        expect(await countRows()).toBe(totalBefore);

        await runner.rollbackTransaction();
      } catch (error) {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
        throw error;
      }
    } finally {
      stderr.mockRestore();
    }
  });
});
