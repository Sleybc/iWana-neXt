import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  resolveMigrationDbCredentials,
  runInTenantSchema,
  SupportTicket,
  TenantContext,
} from '@iwana/db';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { TicketsService } from '../services/tickets.service';
import { AddSubscriberSupportLookupIndexes1590000000000 } from '../../../../../../packages/database/src/migrations/tenant/159_subscriber_support_lookup_indexes';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_assurance_support_${randomBytes(5).toString('hex')}`;
const quotedSchema = `"${schemaName}"`;
const tenantId = randomUUID();
const subscriberId = randomUUID();
const otherSubscriberId = randomUUID();
const contractId = randomUUID();
const otherContractId = randomUUID();
const actorId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración Assurance subscriberId: DB_NAME debe ser test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('Assurance tickets por suscriptor — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: TicketsService;
  const listContractIdsMock = jest.fn().mockResolvedValue([contractId]);
  const crmSubscriberReadPort = {
    listContractIds: listContractIdsMock,
  } as unknown as CrmSubscriberReadPort;

  const actor: JwtPayload = {
    sub: actorId,
    email: 'assurance-it@example.invalid',
    role: UserRole.ADMIN,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'assurance-support-it' }, operation);

  async function insertTicket(input: {
    requesterType: TicketRequesterType;
    requesterRefId?: string | null;
    subjectType?: TicketSubjectType | null;
    subjectRefId?: string | null;
    ticketTenantId?: string;
    createdAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quotedSchema}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, subject_type, subject_ref_id,
         sla_breach_status, field_decision, created_by_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [
        id,
        input.ticketTenantId ?? tenantId,
        `IT-${randomBytes(10).toString('hex')}`,
        TicketType.CUSTOMER_INCIDENT,
        TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Fixture sintético de Assurance',
        input.requesterType,
        input.requesterRefId ?? null,
        input.subjectType ?? null,
        input.subjectRefId ?? null,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
        input.createdAt ?? new Date(),
      ],
    );
    return id;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`SET search_path TO ${quotedSchema}`);
      await queryRunner.query(`
        CREATE TABLE support_tickets (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          ticket_number varchar(30) NOT NULL UNIQUE,
          type text NOT NULL,
          status text NOT NULL,
          priority text NOT NULL,
          source text NOT NULL,
          subject varchar(200) NOT NULL,
          description text,
          requester_type text NOT NULL,
          requester_ref_id varchar(160),
          subject_type text,
          subject_ref_id varchar(160),
          assigned_user_id uuid,
          queue_name text,
          sla_policy_id uuid,
          sla_first_response_at timestamptz,
          sla_resolve_by_at timestamptz,
          first_responded_at timestamptz,
          resolved_at timestamptz,
          closed_at timestamptz,
          sla_breach_status text NOT NULL,
          field_decision text NOT NULL,
          work_order_id uuid,
          created_by_user_id uuid NOT NULL,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `);
      await queryRunner.query(`
        CREATE TABLE visit_requests (
          tenant_id uuid,
          subscriber_id uuid,
          expediente_id uuid,
          deleted_at timestamptz
        )
      `);
      await queryRunner.query('CREATE TABLE schedule_events (tenant_id uuid, subscriber_id uuid)');
      await new AddSubscriberSupportLookupIndexes1590000000000().up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    service = new TicketsService(
      dataSource,
      { deriveBreachStatus: jest.fn().mockReturnValue(SlaBreachStatus.OK) } as never,
      {} as never,
      {} as never,
      {} as never,
      crmSubscriberReadPort as never,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  beforeEach(() => {
    listContractIdsMock.mockReset().mockResolvedValue([contractId]);
  });

  it('incluye las tres vías de vínculo del suscriptor y excluye otros suscriptores y tenants', async () => {
    const requesterTicketId = await insertTicket({
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subscriberId,
    });
    const subjectTicketId = await insertTicket({
      requesterType: TicketRequesterType.INTERNAL_USER,
      subjectType: TicketSubjectType.SUBSCRIBER,
      subjectRefId: subscriberId,
    });
    const contractTicketId = await insertTicket({
      requesterType: TicketRequesterType.INTERNAL_USER,
      subjectType: TicketSubjectType.CONTRACT,
      subjectRefId: contractId,
    });
    await insertTicket({
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: otherSubscriberId,
    });
    await insertTicket({
      requesterType: TicketRequesterType.INTERNAL_USER,
      subjectType: TicketSubjectType.CONTRACT,
      subjectRefId: otherContractId,
    });
    await insertTicket({
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subscriberId,
      ticketTenantId: randomUUID(),
    });

    const result = await inTenant(() => service.list({ subscriberId } as never, actor));

    expect((result.data as SupportTicket[]).map(({ id }) => id).sort()).toEqual(
      [requesterTicketId, subjectTicketId, contractTicketId].sort(),
    );
    expect(result.total).toBe(3);
    expect(listContractIdsMock).toHaveBeenCalledTimes(1);
    expect(listContractIdsMock).toHaveBeenCalledWith(tenantId, schemaName, subscriberId);
  });

  it('usa los índices de Assurance 159 para las ramas de vínculo del filtro', async () => {
    await dataSource.query(
      `INSERT INTO ${quotedSchema}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, sla_breach_status, field_decision,
         created_by_user_id, created_at, updated_at
       )
       SELECT md5('assurance-support-' || sequence)::uuid,
              $1, 'PLAN-' || lpad(sequence::text, 8, '0'),
              $2, $3, $4, $5, 'Fixture de plan', $6,
              md5('other-subscriber-' || sequence), $7, $8, $9, now(), now()
         FROM generate_series(1, 5000) AS sequence`,
      [
        tenantId,
        TicketType.CUSTOMER_INCIDENT,
        TicketStatus.OPEN,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        TicketRequesterType.SUBSCRIBER,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
      ],
    );
    await dataSource.query(`ANALYZE ${quotedSchema}.support_tickets`);

    const plan = await runInTenantSchema(dataSource, schemaName, async (queryRunner) => {
      return queryRunner.query(
        `EXPLAIN (ANALYZE, FORMAT JSON)
         SELECT st.id
           FROM support_tickets st
          WHERE st.tenant_id = $1
            AND (
              (st.requester_type = $2 AND st.requester_ref_id = $3)
              OR (st.subject_type = $4 AND st.subject_ref_id = $3)
              OR (st.subject_type = $5 AND st.subject_ref_id = ANY($6::varchar[]))
            )`,
        [
          tenantId,
          TicketRequesterType.SUBSCRIBER,
          subscriberId,
          TicketSubjectType.SUBSCRIBER,
          TicketSubjectType.CONTRACT,
          [contractId],
        ],
      );
    });
    const explainJson = JSON.stringify(plan);

    expect(explainJson).toContain('idx_support_tickets_tenant_requester_subscriber');
    expect(explainJson).toContain('idx_support_tickets_tenant_subject');
    expect(explainJson).not.toContain('"Node Type":"Seq Scan"');
  });
});
