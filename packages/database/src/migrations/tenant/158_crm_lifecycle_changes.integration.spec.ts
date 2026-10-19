import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { CreateCrmLifecycleChanges1580000000000 } from './158_crm_lifecycle_changes';

const SCHEMA = `tenant_mod05_lifecycle_158_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 158: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

const REASON_CODES = [
  'MORA',
  'SOLICITUD_TITULAR',
  'USO_INDEBIDO',
  'ORDEN_AUTORIDAD',
  'FALLA_TECNICA_PROLONGADA',
  'PAGO_REGISTRADO',
  'FIN_SUSPENSION_SOLICITADA',
  'CORRECCION_OPERATIVA',
  'LEVANTAMIENTO_ORDEN',
  'MORA_PROLONGADA',
  'TRASLADO_SIN_COBERTURA',
  'DUPLICADO',
  'DESCARTE_EXPEDIENTE',
] as const;

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

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

describeWithDb('Migración 158 — historial del ciclo de vida en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new CreateCrmLifecycleChanges1580000000000();
  const subscriberId = randomUUID();
  const contractId = randomUUID();

  async function insertChange({
    reasonCode,
    source,
    entityType = 'CONTRACT',
    entityId = contractId,
    historySubscriberId = subscriberId,
  }: {
    reasonCode: string;
    source: string;
    entityType?: string;
    entityId?: string;
    historySubscriberId?: string;
  }): Promise<void> {
    const active = requireRunner(runner);
    await active.query(
      `INSERT INTO crm_lifecycle_changes
         (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
          reason_code, source, batch_id)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'SUSPENDED', $5, $6, $7)`,
      [randomUUID(), entityType, entityId, historySubscriberId, reasonCode, source, randomUUID()],
    );
  }

  async function expectNoLifecycleSchema(): Promise<void> {
    const active = requireRunner(runner);
    const columns = (await active.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'contracts'
         AND column_name IN ('status_reason_code', 'status_changed_at')
    `)) as Array<{ column_name: string }>;
    const table = (await active.query(
      `SELECT to_regclass('crm_lifecycle_changes') IS NOT NULL AS present`,
    )) as Array<{
      present: boolean;
    }>;

    expect(columns).toEqual([]);
    expect(table[0]?.present).toBe(false);
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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    await runner.query(`CREATE TABLE subscribers (id uuid PRIMARY KEY)`);
    await runner.query(`CREATE TABLE contracts (id uuid PRIMARY KEY)`);
    await runner.query(`INSERT INTO subscribers (id) VALUES ($1)`, [subscriberId]);
    await runner.query(`INSERT INTO contracts (id) VALUES ($1)`, [contractId]);
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
      if (dataSource?.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    }
  });

  it('up crea el modelo, acepta los 13 códigos del catálogo y rechaza uno ajeno', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const historyColumns = (await active.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'crm_lifecycle_changes'
       ORDER BY column_name
    `)) as Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }>;
    expect(historyColumns).toEqual([
      {
        column_name: 'actor_id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'batch_id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'changed_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: 'now()',
      },
      {
        column_name: 'contract_scope_explicit',
        data_type: 'boolean',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: 'false',
      },
      {
        column_name: 'entity_id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'entity_type',
        data_type: 'character varying',
        character_maximum_length: 16,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'from_status',
        data_type: 'character varying',
        character_maximum_length: 30,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: 'gen_random_uuid()',
      },
      {
        column_name: 'note_encrypted',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'reason_code',
        data_type: 'character varying',
        character_maximum_length: 40,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'source',
        data_type: 'character varying',
        character_maximum_length: 16,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'subscriber_id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'tenant_id',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      },
      {
        column_name: 'to_status',
        data_type: 'character varying',
        character_maximum_length: 30,
        is_nullable: 'NO',
        column_default: null,
      },
    ]);

    const contractColumns = (await active.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'contracts'
         AND column_name IN ('status_reason_code', 'status_changed_at')
       ORDER BY column_name
    `)) as Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }>;
    expect(contractColumns).toEqual([
      {
        column_name: 'status_changed_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'status_reason_code',
        data_type: 'character varying',
        character_maximum_length: 40,
        is_nullable: 'YES',
        column_default: null,
      },
    ]);

    const constraints = (await active.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS definition,
             CASE WHEN contype = 'f' THEN confrelid::regclass::text ELSE NULL END AS referenced_table
        FROM pg_constraint
       WHERE conrelid = 'crm_lifecycle_changes'::regclass
         AND conname IN (
           'ck_crm_lifecycle_changes_entity_type',
           'ck_crm_lifecycle_changes_reason_code',
           'ck_crm_lifecycle_changes_source',
           'fk_crm_lifecycle_changes_subscriber',
           'pk_crm_lifecycle_changes'
         )
       ORDER BY conname
    `)) as Array<{
      conname: string;
      contype: string;
      definition: string;
      referenced_table: string | null;
    }>;
    expect(constraints).toEqual([
      {
        conname: 'ck_crm_lifecycle_changes_entity_type',
        contype: 'c',
        definition: expect.stringMatching(/CHECK/u),
        referenced_table: null,
      },
      {
        conname: 'ck_crm_lifecycle_changes_reason_code',
        contype: 'c',
        definition: expect.stringMatching(/CHECK/u),
        referenced_table: null,
      },
      {
        conname: 'ck_crm_lifecycle_changes_source',
        contype: 'c',
        definition: expect.stringMatching(/CHECK/u),
        referenced_table: null,
      },
      {
        conname: 'fk_crm_lifecycle_changes_subscriber',
        contype: 'f',
        definition: expect.stringMatching(/FOREIGN KEY \(subscriber_id\)/u),
        referenced_table: 'subscribers',
      },
      {
        conname: 'pk_crm_lifecycle_changes',
        contype: 'p',
        definition: 'PRIMARY KEY (id)',
        referenced_table: null,
      },
    ]);

    const index = (await active.query(`
      SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_lifecycle_subscriber'
    `)) as Array<{ indexdef: string }>;
    expect(index[0]?.indexdef).toMatch(/\(tenant_id, subscriber_id, changed_at DESC\)/u);

    for (const code of REASON_CODES) {
      await insertChange({
        reasonCode: code,
        source: code === 'DESCARTE_EXPEDIENTE' ? 'SYSTEM' : 'MANUAL',
      });
    }

    await insertChange({ reasonCode: 'MORA', source: 'BILLING' });
    await insertChange({
      reasonCode: 'SOLICITUD_TITULAR',
      source: 'MANUAL',
      entityType: 'SUBSCRIBER',
      entityId: subscriberId,
    });
    const historyRows = (await active.query(
      `SELECT COUNT(*)::int AS total FROM crm_lifecycle_changes`,
    )) as Array<{ total: number }>;
    expect(historyRows[0]?.total).toBe(REASON_CODES.length + 2);
    const entityTypeCounts = (await active.query(`
      SELECT entity_type, COUNT(*)::int AS total
        FROM crm_lifecycle_changes
       GROUP BY entity_type
       ORDER BY entity_type
    `)) as Array<{ entity_type: string; total: number }>;
    expect(entityTypeCounts).toEqual([
      { entity_type: 'CONTRACT', total: REASON_CODES.length + 1 },
      { entity_type: 'SUBSCRIBER', total: 1 },
    ]);

    await expectRejectedWrite(
      active,
      () => insertChange({ reasonCode: 'MOTIVO_FUERA_DEL_CATALOGO', source: 'MANUAL' }),
      /ck_crm_lifecycle_changes_reason_code/u,
    );
    await expectRejectedWrite(
      active,
      () => insertChange({ reasonCode: 'MORA', source: 'MANUAL', entityType: 'UNKNOWN' }),
      /ck_crm_lifecycle_changes_entity_type/u,
    );
    await expectRejectedWrite(
      active,
      () => insertChange({ reasonCode: 'MORA', source: 'UNKNOWN' }),
      /ck_crm_lifecycle_changes_source/u,
    );
    await expectRejectedWrite(
      active,
      () =>
        insertChange({
          reasonCode: 'MORA',
          source: 'MANUAL',
          historySubscriberId: randomUUID(),
        }),
      /fk_crm_lifecycle_changes_subscriber/u,
    );
  });

  it('down elimina solo la estructura nueva y conserva las tablas y filas previas', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    await migration.down(active);

    await expectNoLifecycleSchema();
    await expect(
      active.query(`SELECT id FROM subscribers WHERE id = $1`, [subscriberId]),
    ).resolves.toEqual([{ id: subscriberId }]);
    await expect(
      active.query(`SELECT id FROM contracts WHERE id = $1`, [contractId]),
    ).resolves.toEqual([{ id: contractId }]);
  });

  it('down con historial exige autorización explícita antes de borrar filas', async () => {
    const active = requireRunner(runner);
    const originalFlag = process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    await migration.up(active);
    await insertChange({ reasonCode: 'MORA', source: 'MANUAL' });

    try {
      await expect(migration.down(active)).rejects.toThrow(
        /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/u,
      );
      const table = (await active.query(
        `SELECT to_regclass('crm_lifecycle_changes') IS NOT NULL AS present`,
      )) as Array<{
        present: boolean;
      }>;
      expect(table[0]?.present).toBe(true);
      expect(await active.query(`SELECT id FROM contracts WHERE id = $1`, [contractId])).toEqual([
        { id: contractId },
      ]);

      process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
      await migration.down(active);
      await expectNoLifecycleSchema();
    } finally {
      if (originalFlag === undefined) delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
      else process.env[DESTRUCTIVE_DOWN_ENV_VAR] = originalFlag;
    }
  });
});
