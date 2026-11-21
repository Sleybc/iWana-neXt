import { randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
} from '@iwana/shared';
import type { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { SubscribersService } from '../../crm/subscribers/subscribers.service';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { AssuranceTicketReferenceReadAdapter } from '../../assurance/ports/assurance-ticket-reference-read.adapter';
import {
  ExecutionOrderConsoleLinksService,
  type ExecutionOrderConsoleLinkSource,
} from '../services/execution-order-console-links.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ephemeralSchemaName } from '../../../../../../packages/database/test/ephemeral-schema';

/**
 * MOD11 consola, contrato v1.8 (CA-10, CA-11) — PostgreSQL real con los adaptadores
 * reales de CRM (marcas de privacidad incluidas) y de Assurance. Ningún puerto es un
 * doble: solo los permisos efectivos son fijos. El servicio corre sobre un DataSource
 * de UNA conexión: si un puerto abriera la suya, la lectura esperaría al pool y fallaría.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const databaseName = process.env['DB_NAME'] ?? '';
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = ephemeralSchemaName('tenant_eo_links_');
const q = `"${schemaName}"`;
const tenantId = randomUUID();
const otherSchemaName = `${schemaName}_otro`;
const qOther = `"${otherSchemaName}"`;
const otherTenantId = randomUUID();
const actorId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(databaseName)) {
  throw new Error(
    'Integración enlaces de la OT: DB_NAME debe ser test o iwana_it_*; solo crea y limpia schemas efímeros.',
  );
}

const ALL_READ = [
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  // Con permiso de ver datos bloqueados: la consola igual los oculta.
  AccessPermissionKey.CRM_BLOCKED_DATA_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
];

describeWithDb('MOD11 enlaces de la consola — PostgreSQL real, adaptadores reales', () => {
  let admin: DataSource;
  let single: DataSource;
  let service: ExecutionOrderConsoleLinksService;

  const ids = {
    plainSubscriber: randomUUID(),
    blockedSubscriber: randomUUID(),
    blockedParty: randomUUID(),
    anonymizedSubscriber: randomUUID(),
    ticket: randomUUID(),
    /** Filas del mismo schema con otro tenant_id. */
    sameSchemaForeignSubscriber: randomUUID(),
    sameSchemaForeignTicket: randomUUID(),
    /** Filas del otro tenant en su propio schema. */
    otherTenantSubscriber: randomUUID(),
    otherTenantTicket: randomUUID(),
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'eo-links-it' }, operation);

  const sql = (schema: string, text: string, params: unknown[] = []) =>
    runInTenantSchema(admin, schema, (qr) => qr.query(text, params));

  const source = (
    patch: Partial<ExecutionOrderConsoleLinkSource>,
  ): ExecutionOrderConsoleLinkSource => ({
    subscriberId: null,
    ticketId: null,
    scheduleEventId: null,
    serviceAddress: 'Dirección de servicio sintética',
    municipality: 'Municipio sintético',
    ...patch,
  });

  const resolve = (patch: Partial<ExecutionOrderConsoleLinkSource>) =>
    inTenant(() => service.resolve(source(patch), { sub: actorId }));

  async function insertSubscriber(
    schema: string,
    owner: string,
    row: { id: string; partyId?: string | null; anonymized?: boolean; firstName: string },
  ) {
    await sql(
      schema,
      `INSERT INTO subscribers
         (id, tenant_id, party_id, anonymized_at, anonymized_request_id, person_type, customer_segment,
          document_type, document_number_encrypted, first_name, last_name, stratum, vat_treatment,
          address, created_by)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN gen_random_uuid() END,
               'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', $5, 'Sintética', 3, 'STANDARD',
               'Dirección sintética', $6)`,
      [row.id, owner, row.partyId ?? null, row.anonymized ?? false, row.firstName, actorId],
    );
  }

  async function insertTicket(schemaQ: string, owner: string, id: string, number: string) {
    await admin.query(
      `INSERT INTO ${schemaQ}.support_tickets (
         id, tenant_id, ticket_number, type, status, priority, source, subject,
         requester_type, requester_ref_id, sla_breach_status, field_decision, created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,$12)`,
      [
        id,
        owner,
        number,
        TicketType.CUSTOMER_INCIDENT,
        TicketStatus.IN_PROGRESS,
        TicketPriority.NORMAL,
        TicketSource.MANUAL,
        'Fixture sintético de enlaces',
        TicketRequesterType.SUBSCRIBER,
        SlaBreachStatus.OK,
        TicketFieldDecision.NOT_REQUIRED,
        actorId,
      ],
    );
  }

  async function createTenantSchema(id: string, schema: string, schemaQ: string, slug: string) {
    await admin.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Enlaces OT sintético', $2, $3, 'ACTIVE', 'eo-links-it@example.invalid')`,
      [id, slug, schema],
    );
    await admin.query(`CREATE SCHEMA ${schemaQ}`);
    const tenantDataSource = createTenantDataSource(admin, schema, `eo-links-${schema}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
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
      entities: [PartyPrivacyMarkEntity],
      migrations: [],
      synchronize: false,
      logging: false,
    };
    admin = new DataSource({ ...base, extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 } });
    await admin.initialize();
    single = new DataSource({ ...base, extra: { max: 1, min: 0, connectionTimeoutMillis: 3_000 } });
    await single.initialize();

    await createTenantSchema(tenantId, schemaName, q, `eo-links-${tenantId.slice(0, 8)}`);
    await createTenantSchema(
      otherTenantId,
      otherSchemaName,
      qOther,
      `eo-links-otro-${otherTenantId.slice(0, 8)}`,
    );

    await sql(
      schemaName,
      `INSERT INTO party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular Bloqueado')`,
      [ids.blockedParty, `DOC-${ids.blockedParty.slice(0, 8)}`],
    );
    await insertSubscriber(schemaName, tenantId, { id: ids.plainSubscriber, firstName: 'Ana' });
    await insertSubscriber(schemaName, tenantId, {
      id: ids.blockedSubscriber,
      partyId: ids.blockedParty,
      firstName: 'Bruno',
    });
    await insertSubscriber(schemaName, tenantId, {
      id: ids.anonymizedSubscriber,
      anonymized: true,
      firstName: 'Carla',
    });
    await sql(
      schemaName,
      `INSERT INTO party_privacy_marks (party_id, mark, event, occurred_at)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', now())`,
      [ids.blockedParty],
    );
    await insertTicket(q, tenantId, ids.ticket, 'IT-PROPIO-001');

    // Mismo schema, otro tenant_id.
    await insertSubscriber(schemaName, otherTenantId, {
      id: ids.sameSchemaForeignSubscriber,
      firstName: 'Fabio',
    });
    await insertTicket(q, otherTenantId, ids.sameSchemaForeignTicket, 'IT-AJENO-001');
    // Otro tenant en su propio schema.
    await insertSubscriber(otherSchemaName, otherTenantId, {
      id: ids.otherTenantSubscriber,
      firstName: 'Gloria',
    });
    await insertTicket(qOther, otherTenantId, ids.otherTenantTicket, 'IT-AJENO-002');

    const crm = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(crm, 'dataSource', { value: single });
    Object.defineProperty(crm, 'privacyMarksReadPort', { value: new PrivacyMarksAdapter(single) });
    const crmPort = {
      resolveTicketParties: (...args: Parameters<SubscribersService['resolveTicketParties']>) =>
        crm.resolveTicketParties(...args),
    } as unknown as CrmSubscriberReadPort;

    service = new ExecutionOrderConsoleLinksService(
      single,
      { getEffectivePermissionsForUser: async () => ALL_READ } as never,
      crmPort,
      new AssuranceTicketReferenceReadAdapter(),
    );
  }, 480_000);

  // Ninguna prueba debe pasar por el camino fail-closed: el null tiene que venir de la regla.
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn');
  });
  afterEach(() => {
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  afterAll(async () => {
    if (single?.isInitialized) await single.destroy();
    if (admin?.isInitialized) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${qOther} CASCADE`);
        await admin.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await admin.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
          [tenantId, otherTenantId],
        ]);
      } finally {
        await admin.destroy();
      }
    }
  }, 120_000);

  it('titular normal y ticket propio: nombre de CRM, dirección de la OT y número del ticket', async () => {
    const eventId = randomUUID();
    const links = await resolve({
      subscriberId: ids.plainSubscriber,
      ticketId: ids.ticket,
      scheduleEventId: eventId,
    });
    expect(links).toEqual({
      subscriber: {
        id: ids.plainSubscriber,
        displayName: 'Ana Sintética',
        serviceAddress: 'Dirección de servicio sintética',
        municipality: 'Municipio sintético',
      },
      sourceTicket: { id: ids.ticket, number: 'IT-PROPIO-001' },
      visit: { scheduleEventId: eventId },
    });
  });

  it.each([
    ['con DATOS_BLOQUEADOS', () => ids.blockedSubscriber],
    ['suprimido', () => ids.anonymizedSubscriber],
  ])(
    'titular %s: sin nombre, dirección ni enlace aun con permiso de datos bloqueados',
    async (_l, id) => {
      const links = await resolve({ subscriberId: id(), ticketId: ids.ticket });
      expect(links.subscriber).toBeNull();
      expect(links.sourceTicket).toEqual({ id: ids.ticket, number: 'IT-PROPIO-001' });
      expect(JSON.stringify(links)).not.toMatch(/Bruno|Carla|Dirección de servicio/);
    },
  );

  it('CA-11: fila del mismo schema con otro tenant_id no cruza', async () => {
    const links = await resolve({
      subscriberId: ids.sameSchemaForeignSubscriber,
      ticketId: ids.sameSchemaForeignTicket,
    });
    expect(links.subscriber).toBeNull();
    expect(links.sourceTicket).toBeNull();
  });

  it('CA-11: ids del otro tenant (su propio schema) no se resuelven desde este tenant', async () => {
    const links = await resolve({
      subscriberId: ids.otherTenantSubscriber,
      ticketId: ids.otherTenantTicket,
    });
    expect(links.subscriber).toBeNull();
    expect(links.sourceTicket).toBeNull();
    expect(JSON.stringify(links)).not.toMatch(/Gloria|IT-AJENO/);
  });

  it('referencias no UUID (importaciones) dan null sin error', async () => {
    const links = await resolve({ subscriberId: 'UISP-123', ticketId: 'UISP-T-9' });
    expect(links.subscriber).toBeNull();
    expect(links.sourceTicket).toBeNull();
  });
});
