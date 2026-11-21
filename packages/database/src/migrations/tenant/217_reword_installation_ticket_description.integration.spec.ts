import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { RewordInstallationTicketDescription2170000000217 } from './217_reword_installation_ticket_description';
import { ephemeralSchemaName } from '../../../test/ephemeral-schema';

const SCHEMA = ephemeralSchemaName('tenant_mod10_reword_217_');
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const NEW_TEXT = 'Ticket creado automáticamente al programar la visita de instalación.';

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 217: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Migración 217 — descripción del ticket de instalación sin UUID', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new RewordInstallationTicketDescription2170000000217();
  const expediente = randomUUID();
  const oldText = `Ticket operativo de instalación generado automáticamente para el expediente ${expediente}.`;
  const generated = randomUUID();
  const edited = randomUUID();
  const customer = randomUUID();

  const active = (): QueryRunner => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    return runner;
  };

  async function description(id: string): Promise<string | null> {
    const rows = (await active().query(
      `SELECT description FROM support_tickets WHERE id = $1::uuid`,
      [id],
    )) as Array<{ description: string | null }>;
    return rows[0]?.description ?? null;
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
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}", public`);
    await runner.query(
      `CREATE TABLE support_tickets (id uuid PRIMARY KEY, type varchar NOT NULL,
         subject_type varchar, subject_ref_id varchar(160), description text)`,
    );
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
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

  beforeEach(async () => {
    await active().query(`TRUNCATE support_tickets`);
    await active().query(
      `INSERT INTO support_tickets (id, type, subject_type, subject_ref_id, description) VALUES
         ($1, 'OPERATIONAL_TASK', 'EXPEDIENTE', $4, $5),
         ($2, 'OPERATIONAL_TASK', 'EXPEDIENTE', $4, 'Nota escrita a mano por el despacho.'),
         ($3, 'CUSTOMER_INCIDENT', 'SUBSCRIBER', $4, $5)`,
      [generated, edited, customer, expediente, oldText],
    );
  });

  it('up reescribe solo la descripción generada y es idempotente', async () => {
    await migration.up(active());
    await migration.up(active());

    expect(await description(generated)).toBe(NEW_TEXT);
    expect(await description(edited)).toBe('Nota escrita a mano por el despacho.');
    expect(await description(customer)).toBe(oldText);
  });

  it('down reconstruye el texto antiguo desde el expediente', async () => {
    await migration.up(active());
    await migration.down(active());

    expect(await description(generated)).toBe(oldText);
    expect(await description(edited)).toBe('Nota escrita a mano por el despacho.');
  });
});
