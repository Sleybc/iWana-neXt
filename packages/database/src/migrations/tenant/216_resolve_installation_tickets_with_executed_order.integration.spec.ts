import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ResolveInstallationTicketsWithExecutedOrder2160000000216 } from './216_resolve_installation_tickets_with_executed_order';

const SCHEMA = `tenant_mod10_resolve_216_${randomBytes(4).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 216: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 216 — resuelve tickets de instalación con orden ya ejecutada', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new ResolveInstallationTicketsWithExecutedOrder2160000000216();

  const tenantId = randomUUID();
  const closedAt = '2026-10-11T19:45:32.000Z';
  const executed = randomUUID();
  const withObservations = randomUUID();
  const stillPending = randomUUID();
  const customerTicket = randomUUID();
  const alreadyClosed = randomUUID();
  const annulledOnly = randomUUID();

  type TicketRow = {
    status: string;
    resolved_at: Date | null;
    first_responded_at: Date | null;
  };

  async function ticket(id: string): Promise<TicketRow> {
    const rows = (await requireRunner(runner).query(
      `SELECT status::text AS status, resolved_at, first_responded_at
         FROM support_tickets WHERE id = $1::uuid`,
      [id],
    )) as TicketRow[];
    if (!rows[0]) throw new Error(`Ticket ${id} no sembrado.`);
    return rows[0];
  }

  async function seed(): Promise<void> {
    const active = requireRunner(runner);
    await active.query(`TRUNCATE support_tickets, execution_orders, ticket_timeline_events`);
    const addTicket = (id: string, type: string, subjectType: string, status: string) =>
      active.query(
        `INSERT INTO support_tickets (id, tenant_id, type, subject_type, status)
         VALUES ($1, $2, $3, $4, $5::ticket_status)`,
        [id, tenantId, type, subjectType, status],
      );
    const addOrder = (
      ticketId: string,
      result: string | null,
      closed: string | null,
      annulled = false,
    ) =>
      active.query(
        `INSERT INTO execution_orders (id, tenant_id, ticket_id, result, closed_at, is_annulled)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::timestamptz, $5)`,
        [tenantId, ticketId, result, closed, annulled],
      );

    await addTicket(executed, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'OPEN');
    await addOrder(executed, 'EXECUTED', closedAt);
    await addTicket(withObservations, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'OPEN');
    await addOrder(withObservations, 'EXECUTED_WITH_OBSERVATIONS', closedAt);
    await addTicket(stillPending, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'IN_PROGRESS');
    await addOrder(stillPending, 'EXECUTED', closedAt);
    await addOrder(stillPending, null, null);
    await addTicket(customerTicket, 'CUSTOMER_INCIDENT', 'SUBSCRIBER', 'OPEN');
    await addOrder(customerTicket, 'EXECUTED', closedAt);
    await addTicket(alreadyClosed, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'CLOSED');
    await addOrder(alreadyClosed, 'EXECUTED', closedAt);
    await addTicket(annulledOnly, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'OPEN');
    await addOrder(annulledOnly, 'EXECUTED', closedAt, true);
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
      `CREATE TYPE ticket_status AS ENUM
         ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')`,
    );
    await runner.query(
      `CREATE TABLE support_tickets (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
         type varchar NOT NULL, subject_type varchar, status ticket_status NOT NULL,
         first_responded_at timestamptz, resolved_at timestamptz)`,
    );
    await runner.query(
      `CREATE TABLE execution_orders (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
         ticket_id varchar(160), result varchar(40), closed_at timestamptz,
         is_annulled boolean NOT NULL)`,
    );
    await runner.query(
      `CREATE TABLE ticket_timeline_events (id uuid PRIMARY KEY, ticket_id uuid NOT NULL,
         tenant_id uuid NOT NULL, event_type varchar NOT NULL, payload jsonb NOT NULL,
         actor_user_id uuid, occurred_at timestamptz NOT NULL)`,
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

  beforeEach(seed);

  it('up resuelve el ticket de instalación con la fecha real del cierre y es idempotente', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    await migration.up(active);

    expect(await ticket(executed)).toEqual({
      status: 'RESOLVED',
      resolved_at: new Date(closedAt),
      first_responded_at: new Date(closedAt),
    });
    const events = (await active.query(
      `SELECT ticket_id::text AS ticket_id, payload FROM ticket_timeline_events`,
    )) as Array<{ ticket_id: string; payload: Record<string, unknown> }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      ticket_id: executed,
      payload: { from: 'OPEN', to: 'RESOLVED', automatic: true, restoredByMigration: 216 },
    });
  });

  it('up deja abierto lo que tiene algo pendiente y no toca lo que no es de instalación', async () => {
    await migration.up(requireRunner(runner));

    expect((await ticket(withObservations)).status).toBe('OPEN');
    expect((await ticket(stillPending)).status).toBe('IN_PROGRESS');
    expect((await ticket(customerTicket)).status).toBe('OPEN');
    expect((await ticket(alreadyClosed)).status).toBe('CLOSED');
    expect((await ticket(annulledOnly)).status).toBe('OPEN');
  });

  it('down devuelve el estado anterior, borra sus eventos y respeta lo cambiado a mano', async () => {
    const active = requireRunner(runner);
    const reopened = randomUUID();
    await active.query(
      `INSERT INTO support_tickets (id, tenant_id, type, subject_type, status)
       VALUES ($1, $2, 'OPERATIONAL_TASK', 'EXPEDIENTE', 'ASSIGNED')`,
      [reopened, tenantId],
    );
    await active.query(
      `INSERT INTO execution_orders (id, tenant_id, ticket_id, result, closed_at, is_annulled)
       VALUES (gen_random_uuid(), $1, $2, 'EXECUTED', $3::timestamptz, false)`,
      [tenantId, reopened, closedAt],
    );
    await migration.up(active);
    // Alguien lo reabrió después de up(): down no lo pisa.
    await active.query(`UPDATE support_tickets SET status = 'IN_PROGRESS' WHERE id = $1::uuid`, [
      reopened,
    ]);
    await migration.down(active);
    await migration.down(active);

    expect(await ticket(executed)).toEqual({
      status: 'OPEN',
      resolved_at: null,
      first_responded_at: null,
    });
    expect((await ticket(reopened)).status).toBe('IN_PROGRESS');
    const events = (await active.query(`SELECT 1 FROM ticket_timeline_events`)) as unknown[];
    expect(events).toHaveLength(0);
  });
});
