import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import {
  resolveMigrationDbCredentials,
  runInTenantSchema,
  SupportTicket,
  TenantContext,
} from '@iwana/db';
import {
  ASSURANCE_WORK_QUEUES,
  AccessPermissionKey,
  AssuranceWorkQueueCountsSchema,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketListItemExtensionSchema,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { SubscribersService } from '../../crm/subscribers/subscribers.service';
import { findTicketRequesterIdsByName } from '../../crm/subscribers/ticket-party-resolution';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { AssuranceDashboardService } from '../services/assurance-dashboard.service';
import { PqrService } from '../services/pqr.service';
import { SlaService } from '../services/sla.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ephemeralSchemaName } from '../../../../../../packages/database/test/ephemeral-schema';

/**
 * Bandeja con colas de trabajo, paso 2 (spec MOD10 bandeja 2026-11-18 §3 J–L, CA-10 a CA-13, R3,
 * R6) contra PostgreSQL real, con el adaptador CRM y el de marcas de privacidad reales. Datos
 * sintéticos sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = ephemeralSchemaName('tenant_inbox_');
const q = `"${schemaName}"`;
const tenantId = randomUUID();
const otherSchemaName = ephemeralSchemaName('tenant_inbox_other_');
const otherTenantId = randomUUID();
const actorId = randomUUID();
const colleagueId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración bandeja: DB_NAME debe ser test o iwana_it_*; solo crea y limpia schemas efímeros.',
  );
}

const TICKETS_ONLY = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
const WITH_CRM = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
];

const HOUR = 3_600_000;
const at = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

interface TicketInput {
  number?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  queueName?: TicketQueue | null;
  subject?: string;
  requesterType?: TicketRequesterType;
  requesterRefId?: string | null;
  assignedUserId?: string | null;
  createdAt?: string;
  slaFirstResponseAt?: string | null;
  slaResolveByAt?: string | null;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  rowTenantId?: string;
}

describeWithDb('MOD10 bandeja con colas — PostgreSQL real', () => {
  let admin: DataSource;
  let single: DataSource;
  let tickets: TicketsService;
  let dashboard: AssuranceDashboardService;
  let permissions: string[] = TICKETS_ONLY;

  const subs = {
    visible: randomUUID(),
    blocked: randomUUID(),
    blockedParty: randomUUID(),
    anonymized: randomUUID(),
    foreign: randomUUID(),
  };
  const ids: Record<string, string> = {};

  const actor: JwtPayload = {
    sub: actorId,
    email: 'inbox-it@example.invalid',
    role: UserRole.SUPPORT,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'inbox-it' }, operation);

  const sqlIn = (schema: string, text: string, params: unknown[] = []) =>
    runInTenantSchema(admin, schema, (qr) => qr.query(text, params));

  async function insertTicket(
    schema: string,
    rowTenant: string,
    input: TicketInput,
  ): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO "${schema}".support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, assigned_user_id, queue_name, sla_breach_status,
         field_decision, created_by_user_id, created_at, sla_first_response_at, sla_resolve_by_at,
         first_responded_at, resolved_at, closed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                 COALESCE($16::timestamptz, now()), $17, $18, $19, $20, $21)`,
      [
        id,
        input.rowTenantId ?? rowTenant,
        input.number ?? `IT-${randomBytes(6).toString('hex')}`,
        input.type ?? TicketType.CUSTOMER_INCIDENT,
        input.status ?? TicketStatus.OPEN,
        input.priority ?? TicketPriority.NORMAL,
        TicketSource.MANUAL,
        input.subject ?? 'Caso sintético',
        input.requesterType ?? TicketRequesterType.INTERNAL_USER,
        input.requesterRefId ?? null,
        input.assignedUserId ?? null,
        input.queueName ?? null,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
        input.createdAt ?? null,
        input.slaFirstResponseAt ?? null,
        input.slaResolveByAt ?? null,
        input.firstRespondedAt ?? null,
        input.resolvedAt ?? null,
        input.closedAt ?? null,
      ],
    );
    return id;
  }

  async function createTenant(id: string, schema: string): Promise<void> {
    await admin.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Bandeja sintética', $2, $3, 'ACTIVE', 'inbox-it@example.invalid')`,
      [id, `inbox-${id.slice(0, 8)}`, schema],
    );
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const tenantDataSource = createTenantDataSource(admin, schema, `inbox-${schema}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function insertSubscriber(
    schema: string,
    rowTenant: string,
    id: string,
    names: { first: string; last: string },
    opts: { partyId?: string; anonymized?: boolean } = {},
  ): Promise<void> {
    await sqlIn(
      schema,
      `INSERT INTO subscribers
         (id, tenant_id, party_id, anonymized_at, anonymized_request_id, person_type, customer_segment,
          document_type, document_number_encrypted, first_name, last_name, stratum, vat_treatment,
          address, created_by)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN gen_random_uuid() END,
               'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', $5, $6, 3, 'STANDARD',
               'Dirección sintética', $7)`,
      [
        id,
        rowTenant,
        opts.partyId ?? null,
        opts.anonymized ?? false,
        names.first,
        names.last,
        actorId,
      ],
    );
  }

  const list = (query: Record<string, unknown> = {}) =>
    inTenant(() => tickets.list({ limit: 100, ...query } as never, actor));
  const listIds = async (query: Record<string, unknown> = {}) =>
    ((await list(query)).data as Array<{ id: string }>).map((row) => row.id).sort();
  const summary = () => inTenant(() => dashboard.getSummary(actorId));

  /**
   * R3: el cálculo en memoria retirado de `AssuranceDashboardService` (HEAD d479261e), copiado
   * sin cambios como oráculo: el resumen SQL debe dar las mismas cifras sobre los mismos datos.
   */
  async function legacyInMemorySummary() {
    const sla = new SlaService(single);
    return inTenant(() =>
      runInTenantSchema(single, schemaName, async (qr) => {
        const all = await qr.manager.find(SupportTicket, { where: { tenantId } });
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        const byPriority: Record<string, number> = {};
        const byType: Record<string, number> = {};
        const byQueue: Record<string, number> = {};
        let atRiskCount = 0;
        let breachedCount = 0;
        let resolvedTodayCount = 0;
        for (const ticket of all) {
          const derived = sla.deriveBreachStatus(ticket);
          if (derived === SlaBreachStatus.AT_RISK) atRiskCount += 1;
          if (
            derived === SlaBreachStatus.FIRST_RESPONSE_BREACHED ||
            derived === SlaBreachStatus.RESOLUTION_BREACHED
          ) {
            breachedCount += 1;
          }
          if (
            ticket.resolvedAt &&
            ticket.resolvedAt >= todayStart &&
            ticket.resolvedAt <= todayEnd
          ) {
            resolvedTodayCount += 1;
          }
          if (
            ![TicketStatus.CLOSED, TicketStatus.CANCELLED, TicketStatus.RESOLVED].includes(
              ticket.status,
            )
          ) {
            byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
            byType[ticket.type] = (byType[ticket.type] ?? 0) + 1;
            if (ticket.queueName) byQueue[ticket.queueName] = (byQueue[ticket.queueName] ?? 0) + 1;
          }
        }
        return {
          openCount: all.filter((t) => t.status === TicketStatus.OPEN).length,
          assignedCount: all.filter((t) => t.status === TicketStatus.ASSIGNED).length,
          inProgressCount: all.filter((t) => t.status === TicketStatus.IN_PROGRESS).length,
          atRiskCount,
          breachedCount,
          resolvedTodayCount,
          fieldServicePendingCount: all.filter(
            (t) => t.status === TicketStatus.FIELD_SERVICE_REQUESTED,
          ).length,
          byPriority,
          byType,
          byQueue,
        };
      }),
    );
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    const base = {
      type: 'postgres' as const,
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket, PartyPrivacyMarkEntity],
      migrations: [],
      synchronize: false,
      logging: false,
    };
    admin = new DataSource({ ...base, extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 } });
    await admin.initialize();
    single = new DataSource({ ...base, extra: { max: 1, min: 0, connectionTimeoutMillis: 3_000 } });
    await single.initialize();
    await createTenant(tenantId, schemaName);
    await createTenant(otherTenantId, otherSchemaName);

    await sqlIn(
      schemaName,
      `INSERT INTO party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular Bloqueado')`,
      [subs.blockedParty, `DOC-${subs.blockedParty.slice(0, 8)}`],
    );
    await insertSubscriber(schemaName, tenantId, subs.visible, { first: 'Ana', last: 'Visible' });
    await insertSubscriber(
      schemaName,
      tenantId,
      subs.blocked,
      { first: 'Bruno', last: 'Bloqueado' },
      { partyId: subs.blockedParty },
    );
    await insertSubscriber(
      schemaName,
      tenantId,
      subs.anonymized,
      { first: 'Carla', last: 'Suprimida' },
      { anonymized: true },
    );
    await sqlIn(
      schemaName,
      `INSERT INTO party_privacy_marks (party_id, mark, event, occurred_at)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', now())`,
      [subs.blockedParty],
    );
    // Otro tenant: su propio schema, con un suscriptor del mismo nombre.
    await insertSubscriber(otherSchemaName, otherTenantId, subs.foreign, {
      first: 'Ana',
      last: 'Visible',
    });

    // ── Tenant A: un ticket por situación de cola ─────────────────────────
    const A = (input: TicketInput) => insertTicket(schemaName, tenantId, input);
    ids['mineOpen'] = await A({
      number: 'TCK-INBOX-0001',
      subject: 'Sin internet en casa',
      assignedUserId: actorId,
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subs.visible,
      queueName: TicketQueue.SUPPORT,
    });
    ids['atRisk'] = await A({
      status: TicketStatus.ASSIGNED,
      assignedUserId: colleagueId,
      createdAt: at(-10),
      slaResolveByAt: at(1),
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subs.blocked,
      priority: TicketPriority.HIGH,
      queueName: TicketQueue.NOC,
    });
    ids['breachedUnassigned'] = await A({
      status: TicketStatus.IN_PROGRESS,
      createdAt: at(-30),
      slaResolveByAt: at(-1),
      firstRespondedAt: at(-29),
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subs.anonymized,
      type: TicketType.PQR,
    });
    ids['waitingMine'] = await A({
      number: 'TCK-INBOX-0042',
      status: TicketStatus.PENDING_CUSTOMER,
      assignedUserId: actorId,
    });
    ids['fieldUnassigned'] = await A({
      status: TicketStatus.FIELD_SERVICE_REQUESTED,
      subject: 'Fibra caída en poste',
      queueName: TicketQueue.OPERATIONS,
    });
    ids['closedLate'] = await A({
      status: TicketStatus.CLOSED,
      assignedUserId: actorId,
      createdAt: at(-72),
      slaResolveByAt: at(-48),
      resolvedAt: at(-40),
      closedAt: at(-39),
    });
    ids['resolvedToday'] = await A({
      status: TicketStatus.RESOLVED,
      assignedUserId: actorId,
      resolvedAt: new Date().toISOString(),
    });
    ids['cancelled'] = await A({ status: TicketStatus.CANCELLED, subject: 'Fibra caída anulada' });
    ids['firstResponseBreached'] = await A({
      createdAt: at(-5),
      slaFirstResponseAt: at(-1),
      assignedUserId: colleagueId,
      priority: TicketPriority.CRITICAL,
      queueName: TicketQueue.NOC,
    });
    // Fila de otro tenant_id dentro del mismo schema: nunca cuenta ni aparece.
    await A({
      rowTenantId: otherTenantId,
      subject: 'Fibra caída en poste',
      assignedUserId: actorId,
    });
    // Otro tenant, su schema: mismo asunto y mismo nombre de cliente.
    await insertTicket(otherSchemaName, otherTenantId, {
      subject: 'Fibra caída en poste',
      requesterType: TicketRequesterType.SUBSCRIBER,
      requesterRefId: subs.foreign,
      number: 'TCK-INBOX-0042',
    });

    const crm = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(crm, 'dataSource', { value: single });
    Object.defineProperty(crm, 'privacyMarksReadPort', { value: new PrivacyMarksAdapter(single) });
    const crmPort = {
      listContractIds: async () => [],
      findExpedienteId: async () => null,
      resolveTicketParties: (...args: Parameters<SubscribersService['resolveTicketParties']>) =>
        crm.resolveTicketParties(...args),
      findTicketRequesterIdsByName: (
        ...args: Parameters<SubscribersService['findTicketRequesterIdsByName']>
      ) => crm.findTicketRequesterIdsByName(...args),
    } as unknown as CrmSubscriberReadPort;

    tickets = new TicketsService(
      single,
      new SlaService(single),
      new PqrService(single),
      new TimelineService(single),
      {} as never,
      crmPort,
      undefined,
      undefined,
      { getEffectivePermissionsForUser: async () => permissions } as never,
      undefined,
    );
    dashboard = new AssuranceDashboardService(single);
  }, 480_000);

  afterAll(async () => {
    if (single?.isInitialized) await single.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await admin.query(`DROP SCHEMA IF EXISTS "${otherSchemaName}" CASCADE`);
        await admin.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
          [tenantId, otherTenantId],
        ]);
      } finally {
        await admin.destroy();
      }
    }
  });

  beforeEach(() => {
    permissions = TICKETS_ONLY;
  });

  describe('R3 · el resumen SQL da las mismas cifras que el cálculo en memoria retirado', () => {
    it('cada campo anterior coincide sobre los mismos datos', async () => {
      const [sqlSummary, legacy] = await Promise.all([summary(), legacyInMemorySummary()]);
      const { byWorkQueue: _new, ...comparable } = sqlSummary;
      expect(comparable).toEqual(legacy);
      // Sanidad del fixture: cada cifra se ejerce con un valor distinto de cero.
      expect(legacy).toMatchObject({
        openCount: 2,
        assignedCount: 1,
        inProgressCount: 1,
        atRiskCount: 1,
        breachedCount: 3,
        resolvedTodayCount: 1,
        fieldServicePendingCount: 1,
        byQueue: { SUPPORT: 1, NOC: 2, OPERATIONS: 1 },
      });
    });
  });

  describe('J · colas exactas (CA-10, CA-11)', () => {
    const expected: Record<(typeof ASSURANCE_WORK_QUEUES)[number], string[]> = {
      mine: ['mineOpen', 'waitingMine'],
      dueSoon: ['atRisk'],
      waitingCustomer: ['waitingMine'],
      fieldService: ['fieldUnassigned'],
      unassigned: ['breachedUnassigned', 'fieldUnassigned'],
      breached: ['breachedUnassigned', 'closedLate', 'firstResponseBreached'],
      all: [
        'mineOpen',
        'atRisk',
        'breachedUnassigned',
        'waitingMine',
        'fieldUnassigned',
        'firstResponseBreached',
      ],
    };

    it.each(ASSURANCE_WORK_QUEUES)(
      '%s: lista los tickets esperados y su conteo es igual al total de la lista',
      async (queue) => {
        const result = await list({ workQueue: queue });
        const got = (result.data as Array<{ id: string }>).map((row) => row.id).sort();
        expect(got).toEqual(expected[queue].map((key) => ids[key]!).sort());
        const counts = (await summary()).byWorkQueue;
        expect(counts[queue]).toBe(result.meta.total);
      },
    );

    it('el conteo por cola cumple el contrato y Vencidos = breachedCount', async () => {
      const result = await summary();
      expect(AssuranceWorkQueueCountsSchema.safeParse(result.byWorkQueue).success).toBe(true);
      expect(result.byWorkQueue.breached).toBe(result.breachedCount);
    });

    // QA2 · CA-11: el resumen no hidrata entidades. Se espían las lecturas que cargan filas como
    // entidades; ninguna corre, y las cifras salen de lecturas crudas de agregados.
    it('QA2 · CA-11: el resumen solo usa agregados SQL, sin cargar tickets como entidades', async () => {
      const loaders = [
        jest.spyOn(EntityManager.prototype, 'find'),
        jest.spyOn(EntityManager.prototype, 'findBy'),
        jest.spyOn(EntityManager.prototype, 'findAndCount'),
        jest.spyOn(SelectQueryBuilder.prototype, 'getMany'),
        jest.spyOn(SelectQueryBuilder.prototype, 'getManyAndCount'),
        jest.spyOn(SelectQueryBuilder.prototype, 'getOne'),
      ];
      const raw = jest.spyOn(SelectQueryBuilder.prototype, 'getRawOne');
      try {
        const result = await summary();
        expect(result.byWorkQueue.all).toBe(6);
        for (const loader of loaders) expect(loader).not.toHaveBeenCalled();
        expect(raw).toHaveBeenCalledTimes(1);
        const sql = (raw.mock.contexts[0] as SelectQueryBuilder<SupportTicket>).getQuery();
        expect(sql).toContain('COUNT(*) FILTER');
      } finally {
        for (const spy of [...loaders, raw]) spy.mockRestore();
      }
    });

    it('Míos es relativo a quien consulta', async () => {
      const other = await inTenant(() => dashboard.getSummary(colleagueId));
      expect(other.byWorkQueue.mine).toBe(2);
      expect((await summary()).byWorkQueue.mine).toBe(2);
      // QA2 (test-change-reviewer): actor y colega dan 2 por coincidencia; un tercer usuario sin
      // tickets asignados da 0, así se detecta si el conteo deja de depender del actor.
      const nobody = await inTenant(() => dashboard.getSummary(randomUUID()));
      expect(nobody.byWorkQueue.mine).toBe(0);
      expect(nobody.byWorkQueue.all).toBe(6);
    });

    it('la cola se combina con los filtros sueltos', async () => {
      expect(await listIds({ workQueue: 'all', priority: TicketPriority.CRITICAL })).toEqual([
        ids['firstResponseBreached'],
      ]);
      expect(await listIds({ workQueue: 'mine', status: TicketStatus.CLOSED })).toEqual([]);
      expect(await listIds({ workQueue: 'breached', queueName: TicketQueue.NOC })).toEqual([
        ids['firstResponseBreached'],
      ]);
      expect(
        await listIds({
          workQueue: 'all',
          order: 'urgency',
          slaBreachStatus: SlaBreachStatus.AT_RISK,
        }),
      ).toEqual([ids['atRisk']]);
    });

    it('sin cola, el listado no cambia (incluye resueltos, cerrados y cancelados)', async () => {
      expect((await list()).meta.total).toBe(9);
    });
  });

  describe('K · búsqueda en servidor (CA-12)', () => {
    it('por número, parcial y sin distinguir mayúsculas', async () => {
      expect(await listIds({ search: 'tck-inbox-0042' })).toEqual([ids['waitingMine']]);
    });

    it('por asunto, sin filas de otro tenant ni de otro tenant_id del schema', async () => {
      expect(await listIds({ search: 'FIBRA CAÍDA EN' })).toEqual([ids['fieldUnassigned']]);
    });

    it('por cliente solo con crm.subscribers.read', async () => {
      expect(await listIds({ search: 'ana visible' })).toEqual([]);
      permissions = WITH_CRM;
      expect(await listIds({ search: 'ana visible' })).toEqual([ids['mineOpen']]);
    });

    it('nunca encuentra por nombre a un titular bloqueado o suprimido (CA-13)', async () => {
      permissions = WITH_CRM;
      expect(await listIds({ search: 'Bruno Bloqueado' })).toEqual([]);
      expect(await listIds({ search: 'Carla' })).toEqual([]);
    });

    // QA2 (pedido de sec-eng): el ticket del titular con DATOS_BLOQUEADOS existe y se encuentra por
    // otros medios, pero ninguna forma de su nombre (nombre, apellido, nombre de la party) lo trae,
    // ni el puerto CRM devuelve su id. El control positivo (Ana) prueba que la búsqueda por cliente
    // está activa en la misma corrida, así la ausencia no es vacía.
    it('QA2 · titular con DATOS_BLOQUEADOS: su ticket existe, pero no aparece al buscar por su nombre', async () => {
      permissions = WITH_CRM;
      expect(await listIds({ search: 'Ana' })).toEqual([ids['mineOpen']]);
      expect(await listIds({ workQueue: 'dueSoon' })).toEqual([ids['atRisk']]);
      for (const term of ['Bruno', 'Bloqueado', 'Bruno Bloqueado', 'Titular Bloqueado', 'bru']) {
        expect(await listIds({ search: term })).not.toContain(ids['atRisk']);
      }
      const found = await inTenant(() =>
        runInTenantSchema(single, schemaName, (qr) =>
          findTicketRequesterIdsByName('Bruno', qr, new PrivacyMarksAdapter(single)),
        ),
      );
      expect(found).not.toContain(subs.blocked);
    });

    it('los comodines se toman literales', async () => {
      expect(await listIds({ search: '%%' })).toEqual([]);
      expect(await listIds({ search: '__' })).toEqual([]);
    });

    it('se combina con la cola y pagina', async () => {
      expect(await listIds({ search: 'fibra', workQueue: 'unassigned' })).toEqual([
        ids['fieldUnassigned'],
      ]);
      const page = await list({ search: 'fibra', limit: 1 });
      expect(page.meta.total).toBe(2);
      expect(page.data).toHaveLength(1);
    });
  });

  describe('L · cliente en la fila (CA-13)', () => {
    const nameOf = async (key: string) => {
      const rows = (await list()).data as Array<{ id: string; requesterDisplayName: unknown }>;
      return rows.find((row) => row.id === ids[key])?.requesterDisplayName;
    };

    it('con permiso: nombre del visible; bloqueado, suprimido e interno, nulos', async () => {
      permissions = WITH_CRM;
      expect(await nameOf('mineOpen')).toBe('Ana Visible');
      expect(await nameOf('atRisk')).toBeNull();
      expect(await nameOf('breachedUnassigned')).toBeNull();
      expect(await nameOf('waitingMine')).toBeNull();
      const text = JSON.stringify((await list()).data);
      expect(text).not.toContain('Bruno');
      expect(text).not.toContain('Carla');
      for (const row of (await list()).data as Array<Record<string, unknown>>) {
        expect(
          TicketListItemExtensionSchema.safeParse({
            assignedUserDisplayName: row['assignedUserDisplayName'],
            activeVisit: row['activeVisit'],
            executionOrder: row['executionOrder'],
            requesterDisplayName: row['requesterDisplayName'],
          }).success,
        ).toBe(true);
      }
    });

    it('sin crm.subscribers.read: nulo aun para el visible', async () => {
      expect(await nameOf('mineOpen')).toBeNull();
    });
  });

  /**
   * R6: medición con volumen. Se insertan 20 000 tickets y 5 000 suscriptores en un schema propio
   * y se mide el listado con búsqueda y el resumen. Solo informa: el umbral para detener y pedir
   * índice se evalúa en el informe.
   */
  describe('R6 · medición de la búsqueda con volumen', () => {
    it('mide listado con búsqueda y resumen sobre 20 000 tickets', async () => {
      const volume = 20_000;
      await sqlIn(
        schemaName,
        `INSERT INTO subscribers
           (id, tenant_id, person_type, customer_segment, document_type, document_number_encrypted,
            first_name, last_name, stratum, vat_treatment, address, created_by)
         SELECT gen_random_uuid(), $1, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
                'Nombre' || g, 'Volumen' || g, 3, 'STANDARD', 'Dirección sintética', $2
           FROM generate_series(1, 5000) g`,
        [tenantId, actorId],
      );
      await sqlIn(
        schemaName,
        `INSERT INTO support_tickets (
           id, tenant_id, ticket_number, type, status, priority, source, subject, requester_type,
           requester_ref_id, assigned_user_id, sla_breach_status, field_decision, created_by_user_id,
           created_at, sla_resolve_by_at)
         SELECT gen_random_uuid(), $1, 'VOL-' || lpad(g::text, 7, '0'), 'CUSTOMER_INCIDENT',
                (ARRAY['OPEN','ASSIGNED','IN_PROGRESS','CLOSED','RESOLVED'])[1 + g % 5]::ticket_status,
                'NORMAL', 'MANUAL', 'Asunto de volumen ' || g, 'SUBSCRIBER',
                s.id::text, CASE WHEN g % 3 = 0 THEN $2::uuid END, 'OK', 'NOT_REQUIRED', $2,
                now() - (g || ' minutes')::interval, now() + ((g % 48) - 24 || ' hours')::interval
           FROM generate_series(1, $3::int) g
           JOIN LATERAL (SELECT id FROM subscribers WHERE first_name = 'Nombre' || (1 + g % 5000) LIMIT 1) s ON true`,
        [tenantId, actorId, volume],
      );
      await sqlIn(schemaName, 'ANALYZE support_tickets');
      await sqlIn(schemaName, 'ANALYZE subscribers');

      const time = async (label: string, run: () => Promise<unknown>) => {
        await run(); // calentamiento
        const samples: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const start = performance.now();
          await run();
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        return { label, medianMs: Math.round(samples[2]!), maxMs: Math.round(samples[4]!) };
      };

      permissions = WITH_CRM;
      const results = [
        await time('listado sin búsqueda, urgency', () => list({ limit: 25, order: 'urgency' })),
        await time('búsqueda por asunto «volumen 1234»', () =>
          list({ limit: 25, order: 'urgency', search: 'volumen 1234' }),
        ),
        await time('búsqueda por número «VOL-0012»', () =>
          list({ limit: 25, order: 'urgency', search: 'VOL-0012' }),
        ),
        await time('búsqueda por cliente «Nombre12» (con CRM, ≤500 ids)', () =>
          list({ limit: 25, order: 'urgency', search: 'Nombre12' }),
        ),
        await time('búsqueda sin coincidencias «zzzz»', () =>
          list({ limit: 25, order: 'urgency', search: 'zzzz' }),
        ),
        await time('cola all + búsqueda por cliente', () =>
          list({ limit: 25, order: 'urgency', search: 'Volumen', workQueue: 'all' }),
        ),
        await time('resumen con conteo por cola', () => summary()),
      ];
      const plan = (await sqlIn(
        schemaName,
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT count(*) FROM support_tickets st
          WHERE st.tenant_id = $1 AND (st.ticket_number ILIKE $2 OR st.subject ILIKE $2)`,
        [tenantId, '%volumen 1234%'],
      )) as Array<{ 'QUERY PLAN': string }>;
      console.log(
        `R6 medición (${volume} tickets, 5000 suscriptores)\n` +
          results.map((r) => `${r.label}: mediana ${r.medianMs} ms, máx ${r.maxMs} ms`).join('\n') +
          `\nPlan búsqueda asunto/número:\n${plan.map((row) => row['QUERY PLAN']).join('\n')}`,
      );
      for (const result of results) expect(result.medianMs).toBeGreaterThanOrEqual(0);
    }, 300_000);
  });
});
