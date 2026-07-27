import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import {
  dropInvalidIndexIfExists,
  PAGINATION_INDEX_NAMES,
  PaginationOrderingIndexes0890000000000,
  verifyPaginationIndexes,
} from './089_pagination_ordering_indexes';

/**
 * Test de INTEGRACIÓN de la migración 089 contra un PostgreSQL real.
 *
 * ## Por qué existe (hallazgo A-2, INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0)
 *
 * `089_pagination_ordering_indexes.spec.ts` ejercita la migración contra un
 * `QueryRunner` mockeado: registra la cadena SQL emitida, no la ejecuta. Eso
 * deja dos defectos históricos sin red de regresión:
 *
 * - **BL-1** — la versión original envolvía la limpieza de índices INVALID en un
 *   bloque `DO $$ ... $$` que contenía `$1`. Dentro de dollar-quoting, `$1` no es
 *   un bind parameter sino texto, así que el driver enviaba un parámetro para una
 *   sentencia preparada que declaraba cero: PostgreSQL respondía
 *   `bind message supplies 1 parameters, but prepared statement requires 0`.
 *   Es un error de **runtime del servidor**: ningún mock puede detectarlo, porque
 *   el mock nunca prepara ni ejecuta la sentencia. El test
 *   «up() se ejecuta … sin lanzar» de este fichero muere en el acto si alguien
 *   reintroduce ese patrón.
 *
 * - **D-1** — `verifyPaginationIndexes` y `dropInvalidIndexIfExists` consultaban
 *   `pg_index` sin filtrar por `current_schema()`. Los nombres de índice son
 *   únicos por schema, no por base: en una base multi-tenant la verificación
 *   contaba los `idx_pag_*` de TODOS los tenants y daba falsos positivos. Los
 *   tests unitarios solo comprueban que la cadena SQL contiene `pg_namespace` y
 *   `current_schema()`; eso no distingue una consulta distinta e igualmente mal
 *   filtrada. Aquí se comprueba por **resultado**: se planta un índice señuelo en
 *   otro schema y se exige que la verificación no lo vea.
 *
 * ## Cómo se ejecuta
 *
 * `pnpm --filter @iwana/db test:integration`. Si no hay PostgreSQL alcanzable,
 * `test/integration-db-probe.js` (globalSetup) publica la bandera en
 * `IWANA_DB_INTEGRATION_AVAILABLE` y esta suite se omite con un banner en
 * consola — nunca en silencio, y nunca declarándose verde sin haber ejecutado.
 *
 * ## Restricciones de infraestructura
 *
 * La migración declara `transactional = false` y usa `CREATE/DROP INDEX
 * CONCURRENTLY`, que PostgreSQL prohíbe dentro de una transacción. Por eso los
 * `QueryRunner` de esta suite nunca abren transacción y el `search_path` se fija
 * con `SET` de sesión (no `SET LOCAL`), sobre la conexión fijada por el propio
 * `QueryRunner`. La conexión es directa al servidor, no vía pgBouncer.
 *
 * ## Schemas efímeros
 *
 * - `it_089_a` — las 16 tablas mínimas; recibe `up()` / `down()` reales.
 * - `it_089_b` — solo `visit_requests` + un índice señuelo `idx_pag_*`: es el
 *   schema desde el que se comprueba el aislamiento de D-1.
 * - `it_089_c` — laboratorio de índices INVALID reales para
 *   `dropInvalidIndexIfExists`.
 *
 * Los tres se eliminan con `DROP SCHEMA ... CASCADE` en `afterAll`.
 */

const SCHEMA_MIGRATED = 'it_089_a';
const SCHEMA_DECOY = 'it_089_b';
const SCHEMA_INVALID_LAB = 'it_089_c';
const ALL_SCHEMAS = [SCHEMA_MIGRATED, SCHEMA_DECOY, SCHEMA_INVALID_LAB];

/** Índice señuelo plantado en `it_089_b` para la prueba anti-D-1. */
const DECOY_INDEX = 'idx_pag_visit_requests_created_id';

/** Nombre INVALID que SÍ está en la whitelist de la migración. */
const INVALID_WHITELISTED = 'idx_pag_stock_counts_created_id';

/** Nombre INVALID que NO está en la whitelist: `dropInvalidIndexIfExists` debe rechazarlo. */
const INVALID_NOT_WHITELISTED = 'idx_pag_intruso_fuera_de_whitelist';

/**
 * Tablas mínimas del schema migrado: solo las columnas que tocan los 17 índices
 * del inventario del docblock de la migración. No se replica el esquema real de
 * cada módulo — un índice no necesita más que sus columnas y tipos compatibles.
 */
const MINIMAL_TABLES: ReadonlyArray<{ table: string; columns: string }> = [
  { table: 'inventory_items', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'stock_balances', columns: 'id uuid PRIMARY KEY, updated_at timestamptz NOT NULL' },
  { table: 'serialized_assets', columns: 'id uuid PRIMARY KEY, updated_at timestamptz NOT NULL' },
  { table: 'stock_locations', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'purchase_requests', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'subscribers', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'supplier_profiles', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  {
    table: 'inventory_write_offs',
    columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL',
  },
  { table: 'asset_loan_assignments', columns: 'id uuid PRIMARY KEY, installed_at timestamptz' },
  {
    table: 'catalog_items',
    columns:
      'id uuid PRIMARY KEY, updated_at timestamptz NOT NULL, is_active boolean NOT NULL DEFAULT true, name varchar(300) NOT NULL, deleted_at timestamptz',
  },
  { table: 'audit_logs', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'stock_issues', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'stock_counts', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'visit_requests', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  { table: 'support_tickets', columns: 'id uuid PRIMARY KEY, created_at timestamptz NOT NULL' },
  {
    table: 'stock_movements',
    columns:
      'id uuid PRIMARY KEY, created_at timestamptz NOT NULL, movement_number varchar(60) NOT NULL',
  },
];

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';

if (!dbAvailable) {
  // Ruidoso a propósito: una omisión silenciosa aquí equivale a no tener red.
  console.warn(
    '[089-integration] describe.skip activo — sin PostgreSQL alcanzable, BL-1 y D-1 quedan sin cobertura de runtime.',
  );
}

const describeWithDb = dbAvailable ? describe : describe.skip;

interface IndexCatalogRow {
  index_name: string;
  is_valid: boolean;
}

/** Lee el catálogo real de índices de un schema concreto, sin pasar por la migración. */
async function readIndexCatalog(
  queryRunner: QueryRunner,
  schemaName: string,
): Promise<IndexCatalogRow[]> {
  return (await queryRunner.query(
    `SELECT c.relname AS index_name, i.indisvalid AS is_valid
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname LIKE 'idx_pag_%'
     ORDER BY c.relname`,
    [schemaName],
  )) as IndexCatalogRow[];
}

/**
 * Deja un índice en estado INVALID de forma determinista.
 *
 * `CREATE UNIQUE INDEX CONCURRENTLY` sobre datos con duplicados falla en el
 * escaneo y PostgreSQL conserva el índice marcado `indisvalid = false`
 * (documentado en CREATE INDEX, sección CONCURRENTLY). Es la única forma
 * reproducible de reproducir el escenario que motivó `dropInvalidIndexIfExists`.
 */
async function seedInvalidIndex(
  queryRunner: QueryRunner,
  schemaName: string,
  indexName: string,
): Promise<void> {
  try {
    await queryRunner.query(
      `CREATE UNIQUE INDEX CONCURRENTLY "${indexName}" ON stock_counts (created_at DESC, id DESC)`,
    );
  } catch {
    // Esperado: la violación de unicidad es justo lo que deja el índice INVALID.
  }

  const rows = await readIndexCatalog(queryRunner, schemaName);
  const seeded = rows.find((row) => row.index_name === indexName);
  if (!seeded || seeded.is_valid !== false) {
    throw new Error(
      `[089-integration] No se pudo dejar "${indexName}" en estado INVALID; ` +
        'la premisa del test de dropInvalidIndexIfExists ya no se cumple.',
    );
  }
}

describeWithDb('089 pagination ordering indexes — integración contra PostgreSQL real', () => {
  const migration = new PaginationOrderingIndexes0890000000000();

  let dataSource: DataSource;
  let runnerMigrated: QueryRunner;
  let runnerDecoy: QueryRunner;
  let runnerInvalidLab: QueryRunner;

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
      extra: {
        max: 5,
        min: 1,
        connectionTimeoutMillis: 5_000,
      },
    });

    await dataSource.initialize();

    // Limpieza defensiva por si una corrida anterior murió antes del afterAll.
    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      for (const schema of ALL_SCHEMAS) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      }
    } finally {
      await bootstrap.release();
    }

    // Un QueryRunner por schema: connect() fija la conexión, así que el
    // `SET search_path` de sesión sobrevive a todas sus queries. Sin
    // startTransaction(): CREATE INDEX CONCURRENTLY no admite transacción.
    runnerMigrated = dataSource.createQueryRunner();
    await runnerMigrated.connect();
    await runnerMigrated.query(`SET search_path TO "${SCHEMA_MIGRATED}"`);
    for (const { table, columns } of MINIMAL_TABLES) {
      await runnerMigrated.query(`CREATE TABLE "${table}" (${columns})`);
    }

    runnerDecoy = dataSource.createQueryRunner();
    await runnerDecoy.connect();
    await runnerDecoy.query(`SET search_path TO "${SCHEMA_DECOY}"`);
    await runnerDecoy.query(
      `CREATE TABLE "visit_requests" (id uuid PRIMARY KEY, created_at timestamptz NOT NULL)`,
    );
    await runnerDecoy.query(
      `CREATE INDEX "${DECOY_INDEX}" ON visit_requests (created_at DESC, id ASC)`,
    );

    runnerInvalidLab = dataSource.createQueryRunner();
    await runnerInvalidLab.connect();
    await runnerInvalidLab.query(`SET search_path TO "${SCHEMA_INVALID_LAB}"`);
    await runnerInvalidLab.query(
      `CREATE TABLE "stock_counts" (id uuid NOT NULL, created_at timestamptz NOT NULL)`,
    );
    // Dos filas idénticas: cualquier índice único sobre (created_at, id) fallará.
    await runnerInvalidLab.query(
      `INSERT INTO stock_counts (id, created_at) VALUES
         ('11111111-1111-1111-1111-111111111111', TIMESTAMPTZ '2026-01-01 00:00:00+00'),
         ('11111111-1111-1111-1111-111111111111', TIMESTAMPTZ '2026-01-01 00:00:00+00')`,
    );
    await seedInvalidIndex(runnerInvalidLab, SCHEMA_INVALID_LAB, INVALID_WHITELISTED);
    await seedInvalidIndex(runnerInvalidLab, SCHEMA_INVALID_LAB, INVALID_NOT_WHITELISTED);
  });

  afterAll(async () => {
    for (const runner of [runnerMigrated, runnerDecoy, runnerInvalidLab]) {
      if (runner) {
        await runner.release();
      }
    }

    if (dataSource?.isInitialized) {
      const cleanup = dataSource.createQueryRunner();
      await cleanup.connect();
      try {
        for (const schema of ALL_SCHEMAS) {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        }
      } finally {
        await cleanup.release();
        await dataSource.destroy();
      }
    }
  });

  describe('up() contra un schema real', () => {
    it('no lanza al ejecutarse (anti BL-1: el error era de runtime de PostgreSQL)', async () => {
      // Este es el test que el mock no podía dar. Si alguien reintroduce un
      // `DO $$ ... $1 ... $$`, PostgreSQL responde «bind message supplies 1
      // parameters, but prepared statement requires 0» y esta línea revienta.
      await expect(migration.up(runnerMigrated)).resolves.toBeUndefined();
    });

    it('deja los 17 índices de paginación creados y válidos en el schema migrado', async () => {
      const result = await verifyPaginationIndexes(runnerMigrated);

      expect(result.invalid).toEqual([]);
      expect(result.missing).toEqual([]);
      expect(result.valid).toHaveLength(17);
      expect([...result.valid].sort()).toEqual([...PAGINATION_INDEX_NAMES].sort());
    });

    it('los 17 índices existen físicamente en el catálogo de PostgreSQL', async () => {
      // Verificación independiente de la propia migración: se consulta el
      // catálogo con una query escrita en el test, no con la de producción.
      const rows = await readIndexCatalog(runnerMigrated, SCHEMA_MIGRATED);

      expect(rows).toHaveLength(17);
      expect(rows.every((row) => row.is_valid)).toBe(true);
    });

    it('es idempotente: una segunda ejecución mantiene 17/17 sin lanzar', async () => {
      await expect(migration.up(runnerMigrated)).resolves.toBeUndefined();

      const result = await verifyPaginationIndexes(runnerMigrated);
      expect(result.valid).toHaveLength(17);
      expect(result.invalid).toEqual([]);
      expect(result.missing).toEqual([]);
    });
  });

  describe('aislamiento por schema (anti D-1)', () => {
    it('verifyPaginationIndexes solo ve los índices del schema activo', async () => {
      // Estado del sistema en este punto:
      //   it_089_a → los 17 índices creados por up()
      //   it_089_b → exactamente 1 índice idx_pag_* (el señuelo)
      // Con el filtro `n.nspname = current_schema()`, desde it_089_b se ve 1 y
      // faltan 16. Sin el filtro, la consulta traería también los 17 de it_089_a
      // (y los de cualquier tenant real de la base), el conjunto `found` quedaría
      // completo y `missing` vendría vacío: el falso positivo exacto de D-1.
      const result = await verifyPaginationIndexes(runnerDecoy);

      expect(result.valid).toEqual([DECOY_INDEX]);
      expect(result.invalid).toEqual([]);
      expect(result.missing).toHaveLength(16);
      expect(result.missing).not.toContain(DECOY_INDEX);
    });

    it('dropInvalidIndexIfExists no toca un índice INVALID homónimo de otro schema', async () => {
      // it_089_c tiene `idx_pag_stock_counts_created_id` en estado INVALID.
      // Desde it_089_a el mismo nombre está VÁLIDO: la función no debe borrarlo,
      // porque su SELECT está acotado a current_schema().
      await dropInvalidIndexIfExists(runnerMigrated, INVALID_WHITELISTED);

      const migratedRows = await readIndexCatalog(runnerMigrated, SCHEMA_MIGRATED);
      expect(migratedRows.map((row) => row.index_name)).toContain(INVALID_WHITELISTED);

      const labRows = await readIndexCatalog(runnerInvalidLab, SCHEMA_INVALID_LAB);
      const stillInvalid = labRows.find((row) => row.index_name === INVALID_WHITELISTED);
      expect(stillInvalid?.is_valid).toBe(false);
    });
  });

  describe('dropInvalidIndexIfExists contra índices INVALID reales', () => {
    it('verifyPaginationIndexes reporta como INVALID los índices realmente rotos', async () => {
      const result = await verifyPaginationIndexes(runnerInvalidLab);

      expect(result.invalid).toContain(INVALID_WHITELISTED);
      expect(result.invalid).toContain(INVALID_NOT_WHITELISTED);
      expect(result.valid).toEqual([]);
    });

    it('lanza y NO borra cuando el nombre INVALID está fuera de la whitelist', async () => {
      await expect(
        dropInvalidIndexIfExists(runnerInvalidLab, INVALID_NOT_WHITELISTED),
      ).rejects.toThrow(`[089] index name not in whitelist: ${INVALID_NOT_WHITELISTED}`);

      const rows = await readIndexCatalog(runnerInvalidLab, SCHEMA_INVALID_LAB);
      expect(rows.map((row) => row.index_name)).toContain(INVALID_NOT_WHITELISTED);
    });

    it('elimina el índice INVALID cuando el nombre está en la whitelist', async () => {
      await dropInvalidIndexIfExists(runnerInvalidLab, INVALID_WHITELISTED);

      const rows = await readIndexCatalog(runnerInvalidLab, SCHEMA_INVALID_LAB);
      expect(rows.map((row) => row.index_name)).not.toContain(INVALID_WHITELISTED);
    });
  });

  describe('down() contra un schema real', () => {
    it('elimina los 17 índices del schema migrado', async () => {
      await expect(migration.down(runnerMigrated)).resolves.toBeUndefined();

      const result = await verifyPaginationIndexes(runnerMigrated);
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
      expect(result.missing).toHaveLength(17);
    });

    it('no toca los índices de otros schemas', async () => {
      // Complemento del anti-D-1: down() usa nombres sin calificar, así que su
      // alcance también depende del search_path de la conexión.
      const decoyRows = await readIndexCatalog(runnerDecoy, SCHEMA_DECOY);
      expect(decoyRows.map((row) => row.index_name)).toEqual([DECOY_INDEX]);
    });

    it('es idempotente: una segunda ejecución no lanza', async () => {
      await expect(migration.down(runnerMigrated)).resolves.toBeUndefined();
    });

    it('up() vuelve a reconstruir los 17 índices tras el down()', async () => {
      await expect(migration.up(runnerMigrated)).resolves.toBeUndefined();

      const result = await verifyPaginationIndexes(runnerMigrated);
      expect(result.valid).toHaveLength(17);
      expect(result.missing).toEqual([]);
    });
  });
});
