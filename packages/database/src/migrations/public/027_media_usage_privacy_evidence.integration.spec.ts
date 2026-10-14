import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { MediaUsagePrivacyEvidence1784419215000 } from './027_media_usage_privacy_evidence';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 027: DB_NAME debe ser test o iwana_it_*; la prueba modifica public.media_assets dentro de una transacción.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

async function ensureFixture(runner: QueryRunner): Promise<void> {
  const present = (await runner.query(
    `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
  )) as Array<{ present: boolean }>;

  if (present[0]?.present !== true) {
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
      "usage" IN ('logo', 'seal', 'favicon', 'login_background', 'general',
        'execution_evidence', 'stratum_evidence')
    )
  `);
}

async function insertAsset(runner: QueryRunner, usage: string, deleted = false): Promise<string> {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO "public"."media_assets"
       ("id", "tenant_schema", "usage", "original_filename", "mime_type", "ext",
        "size_bytes", "object_key", "deleted_at")
     VALUES ($1, 'tenant_privacy_fixture', $2, 'fixture.pdf', 'application/pdf', 'pdf', 1024, $3, $4)`,
    [id, usage, `tenant_privacy_fixture/${usage}/${id}.pdf`, deleted ? new Date() : null],
  );
  return id;
}

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

describeWithDb('Migración 027 — uso privacy_evidence en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new MediaUsagePrivacyEvidence1784419215000();

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
          if (runner.isTransactionActive) await runner.rollbackTransaction();
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy();
    }
  });

  it('up admite privacy_evidence y conserva los usos existentes', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () => insertAsset(active, 'privacy_evidence'));

    await migration.up(active);

    await expect(insertAsset(active, 'privacy_evidence')).resolves.toEqual(expect.any(String));
    await expect(insertAsset(active, 'stratum_evidence')).resolves.toEqual(expect.any(String));
    await expectRejectedWrite(active, () => insertAsset(active, 'unknown_usage'));
  });

  it('up es idempotente y down rechaza evidencia existente aunque esté eliminada lógicamente', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    await migration.up(active);
    await insertAsset(active, 'privacy_evidence', true);

    await expect(migration.down(active)).rejects.toThrow(
      /existen 1 asset\(s\) con usage = 'privacy_evidence'/u,
    );
  });

  it('down restaura el CHECK de la 026 sin eliminar ni reasignar datos', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    const id = await insertAsset(active, 'privacy_evidence');
    await active.query(`DELETE FROM "public"."media_assets" WHERE id = $1`, [id]);

    await migration.down(active);

    await expectRejectedWrite(active, () => insertAsset(active, 'privacy_evidence'));
    await expect(insertAsset(active, 'stratum_evidence')).resolves.toEqual(expect.any(String));
  });
});
