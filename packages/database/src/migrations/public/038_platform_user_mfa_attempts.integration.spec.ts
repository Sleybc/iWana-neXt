/**
 * Migraciones 038 (public) y 218 (tenant) contra PostgreSQL real: `down` y `up` reversibles.
 * Todo corre en una transacción que siempre se revierte.
 */
import { DataSource, type QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ephemeralSchemaName } from '../../../test/ephemeral-schema';
import { AddUserMfaLastUsedStep2180000000218 } from '../tenant/218_add_user_mfa_last_used_step';
import { PlatformUserMfaAttempts1784419226000 } from './038_platform_user_mfa_attempts';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const database = process.env['DB_NAME'] ?? '';
const port = Number(process.env['DB_PORT']);

if (dbAvailable && (database !== 'test' || !Number.isInteger(port) || port < 1)) {
  throw new Error('Integración 038 exige DB_NAME=test y DB_PORT explícito.');
}

describeWithDb('Migraciones 038 y 218 — reversibilidad (PostgreSQL real)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  const columns = async (schema: string, table: string): Promise<string[]> =>
    (
      (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
            AND column_name IN ('mfa_last_used_step', 'mfa_failed_attempts', 'mfa_locked_until')
          ORDER BY column_name`,
        [schema, table],
      )) as Array<{ column_name: string }>
    ).map((row) => row.column_name);

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port,
      database,
      ...resolveMigrationDbCredentials(),
    });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    await runner?.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('038: down retira las tres columnas y up las repone', async () => {
    const migration = new PlatformUserMfaAttempts1784419226000();
    const all = ['mfa_failed_attempts', 'mfa_last_used_step', 'mfa_locked_until'];
    expect(await columns('public', 'platform_users')).toEqual(all);
    await migration.down(runner);
    expect(await columns('public', 'platform_users')).toEqual([]);
    await migration.up(runner);
    expect(await columns('public', 'platform_users')).toEqual(all);
  });

  it('218: up añade la columna con filas existentes y down la retira', async () => {
    const schema = ephemeralSchemaName('tenant_mfa_218_');
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    await runner.query('CREATE TABLE users (id integer)');
    await runner.query('INSERT INTO users VALUES (1)');
    const migration = new AddUserMfaLastUsedStep2180000000218();

    await migration.up(runner);
    expect(await columns(schema, 'users')).toEqual(['mfa_last_used_step']);
    expect(await runner.query('SELECT * FROM users')).toEqual([
      { id: 1, mfa_last_used_step: null },
    ]);
    await migration.down(runner);
    expect(await columns(schema, 'users')).toEqual([]);
  });
});
