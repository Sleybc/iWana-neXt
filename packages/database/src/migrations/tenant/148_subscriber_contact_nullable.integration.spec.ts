import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { SubscriberContactNullable1480000000000 } from './148_subscriber_contact_nullable';

/**
 * La prueba crea su schema y tablas objetivo desde cero: `E2E_TENANT_SLUG=test` puede estar
 * definido durante la ejecución, pero el test no consulta ni depende del schema de ese tenant.
 */
const SCHEMA = `tenant_mod05_contact_148_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 148: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

async function nullability(runner: QueryRunner): Promise<Record<string, string>> {
  const rows = (await runner.query(
    `SELECT table_name, column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1
        AND ((table_name = 'subscribers' AND column_name IN ('email_encrypted', 'phone_encrypted'))
          OR (table_name = 'party_contact' AND column_name = 'value'))
      ORDER BY table_name, column_name`,
    [SCHEMA],
  )) as Array<{ table_name: string; column_name: string; is_nullable: string }>;

  return Object.fromEntries(
    rows.map((row) => [`${row.table_name}.${row.column_name}`, row.is_nullable]),
  );
}

describeWithDb('Migración 148 — contactos nullable en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new SubscriberContactNullable1480000000000();

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
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY,
        email_encrypted text NOT NULL,
        phone_encrypted text NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE party_contact (
        id uuid PRIMARY KEY,
        value text NOT NULL
      )
    `);
    await runner.query(
      `INSERT INTO subscribers (id, email_encrypted, phone_encrypted) VALUES ($1, 'cipher-email', 'cipher-phone')`,
      [randomUUID()],
    );
    await runner.query(`INSERT INTO party_contact (id, value) VALUES ($1, 'cipher-contact')`, [
      randomUUID(),
    ]);
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

  it('ejecuta up/down/up y aborta down con NULL antes de modificar el schema', async () => {
    const active = requireRunner(runner);
    const notNull = {
      'party_contact.value': 'NO',
      'subscribers.email_encrypted': 'NO',
      'subscribers.phone_encrypted': 'NO',
    };

    expect(await nullability(active)).toEqual(notNull);

    await migration.up(active);
    const nullable = {
      'party_contact.value': 'YES',
      'subscribers.email_encrypted': 'YES',
      'subscribers.phone_encrypted': 'YES',
    };
    expect(await nullability(active)).toEqual(nullable);
    expect(await active.query(`SELECT email_encrypted, phone_encrypted FROM subscribers`)).toEqual([
      { email_encrypted: 'cipher-email', phone_encrypted: 'cipher-phone' },
    ]);
    expect(await active.query(`SELECT value FROM party_contact`)).toEqual([
      { value: 'cipher-contact' },
    ]);

    await migration.down(active);
    expect(await nullability(active)).toEqual(notNull);

    await migration.up(active);
    expect(await nullability(active)).toEqual(nullable);

    const nullSubscriberId = randomUUID();
    const nullContactId = randomUUID();
    await active.query(
      `INSERT INTO subscribers (id, email_encrypted, phone_encrypted) VALUES ($1, NULL, NULL)`,
      [nullSubscriberId],
    );
    await active.query(`INSERT INTO party_contact (id, value) VALUES ($1, NULL)`, [nullContactId]);

    await expect(migration.down(active)).rejects.toThrow(
      'subscribers.email_encrypted (1), subscribers.phone_encrypted (1) y party_contact.value (1)',
    );
    expect(await nullability(active)).toEqual(nullable);

    await active.query(`DELETE FROM subscribers WHERE id = $1`, [nullSubscriberId]);
    await active.query(`DELETE FROM party_contact WHERE id = $1`, [nullContactId]);
    await migration.down(active);
    expect(await nullability(active)).toEqual(notNull);
  });
});
