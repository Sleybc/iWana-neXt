import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { OperatorContractProfile1840000000184 } from './184_operator_contract_profile';

const SCHEMA = `tenant_operator_profile_184_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración 184: DB_NAME debe ser dbiw, test o iwana_it_*.');
}

describeWithDb('Migración 184 — datos del operador para el contrato en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new OperatorContractProfile1840000000184();

  function active(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function rejects(sql: string, params: unknown[] = []): Promise<string> {
    await active().query('SAVEPOINT sp_184');
    try {
      await active().query(sql, params);
    } catch (error) {
      await active().query('ROLLBACK TO SAVEPOINT sp_184');
      return (error as { constraint?: string }).constraint ?? 'error';
    }
    await active().query('RELEASE SAVEPOINT sp_184');
    throw new Error(`Se esperaba rechazo: ${sql}`);
  }

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
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.destroy();
      }
    }
  });

  it('crea una fila por empresa con valores nulos por defecto y canales en arreglo vacío', async () => {
    await migration.up(active());
    await active().query(`INSERT INTO operator_contract_profile (tenant_id) VALUES ($1)`, [
      TENANT_ID,
    ]);
    const rows = (await active().query(
      `SELECT customer_service_channels, reconnection_fee, annual_increase_cap_percent
       FROM operator_contract_profile WHERE tenant_id = $1`,
      [TENANT_ID],
    )) as unknown[];
    expect(rows).toEqual([
      { customer_service_channels: [], reconnection_fee: null, annual_increase_cap_percent: null },
    ]);
    expect(
      await rejects(`INSERT INTO operator_contract_profile (tenant_id) VALUES ($1)`, [TENANT_ID]),
    ).toBe('operator_contract_profile_pkey');
  });

  it('rechaza montos negativos, topes fuera de 0..100 y canales que no son arreglo', async () => {
    const other = randomUUID();
    expect(
      await rejects(
        `INSERT INTO operator_contract_profile (tenant_id, reconnection_fee) VALUES ($1, -1)`,
        [other],
      ),
    ).toBe('chk_operator_contract_profile_reconnection_fee');
    expect(
      await rejects(
        `INSERT INTO operator_contract_profile (tenant_id, annual_increase_cap_percent) VALUES ($1, 100.01)`,
        [other],
      ),
    ).toBe('chk_operator_contract_profile_increase_cap');
    expect(
      await rejects(
        `INSERT INTO operator_contract_profile (tenant_id, customer_service_channels) VALUES ($1, '{}'::jsonb)`,
        [other],
      ),
    ).toBe('chk_operator_contract_profile_channels_array');
  });

  it('down bloquea con datos, revierte con la variable destructiva y se puede reaplicar', async () => {
    await expect(migration.down(active())).rejects.toThrow(/bloqueado/u);
    process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = 'true';
    try {
      await migration.down(active());
    } finally {
      delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    }
    const gone = (await active().query(
      `SELECT to_regclass('operator_contract_profile') IS NULL AS absent`,
    )) as Array<{ absent: boolean }>;
    expect(gone[0]?.absent).toBe(true);
    await migration.up(active());
    await migration.down(active());
  });
});
