import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  resolveMigrationDbCredentials,
  runInTenantSchema,
  SupportTicket,
  TenantContext,
  TicketPqrRecord,
  TicketTimelineEvent,
} from '@iwana/db';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketDetailExtensionSchema,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { SubscribersService } from '../../crm/subscribers/subscribers.service';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';
import { FieldServiceWorkAdapter } from '../../wfm/ports/field-service-work.adapter';
import { PqrService } from '../services/pqr.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * MOD10 detalle del ticket, paso 2 — PostgreSQL real con los adaptadores reales de CRM
 * (marcas de privacidad incluidas), programación (WFM) y órdenes de ejecución (MOD11).
 * Ningún puerto es un doble: solo los permisos efectivos y el SLA son fijos.
 * El servicio corre sobre un DataSource de UNA conexión: si un puerto abriera la suya,
 * la lectura esperaría al pool y fallaría por tiempo (R-pool).
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_assurance_detail_${randomBytes(5).toString('hex')}`;
const q = `"${schemaName}"`;
const tenantId = randomUUID();
const actorId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración detalle de ticket: DB_NAME debe ser test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

const ALL_READ = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.CRM_EXPEDIENTES_READ,
  // Con permiso de ver datos bloqueados: el detalle del ticket igual los oculta (R4).
  AccessPermissionKey.CRM_BLOCKED_DATA_READ,
];

describeWithDb('Assurance detalle del ticket — PostgreSQL real, adaptadores reales', () => {
  let admin: DataSource;
  let single: DataSource;
  let service: TicketsService;
  let permissions: string[] = ALL_READ;
  let crmShouldFail = false;

  const ids = {
    plainSubscriber: randomUUID(),
    blockedSubscriber: randomUUID(),
    blockedParty: randomUUID(),
    anonymizedSubscriber: randomUUID(),
    plainContract: randomUUID(),
    blockedContract: randomUUID(),
    plainExpediente: randomUUID(),
    blockedExpediente: randomUUID(),
  };

  const actor = (role: UserRole = UserRole.SUPPORT, sub = actorId): JwtPayload => ({
    sub,
    email: 'detail-it@example.invalid',
    role,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  });

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'assurance-detail-it' }, operation);

  const sql = (text: string, params: unknown[] = []) =>
    runInTenantSchema(admin, schemaName, (qr) => qr.query(text, params));

  async function insertTicket(input: {
    requesterType?: TicketRequesterType;
    requesterRefId?: string | null;
    subjectType?: TicketSubjectType | null;
    subjectRefId?: string | null;
    status?: TicketStatus;
    type?: TicketType;
    assignedUserId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO ${q}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, subject_type, subject_ref_id, assigned_user_id,
         sla_breach_status, field_decision, created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        tenantId,
        `IT-${randomBytes(8).toString('hex')}`,
        input.type ?? TicketType.CUSTOMER_INCIDENT,
        input.status ?? TicketStatus.IN_PROGRESS,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Fixture sintético del detalle',
        input.requesterType ?? TicketRequesterType.SUBSCRIBER,
        input.requesterRefId ?? null,
        input.subjectType ?? null,
        input.subjectRefId ?? null,
        input.assignedUserId ?? null,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
      ],
    );
    return id;
  }

  async function insertOrder(input: {
    number: string;
    ticketId?: string | null;
    annulled?: boolean;
    createdAt?: string;
  }): Promise<string> {
    const id = randomUUID();
    await sql(
      `INSERT INTO execution_orders
         (id, tenant_id, execution_order_number, origin_context, customer_display_label,
          work_type, work_summary, ticket_id, status, is_annulled, created_at)
       VALUES ($1, $2, $3, 'ASSURANCE', 'Cliente sintético', 'SUPPORT', 'Visita sintética', $4,
               $5, $6, COALESCE($7::timestamptz, now()))`,
      [
        id,
        tenantId,
        input.number,
        input.ticketId ?? null,
        input.annulled ? 'CANCELLED' : 'ASSIGNED',
        input.annulled ?? false,
        input.createdAt ?? null,
      ],
    );
    return id;
  }

  const detail = (ticketId: string, who: JwtPayload = actor()) =>
    inTenant(() => service.getDetail(ticketId, who));

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    const base = {
      type: 'postgres' as const,
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket, TicketTimelineEvent, TicketPqrRecord, PartyPrivacyMarkEntity],
      migrations: [],
      synchronize: false,
      logging: false,
    };
    admin = new DataSource({ ...base, extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 } });
    await admin.initialize();
    single = new DataSource({ ...base, extra: { max: 1, min: 0, connectionTimeoutMillis: 3_000 } });
    await single.initialize();

    await admin.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Detalle de ticket sintético', $2, $3, 'ACTIVE', 'detail-it@example.invalid')`,
      [tenantId, `assurance-detail-${tenantId.slice(0, 8)}`, schemaName],
    );
    await admin.query(`CREATE SCHEMA ${q}`);
    const tenantDataSource = createTenantDataSource(admin, schemaName, `detail-${schemaName}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    await sql(
      `INSERT INTO expediente_records (id, tenant_id, full_name, created_by)
       VALUES ($1, $3, 'Expediente Visible', $4), ($2, $3, 'Expediente Bloqueado', $4)`,
      [ids.plainExpediente, ids.blockedExpediente, tenantId, actorId],
    );
    await sql(
      `INSERT INTO party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular Bloqueado')`,
      [ids.blockedParty, `DOC-${ids.blockedParty.slice(0, 8)}`],
    );
    await sql(
      `INSERT INTO subscribers
         (id, tenant_id, party_id, expediente_id, anonymized_at, anonymized_request_id, person_type, customer_segment,
          document_type, document_number_encrypted, first_name, last_name, commercial_name,
          stratum, vat_treatment, address, created_by)
       SELECT f.id, $1, f.party_id, f.expediente_id, f.anonymized_at,
              CASE WHEN f.anonymized_at IS NULL THEN NULL ELSE gen_random_uuid() END, 'NATURAL', 'RESIDENTIAL',
              'CC', 'sintetico-cifrado', f.first_name, 'Sintética', f.commercial_name, 3,
              'STANDARD', 'Dirección sintética', $2
         FROM (VALUES
           ($3::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz, 'Ana', 'Ana Comercial'),
           ($4::uuid, $5::uuid, $6::uuid, NULL::timestamptz, 'Bruno', NULL),
           ($7::uuid, NULL::uuid, NULL::uuid, now(), 'Carla', NULL)
         ) AS f(id, party_id, expediente_id, anonymized_at, first_name, commercial_name)`,
      [
        tenantId,
        actorId,
        ids.plainSubscriber,
        ids.blockedSubscriber,
        ids.blockedParty,
        ids.blockedExpediente,
        ids.anonymizedSubscriber,
      ],
    );
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json)
       VALUES ($1, $3, $4, 'fixture-plan', '{}'::jsonb), ($2, $3, $5, 'fixture-plan', '{}'::jsonb)`,
      [
        ids.plainContract,
        ids.blockedContract,
        tenantId,
        ids.plainSubscriber,
        ids.blockedSubscriber,
      ],
    );
    await sql(
      `INSERT INTO party_privacy_marks (party_id, mark, event, occurred_at)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', now())`,
      [ids.blockedParty],
    );

    // Adaptadores reales. SubscribersService y ExecutionOrdersService se instancian sin sus
    // dependencias ajenas a estas lecturas (mismo patrón que crm-subscriber-read.postgres).
    const crm = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(crm, 'dataSource', { value: single });
    Object.defineProperty(crm, 'privacyMarksReadPort', { value: new PrivacyMarksAdapter(single) });
    const crmPort = {
      resolveTicketParties: (...args: Parameters<SubscribersService['resolveTicketParties']>) => {
        if (crmShouldFail) {
          // Error SQL real dentro de la transacción del detalle: el SAVEPOINT debe aislarlo.
          return args[1].query('SELECT * FROM tabla_que_no_existe');
        }
        return crm.resolveTicketParties(...args);
      },
      assertWritableReferences: (
        ...args: Parameters<SubscribersService['assertWritableReferences']>
      ) => crm.assertWritableReferences(...args),
    } as unknown as CrmSubscriberReadPort;
    const executionOrders = Object.create(
      ExecutionOrdersService.prototype,
    ) as ExecutionOrdersService;
    Object.defineProperty(executionOrders, 'dataSource', { value: admin });

    service = new TicketsService(
      single,
      { deriveBreachStatus: () => SlaBreachStatus.OK } as never,
      new PqrService(single),
      new TimelineService(single),
      {} as never,
      crmPort,
      new FieldServiceWorkAdapter(),
      executionOrders,
      { getEffectivePermissionsForUser: async () => permissions } as never,
    );
  }, 240_000);

  afterAll(async () => {
    if (single?.isInitialized) await single.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await admin.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await admin.destroy();
      }
    }
  });

  beforeEach(() => {
    permissions = ALL_READ;
    crmShouldFail = false;
  });

  describe('R4 — nombres del solicitante y del relacionado', () => {
    it('titular visible: nombre y ficha; la respuesta cumple el contrato compartido', async () => {
      const ticketId = await insertTicket({
        requesterRefId: ids.plainSubscriber,
        subjectType: TicketSubjectType.CONTRACT,
        subjectRefId: ids.plainContract,
      });
      const result = await detail(ticketId);
      expect(result.requester).toEqual({
        type: 'SUBSCRIBER',
        refId: ids.plainSubscriber,
        displayName: 'Ana Comercial',
        nameState: 'AVAILABLE',
        profile: { kind: 'SUBSCRIBER', id: ids.plainSubscriber },
      });
      expect(result.relatedTo).toEqual({
        type: 'CONTRACT',
        refId: ids.plainContract,
        displayName: 'Ana Comercial',
        nameState: 'AVAILABLE',
        profile: { kind: 'SUBSCRIBER', id: ids.plainSubscriber },
      });
      const {
        requester,
        relatedTo,
        activeVisit,
        executionOrder,
        executionOrderCount,
        allowedTransitions,
      } = result;
      expect(
        TicketDetailExtensionSchema.safeParse({
          requester,
          relatedTo,
          activeVisit,
          executionOrder,
          executionOrderCount,
          allowedTransitions,
        }).success,
      ).toBe(true);
    });

    it('titular con DATOS_BLOQUEADOS: nombre nulo aun con crm.blocked_data.read (suscriptor, contrato y expediente)', async () => {
      for (const [subjectType, subjectRefId] of [
        [TicketSubjectType.CONTRACT, ids.blockedContract],
        [TicketSubjectType.EXPEDIENTE, ids.blockedExpediente],
      ] as const) {
        const ticketId = await insertTicket({
          requesterRefId: ids.blockedSubscriber,
          subjectType,
          subjectRefId,
        });
        const result = await detail(ticketId);
        expect(result.requester).toMatchObject({ displayName: null, nameState: 'PROTECTED' });
        expect(result.relatedTo).toMatchObject({ displayName: null, nameState: 'PROTECTED' });
        expect(JSON.stringify(result)).not.toContain('Bruno');
        expect(JSON.stringify(result)).not.toContain('Expediente Bloqueado');
      }
    });

    it('titular suprimido: nombre nulo', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.anonymizedSubscriber });
      const result = await detail(ticketId);
      expect(result.requester).toEqual({
        type: 'SUBSCRIBER',
        refId: ids.anonymizedSubscriber,
        displayName: null,
        nameState: 'PROTECTED',
        profile: { kind: 'SUBSCRIBER', id: ids.anonymizedSubscriber },
      });
      expect(JSON.stringify(result)).not.toContain('Carla');
    });

    it('expediente visible: nombre y ficha del expediente', async () => {
      const ticketId = await insertTicket({
        requesterType: TicketRequesterType.INTERNAL_USER,
        requesterRefId: actorId,
        subjectType: TicketSubjectType.EXPEDIENTE,
        subjectRefId: ids.plainExpediente,
      });
      const result = await detail(ticketId);
      expect(result.requester).toMatchObject({ nameState: 'NOT_APPLICABLE', displayName: null });
      expect(result.relatedTo).toEqual({
        type: 'EXPEDIENTE',
        refId: ids.plainExpediente,
        displayName: 'Expediente Visible',
        nameState: 'AVAILABLE',
        profile: { kind: 'EXPEDIENTE', id: ids.plainExpediente },
      });
    });

    it('referencia externa no UUID e inexistente: NOT_FOUND sin error 500', async () => {
      const ticketId = await insertTicket({
        requesterRefId: 'UISP-25790',
        subjectType: TicketSubjectType.SUBSCRIBER,
        subjectRefId: randomUUID(),
      });
      const result = await detail(ticketId);
      expect(result.requester).toMatchObject({
        nameState: 'NOT_FOUND',
        displayName: null,
        profile: null,
      });
      expect(result.relatedTo).toMatchObject({
        nameState: 'NOT_FOUND',
        displayName: null,
        profile: null,
      });
    });

    it('sin crm.subscribers.read: nombre nulo y sin ficha (D-API-2), sin consultar CRM', async () => {
      permissions = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const result = await detail(ticketId, actor(UserRole.AUDITOR));
      expect(result.requester).toEqual({
        type: 'SUBSCRIBER',
        refId: ids.plainSubscriber,
        displayName: null,
        nameState: 'NOT_PERMITTED',
        profile: null,
      });
      expect(result.allowedTransitions).toEqual([]);
    });

    it('si CRM falla, nombre nulo (UNAVAILABLE) y el resto del detalle se sirve', async () => {
      crmShouldFail = true;
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      await insertOrder({ number: 'OTE-20261116-900', ticketId });
      const result = await detail(ticketId);
      expect(result.requester).toMatchObject({ nameState: 'UNAVAILABLE', displayName: null });
      expect(result.executionOrder?.number).toBe('OTE-20261116-900');
      expect(result.allowedTransitions.length).toBeGreaterThan(0);
    });

    it('tipos sin nombre en CRM: NOT_APPLICABLE', async () => {
      const ticketId = await insertTicket({
        requesterType: TicketRequesterType.EMPLOYEE,
        requesterRefId: actorId,
        subjectType: TicketSubjectType.NETWORK_NODE,
        subjectRefId: 'nodo-norte',
      });
      const result = await detail(ticketId);
      expect(result.requester.nameState).toBe('NOT_APPLICABLE');
      expect(result.relatedTo?.nameState).toBe('NOT_APPLICABLE');
    });

    it('sin tipo relacionado: relatedTo nulo', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      expect((await detail(ticketId)).relatedTo).toBeNull();
    });
  });

  describe('visita activa (programación)', () => {
    it('sin visita: null', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      expect((await detail(ticketId)).activeVisit).toBeNull();
    });

    it('pendiente con ventana pedida: REQUESTED; solo cancelada: null', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      await sql(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id, created_at)
         VALUES ($1, 'CANCELLED', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita cancelada', $2, $3, now())`,
        [tenantId, ticketId, actorId],
      );
      expect((await detail(ticketId)).activeVisit).toBeNull();

      const [visit] = (await sql(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id, requested_window_start_at, requested_window_end_at,
           address)
         VALUES ($1, 'NEEDS_CONTEXT', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita pedida', $2, $3,
                 '2026-11-20T13:00:00Z', '2026-11-20T15:00:00Z', 'Calle sintética 123')
         RETURNING id::text AS id`,
        [tenantId, ticketId, actorId],
      )) as Array<{ id: string }>;
      const result = await detail(ticketId);
      expect(result.activeVisit).toEqual({
        id: visit!.id,
        status: 'NEEDS_CONTEXT',
        windowKind: 'REQUESTED',
        windowStartAt: '2026-11-20T13:00:00.000Z',
        windowEndAt: '2026-11-20T15:00:00.000Z',
        scheduleEventId: null,
      });
      expect(JSON.stringify(result.activeVisit)).not.toContain('Calle sintética');
    });

    it('programada: ventana del evento de agenda (SCHEDULED)', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const [event] = (await sql(
        `INSERT INTO schedule_events (tenant_id, type, title, scheduled_start_at, scheduled_end_at,
           assigned_user_id, ticket_id, created_by)
         VALUES ($1, 'SUPPORT', 'Agenda sintética', '2026-11-21T14:00:00Z', '2026-11-21T16:00:00Z',
                 $2, $3, $2)
         RETURNING id::text AS id`,
        [tenantId, actorId, ticketId],
      )) as Array<{ id: string }>;
      await sql(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id, schedule_event_id)
         VALUES ($1, 'SCHEDULED', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita agendada', $2, $3, $4)`,
        [tenantId, ticketId, actorId, event!.id],
      );
      expect((await detail(ticketId)).activeVisit).toMatchObject({
        status: 'SCHEDULED',
        windowKind: 'SCHEDULED',
        windowStartAt: '2026-11-21T14:00:00.000Z',
        windowEndAt: '2026-11-21T16:00:00.000Z',
        scheduleEventId: event!.id,
      });
    });
  });

  describe('orden de ejecución (D4)', () => {
    it('sin orden: null y cero', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const result = await detail(ticketId);
      expect(result.executionOrder).toBeNull();
      expect(result.executionOrderCount).toBe(0);
    });

    it('la más reciente no anulada, con el total; sin datos del cliente', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      await insertOrder({
        number: 'OTE-20261110-001',
        ticketId,
        createdAt: '2026-11-10T10:00:00Z',
      });
      const latestId = await insertOrder({
        number: 'OTE-20261112-001',
        ticketId,
        createdAt: '2026-11-12T10:00:00Z',
      });
      await insertOrder({
        number: 'OTE-20261114-001',
        ticketId,
        annulled: true,
        createdAt: '2026-11-14T10:00:00Z',
      });
      const result = await detail(ticketId);
      expect(result.executionOrder).toEqual({
        id: latestId,
        number: 'OTE-20261112-001',
        status: 'ASSIGNED',
        result: null,
        closedAt: null,
      });
      expect(result.executionOrderCount).toBe(2);
      expect(JSON.stringify(result)).not.toContain('Cliente sintético');
    });
  });

  describe('destinos de estado', () => {
    it('PQR sin registro completo: RESOLVED bloqueado; nunca «Visita técnica solicitada»', async () => {
      const ticketId = await insertTicket({
        requesterRefId: ids.plainSubscriber,
        type: TicketType.PQR,
        status: TicketStatus.IN_PROGRESS,
      });
      const result = await detail(ticketId);
      expect(result.allowedTransitions).toEqual([
        { status: 'PENDING_CUSTOMER', requiresNote: false, blockedReason: null },
        { status: 'PENDING_INTERNAL', requiresNote: false, blockedReason: null },
        { status: 'RESOLVED', requiresNote: true, blockedReason: 'PQR_RECORD_INCOMPLETE' },
        { status: 'CANCELLED', requiresNote: false, blockedReason: null },
      ]);
    });

    it('terminal: lista vacía', async () => {
      const ticketId = await insertTicket({
        requesterRefId: ids.plainSubscriber,
        status: TicketStatus.CLOSED,
      });
      expect((await detail(ticketId)).allowedTransitions).toEqual([]);
    });

    it('técnico asignado ve destinos; no asignado recibe 403 como hoy', async () => {
      const techId = randomUUID();
      const ticketId = await insertTicket({
        requesterRefId: ids.plainSubscriber,
        assignedUserId: techId,
      });
      const own = await detail(ticketId, actor(UserRole.TECHNICIAN, techId));
      expect(own.allowedTransitions.length).toBeGreaterThan(0);
      await expect(
        detail(ticketId, actor(UserRole.TECHNICIAN, randomUUID())),
      ).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('búsqueda por número y vínculo manual (D4)', () => {
    it('búsqueda exacta: NONE, THIS, OTHER; 404 si no existe o está anulada', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const otherTicket = await insertTicket({ requesterRefId: ids.plainSubscriber });
      await insertOrder({ number: 'OTE-20261115-001' });
      await insertOrder({ number: 'OTE-20261115-002', ticketId });
      await insertOrder({ number: 'OTE-20261115-003', ticketId: otherTicket });
      await insertOrder({ number: 'OTE-20261115-004', annulled: true });

      const lookup = (number: string) =>
        inTenant(() => service.lookupExecutionOrder(number, ticketId));
      expect(await lookup('OTE-20261115-001')).toMatchObject({ linkedTicket: 'NONE' });
      expect(await lookup('OTE-20261115-002')).toMatchObject({ linkedTicket: 'THIS' });
      expect(await lookup('OTE-20261115-003')).toMatchObject({ linkedTicket: 'OTHER' });
      await expect(lookup('OTE-20261115-004')).rejects.toMatchObject({ status: 404 });
      await expect(lookup('OTE-20261115-999')).rejects.toMatchObject({ status: 404 });
      expect(JSON.stringify(await lookup('OTE-20261115-001'))).not.toContain('Cliente sintético');
    });

    it('vincula: MOD11 escribe ticket_id y sube version; historial WORK_ORDER_LINKED; work_order_id intacto', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const orderId = await insertOrder({ number: 'OTE-20261116-101' });

      const linked = await inTenant(() =>
        service.linkExecutionOrder(
          ticketId,
          { executionOrderId: orderId, notes: 'Vínculo' },
          actor(),
        ),
      );
      expect(linked).toMatchObject({ id: orderId, number: 'OTE-20261116-101', outcome: 'LINKED' });

      const [order] = (await sql(
        'SELECT ticket_id, version, updated_by_user_id::text AS updated_by FROM execution_orders WHERE id = $1',
        [orderId],
      )) as Array<{ ticket_id: string; version: number; updated_by: string }>;
      expect(order).toEqual({ ticket_id: ticketId, version: 2, updated_by: actorId });

      const events = (await sql(
        'SELECT event_type, payload FROM ticket_timeline_events WHERE ticket_id = $1',
        [ticketId],
      )) as Array<{ event_type: string; payload: Record<string, unknown> }>;
      expect(events).toEqual([
        {
          event_type: TicketTimelineEventType.WORK_ORDER_LINKED,
          payload: {
            executionOrderId: orderId,
            executionOrderNumber: 'OTE-20261116-101',
            notes: 'Vínculo',
          },
        },
      ]);
      const [ticket] = (await sql('SELECT work_order_id FROM support_tickets WHERE id = $1', [
        ticketId,
      ])) as Array<{ work_order_id: string | null }>;
      expect(ticket!.work_order_id).toBeNull();

      const again = await inTenant(() =>
        service.linkExecutionOrder(ticketId, { executionOrderId: orderId }, actor()),
      );
      expect(again.outcome).toBe('ALREADY_LINKED');
      expect(
        (
          (await sql('SELECT count(*)::int AS n FROM ticket_timeline_events WHERE ticket_id = $1', [
            ticketId,
          ])) as Array<{ n: number }>
        )[0]!.n,
      ).toBe(1);

      expect((await detail(ticketId)).executionOrder?.id).toBe(orderId);
    });

    it('409 si la orden es de otro caso; 404 si está anulada o no existe', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const other = await insertTicket({ requesterRefId: ids.plainSubscriber });
      const taken = await insertOrder({ number: 'OTE-20261116-201', ticketId: other });
      const annulled = await insertOrder({ number: 'OTE-20261116-202', annulled: true });
      const link = (executionOrderId: string) =>
        inTenant(() => service.linkExecutionOrder(ticketId, { executionOrderId }, actor()));
      await expect(link(taken)).rejects.toMatchObject({ status: 409 });
      await expect(link(annulled)).rejects.toMatchObject({ status: 404 });
      await expect(link(randomUUID())).rejects.toMatchObject({ status: 404 });
      const [row] = (await sql('SELECT ticket_id FROM execution_orders WHERE id = $1', [
        taken,
      ])) as Array<{ ticket_id: string }>;
      expect(row!.ticket_id).toBe(other);
    });

    it('titular suprimido: 409 y la orden queda sin vincular', async () => {
      const ticketId = await insertTicket({ requesterRefId: ids.anonymizedSubscriber });
      const orderId = await insertOrder({ number: 'OTE-20261116-301' });
      await expect(
        inTenant(() =>
          service.linkExecutionOrder(ticketId, { executionOrderId: orderId }, actor()),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const [row] = (await sql('SELECT ticket_id FROM execution_orders WHERE id = $1', [
        orderId,
      ])) as Array<{ ticket_id: string | null }>;
      expect(row!.ticket_id).toBeNull();
    });
  });
});
