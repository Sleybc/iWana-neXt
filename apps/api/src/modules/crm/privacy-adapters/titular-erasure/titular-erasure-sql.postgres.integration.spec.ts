import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../../packages/database/src/db-credentials';
import {
  anonymizeConfiguredTable,
  markAnonymizedRows,
  readTenantColumns,
  type ErasureKeys,
  type FieldRule,
} from './titular-erasure-sql';
import { CrmTitularErasureParticipant } from './crm-titular-erasure.participant';

const schema = `tenant_privacy_versions_${randomBytes(4).toString('hex')}`;
const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;
const safeDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (databaseAvailable && !safeDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración de versiones de supresión: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

const KEYS: ErasureKeys = {
  hashKey: Buffer.alloc(32, 1),
  activeEncryptionKey: Buffer.alloc(32, 2),
  previousEncryptionKey: null,
};

describeWithDb('Supresión CRM — versiones PostgreSQL reales', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    const bootstrap = dataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      await bootstrap.query(`SET search_path TO "${schema}"`);
      await bootstrap.query(`
        CREATE TABLE contracts (
          id uuid PRIMARY KEY,
          subscriber_id uuid,
          alias text NOT NULL,
          installation_notes text,
          fiscal_name text,
          plan_snapshot_json jsonb,
          updated_at timestamptz NOT NULL
        )
      `);
      await bootstrap.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY,
          first_name text NOT NULL,
          anonymized_at timestamptz,
          anonymized_request_id uuid,
          updated_at timestamptz NOT NULL
        )
      `);
    } finally {
      await bootstrap.release();
    }
    runner = dataSource.createQueryRunner();
    await runner.query(`SET search_path TO "${schema}"`);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('avanza exactamente 1 ms una versión futura al redactar y al poner solo la marca', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const futureVersion = new Date('2099-01-01T00:00:00.000Z');
    await runner.query(
      `INSERT INTO contracts (id, alias, updated_at) VALUES ($1, 'Alias previo', $2)`,
      [contractId, futureVersion],
    );
    await runner.query(
      `INSERT INTO subscribers (id, first_name, anonymized_at, anonymized_request_id, updated_at)
       VALUES ($1, 'Anonimizado', NULL, NULL, $2)`,
      [subscriberId, futureVersion],
    );
    const columns = await readTenantColumns(runner);
    const contractRules: FieldRule[] = [{ column: 'alias', kind: 'marker' }];
    const contractResult = await anonymizeConfiguredTable(
      runner,
      'contracts',
      [contractId],
      contractRules,
      columns,
      KEYS,
      'apply',
    );
    const contractVersions = (await runner.query(`SELECT updated_at FROM contracts WHERE id = $1`, [
      contractId,
    ])) as Array<{ updated_at: Date }>;
    expect(contractResult).toMatchObject({ selected: 1, changed: 1, residual: 0 });
    expect(contractVersions[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(contractVersions[0]?.updated_at.getTime()).toBeGreaterThan(futureVersion.getTime());

    const subscriberVersionBeforeMark = (await runner.query(
      `SELECT updated_at FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date }>;
    const markResult = await markAnonymizedRows(
      runner,
      'subscribers',
      [subscriberId],
      requestId,
      columns,
    );
    const subscriberAfterMark = (await runner.query(
      `SELECT updated_at, anonymized_at, anonymized_request_id
         FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{
      updated_at: Date;
      anonymized_at: Date | null;
      anonymized_request_id: string | null;
    }>;
    expect(markResult).toEqual({ changed: 1, residual: 0 });
    expect(subscriberAfterMark[0]?.updated_at.getTime()).toBe(
      subscriberVersionBeforeMark[0]!.updated_at.getTime() + 1,
    );
    expect(subscriberAfterMark[0]?.anonymized_at).not.toBeNull();
    expect(subscriberAfterMark[0]?.anonymized_request_id).toBe(requestId);
  });

  it('no avanza updated_at cuando el registro ya está limpio y marcado', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const version = new Date('2099-01-01T00:00:00.000Z');
    await runner.query(
      `INSERT INTO contracts (id, alias, updated_at) VALUES ($1, 'ANONIMIZADO', $2)`,
      [contractId, version],
    );
    await runner.query(
      `INSERT INTO subscribers (id, first_name, anonymized_at, anonymized_request_id, updated_at)
       VALUES ($1, 'Anonimizado', now(), $2, $3)`,
      [subscriberId, requestId, version],
    );
    const columns = await readTenantColumns(runner);
    const contractResult = await anonymizeConfiguredTable(
      runner,
      'contracts',
      [contractId],
      [{ column: 'alias', kind: 'marker' }],
      columns,
      KEYS,
      'apply',
    );
    const markResult = await markAnonymizedRows(
      runner,
      'subscribers',
      [subscriberId],
      requestId,
      columns,
    );
    const versions = (await runner.query(`SELECT updated_at FROM contracts WHERE id = $1`, [
      contractId,
    ])) as Array<{ updated_at: Date }>;
    const subscriberVersions = (await runner.query(
      `SELECT updated_at FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date }>;
    expect(contractResult).toEqual({ selected: 1, changed: 0, residual: 0 });
    expect(markResult).toEqual({ changed: 0, residual: 0 });
    expect(versions[0]?.updated_at.getTime()).toBe(version.getTime());
    expect(subscriberVersions[0]?.updated_at.getTime()).toBe(version.getTime());
  });

  it('avanza solo una vez por fila durante la supresión CRM completa', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const futureVersion = new Date('2099-01-01T00:00:00.000Z');
    await runner.query(
      `INSERT INTO subscribers (id, first_name, updated_at)
       VALUES ($1, 'Nombre previo', $2)`,
      [subscriberId, futureVersion],
    );
    await runner.query(
      `INSERT INTO contracts
         (id, subscriber_id, alias, installation_notes, fiscal_name, plan_snapshot_json, updated_at)
       VALUES ($1, $2, 'Alias previo', 'Nota previa', 'Nombre fiscal previo', $3::jsonb, $4)`,
      [
        contractId,
        subscriberId,
        JSON.stringify({ plan: { name: 'dato personal sintético', code: 'keep' } }),
        futureVersion,
      ],
    );

    const participant = new CrmTitularErasureParticipant(
      new ConfigService({ PII_HASH_KEY: Buffer.alloc(32, 1).toString('hex') }),
    );
    await participant.apply(
      {
        partyId: null,
        subscriberIds: [subscriberId],
        expedienteIds: [],
        userIds: [],
        requestId,
        cryptoKeys: KEYS,
      },
      runner,
      'apply',
    );

    const contract = (await runner.query(
      `SELECT updated_at, alias, installation_notes, fiscal_name, plan_snapshot_json
         FROM contracts WHERE id = $1`,
      [contractId],
    )) as Array<{
      updated_at: Date;
      alias: string;
      installation_notes: string | null;
      fiscal_name: string | null;
      plan_snapshot_json: Record<string, unknown>;
    }>;
    const subscriber = (await runner.query(
      `SELECT updated_at, anonymized_at, anonymized_request_id
         FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date; anonymized_at: Date | null; anonymized_request_id: string }>;
    expect(contract[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(contract[0]).toMatchObject({
      alias: 'ANONIMIZADO',
      installation_notes: null,
      fiscal_name: null,
      plan_snapshot_json: { plan: { code: 'keep' } },
    });
    expect(subscriber[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(subscriber[0]?.anonymized_at).not.toBeNull();
    expect(subscriber[0]?.anonymized_request_id).toBe(requestId);
  });
});
