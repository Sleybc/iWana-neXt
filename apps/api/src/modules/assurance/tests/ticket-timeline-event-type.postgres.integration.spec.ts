import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema, TicketTimelineEvent } from '@iwana/db';
import { ExecutionOrderResult, TicketTimelineEventType } from '@iwana/shared';
import { AssuranceExecutionOrderNotifierAdapter } from '../ports/assurance-execution-order-notifier.adapter';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { AddExecutionOrderClosedTimelineEvent2140000000214 } from '../../../../../../packages/database/src/migrations/tenant/214_add_execution_order_closed_timeline_event';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_assurance_timeline_${randomBytes(5).toString('hex')}`;
const quotedSchema = `"${schemaName}"`;
const tenantId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración Assurance timeline: DB_NAME debe ser test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Assurance historial del ticket — enum de eventos en PostgreSQL real', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [TicketTimelineEvent],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Assurance historial sintético',
        `assurance-timeline-${tenantId.slice(0, 8)}`,
        schemaName,
        'assurance-timeline@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `assurance-timeline-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('registra EXECUTION_ORDER_CLOSED al cerrar una orden de ejecución ligada a un ticket', async () => {
    const adapter = new AssuranceExecutionOrderNotifierAdapter(
      dataSource,
      new TimelineService(dataSource),
    );
    const ticketId = randomUUID();
    const executionOrderId = randomUUID();

    await adapter.notifyClosed({
      ticketId,
      executionOrderId,
      result: ExecutionOrderResult.EXECUTED,
      tenantId,
      schemaName,
      actorUserId: randomUUID(),
    });

    const rows: Array<{ event_type: string; payload: Record<string, unknown> }> =
      await dataSource.query(
        `SELECT event_type, payload FROM ${quotedSchema}.ticket_timeline_events
          WHERE ticket_id = $1 AND tenant_id = $2`,
        [ticketId, tenantId],
      );
    expect(rows).toEqual([
      {
        event_type: TicketTimelineEventType.EXECUTION_ORDER_CLOSED,
        payload: { executionOrderId, result: ExecutionOrderResult.EXECUTED },
      },
    ]);
  });

  it('cada valor de TicketTimelineEventType existe en el enum ticket_timeline_event_type', async () => {
    const rows: Array<{ value: string }> = await dataSource.query(
      `SELECT e.enumlabel AS value
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typname = 'ticket_timeline_event_type'`,
      [schemaName],
    );
    const databaseValues = new Set(rows.map(({ value }) => value));

    const missing = Object.values(TicketTimelineEventType).filter(
      (value) => !databaseValues.has(value),
    );

    expect(databaseValues.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('la migración 214 es reversible: down() conserva el valor en uso y lo quita sin filas', async () => {
    const migration = new AddExecutionOrderClosedTimelineEvent2140000000214();
    const hasValue = async (): Promise<boolean> => {
      const rows: Array<{ present: boolean }> = await dataSource.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = $1 AND t.typname = 'ticket_timeline_event_type'
              AND e.enumlabel = 'EXECUTION_ORDER_CLOSED'
         ) AS present`,
        [schemaName],
      );
      return rows[0]?.present === true;
    };

    // El primer test dejó un evento EXECUTION_ORDER_CLOSED: down() no debe tocar el tipo.
    await runInTenantSchema(dataSource, schemaName, (qr) => migration.down(qr));
    expect(await hasValue()).toBe(true);

    await dataSource.query(
      `DELETE FROM ${quotedSchema}.ticket_timeline_events WHERE event_type = 'EXECUTION_ORDER_CLOSED'`,
    );
    await runInTenantSchema(dataSource, schemaName, (qr) => migration.down(qr));
    expect(await hasValue()).toBe(false);

    await runInTenantSchema(dataSource, schemaName, (qr) => migration.up(qr));
    expect(await hasValue()).toBe(true);
  });
});
