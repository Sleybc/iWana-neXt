import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ContractStratumEvidenceUnique1450000000000 } from './145_contract_stratum_evidence_unique';

/**
 * Ejercita la 145 sobre PostgreSQL real, en un schema de tenant efímero.
 *
 * El fixture replica la forma que deja la 144 (`contracts.stratum_evidence_media_id`).
 * Cada caso corre dentro de la transacción de la prueba y vuelve al estado inicial con
 * SAVEPOINT; al final se hace ROLLBACK y se elimina el schema efímero.
 *
 * `pnpm --filter @iwana/db test:integration` con `IWANA_DB_INTEGRATION_AVAILABLE=true`.
 */

const SCHEMA = `tenant_mod05_stratum_${randomBytes(5).toString('hex')}`;
const INDEX_NAME = 'uq_contracts_stratum_evidence';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

/**
 * Solo la base de CI (`test`) o una base de integración propia (`iwana_it_*`). Nunca la
 * de desarrollo: `test/integration-db-probe.js` toma `DB_NAME` de `.env.development` si
 * nadie lo fija, y esa base no puede recibir esta prueba.
 */
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 145: DB_NAME no es una base de integración propia (test o iwana_it_*). ' +
      'La prueba no se ejecuta contra la base de desarrollo.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) {
    throw new Error('QueryRunner de integración no inicializado.');
  }
  return runner;
}

async function insertContract(runner: QueryRunner, mediaId: string | null): Promise<string> {
  const id = randomUUID();

  await runner.query(`INSERT INTO contracts (id, stratum_evidence_media_id) VALUES ($1, $2)`, [
    id,
    mediaId,
  ]);

  return id;
}

async function indexDefinition(runner: QueryRunner): Promise<string | undefined> {
  const rows = (await runner.query(
    `SELECT pg_get_indexdef(c.oid) AS definition
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [SCHEMA, INDEX_NAME],
  )) as Array<{ definition: string }>;

  return rows[0]?.definition;
}

async function contractCount(runner: QueryRunner): Promise<number> {
  const rows = (await runner.query(`SELECT COUNT(*)::int AS total FROM contracts`)) as Array<{
    total: number;
  }>;

  return rows[0]?.total ?? 0;
}

/**
 * Comprueba que una escritura falla sin abortar la transacción de la prueba: el fallo
 * de PostgreSQL deja la transacción inutilizable hasta volver a un SAVEPOINT.
 */
async function expectRejectedWrite(
  runner: QueryRunner,
  write: () => Promise<unknown>,
  message: RegExp,
): Promise<void> {
  await runner.query('SAVEPOINT expected_rejection');
  try {
    await expect(write()).rejects.toThrow(message);
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await runner.query('RELEASE SAVEPOINT expected_rejection');
  }
}

describeWithDb('Migración 145 — índice único del soporte de estrato en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new ContractStratumEvidenceUnique1450000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    // Forma que deja la 144: stratum_evidence_media_id uuid NULL en contracts.
    await runner.query(`
      CREATE TABLE contracts (
        id uuid PRIMARY KEY,
        stratum_evidence_media_id uuid NULL
      )
    `);
  });

  beforeEach(async () => {
    await requireRunner(runner).query('SAVEPOINT case_start');
  });

  afterEach(async () => {
    const active = requireRunner(runner);
    await active.query('ROLLBACK TO SAVEPOINT case_start');
    await active.query('RELEASE SAVEPOINT case_start');
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        try {
          if (runner.isTransactionActive) {
            await runner.rollbackTransaction();
          }
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    }
  });

  it('up sin duplicados crea el índice parcial y admite varios contratos sin soporte', async () => {
    const active = requireRunner(runner);
    const mediaId = randomUUID();
    await insertContract(active, mediaId);
    await insertContract(active, null);
    await insertContract(active, null);

    await migration.up(active);

    expect(await indexDefinition(active)).toMatch(
      /CREATE UNIQUE INDEX uq_contracts_stratum_evidence ON .*contracts USING btree \(stratum_evidence_media_id\) WHERE \(stratum_evidence_media_id IS NOT NULL\)/u,
    );
    await expectRejectedWrite(
      active,
      () => insertContract(active, mediaId),
      /uq_contracts_stratum_evidence/u,
    );
    await expect(insertContract(active, null)).resolves.toEqual(expect.any(String));
  });

  it('up aborta con el preflight si un asset respalda dos contratos y no crea el índice', async () => {
    const active = requireRunner(runner);
    const mediaId = randomUUID();
    const contractA = await insertContract(active, mediaId);
    const contractB = await insertContract(active, mediaId);

    const error = await migration.up(active).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/Migración 145 abortada: 1 asset\(s\) de soporte de estrato/u);
    expect(message).toContain(mediaId);
    expect(message).toContain(contractA);
    expect(message).toContain(contractB);
    expect(await indexDefinition(active)).toBeUndefined();
  });

  it('down elimina solo el índice sin tocar datos, y up lo vuelve a crear', async () => {
    const active = requireRunner(runner);
    await insertContract(active, randomUUID());
    await migration.up(active);

    await migration.down(active);

    expect(await indexDefinition(active)).toBeUndefined();
    expect(await contractCount(active)).toBe(1);

    await migration.up(active);
    expect(await indexDefinition(active)).toContain(INDEX_NAME);
  });

  it('falla con mensaje claro si la 144 no está aplicada y no emite DDL', async () => {
    const active = requireRunner(runner);
    await active.query(`ALTER TABLE contracts DROP COLUMN stratum_evidence_media_id`);

    await expect(migration.up(active)).rejects.toThrow(/144_vat_service_point/u);
    expect(await indexDefinition(active)).toBeUndefined();
  });
});
