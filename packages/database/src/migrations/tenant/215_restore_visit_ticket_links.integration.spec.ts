import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { RestoreVisitTicketLinks2150000000215 } from './215_restore_visit_ticket_links';
import { ephemeralSchemaName } from '../../../test/ephemeral-schema';

const SCHEMA = ephemeralSchemaName('tenant_mod09_links_215_');
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 215: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 215 — restaura el ticket de las solicitudes de visita', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new RestoreVisitTicketLinks2150000000215();

  const tenantId = randomUUID();
  const ticket = randomUUID();
  const otherTicket = randomUUID();
  const lostVisit = randomUUID();
  const lostEvent = randomUUID();
  const closedOrder = randomUUID();
  const openVisit = randomUUID();
  const openOrder = randomUUID();
  const keptVisit = randomUUID();
  const neverLinkedVisit = randomUUID();
  const ghostVisit = randomUUID();
  const closedAt = '2026-08-28T20:00:00.000Z';

  async function ticketOf(table: string, id: string): Promise<string | null> {
    const rows = (await requireRunner(runner).query(
      `SELECT ticket_id FROM ${table} WHERE id = $1::uuid`,
      [id],
    )) as Array<{ ticket_id: string | null }>;
    return rows[0]?.ticket_id ?? null;
  }

  async function timeline(): Promise<Array<{ event_type: string; payload: unknown }>> {
    return (await requireRunner(runner).query(
      `SELECT event_type, payload, occurred_at FROM ticket_timeline_events ORDER BY event_type`,
    )) as Array<{ event_type: string; payload: unknown }>;
  }

  async function seed(): Promise<void> {
    const active = requireRunner(runner);
    await active.query(
      `TRUNCATE visit_requests, schedule_events, execution_orders, audit_logs,
                support_tickets, ticket_timeline_events`,
    );
    await active.query(`INSERT INTO support_tickets (id, tenant_id) VALUES ($1, $3), ($2, $3)`, [
      ticket,
      otherTicket,
      tenantId,
    ]);
    await active.query(
      `INSERT INTO visit_requests (id, tenant_id, ticket_id, schedule_event_id, execution_order_id)
       VALUES ($1, $7, NULL, $5, $6), ($2, $7, NULL, NULL, NULL), ($3, $7, $8, NULL, NULL),
              ($4, $7, NULL, NULL, NULL), ($9, $7, NULL, NULL, NULL)`,
      [
        lostVisit,
        openVisit,
        keptVisit,
        neverLinkedVisit,
        lostEvent,
        closedOrder,
        tenantId,
        otherTicket,
        ghostVisit,
      ],
    );
    await active.query(
      `INSERT INTO schedule_events (id, tenant_id, ticket_id) VALUES ($1, $2, NULL)`,
      [lostEvent, tenantId],
    );
    await active.query(
      `INSERT INTO execution_orders
         (id, tenant_id, execution_order_number, visit_request_id, ticket_id, is_annulled, result, closed_at)
       VALUES ($1, $3, 'OTE-1', NULL, NULL, false, 'EXECUTED', $5::timestamptz),
              ($2, $3, 'OTE-2', $4, NULL, false, NULL, NULL)`,
      [closedOrder, openOrder, tenantId, openVisit, closedAt],
    );
    const audit = (visit: string, action: string, ticketId: string | null, at: string) =>
      active.query(
        `INSERT INTO audit_logs (id, tenant_id, action, entity_id, new_value, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [tenantId, action, visit, JSON.stringify({ id: visit, ticketId }), at],
      );
    await audit(lostVisit, 'CREATE', ticket, '2026-08-21T16:12:49Z');
    await audit(lostVisit, 'UPDATE', null, '2026-08-22T12:36:09Z');
    await audit(openVisit, 'CREATE', ticket, '2026-08-21T16:00:00Z');
    await audit(keptVisit, 'CREATE', ticket, '2026-08-21T16:00:00Z');
    await audit(neverLinkedVisit, 'CREATE', null, '2026-08-21T16:00:00Z');
    await audit(ghostVisit, 'CREATE', randomUUID(), '2026-08-21T16:00:00Z');
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
      `CREATE TABLE support_tickets (id uuid PRIMARY KEY, tenant_id uuid NOT NULL)`,
    );
    await runner.query(
      `CREATE TABLE visit_requests (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
         ticket_id varchar(160), schedule_event_id uuid, execution_order_id uuid)`,
    );
    await runner.query(
      `CREATE TABLE schedule_events (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, ticket_id varchar(160))`,
    );
    await runner.query(
      `CREATE TABLE execution_orders (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
         execution_order_number varchar(40) NOT NULL, visit_request_id uuid, ticket_id varchar(160),
         is_annulled boolean NOT NULL, result varchar(40), closed_at timestamptz)`,
    );
    await runner.query(
      `CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, action varchar NOT NULL,
         entity_id varchar NOT NULL, new_value jsonb, created_at timestamptz NOT NULL)`,
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

  beforeEach(async () => {
    await requireRunner(runner).query(`DROP TABLE IF EXISTS migration_215_restored_ticket_links`);
    await seed();
  });

  it('up restaura la solicitud, su evento y su orden, y deja el cierre en el historial', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    await migration.up(active);

    expect(await ticketOf('visit_requests', lostVisit)).toBe(ticket);
    expect(await ticketOf('schedule_events', lostEvent)).toBe(ticket);
    expect(await ticketOf('execution_orders', closedOrder)).toBe(ticket);
    expect(await ticketOf('visit_requests', openVisit)).toBe(ticket);
    expect(await ticketOf('execution_orders', openOrder)).toBe(ticket);

    const events = await timeline();
    expect(events.map((event) => event.event_type)).toEqual([
      'EXECUTION_ORDER_CLOSED',
      'WORK_ORDER_LINKED',
      'WORK_ORDER_LINKED',
    ]);
    expect(events[0]).toMatchObject({
      payload: { executionOrderId: closedOrder, result: 'EXECUTED', restoredByMigration: 215 },
      occurred_at: new Date(closedAt),
    });
  });

  it('up no toca lo que ya tenía ticket, lo que nunca lo tuvo ni un ticket inexistente', async () => {
    await migration.up(requireRunner(runner));

    expect(await ticketOf('visit_requests', keptVisit)).toBe(otherTicket);
    expect(await ticketOf('visit_requests', neverLinkedVisit)).toBeNull();
    expect(await ticketOf('visit_requests', ghostVisit)).toBeNull();
  });

  it('down devuelve a NULL solo lo restaurado, borra sus eventos y retira la tabla', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    // Un vínculo cambiado a mano después de up() no es de la migración: down lo respeta.
    await active.query(`UPDATE execution_orders SET ticket_id = $1 WHERE id = $2::uuid`, [
      otherTicket,
      openOrder,
    ]);
    await migration.down(active);
    await migration.down(active);

    expect(await ticketOf('visit_requests', lostVisit)).toBeNull();
    expect(await ticketOf('schedule_events', lostEvent)).toBeNull();
    expect(await ticketOf('execution_orders', closedOrder)).toBeNull();
    expect(await ticketOf('execution_orders', openOrder)).toBe(otherTicket);
    expect(await ticketOf('visit_requests', keptVisit)).toBe(otherTicket);
    expect(await timeline()).toEqual([]);
    const table = (await active.query(
      `SELECT to_regclass('migration_215_restored_ticket_links') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    expect(table[0]?.present).toBe(false);
  });
});
