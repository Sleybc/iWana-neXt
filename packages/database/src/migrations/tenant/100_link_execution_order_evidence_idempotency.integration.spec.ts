import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { LinkExecutionOrderEvidenceIdempotency1000000000000 } from './100_link_execution_order_evidence_idempotency';
import { AlignExecutionOrderEvidenceIntentRetention1010000000000 } from './101_align_execution_order_evidence_intent_retention';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const destructiveFlag = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const suffix = randomBytes(8).toString('hex');
const schemas = {
  retention: `it_100_retention_${suffix}`,
  isolation: `it_100_isolation_${suffix}`,
} as const;

type SchemaKey = keyof typeof schemas;

if (!dbAvailable) {
  console.warn(
    '[100-101-integration] describe.skip activo — sin PostgreSQL real; la retención de evidencia no se valida contra un schema.',
  );
}

/** DDL mínimo de las cinco tablas que toca la función de retención. */
const TABLE_DDL: Record<string, string> = {
  execution_order_idempotency_records: `
    CREATE TABLE execution_order_idempotency_records (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      operation VARCHAR(120) NOT NULL,
      key_id VARCHAR(40) NOT NULL,
      key_hmac CHAR(64) NOT NULL,
      payload_hmac CHAR(64) NOT NULL,
      intent_id UUID NOT NULL,
      resource_ref VARCHAR(160),
      result_code VARCHAR(64),
      result_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      resource_version INTEGER,
      expires_at TIMESTAMPTZ NOT NULL,
      tombstoned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_execution_order_idempotency_records PRIMARY KEY (id)
    )`,
  execution_order_evidence_upload_intents: `
    CREATE TABLE execution_order_evidence_upload_intents (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      execution_order_id UUID NOT NULL,
      tenant_id UUID NOT NULL,
      media_asset_id UUID,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ANALYSIS',
      expires_at TIMESTAMPTZ,
      actor_user_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_execution_order_evidence_upload_intents PRIMARY KEY (id),
      CONSTRAINT chk_execution_order_evidence_upload_intents_status CHECK (
        status IN ('PENDING', 'PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED', 'FAILED')
      )
    )`,
  execution_order_outbox_events: `
    CREATE TABLE execution_order_outbox_events (
      id UUID PRIMARY KEY,
      published_at TIMESTAMPTZ
    )`,
  execution_order_inbox_events: `
    CREATE TABLE execution_order_inbox_events (
      id UUID PRIMARY KEY,
      processed_at TIMESTAMPTZ
    )`,
  execution_order_audit_intents: `
    CREATE TABLE execution_order_audit_intents (
      id UUID PRIMARY KEY,
      delivered_at TIMESTAMPTZ
    )`,
};

async function insertIntent(
  runner: QueryRunner,
  id: string,
  expiresAtExpr: string,
  status = 'PENDING',
): Promise<void> {
  await runner.query(
    `INSERT INTO execution_order_evidence_upload_intents
       (id, execution_order_id, tenant_id, status, expires_at)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), $2, ${expiresAtExpr})`,
    [id, status],
  );
}

async function insertRecord(
  runner: QueryRunner,
  params: {
    id: string;
    resourceRef?: string | null;
    evidenceIntentId?: string | null;
    resultStatus?: string;
    expiresAtExpr: string;
    tombstoned?: boolean;
    /** false = insert pre-100, cuando la columna aún no existe. */
    includeEvidenceColumn?: boolean;
  },
): Promise<void> {
  const includeEvidence = params.includeEvidenceColumn ?? true;
  const evidenceColumnSql = includeEvidence ? ', evidence_upload_intent_id' : '';
  const evidencePlaceholderSql = includeEvidence ? ', $3' : '';
  const resultStatusIndex = includeEvidence ? 4 : 3;
  const args = [
    params.id,
    params.resourceRef ?? null,
    ...(includeEvidence ? [params.evidenceIntentId ?? null] : []),
    params.resultStatus ?? 'SUCCESS',
  ];
  await runner.query(
    `INSERT INTO execution_order_idempotency_records
       (id, tenant_id, operation, key_id, key_hmac, payload_hmac, intent_id,
        resource_ref${evidenceColumnSql}, result_status, expires_at, tombstoned_at)
     VALUES ($1, gen_random_uuid(), 'execution.evidence.upload', 'key-1', 'hmac', 'payload',
        gen_random_uuid(), $2${evidencePlaceholderSql}, $${resultStatusIndex},
        ${params.expiresAtExpr}, ${params.tombstoned ? 'NOW()' : 'NULL'})`,
    args,
  );
}

async function runPurge(runner: QueryRunner): Promise<{
  idempotency_records_deleted: number;
  evidence_upload_intents_deleted: number;
}> {
  const rows = (await runner.query(
    `SELECT idempotency_records_deleted, outbox_events_deleted, inbox_events_deleted,
            audit_intents_deleted, evidence_upload_intents_deleted
     FROM purge_execution_order_retention_batch(500)`,
  )) as Array<{
    idempotency_records_deleted: string;
    outbox_events_deleted: string;
    inbox_events_deleted: string;
    audit_intents_deleted: string;
    evidence_upload_intents_deleted: string;
  }>;
  const row = rows[0];
  if (!row) throw new Error('La función de retención no devolvió fila');
  return {
    idempotency_records_deleted: Number(row.idempotency_records_deleted),
    evidence_upload_intents_deleted: Number(row.evidence_upload_intents_deleted),
  };
}

async function intentExists(runner: QueryRunner, id: string): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT EXISTS (SELECT 1 FROM execution_order_evidence_upload_intents WHERE id = $1) AS present`,
    [id],
  )) as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}

async function recordExists(runner: QueryRunner, id: string): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT EXISTS (SELECT 1 FROM execution_order_idempotency_records WHERE id = $1) AS present`,
    [id],
  )) as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}

async function withDestructiveFlag<T>(operation: () => Promise<T>): Promise<T> {
  process.env[destructiveFlag] = 'true';
  try {
    return await operation();
  } finally {
    delete process.env[destructiveFlag];
  }
}

describeWithDb('100-101 retención durable de evidencia de OT — PostgreSQL real', () => {
  let dataSource: DataSource;
  const runners = new Map<SchemaKey, QueryRunner>();
  const originalFlag = process.env[destructiveFlag];

  // Fixtures de backfill (100): ids fijos, datos ficticios.
  const legacyIntentA = '10000000-0000-4000-8000-00000000000a';
  const legacyIntentB = '10000000-0000-4000-8000-00000000000b';
  const recordLegacyA = '10000000-0000-4000-8000-00000000001a';
  const recordBadRefA = '10000000-0000-4000-8000-00000000001b';
  const recordCrossSchemaB = '10000000-0000-4000-8000-00000000001c';
  const recordLegacyB = '10000000-0000-4000-8000-00000000001d';
  const recordBadRefB = '10000000-0000-4000-8000-00000000001e';

  async function runnerFor(key: SchemaKey): Promise<QueryRunner> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schemas[key]}"`);
    runners.set(key, runner);
    return runner;
  }

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
      extra: { max: 5, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      for (const schema of Object.values(schemas)) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      }
    } finally {
      await bootstrap.release();
    }

    for (const key of ['retention', 'isolation'] as const) {
      const runner = await runnerFor(key);
      for (const ddl of Object.values(TABLE_DDL)) {
        await runner.query(ddl);
      }
    }

    // Fixtures de backfill ANTES de 100.up (la columna aún no existe).
    const retention = runners.get('retention');
    const isolation = runners.get('isolation');
    if (!retention || !isolation) throw new Error('Expected two PostgreSQL query runners');

    await insertIntent(retention, legacyIntentA, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(retention, {
      id: recordLegacyA,
      resourceRef: legacyIntentA,
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
      includeEvidenceColumn: false,
    });
    await insertRecord(retention, {
      id: recordBadRefA,
      resourceRef: 'referencia-legacy-no-uuid',
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
      includeEvidenceColumn: false,
    });

    await insertIntent(isolation, legacyIntentB, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(isolation, {
      id: recordCrossSchemaB,
      resourceRef: legacyIntentA, // intent que SOLO existe en retention
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
      includeEvidenceColumn: false,
    });
    await insertRecord(isolation, {
      id: recordLegacyB,
      resourceRef: legacyIntentB,
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
      includeEvidenceColumn: false,
    });
    await insertRecord(isolation, {
      id: recordBadRefB,
      resourceRef: 'no-es-un-uuid',
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
      includeEvidenceColumn: false,
    });
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[destructiveFlag];
    else process.env[destructiveFlag] = originalFlag;

    for (const runner of runners.values()) {
      await runner.release();
    }

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      for (const schema of Object.values(schemas)) {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    delete process.env[destructiveFlag];
  });

  it('100 up: columna, FK RESTRICT, índice parcial y backfill same-schema', async () => {
    const retention = runners.get('retention');
    const isolation = runners.get('isolation');
    if (!retention || !isolation) throw new Error('Expected two PostgreSQL query runners');
    const migration = new LinkExecutionOrderEvidenceIdempotency1000000000000();

    for (const runner of [retention, isolation]) {
      await expect(migration.up(runner)).resolves.toBeUndefined();

      const column = (await runner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'execution_order_idempotency_records'
             AND column_name = 'evidence_upload_intent_id'
         ) AS present`,
      )) as Array<{ present: boolean }>;
      expect(column[0]?.present).toBe(true);

      const fk = (await runner.query(
        `SELECT confdeltype FROM pg_constraint
         WHERE conname = 'fk_execution_order_idempotency_evidence_intent'
           AND connamespace = current_schema()::regnamespace`,
      )) as Array<{ confdeltype: string }>;
      expect(fk[0]?.confdeltype).toBe('r'); // RESTRICT

      const index = (await runner.query(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = 'idx_execution_order_idempotency_evidence_intent'`,
      )) as Array<{ indexdef: string }>;
      expect(index[0]?.indexdef).toContain('evidence_upload_intent_id IS NOT NULL');
    }

    // Backfill: referencia válida resuelta en el MISMO schema.
    const linkedA = (await retention.query(
      `SELECT evidence_upload_intent_id FROM execution_order_idempotency_records WHERE id = $1`,
      [recordLegacyA],
    )) as Array<{ evidence_upload_intent_id: string | null }>;
    expect(linkedA[0]?.evidence_upload_intent_id).toBe(legacyIntentA);

    const badRefA = (await retention.query(
      `SELECT evidence_upload_intent_id FROM execution_order_idempotency_records WHERE id = $1`,
      [recordBadRefA],
    )) as Array<{ evidence_upload_intent_id: string | null }>;
    expect(badRefA[0]?.evidence_upload_intent_id).toBeNull();

    // El intent de A no existe en B: la referencia cruzada NO se resuelve.
    const crossB = (await isolation.query(
      `SELECT evidence_upload_intent_id FROM execution_order_idempotency_records WHERE id = $1`,
      [recordCrossSchemaB],
    )) as Array<{ evidence_upload_intent_id: string | null }>;
    expect(crossB[0]?.evidence_upload_intent_id).toBeNull();

    const linkedB = (await isolation.query(
      `SELECT evidence_upload_intent_id FROM execution_order_idempotency_records WHERE id = $1`,
      [recordLegacyB],
    )) as Array<{ evidence_upload_intent_id: string | null }>;
    expect(linkedB[0]?.evidence_upload_intent_id).toBe(legacyIntentB);

    const badRefB = (await isolation.query(
      `SELECT evidence_upload_intent_id FROM execution_order_idempotency_records WHERE id = $1`,
      [recordBadRefB],
    )) as Array<{ evidence_upload_intent_id: string | null }>;
    expect(badRefB[0]?.evidence_upload_intent_id).toBeNull();
  });

  it('101 up reemplaza la función con la semántica NOT EXISTS', async () => {
    const retention = runners.get('retention');
    const isolation = runners.get('isolation');
    if (!retention || !isolation) throw new Error('Expected two PostgreSQL query runners');
    const migration = new AlignExecutionOrderEvidenceIntentRetention1010000000000();

    for (const runner of [retention, isolation]) {
      await expect(migration.up(runner)).resolves.toBeUndefined();
      const body = (await runner.query(
        `SELECT prosrc FROM pg_proc
         JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
         WHERE pg_namespace.nspname = current_schema()
           AND pg_proc.proname = 'purge_execution_order_retention_batch'`,
      )) as Array<{ prosrc: string }>;
      expect(body[0]?.prosrc).toContain('evidence_upload_intent_id');
      expect(body[0]?.prosrc).toContain('NOT EXISTS');
    }
  });

  it('purga intents expirados sin idempotencia viva vinculada', async () => {
    const retention = runners.get('retention');
    if (!retention) throw new Error('Expected retention query runner');
    const orphanIntent = '10000000-0000-4000-8000-000000000002';
    await insertIntent(retention, orphanIntent, `NOW() - INTERVAL '2 hours'`);

    const counts = await runPurge(retention);

    expect(counts.evidence_upload_intents_deleted).toBe(1);
    expect(await intentExists(retention, orphanIntent)).toBe(false);
  });

  it('retiene intents expirados vinculados a idempotencia vigente', async () => {
    const retention = runners.get('retention');
    if (!retention) throw new Error('Expected retention query runner');
    const linkedIntent = '10000000-0000-4000-8000-000000000003';
    const liveRecord = '10000000-0000-4000-8000-000000000004';
    await insertIntent(retention, linkedIntent, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(retention, {
      id: liveRecord,
      evidenceIntentId: linkedIntent,
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
    });

    const counts = await runPurge(retention);

    expect(counts.evidence_upload_intents_deleted).toBe(0);
    expect(await intentExists(retention, linkedIntent)).toBe(true);
    expect(await recordExists(retention, liveRecord)).toBe(true);
  });

  it('purga intents vinculados a registros expirados o tombstoned tras la retención del registro', async () => {
    const retention = runners.get('retention');
    if (!retention) throw new Error('Expected retention query runner');
    const expiredRecord = '10000000-0000-4000-8000-000000000005';
    const expiredIntent = '10000000-0000-4000-8000-000000000006';
    const tombstonedRecord = '10000000-0000-4000-8000-000000000007';
    const tombstonedIntent = '10000000-0000-4000-8000-000000000008';

    await insertIntent(retention, expiredIntent, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(retention, {
      id: expiredRecord,
      evidenceIntentId: expiredIntent,
      expiresAtExpr: `NOW() - INTERVAL '1 hour'`,
    });
    await insertIntent(retention, tombstonedIntent, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(retention, {
      id: tombstonedRecord,
      evidenceIntentId: tombstonedIntent,
      expiresAtExpr: `NOW() - INTERVAL '1 hour'`,
      tombstoned: true,
    });

    const counts = await runPurge(retention);

    // El paso de idempotencia corre primero: libera el intent, que luego se purga.
    expect(counts.idempotency_records_deleted).toBe(2);
    expect(counts.evidence_upload_intents_deleted).toBe(2);
    expect(await recordExists(retention, expiredRecord)).toBe(false);
    expect(await recordExists(retention, tombstonedRecord)).toBe(false);
    expect(await intentExists(retention, expiredIntent)).toBe(false);
    expect(await intentExists(retention, tombstonedIntent)).toBe(false);
  });

  it('la FK ON DELETE RESTRICT impide borrar un intent referenciado', async () => {
    const isolation = runners.get('isolation');
    if (!isolation) throw new Error('Expected isolation query runner');
    const protectedIntent = '10000000-0000-4000-8000-000000000009';
    const protectedRecord = '10000000-0000-4000-8000-00000000000c';
    await insertIntent(isolation, protectedIntent, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(isolation, {
      id: protectedRecord,
      evidenceIntentId: protectedIntent,
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
    });

    // RESTRICT violado: SQLSTATE 23001 (restrict_violation), no 23503.
    await expect(
      isolation.query(`DELETE FROM execution_order_evidence_upload_intents WHERE id = $1`, [
        protectedIntent,
      ]),
    ).rejects.toMatchObject({ code: '23001' });

    expect(await intentExists(isolation, protectedIntent)).toBe(true);
  });

  it('los schemas quedan aislados: la purga de un tenant no toca al otro', async () => {
    const isolation = runners.get('isolation');
    if (!isolation) throw new Error('Expected isolation query runner');
    const otherTenantIntent = '10000000-0000-4000-8000-00000000000d';
    await insertIntent(isolation, otherTenantIntent, `NOW() - INTERVAL '2 hours'`);

    // El intent del tenant B sigue intacto tras las purgas ejecutadas en A.
    expect(await intentExists(isolation, otherTenantIntent)).toBe(true);

    const counts = await runPurge(isolation);

    expect(counts.evidence_upload_intents_deleted).toBe(1);
    expect(await intentExists(isolation, otherTenantIntent)).toBe(false);
  });

  it('101 down restaura la función legacy de la 095 (con su bug de retención)', async () => {
    const retention = runners.get('retention');
    if (!retention) throw new Error('Expected retention query runner');
    const migration = new AlignExecutionOrderEvidenceIntentRetention1010000000000();

    await migration.down(retention);

    const body = (await retention.query(
      `SELECT prosrc FROM pg_proc
       JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
       WHERE pg_namespace.nspname = current_schema()
         AND pg_proc.proname = 'purge_execution_order_retention_batch'`,
    )) as Array<{ prosrc: string }>;
    expect(body[0]?.prosrc).not.toContain('evidence_upload_intent_id');
    expect(body[0]?.prosrc).not.toContain('NOT EXISTS');

    // El bug legacy queda restaurado: la función intenta borrar un intent
    // referenciado por idempotencia viva y la FK RESTRICT lo rechaza (23001).
    const victimIntent = '10000000-0000-4000-8000-00000000000e';
    const victimRecord = '10000000-0000-4000-8000-00000000000f';
    await insertIntent(retention, victimIntent, `NOW() - INTERVAL '2 hours'`);
    await insertRecord(retention, {
      id: victimRecord,
      evidenceIntentId: victimIntent,
      expiresAtExpr: `NOW() + INTERVAL '1 day'`,
    });
    await expect(runPurge(retention)).rejects.toMatchObject({ code: '23001' });
    // La llamada fallida se revierte completa: nada se borró.
    expect(await intentExists(retention, victimIntent)).toBe(true);
    expect(await recordExists(retention, victimRecord)).toBe(true);
  });

  it('100 down exige flag con vínculos y con flag elimina columna, FK e índice', async () => {
    const retention = runners.get('retention');
    if (!retention) throw new Error('Expected retention query runner');
    const migration = new LinkExecutionOrderEvidenceIdempotency1000000000000();

    await expect(migration.down(retention)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
    );

    await withDestructiveFlag(() => migration.down(retention));

    const column = (await retention.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'execution_order_idempotency_records'
           AND column_name = 'evidence_upload_intent_id'
       ) AS present`,
    )) as Array<{ present: boolean }>;
    expect(column[0]?.present).toBe(false);

    const fk = (await retention.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_execution_order_idempotency_evidence_intent'
           AND connamespace = current_schema()::regnamespace
       ) AS present`,
    )) as Array<{ present: boolean }>;
    expect(fk[0]?.present).toBe(false);

    const index = (await retention.query(
      `SELECT to_regclass(current_schema() || '.idx_execution_order_idempotency_evidence_intent') AS index_name`,
    )) as Array<{ index_name: string | null }>;
    expect(index[0]?.index_name).toBeNull();
  });
});
