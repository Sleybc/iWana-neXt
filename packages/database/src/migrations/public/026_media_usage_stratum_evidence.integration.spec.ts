import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { MediaUsageStratumEvidence1784419214000 } from './026_media_usage_stratum_evidence';

/**
 * Ejercita la 026 sobre PostgreSQL real.
 *
 * La migración opera sobre `public.media_assets`, con esquema fijo como la 020. Por eso
 * toda la prueba corre dentro de UNA transacción que termina siempre en ROLLBACK, y cada
 * caso vuelve al estado inicial con SAVEPOINT: no queda ningún cambio en la base. Si la
 * tabla no existe se crea dentro de esa transacción; si existe, su CHECK se fija al estado
 * previo (020) dentro de la misma transacción.
 *
 * `pnpm --filter @iwana/db test:integration` con `IWANA_DB_INTEGRATION_AVAILABLE=true`.
 */

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
    'Integración 026: DB_NAME no es una base de integración propia (test o iwana_it_*). ' +
      'La prueba transacciona sobre public.media_assets y no se ejecuta contra la base de desarrollo.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) {
    throw new Error('QueryRunner de integración no inicializado.');
  }
  return runner;
}

/** Fija `public.media_assets` al estado previo a la 026 dentro de la transacción de la prueba. */
async function ensureFixture(runner: QueryRunner): Promise<void> {
  const present = (await runner.query(
    `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
  )) as Array<{ present: boolean }>;

  if (present[0]?.present !== true) {
    // Mismo DDL base que la 008, con solo las columnas que usan estas sentencias.
    await runner.query(`
      CREATE TABLE "public"."media_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_schema" varchar(63) NOT NULL,
        "usage" varchar(30) NOT NULL DEFAULT 'general',
        "theme_variant" varchar(10) NULL,
        "original_filename" varchar(255) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "ext" varchar(20) NOT NULL,
        "size_bytes" integer NOT NULL,
        "object_key" varchar(500) NOT NULL,
        "public_url" varchar(1000) NULL,
        "uploaded_by_user_id" varchar(36) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "pk_media_assets" PRIMARY KEY ("id"),
        CONSTRAINT "uq_media_assets_object_key" UNIQUE ("object_key"),
        CONSTRAINT "chk_media_assets_size_positive" CHECK ("size_bytes" > 0)
      )
    `);
  }

  await runner.query(
    `ALTER TABLE "public"."media_assets" DROP CONSTRAINT IF EXISTS "chk_media_assets_usage"`,
  );
  await runner.query(`
    ALTER TABLE "public"."media_assets"
    ADD CONSTRAINT "chk_media_assets_usage" CHECK (
      "usage" IN ('logo', 'seal', 'favicon', 'login_background', 'general', 'execution_evidence')
    )
  `);
}

async function constraintDefinition(runner: QueryRunner): Promise<string> {
  const rows = (await runner.query(
    `SELECT pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = 'public.media_assets'::regclass
       AND conname = 'chk_media_assets_usage'`,
  )) as Array<{ definition: string }>;

  return rows[0]?.definition ?? '';
}

async function usageOf(runner: QueryRunner, id: string): Promise<string | null> {
  const rows = (await runner.query(`SELECT usage FROM "public"."media_assets" WHERE id = $1`, [
    id,
  ])) as Array<{ usage: string }>;

  return rows[0]?.usage ?? null;
}

async function insertAsset(runner: QueryRunner, usage: string, deleted = false): Promise<string> {
  const id = randomUUID();

  await runner.query(
    `INSERT INTO "public"."media_assets"
       ("id", "tenant_schema", "usage", "original_filename", "mime_type", "ext",
        "size_bytes", "object_key", "deleted_at")
     VALUES ($1, 'platform', $2, 'soporte.pdf', 'application/pdf', 'pdf', 1024, $3, $4)`,
    [id, usage, `platform/${usage}/${id}.pdf`, deleted ? new Date().toISOString() : null],
  );

  return id;
}

/**
 * Comprueba que una escritura falla sin abortar la transacción de la prueba: el fallo
 * de PostgreSQL deja la transacción inutilizable hasta volver a un SAVEPOINT.
 */
async function expectRejectedWrite(
  runner: QueryRunner,
  write: () => Promise<unknown>,
): Promise<void> {
  await runner.query('SAVEPOINT expected_rejection');
  try {
    await expect(write()).rejects.toThrow();
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await runner.query('RELEASE SAVEPOINT expected_rejection');
  }
}

describeWithDb('Migración 026 — uso stratum_evidence en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new MediaUsageStratumEvidence1784419214000();

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

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await ensureFixture(runner);
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
        await dataSource.destroy();
      }
    }
  });

  it('up admite stratum_evidence, conserva execution_evidence y rechaza valores ajenos', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () => insertAsset(active, 'stratum_evidence'));

    await migration.up(active);

    const stratumId = await insertAsset(active, 'stratum_evidence');
    const executionId = await insertAsset(active, 'execution_evidence');
    expect(await usageOf(active, stratumId)).toBe('stratum_evidence');
    expect(await usageOf(active, executionId)).toBe('execution_evidence');
    await expectRejectedWrite(active, () => insertAsset(active, 'bogus'));
  });

  it('up es idempotente: una segunda pasada no cambia el CHECK', async () => {
    const active = requireRunner(runner);

    await migration.up(active);
    const first = await constraintDefinition(active);
    await migration.up(active);

    expect(first).toContain('stratum_evidence');
    expect(await constraintDefinition(active)).toBe(first);
  });

  it('up aborta sin tocar el CHECK si su definición previa no es la de la 020', async () => {
    const active = requireRunner(runner);
    await active.query(
      `ALTER TABLE "public"."media_assets" DROP CONSTRAINT "chk_media_assets_usage"`,
    );
    await active.query(`
      ALTER TABLE "public"."media_assets"
      ADD CONSTRAINT "chk_media_assets_usage" CHECK ("usage" IN ('logo', 'general')) NOT VALID
    `);
    const before = await constraintDefinition(active);

    await expect(migration.up(active)).rejects.toThrow(/definición incompatible/u);
    expect(await constraintDefinition(active)).toBe(before);
  });

  it('down aborta con filas stratum_evidence, sin borrarlas ni alterar el CHECK', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    const stratumId = await insertAsset(active, 'stratum_evidence');
    const before = await constraintDefinition(active);

    await expect(migration.down(active)).rejects.toThrow(
      /existen 1 asset\(s\) con usage = 'stratum_evidence'/u,
    );
    expect(await usageOf(active, stratumId)).toBe('stratum_evidence');
    expect(await constraintDefinition(active)).toBe(before);
  });

  it('down aborta también con filas stratum_evidence eliminadas lógicamente', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    const deletedId = await insertAsset(active, 'stratum_evidence', true);

    await expect(migration.down(active)).rejects.toThrow(/eliminados lógicamente/u);
    expect(await usageOf(active, deletedId)).toBe('stratum_evidence');
  });

  it('down restaura el CHECK de la 020 y conserva las demás filas sin stratum_evidence', async () => {
    const active = requireRunner(runner);
    const generalId = await insertAsset(active, 'general');
    const executionId = await insertAsset(active, 'execution_evidence');
    await migration.up(active);

    await migration.down(active);

    expect(await constraintDefinition(active)).not.toContain('stratum_evidence');
    await expectRejectedWrite(active, () => insertAsset(active, 'stratum_evidence'));
    expect(await usageOf(active, generalId)).toBe('general');
    expect(await usageOf(active, executionId)).toBe('execution_evidence');
  });

  it('up/down/up completa el ciclo sin pérdida de filas', async () => {
    const active = requireRunner(runner);
    const generalId = await insertAsset(active, 'general');

    await migration.up(active);
    await migration.down(active);
    await migration.up(active);

    expect(await usageOf(active, generalId)).toBe('general');
    const stratumId = await insertAsset(active, 'stratum_evidence');
    expect(await usageOf(active, stratumId)).toBe('stratum_evidence');
  });
});
