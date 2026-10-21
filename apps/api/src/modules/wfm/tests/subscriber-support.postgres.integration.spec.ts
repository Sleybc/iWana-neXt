import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  resolveMigrationDbCredentials,
  ScheduleEvent,
  TenantContext,
  VisitRequest,
} from '@iwana/db';
import {
  ScheduleEventStatus,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AddSubscriberSupportLookupIndexes1590000000000 } from '../../../../../../packages/database/src/migrations/tenant/159_subscriber_support_lookup_indexes';
import { VisitRequestsService } from '../services/visit-requests.service';
import { ScheduleEventsService } from '../services/schedule-events.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_wfm_subscriber_support_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const tenantId = randomUUID();

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('MOD05 E6 — filtros WFM por suscriptor en PostgreSQL real', () => {
  let dataSource: DataSource;
  const subscriberId = randomUUID();
  const otherSubscriberId = randomUUID();
  const expedienteId = randomUUID();
  const actorId = randomUUID();
  const visitRequestIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const q = (table: string) => `${quoteIdentifier(schemaName)}.${quoteIdentifier(table)}`;
  const actor = {
    sub: actorId,
    role: UserRole.ADMIN,
    tenantId: '',
    schemaName: '',
    jti: randomUUID(),
    type: 'tenant',
  } as JwtPayload;

  const crmSubscriberReadPort = {
    findExpedienteId: jest.fn(async (requestedTenantId: string, requestedSchemaName: string) => {
      expect(requestedTenantId).toBe(tenantId);
      expect(requestedSchemaName).toBe(schemaName);
      return expedienteId;
    }),
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'wfm-subscriber-support-it' }, operation);

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? 'iwana';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración WFM suscriptor: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }

    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      schema: schemaName,
      entities: [VisitRequest, ScheduleEvent],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await dataSource.synchronize();
    actor.tenantId = tenantId;
    actor.schemaName = schemaName;

    const migrationQueryRunner = dataSource.createQueryRunner();
    await migrationQueryRunner.connect();
    try {
      await migrationQueryRunner.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
      await migrationQueryRunner.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          expediente_id uuid,
          deleted_at timestamptz
        )
      `);
      await migrationQueryRunner.query(`
        CREATE TABLE contracts (
          tenant_id uuid NOT NULL,
          subscriber_id uuid NOT NULL,
          deleted_at timestamptz
        )
      `);
      await migrationQueryRunner.query(`
        CREATE TABLE support_tickets (
          tenant_id uuid NOT NULL,
          requester_type text NOT NULL,
          requester_ref_id varchar(160),
          subject_type text,
          subject_ref_id varchar(160),
          deleted_at timestamptz
        )
      `);
      await new AddSubscriberSupportLookupIndexes1590000000000().up(migrationQueryRunner);
    } finally {
      await migrationQueryRunner.release();
    }

    await dataSource.query(
      `INSERT INTO ${q('visit_requests')}
        (id, tenant_id, status, origin_context, work_type, priority, title,
         requested_by_user_id, origin_ref, expediente_id, subscriber_id, ticket_id)
       VALUES
        ($1, $5, $6, $7, $8, $9, 'Visita vinculada directamente', $10, $17, NULL, $11, NULL),
        ($2, $5, $6, $12, $8, $9, 'Visita vinculada por expediente', $10, $18, $13, NULL, NULL),
        ($3, $5, $6, $14, $8, $9, 'Visita originada por ticket', $10, $19, $13, $11, $15),
        ($4, $5, $6, $7, $8, $9, 'Visita de otro suscriptor', $10, $20, NULL, $16, NULL)`,
      [
        ...visitRequestIds,
        tenantId,
        VisitRequestStatus.PENDING,
        WorkOrderSourceContext.MANUAL,
        WfmWorkType.SUPPORT,
        WorkOrderPriority.NORMAL,
        actorId,
        subscriberId,
        WorkOrderSourceContext.CRM,
        expedienteId,
        WorkOrderSourceContext.ASSURANCE,
        `ticket-${randomUUID()}`,
        otherSubscriberId,
        `direct-${randomUUID()}`,
        `expediente-${randomUUID()}`,
        `assurance-${randomUUID()}`,
        `other-${randomUUID()}`,
      ],
    );

    const scheduledStartAt = '2099-10-20T15:00:00.000Z';
    const scheduledEndAt = '2099-10-20T16:00:00.000Z';
    await dataSource.query(
      `INSERT INTO ${q('schedule_events')}
        (id, tenant_id, type, status, title, scheduled_start_at, scheduled_end_at,
         assigned_user_id, expediente_id, subscriber_id, ticket_id, created_by)
       VALUES
        ($1, $5, $6, $7, 'Evento vinculado directamente', $8, $9, $10, NULL, $11, NULL, $10),
        ($2, $5, $6, $7, 'Evento vinculado por expediente', $8, $9, $10, $12, NULL, NULL, $10),
        ($3, $5, $6, $7, 'Evento originado por ticket', $8, $9, $10, $12, $11, $13, $10),
        ($4, $5, $6, $7, 'Evento de otro suscriptor', $8, $9, $10, NULL, $14, NULL, $10)`,
      [
        ...eventIds,
        tenantId,
        WfmWorkType.SUPPORT,
        ScheduleEventStatus.DRAFT,
        scheduledStartAt,
        scheduledEndAt,
        actorId,
        subscriberId,
        expedienteId,
        `ticket-${randomUUID()}`,
        otherSubscriberId,
      ],
    );
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    } finally {
      await dataSource.destroy();
    }
  });

  it('returns only direct-subscriber or CRM-expediente visits, excluding ticket origins', async () => {
    const service = new VisitRequestsService(
      dataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findDisplayNamesByIds: jest.fn().mockResolvedValue(new Map([[expedienteId, null]])),
      } as never,
      {} as never,
      crmSubscriberReadPort as never,
    );

    const result = await inTenant(() =>
      service.listVisitRequests({ subscriberId, page: 1, limit: 20 }, actor),
    );

    expect(result.items.map(({ id }) => id).sort()).toEqual(
      [visitRequestIds[0], visitRequestIds[1]].sort(),
    );
    expect(result.meta.total).toBe(2);
    expect(crmSubscriberReadPort.findExpedienteId).toHaveBeenCalledWith(
      tenantId,
      schemaName,
      subscriberId,
    );
  });

  it('returns only direct-subscriber or CRM-expediente events, excluding ticket origins', async () => {
    const service = new ScheduleEventsService(
      dataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      crmSubscriberReadPort as never,
    );

    const result = await inTenant(() => service.list({ subscriberId }, actor));

    expect(result.data.map(({ id }) => id).sort()).toEqual([eventIds[0], eventIds[1]].sort());
    expect(result.meta.total).toBe(2);
    expect(crmSubscriberReadPort.findExpedienteId).toHaveBeenCalledWith(
      tenantId,
      schemaName,
      subscriberId,
    );
  });

  it('uses subscriber and expediente indexes for the visit-request lookup', async () => {
    await dataSource.query(
      `INSERT INTO ${q('visit_requests')} (
         id, tenant_id, status, origin_context, work_type, priority, title,
         requested_by_user_id, origin_ref, expediente_id, subscriber_id, ticket_id
       )
       SELECT md5('wfm-subscriber-support-visit-' || sequence)::uuid,
              $1, $2, $3, $4, $5, 'Fixture de búsqueda', $6,
              'support-index-' || sequence::text,
              md5('other-expediente-' || sequence)::uuid,
              md5('other-subscriber-' || sequence)::uuid,
              NULL
         FROM generate_series(1, 5000) AS sequence`,
      [
        tenantId,
        VisitRequestStatus.PENDING,
        WorkOrderSourceContext.MANUAL,
        WfmWorkType.SUPPORT,
        WorkOrderPriority.NORMAL,
        actorId,
      ],
    );
    await dataSource.query(`ANALYZE ${q('visit_requests')}`);

    const plan = await dataSource.query(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT id
         FROM ${q('visit_requests')}
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (subscriber_id = $2 OR expediente_id = $3)
          AND ticket_id IS NULL`,
      [tenantId, subscriberId, expedienteId],
    );
    const explainJson = JSON.stringify(plan);

    expect(explainJson).toContain('idx_visit_requests_tenant_subscriber');
    expect(explainJson).toContain('idx_visit_requests_tenant_expediente');
    expect(explainJson).not.toContain('"Node Type":"Seq Scan"');
  });

  it('uses subscriber and expediente indexes for the schedule-event lookup', async () => {
    await dataSource.query(
      `INSERT INTO ${q('schedule_events')} (
         id, tenant_id, type, status, title, scheduled_start_at, scheduled_end_at,
         assigned_user_id, expediente_id, subscriber_id, ticket_id, created_by
       )
       SELECT md5('wfm-subscriber-support-event-' || sequence)::uuid,
              $1, $2, $3, 'Fixture de búsqueda', $4, $5,
              $6,
              md5('other-expediente-' || sequence)::uuid,
              md5('other-subscriber-' || sequence)::uuid,
              NULL, $6
         FROM generate_series(1, 5000) AS sequence`,
      [
        tenantId,
        WfmWorkType.SUPPORT,
        ScheduleEventStatus.DRAFT,
        '2099-10-20T15:00:00.000Z',
        '2099-10-20T16:00:00.000Z',
        actorId,
      ],
    );
    await dataSource.query(`ANALYZE ${q('schedule_events')}`);

    const plan = await dataSource.query(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT id
         FROM ${q('schedule_events')}
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (subscriber_id = $2 OR expediente_id = $3)
          AND ticket_id IS NULL`,
      [tenantId, subscriberId, expedienteId],
    );
    const explainJson = JSON.stringify(plan);

    expect(explainJson).toContain('idx_schedule_events_tenant_subscriber');
    expect(explainJson).toContain('idx_schedule_events_tenant_expediente');
    expect(explainJson).not.toContain('"Node Type":"Seq Scan"');
  });
});
