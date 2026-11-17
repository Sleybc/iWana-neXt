import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  resolveMigrationDbCredentials,
  runInTenantSchema,
  SupportTicket,
  TenantContext,
} from '@iwana/db';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketListItemExtensionSchema,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';
import { AssuranceAssigneeNamesAdapter } from '../../users/ports/assurance-assignee-names.adapter';
import { FieldServiceWorkAdapter } from '../../wfm/ports/field-service-work.adapter';
import { PqrService } from '../services/pqr.service';
import { TicketsService } from '../services/tickets.service';
import { TimelineService } from '../services/timeline.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * Listado de tickets, paso 2 (spec MOD05 pestaña Soporte §16 B-1 a B-3) — PostgreSQL real con
 * los adaptadores reales de Usuarios, WFM y órdenes de ejecución. El servicio corre sobre un
 * DataSource de UNA conexión: si un puerto abriera la suya, el listado esperaría al pool.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_assurance_list_${randomBytes(5).toString('hex')}`;
const q = `"${schemaName}"`;
const tenantId = randomUUID();
const otherSchemaName = `tenant_assurance_list_other_${randomBytes(5).toString('hex')}`;
const otherTenantId = randomUUID();
const actorId = randomUUID();
const subscriberId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración listado de tickets: DB_NAME debe ser test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

const TICKETS_ONLY = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
const WITH_FIELD_WORK = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
];

describeWithDb('Assurance listado de tickets paso 2 — PostgreSQL real', () => {
  let admin: DataSource;
  let single: DataSource;
  let service: TicketsService;
  let permissions: string[] = TICKETS_ONLY;

  const users = {
    active: randomUUID(),
    pending: randomUUID(),
    inactive: randomUUID(),
    suspended: randomUUID(),
    deleted: randomUUID(),
    nameless: randomUUID(),
    missing: randomUUID(),
  };

  const actor: JwtPayload = {
    sub: actorId,
    email: 'list-it@example.invalid',
    role: UserRole.SUPPORT,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'assurance-list-it' }, operation);

  const sql = (text: string, params: unknown[] = []) =>
    runInTenantSchema(admin, schemaName, (qr) => qr.query(text, params));

  async function insertUser(
    id: string,
    status: string,
    names: [string | null, string | null],
    deleted = false,
  ): Promise<void> {
    await sql(
      `INSERT INTO users (id, email, email_hmac, password_hash, role, status, tenant_id,
         first_name, last_name, deleted_at)
       VALUES ($1, $2, $3, 'x', 'SUPPORT', $4, $5, $6, $7, CASE WHEN $8 THEN now() END)`,
      [
        id,
        `list-${id.slice(0, 8)}@example.invalid`,
        randomBytes(32).toString('hex'),
        status,
        tenantId,
        names[0],
        names[1],
        deleted,
      ],
    );
  }

  async function insertTicket(input: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedUserId?: string | null;
    createdAt?: string;
    slaResolveByAt?: string | null;
    resolvedAt?: string | null;
    closedAt?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await admin.query(
      `INSERT INTO ${q}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, assigned_user_id, sla_breach_status, field_decision,
         created_by_user_id, created_at, sla_resolve_by_at, resolved_at, closed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 COALESCE($15::timestamptz, now()), $16, $17, $18)`,
      [
        id,
        tenantId,
        `IT-${randomBytes(8).toString('hex')}`,
        TicketType.CUSTOMER_INCIDENT,
        input.status ?? TicketStatus.IN_PROGRESS,
        input.priority ?? TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Fixture sintético del listado',
        TicketRequesterType.SUBSCRIBER,
        subscriberId,
        input.assignedUserId ?? null,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
        input.createdAt ?? null,
        input.slaResolveByAt ?? null,
        input.resolvedAt ?? null,
        input.closedAt ?? null,
      ],
    );
    return id;
  }

  const list = (query: Record<string, unknown> = {}) =>
    inTenant(() => service.list({ subscriberId, limit: 100, ...query } as never, actor));

  const byId = async (query: Record<string, unknown> = {}) => {
    const result = await list(query);
    return new Map(
      (result.data as Array<Record<string, unknown> & { id: string }>).map((row) => [row.id, row]),
    );
  };

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    const base = {
      type: 'postgres' as const,
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [SupportTicket],
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
       VALUES ($1, 'Listado de tickets sintético', $2, $3, 'ACTIVE', 'list-it@example.invalid')`,
      [tenantId, `assurance-list-${tenantId.slice(0, 8)}`, schemaName],
    );
    await admin.query(`CREATE SCHEMA ${q}`);
    const tenantDataSource = createTenantDataSource(admin, schemaName, `list-${schemaName}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    await admin.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Listado de tickets sintético ajeno', $2, $3, 'ACTIVE', 'list-it@example.invalid')`,
      [otherTenantId, `assurance-list-${otherTenantId.slice(0, 8)}`, otherSchemaName],
    );
    await admin.query(`CREATE SCHEMA "${otherSchemaName}"`);
    const otherDataSource = createTenantDataSource(
      admin,
      otherSchemaName,
      `list-${otherSchemaName}`,
    );
    await otherDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(otherDataSource);
    } finally {
      await otherDataSource.destroy();
    }

    await insertUser(users.active, 'ACTIVE', ['Ana', 'Pérez']);
    await insertUser(users.pending, 'PENDING_VERIFICATION', ['Beto', null]);
    await insertUser(users.inactive, 'INACTIVE', ['Ciro', 'Inactivo']);
    await insertUser(users.suspended, 'SUSPENDED', ['Dora', 'Suspendida']);
    await insertUser(users.deleted, 'ACTIVE', ['Eva', 'Borrada'], true);
    await insertUser(users.nameless, 'ACTIVE', [null, '  ']);

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
      { listContractIds: async () => [] } as unknown as CrmSubscriberReadPort,
      new FieldServiceWorkAdapter(),
      executionOrders,
      { getEffectivePermissionsForUser: async () => permissions } as never,
      new AssuranceAssigneeNamesAdapter(),
    );
  }, 240_000);

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

  beforeEach(async () => {
    permissions = TICKETS_ONLY;
    await sql('DELETE FROM visit_requests');
    await sql('DELETE FROM schedule_events');
    await sql('DELETE FROM execution_orders');
    await sql('DELETE FROM support_tickets');
  });

  describe('B-1 nombre del responsable sin users.read', () => {
    it('activo o pendiente: nombre; desactivado, borrado, inexistente o sin nombre: null', async () => {
      const t = {
        none: await insertTicket({}),
        active: await insertTicket({ assignedUserId: users.active }),
        pending: await insertTicket({ assignedUserId: users.pending }),
        inactive: await insertTicket({ assignedUserId: users.inactive }),
        suspended: await insertTicket({ assignedUserId: users.suspended }),
        deleted: await insertTicket({ assignedUserId: users.deleted }),
        nameless: await insertTicket({ assignedUserId: users.nameless }),
        missing: await insertTicket({ assignedUserId: users.missing }),
      };
      const rows = await byId();
      const name = (id: string) => rows.get(id)?.['assignedUserDisplayName'];
      expect(name(t.none)).toBeNull();
      expect(name(t.active)).toBe('Ana Pérez');
      expect(name(t.pending)).toBe('Beto');
      expect(name(t.inactive)).toBeNull();
      expect(name(t.suspended)).toBeNull();
      expect(name(t.deleted)).toBeNull();
      expect(name(t.nameless)).toBeNull();
      expect(name(t.missing)).toBeNull();
      expect(JSON.stringify([...rows.values()])).not.toContain('example.invalid');
    });
  });

  describe('B-2 trabajo de campo en lote', () => {
    async function seedFieldWork(ticketId: string) {
      const [event] = (await sql(
        `INSERT INTO schedule_events (tenant_id, type, title, scheduled_start_at, scheduled_end_at,
           assigned_user_id, ticket_id, created_by)
         VALUES ($1, 'SUPPORT', 'Agenda sintética', '2026-11-18T13:00:00Z', '2026-11-18T17:00:00Z',
                 $2, $3, $2)
         RETURNING id::text AS id`,
        [tenantId, actorId, ticketId],
      )) as Array<{ id: string }>;
      await sql(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id, schedule_event_id, address)
         VALUES ($1, 'SCHEDULED', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita agendada', $2, $3, $4,
                 'Calle sintética 123')`,
        [tenantId, ticketId, actorId, event!.id],
      );
      await sql(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id, created_at)
         VALUES ($1, 'CANCELLED', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita cancelada', $2, $3,
                 now() + interval '1 hour')`,
        [tenantId, ticketId, actorId],
      );
      const orderIds: string[] = [];
      for (const [number, annulled, createdAt] of [
        ['OTE-20261110-001', false, '2026-11-10T10:00:00Z'],
        ['OTE-20261112-001', false, '2026-11-12T10:00:00Z'],
        ['OTE-20261114-001', true, '2026-11-14T10:00:00Z'],
      ] as const) {
        const id = randomUUID();
        orderIds.push(id);
        await sql(
          `INSERT INTO execution_orders
             (id, tenant_id, execution_order_number, origin_context, customer_display_label,
              work_type, work_summary, ticket_id, status, is_annulled, created_at)
           VALUES ($1, $2, $3, 'ASSURANCE', 'Cliente sintético', 'SUPPORT', 'Visita sintética',
                   $4, $5, $6, $7)`,
          [
            id,
            tenantId,
            `${number.slice(0, 13)}${ticketId.slice(0, 3).replace(/\D/gu, '7').padEnd(3, '7')}`,
            ticketId,
            annulled ? 'CANCELLED' : 'IN_PROGRESS',
            annulled,
            createdAt,
          ],
        );
      }
      return { scheduleEventId: event!.id, latestOrderId: orderIds[1]! };
    }

    it('con permisos: visita activa con ventana y la orden más reciente no anulada, por ticket', async () => {
      permissions = WITH_FIELD_WORK;
      const first = await insertTicket({});
      const second = await insertTicket({});
      const bare = await insertTicket({});
      const seeded = await seedFieldWork(first);
      await seedFieldWork(second);

      const rows = await byId();
      const row = rows.get(first)!;
      expect(row['activeVisit']).toMatchObject({
        status: 'SCHEDULED',
        windowKind: 'SCHEDULED',
        windowStartAt: '2026-11-18T13:00:00.000Z',
        windowEndAt: '2026-11-18T17:00:00.000Z',
        scheduleEventId: seeded.scheduleEventId,
      });
      expect(row['executionOrder']).toMatchObject({
        id: seeded.latestOrderId,
        status: 'IN_PROGRESS',
        result: null,
        closedAt: null,
      });
      expect(rows.get(second)!['activeVisit']).not.toBeNull();
      expect(rows.get(bare)!['activeVisit']).toBeNull();
      expect(rows.get(bare)!['executionOrder']).toBeNull();
      for (const value of rows.values()) {
        const ext = {
          assignedUserDisplayName: value['assignedUserDisplayName'],
          activeVisit: value['activeVisit'],
          executionOrder: value['executionOrder'],
        };
        expect(TicketListItemExtensionSchema.safeParse(ext).success).toBe(true);
      }
      const text = JSON.stringify([...rows.values()]);
      expect(text).not.toContain('Calle sintética');
      expect(text).not.toContain('Cliente sintético');
    });

    it('sin wfm.schedule.read ni lectura de órdenes: ambos nulos', async () => {
      const ticketId = await insertTicket({});
      await seedFieldWork(ticketId);
      const row = (await byId()).get(ticketId)!;
      expect(row['activeVisit']).toBeNull();
      expect(row['executionOrder']).toBeNull();
    });

    it('solo lectura de órdenes: orden servida, visita nula', async () => {
      permissions = [
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      ];
      const ticketId = await insertTicket({});
      await seedFieldWork(ticketId);
      const row = (await byId()).get(ticketId)!;
      expect(row['activeVisit']).toBeNull();
      expect(row['executionOrder']).not.toBeNull();
    });
  });

  describe('aislamiento de tenant', () => {
    it('usuario, visita y orden de otro tenant con el mismo id y ticket_id no aparecen', async () => {
      permissions = WITH_FIELD_WORK;
      const foreignUserId = randomUUID();
      const ticketId = await insertTicket({ assignedUserId: foreignUserId });
      const other = (text: string, params: unknown[]) =>
        runInTenantSchema(admin, otherSchemaName, (qr) => qr.query(text, params));

      await other(
        `INSERT INTO users (id, email, email_hmac, password_hash, role, status, tenant_id,
           first_name, last_name)
         VALUES ($1, $2, $3, 'x', 'SUPPORT', 'ACTIVE', $4, 'Zoe', 'Ajena')`,
        [foreignUserId, 'other-it@example.invalid', randomBytes(32).toString('hex'), otherTenantId],
      );
      await other(
        `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title,
           ticket_id, requested_by_user_id)
         VALUES ($1, 'PENDING', 'ASSURANCE', 'SUPPORT', 'NORMAL', 'Visita ajena', $2, $3)`,
        [otherTenantId, ticketId, foreignUserId],
      );
      await other(
        `INSERT INTO execution_orders
           (id, tenant_id, execution_order_number, origin_context, customer_display_label,
            work_type, work_summary, ticket_id, status, is_annulled)
         VALUES ($1, $2, 'OTE-20261117-901', 'ASSURANCE', 'Cliente ajeno', 'SUPPORT',
                 'Orden ajena', $3, 'IN_PROGRESS', false)`,
        [randomUUID(), otherTenantId, ticketId],
      );
      const [counts] = (await other(
        `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
                (SELECT count(*) FROM visit_requests WHERE ticket_id = $2)::int AS visits,
                (SELECT count(*) FROM execution_orders WHERE ticket_id = $2)::int AS orders`,
        [foreignUserId, ticketId],
      )) as Array<{ users: number; visits: number; orders: number }>;
      expect(counts).toEqual({ users: 1, visits: 1, orders: 1 });

      const row = (await byId()).get(ticketId)!;
      expect(row['assignedUserDisplayName']).toBeNull();
      expect(row['activeVisit']).toBeNull();
      expect(row['executionOrder']).toBeNull();
      expect(JSON.stringify(row)).not.toMatch(/Zoe|Ajena|ajena|ajeno/u);
    });
  });

  describe('B-3 total y orden por urgencia', () => {
    it('meta.total cuenta todos aunque la página traiga menos', async () => {
      for (let index = 0; index < 5; index += 1) await insertTicket({});
      const result = await list({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(5);
      expect(result.total).toBe(5);
    });

    it('order=urgency: vencido, prioridad, plazo próximo, antiguo; luego cerrados recientes', async () => {
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const soon = new Date(Date.now() + 86_400_000 * 2).toISOString();
      const later = new Date(Date.now() + 86_400_000 * 5).toISOString();
      const ids = {
        closedOld: await insertTicket({
          status: TicketStatus.CLOSED,
          priority: TicketPriority.CRITICAL,
          closedAt: '2026-11-01T10:00:00Z',
        }),
        resolvedRecent: await insertTicket({
          status: TicketStatus.RESOLVED,
          resolvedAt: '2026-11-15T10:00:00Z',
        }),
        normalNoDeadlineOld: await insertTicket({ createdAt: '2026-11-01T10:00:00Z' }),
        normalNoDeadlineNew: await insertTicket({ createdAt: '2026-11-05T10:00:00Z' }),
        normalLater: await insertTicket({ slaResolveByAt: later }),
        normalSoon: await insertTicket({ slaResolveByAt: soon }),
        criticalNoDeadline: await insertTicket({ priority: TicketPriority.CRITICAL }),
        lowOverdue: await insertTicket({ priority: TicketPriority.LOW, slaResolveByAt: past }),
      };
      const result = await list({ order: 'urgency' });
      const order = (result.data as Array<{ id: string }>).map((row) => row.id);
      expect(order).toEqual([
        ids.lowOverdue,
        ids.criticalNoDeadline,
        ids.normalSoon,
        ids.normalLater,
        ids.normalNoDeadlineOld,
        ids.normalNoDeadlineNew,
        ids.resolvedRecent,
        ids.closedOld,
      ]);

      const firstPage = await list({ order: 'urgency', limit: 3, page: 1 });
      const secondPage = await list({ order: 'urgency', limit: 3, page: 2 });
      expect(
        [...firstPage.data, ...secondPage.data].map((row) => (row as { id: string }).id),
      ).toEqual(order.slice(0, 6));
    });
  });
});
