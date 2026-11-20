import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, SupportTicket, TicketTimelineEvent } from '@iwana/db';
import {
  ExecutionOrderResult,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
} from '@iwana/shared';
import { AssuranceExecutionOrderNotifierAdapter } from '../ports/assurance-execution-order-notifier.adapter';
import { SlaService } from '../services/sla.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_assurance_autoresolve_${randomBytes(5).toString('hex')}`;
const quotedSchema = `"${schemaName}"`;
const tenantId = randomUUID();
const actorId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración de resolución automática: DB_NAME debe ser test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Ticket de instalación — resolución automática en PostgreSQL real', () => {
  let dataSource: DataSource;
  let adapter: AssuranceExecutionOrderNotifierAdapter;

  async function insertTicket(type: TicketType, subjectType: TicketSubjectType): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quotedSchema}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, subject_type, subject_ref_id,
         sla_breach_status, field_decision, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        tenantId,
        `IT-${randomBytes(10).toString('hex')}`,
        type,
        TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.INTERNAL,
        'Fixture sintético de instalación',
        TicketRequesterType.INTERNAL_USER,
        subjectType,
        randomUUID(),
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
      ],
    );
    return id;
  }

  async function ticketRow(
    id: string,
  ): Promise<{ status: string; resolved_at: Date | null; first_responded_at: Date | null }> {
    const rows = (await dataSource.query(
      `SELECT status::text AS status, resolved_at, first_responded_at
         FROM ${quotedSchema}.support_tickets WHERE id = $1`,
      [id],
    )) as Array<{ status: string; resolved_at: Date | null; first_responded_at: Date | null }>;
    return rows[0]!;
  }

  async function eventTypes(ticketId: string): Promise<string[]> {
    const rows = (await dataSource.query(
      `SELECT event_type::text AS event_type FROM ${quotedSchema}.ticket_timeline_events
        WHERE ticket_id = $1 ORDER BY occurred_at, event_type`,
      [ticketId],
    )) as Array<{ event_type: string }>;
    return rows.map((row) => row.event_type).sort();
  }

  const close = (ticketId: string, result: ExecutionOrderResult) =>
    adapter.notifyClosed({
      ticketId,
      executionOrderId: randomUUID(),
      result,
      tenantId,
      schemaName,
      actorUserId: actorId,
    });

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket, TicketTimelineEvent],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Assurance resolución automática sintética',
        `assurance-autoresolve-${tenantId.slice(0, 8)}`,
        schemaName,
        'assurance-autoresolve@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `assurance-autoresolve-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    adapter = new AssuranceExecutionOrderNotifierAdapter(
      dataSource,
      new TimelineService(dataSource),
      new SlaService(dataSource),
    );
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

  it('resuelve el ticket de instalación al cerrar la orden como ejecutada', async () => {
    const id = await insertTicket(TicketType.OPERATIONAL_TASK, TicketSubjectType.EXPEDIENTE);

    await close(id, ExecutionOrderResult.EXECUTED);

    const row = await ticketRow(id);
    expect(row.status).toBe(TicketStatus.RESOLVED);
    expect(row.resolved_at).toBeInstanceOf(Date);
    expect(row.first_responded_at).toBeInstanceOf(Date);
    expect(await eventTypes(id)).toEqual([
      TicketTimelineEventType.EXECUTION_ORDER_CLOSED,
      TicketTimelineEventType.STATUS_CHANGED,
    ]);
  });

  it('deja el ticket abierto si la orden cierra con seguimiento pendiente', async () => {
    const id = await insertTicket(TicketType.OPERATIONAL_TASK, TicketSubjectType.EXPEDIENTE);

    await close(id, ExecutionOrderResult.REQUIRES_FOLLOW_UP);

    expect((await ticketRow(id)).status).toBe(TicketStatus.OPEN);
    expect(await eventTypes(id)).toEqual([TicketTimelineEventType.EXECUTION_ORDER_CLOSED]);
  });

  it('no resuelve el ticket de un cliente aunque su orden cierre como ejecutada', async () => {
    const id = await insertTicket(TicketType.CUSTOMER_INCIDENT, TicketSubjectType.SUBSCRIBER);

    await close(id, ExecutionOrderResult.EXECUTED);

    expect((await ticketRow(id)).status).toBe(TicketStatus.OPEN);
  });
});
