import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, SupportTicket, TenantContext } from '@iwana/db';
import {
  ScheduleEventStatus,
  SubscriberUpcomingVisitsResponseSchema,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { AssuranceSubscriberTicketsReadAdapter } from '../../assurance/ports/assurance-subscriber-tickets-read.adapter';
import { SubscriberUpcomingVisitsService } from '../services/subscriber-upcoming-visits.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const suffix = () => randomUUID().replaceAll('-', '').slice(0, 12);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

type TenantFixture = { id: string; schema: string };

/**
 * Spec 2026-11-20 v1.1 (bloque I, H13): CA-13 una prueba por origen y CA-15 sin fuga de
 * otro suscriptor ni de otro tenant. Postgres real, cadena de migraciones tenant vigente,
 * puerto de Assurance real sobre `support_tickets`; CRM simulado por su puerto.
 */
describeWithDb('Próximas visitas del suscriptor en PostgreSQL real (CA-13, CA-15)', () => {
  let dataSource: DataSource;
  const tenantA: TenantFixture = { id: randomUUID(), schema: `tenant_wfm_upcoming_a_${suffix()}` };
  const tenantB: TenantFixture = { id: randomUUID(), schema: `tenant_wfm_upcoming_b_${suffix()}` };
  const actorId = randomUUID();
  const subscriberId = randomUUID();
  const otherSubscriberId = randomUUID();
  const expedienteId = randomUUID();
  const contractId = randomUUID();
  const ids = {
    ticketRequester: randomUUID(),
    ticketContract: randomUUID(),
    ticketOther: randomUUID(),
    ticketTenantB: randomUUID(),
    reqOpportunity: randomUUID(),
    reqContract: randomUUID(),
    reqTicket: randomUUID(),
    reqTicketContract: randomUUID(),
    reqScheduledTicket: randomUUID(),
    eventScheduledTicket: randomUUID(),
    eventDirect: randomUUID(),
    reqClosed: randomUUID(),
    reqDeleted: randomUUID(),
    eventCancelled: randomUUID(),
    reqOther: randomUUID(),
    reqOtherTicket: randomUUID(),
    reqTenantB: randomUUID(),
    reqTenantBTicket: randomUUID(),
    eventTenantB: randomUUID(),
    ticketSubject: randomUUID(),
    reqTicketSubject: randomUUID(),
    reqScheduledNoEvent: randomUUID(),
  };
  const busySubscriberId = randomUUID();
  const busyEventId = randomUUID();

  const crmPortFor = (tenant: TenantFixture) => ({
    findExpedienteId: jest.fn(async (tenantId: string, schema: string, id: string) => {
      expect([tenantId, schema]).toEqual([tenant.id, tenant.schema]);
      return id === subscriberId && tenant === tenantA ? expedienteId : null;
    }),
    listContractIds: jest.fn(async (tenantId: string, schema: string, id: string) => {
      expect([tenantId, schema]).toEqual([tenant.id, tenant.schema]);
      return id === subscriberId && tenant === tenantA ? [contractId] : [];
    }),
  });

  const actorFor = (tenant: TenantFixture, role: UserRole) =>
    ({
      sub: actorId,
      role,
      tenantId: tenant.id,
      schemaName: tenant.schema,
      jti: randomUUID(),
      type: 'tenant',
    }) as JwtPayload;

  const listAs = (tenant: TenantFixture, id: string, role: UserRole = UserRole.SUPPORT) => {
    const crmPort = crmPortFor(tenant);
    const service = new SubscriberUpcomingVisitsService(
      dataSource,
      crmPort as never,
      new AssuranceSubscriberTicketsReadAdapter(dataSource, crmPort as never),
    );
    return TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schema, tenantSlug: `it-${tenant.id.slice(0, 8)}` },
      () => service.list(id, actorFor(tenant, role)),
    );
  };

  async function createTenant(tenant: TenantFixture): Promise<void> {
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenant.id,
        'WFM próximas visitas sintético',
        `wfm-upcoming-${tenant.id.slice(0, 8)}`,
        tenant.schema,
        'wfm-upcoming@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quote(tenant.schema)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      tenant.schema,
      `it-${tenant.schema}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function insertTicket(
    tenant: TenantFixture,
    id: string,
    number: string,
    requesterRefId: string | null,
    subject: { type: string; refId: string } | null,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${quote(tenant.schema)}.support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, requester_ref_id,
          subject_type, subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'CUSTOMER_INCIDENT', 'Ticket sintético', $4, $5, $6, $7, $8)`,
      [
        id,
        tenant.id,
        number,
        requesterRefId ? 'SUBSCRIBER' : 'SYSTEM',
        requesterRefId,
        subject?.type ?? null,
        subject?.refId ?? null,
        actorId,
      ],
    );
  }

  async function insertRequest(
    tenant: TenantFixture,
    id: string,
    values: {
      status?: VisitRequestStatus;
      origin?: WorkOrderSourceContext;
      subscriberId?: string | null;
      expedienteId?: string | null;
      contractId?: string | null;
      ticketId?: string | null;
      scheduleEventId?: string | null;
      deleted?: boolean;
    },
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${quote(tenant.schema)}.visit_requests
         (id, tenant_id, status, origin_context, work_type, priority, title, requested_by_user_id,
          origin_ref, subscriber_id, expediente_id, contract_id, ticket_id, schedule_event_id,
          requested_window_start_at, address, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Visita sintética', $7, $8, $9, $10, $11, $12, $13,
               '2099-11-01T14:00:00Z', 'Dirección sintética', $14)`,
      [
        id,
        tenant.id,
        values.status ?? VisitRequestStatus.PENDING,
        values.origin ?? WorkOrderSourceContext.MANUAL,
        WfmWorkType.SUPPORT,
        WorkOrderPriority.NORMAL,
        actorId,
        `it-${id}`,
        values.subscriberId ?? null,
        values.expedienteId ?? null,
        values.contractId ?? null,
        values.ticketId ?? null,
        values.scheduleEventId ?? null,
        values.deleted ? new Date().toISOString() : null,
      ],
    );
  }

  async function insertEvent(
    tenant: TenantFixture,
    id: string,
    values: { status: ScheduleEventStatus; subscriberId?: string | null; ticketId?: string | null },
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${quote(tenant.schema)}.schedule_events
         (id, tenant_id, type, status, title, scheduled_start_at, scheduled_end_at,
          assigned_user_id, subscriber_id, ticket_id, created_by)
       VALUES ($1, $2, $3, $4, 'Evento sintético', '2099-11-05T15:00:00Z', '2099-11-05T16:00:00Z',
               $5, $6, $7, $5)`,
      [
        id,
        tenant.id,
        WfmWorkType.SUPPORT,
        values.status,
        actorId,
        values.subscriberId ?? null,
        values.ticketId ?? null,
      ],
    );
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? 'iwana';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error('Integración próximas visitas: DB_NAME debe ser test o iwana_it_*.');
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await createTenant(tenantA);
    await createTenant(tenantB);

    // Tickets: del suscriptor como solicitante, por un contrato suyo, de otro suscriptor y,
    // en el tenant B, uno con el mismo id de suscriptor.
    await insertTicket(tenantA, ids.ticketRequester, 'TCK-IT-1', subscriberId, null);
    await insertTicket(tenantA, ids.ticketContract, 'TCK-IT-2', null, {
      type: 'CONTRACT',
      refId: contractId,
    });
    await insertTicket(tenantA, ids.ticketOther, 'TCK-IT-3', otherSubscriberId, null);
    await insertTicket(tenantA, ids.ticketSubject, 'TCK-IT-4', null, {
      type: 'SUBSCRIBER',
      refId: subscriberId,
    });
    await insertRequest(tenantA, ids.reqTicketSubject, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketSubject,
    });
    // SCHEDULED sin evento activo (desfase): fila REQUEST con scheduledAt null.
    await insertRequest(tenantA, ids.reqScheduledNoEvent, {
      subscriberId,
      status: VisitRequestStatus.SCHEDULED,
    });
    // Suscriptor con más visitas que el tope: 52 solicitudes y 1 evento.
    for (let index = 0; index < 52; index += 1) {
      await insertRequest(tenantA, randomUUID(), { subscriberId: busySubscriberId });
    }
    await insertEvent(tenantA, busyEventId, {
      status: ScheduleEventStatus.SCHEDULED,
      subscriberId: busySubscriberId,
    });
    await insertTicket(tenantB, ids.ticketTenantB, 'TCK-IT-B', subscriberId, null);

    // Origen oportunidad: solo expediente, sin suscriptor directo.
    await insertRequest(tenantA, ids.reqOpportunity, {
      origin: WorkOrderSourceContext.CRM,
      expedienteId,
    });
    // Origen contrato: solo contrato.
    await insertRequest(tenantA, ids.reqContract, { contractId });
    // Origen ticket (H13): sin suscriptor, como la crea el portal desde un ticket.
    await insertRequest(tenantA, ids.reqTicket, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketRequester,
      status: VisitRequestStatus.NEEDS_CONTEXT,
    });
    await insertRequest(tenantA, ids.reqTicketContract, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketContract,
      status: VisitRequestStatus.READY_TO_SCHEDULE,
    });
    // Ticket ya agendado: una sola fila (el evento) con la solicitud enlazada.
    await insertEvent(tenantA, ids.eventScheduledTicket, {
      status: ScheduleEventStatus.SCHEDULED,
      ticketId: ids.ticketRequester,
    });
    await insertRequest(tenantA, ids.reqScheduledTicket, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketRequester,
      status: VisitRequestStatus.SCHEDULED,
      scheduleEventId: ids.eventScheduledTicket,
    });
    // Directa al suscriptor, sin oportunidad ni contrato.
    await insertEvent(tenantA, ids.eventDirect, {
      status: ScheduleEventStatus.DRAFT,
      subscriberId,
    });
    // Inactivas o borradas: fuera.
    await insertRequest(tenantA, ids.reqClosed, {
      subscriberId,
      status: VisitRequestStatus.CLOSED,
    });
    await insertRequest(tenantA, ids.reqDeleted, { subscriberId, deleted: true });
    await insertEvent(tenantA, ids.eventCancelled, {
      status: ScheduleEventStatus.CANCELLED,
      subscriberId,
    });
    // Otro suscriptor (CA-15).
    await insertRequest(tenantA, ids.reqOther, { subscriberId: otherSubscriberId });
    await insertRequest(tenantA, ids.reqOtherTicket, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketOther,
    });
    // Otro tenant con el mismo id de suscriptor (CA-15).
    await insertRequest(tenantB, ids.reqTenantB, { subscriberId });
    await insertRequest(tenantB, ids.reqTenantBTicket, {
      origin: WorkOrderSourceContext.ASSURANCE,
      ticketId: ids.ticketTenantB,
    });
    await insertEvent(tenantB, ids.eventTenantB, {
      status: ScheduleEventStatus.DRAFT,
      subscriberId,
    });
  }, 300_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      for (const tenant of [tenantA, tenantB]) {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quote(tenant.schema)} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenant.id]);
      }
    } finally {
      await dataSource.destroy();
    }
  });

  const view = async (tenant: TenantFixture = tenantA, id: string = subscriberId) => {
    const response = await listAs(tenant, id);
    expect(SubscriberUpcomingVisitsResponseSchema.safeParse(response).success).toBe(true);
    return {
      response,
      item: (rowId: string) => response.items.find((entry) => entry.id === rowId),
    };
  };

  it('CA-13 origen oportunidad: la solicitud del expediente sale con su id para enlazar', async () => {
    const { item } = await view();
    expect(item(ids.reqOpportunity)).toMatchObject({
      kind: 'REQUEST',
      scheduledAt: null,
      visitRequestId: ids.reqOpportunity,
      scheduleEventId: null,
      origin: { type: 'OPPORTUNITY', expedienteId, ticketId: null, contractId: null },
    });
  });

  it('CA-13 origen contrato: la solicitud de un contrato del suscriptor sale con su contrato', async () => {
    const { item } = await view();
    expect(item(ids.reqContract)).toMatchObject({
      kind: 'REQUEST',
      workType: WfmWorkType.SUPPORT,
      origin: { type: 'CONTRACT', contractId, ticketId: null, expedienteId: null },
      address: 'Dirección sintética',
      requestedWindowStartAt: '2099-11-01T14:00:00.000Z',
    });
  });

  it('CA-13 origen ticket (H13): sin suscriptor guardado, llega por los tickets del suscriptor', async () => {
    const { item } = await view();
    expect(item(ids.reqTicket)).toMatchObject({
      kind: 'REQUEST',
      status: VisitRequestStatus.NEEDS_CONTEXT,
      origin: { type: 'TICKET', ticketId: ids.ticketRequester, ticketNumber: 'TCK-IT-1' },
    });
    // Ticket vinculado por un contrato del suscriptor (misma regla que el listado de tickets).
    expect(item(ids.reqTicketContract)).toMatchObject({
      origin: { type: 'TICKET', ticketId: ids.ticketContract, ticketNumber: 'TCK-IT-2' },
    });
  });

  it('CA-14 una sola fila por visita: la agendada sale como evento con su solicitud y fecha', async () => {
    const { response, item } = await view();
    expect(item(ids.reqScheduledTicket)).toBeUndefined();
    expect(item(ids.eventScheduledTicket)).toMatchObject({
      kind: 'EVENT',
      key: `EVENT:${ids.eventScheduledTicket}`,
      visitRequestId: ids.reqScheduledTicket,
      scheduleEventId: ids.eventScheduledTicket,
      scheduledAt: '2099-11-05T15:00:00.000Z',
      origin: { type: 'TICKET', ticketId: ids.ticketRequester },
    });
    const keys = response.items.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('devuelve solo activas: sin cerradas, canceladas ni borradas; por agendar primero', async () => {
    const { response, item } = await view();
    expect(item(ids.eventDirect)).toMatchObject({ kind: 'EVENT', origin: { type: 'NONE' } });
    expect(response.items.map((entry) => entry.id).sort()).toEqual(
      [
        ids.reqOpportunity,
        ids.reqContract,
        ids.reqTicket,
        ids.reqTicketContract,
        ids.eventScheduledTicket,
        ids.eventDirect,
        ids.reqTicketSubject,
        ids.reqScheduledNoEvent,
      ].sort(),
    );
    expect(response).toMatchObject({ total: 8, truncated: false });
    const firstScheduled = response.items.findIndex((entry) => entry.scheduledAt !== null);
    expect(firstScheduled).toBeGreaterThan(0);
    expect(response.items.slice(firstScheduled).every((entry) => entry.scheduledAt !== null)).toBe(
      true,
    );
  });

  it('CA-15 no muestra visitas de otro suscriptor ni de sus tickets', async () => {
    const { response } = await view();
    const listed = response.items.map((entry) => entry.id);
    expect(listed).not.toContain(ids.reqOther);
    expect(listed).not.toContain(ids.reqOtherTicket);
    const other = await view(tenantA, otherSubscriberId);
    expect(other.response.items.map((entry) => entry.id).sort()).toEqual(
      [ids.reqOther, ids.reqOtherTicket].sort(),
    );
  });

  it('CA-15 no cruza tenants: el mismo id de suscriptor en otro tenant solo ve lo suyo', async () => {
    const { response } = await view();
    const listed = response.items.map((entry) => entry.id);
    for (const foreign of [ids.reqTenantB, ids.reqTenantBTicket, ids.eventTenantB]) {
      expect(listed).not.toContain(foreign);
    }
    const tenantBView = await view(tenantB);
    expect(tenantBView.response.items.map((entry) => entry.id).sort()).toEqual(
      [ids.reqTenantB, ids.reqTenantBTicket, ids.eventTenantB].sort(),
    );
    expect(tenantBView.item(ids.reqTenantBTicket)?.origin.ticketNumber).toBe('TCK-IT-B');
  });

  it('CA-15 un rol de campo no consulta las visitas del suscriptor', async () => {
    await expect(listAs(tenantA, subscriberId, UserRole.TECHNICIAN)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un suscriptor sin visitas devuelve la lista vacía', async () => {
    const { response } = await view(tenantA, randomUUID());
    expect(response).toEqual({ items: [], total: 0, truncated: false });
  });

  it('paridad de vínculo ticket→suscriptor: solicitante, asunto suscriptor y asunto contrato', async () => {
    const { item } = await view();
    expect(item(ids.reqTicket)?.origin.ticketNumber).toBe('TCK-IT-1');
    expect(item(ids.reqTicketSubject)?.origin.ticketNumber).toBe('TCK-IT-4');
    expect(item(ids.reqTicketContract)?.origin.ticketNumber).toBe('TCK-IT-2');
  });

  it('contrato: una solicitud SCHEDULED sin evento activo sale como REQUEST con scheduledAt null', async () => {
    const { item } = await view();
    expect(item(ids.reqScheduledNoEvent)).toMatchObject({
      kind: 'REQUEST',
      status: VisitRequestStatus.SCHEDULED,
      scheduledAt: null,
      scheduleEventId: null,
    });
  });

  it('tope: 50 filas, total exacto agregado y truncated; por agendar primero', async () => {
    const { response } = await view(tenantA, busySubscriberId);
    expect(response.items).toHaveLength(50);
    expect(response).toMatchObject({ total: 53, truncated: true });
    expect(response.items.every((entry) => entry.kind === 'REQUEST')).toBe(true);
    expect(response.items.map((entry) => entry.id)).not.toContain(busyEventId);
  });
});
