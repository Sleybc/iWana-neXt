import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { AssuranceSubscriberTicketLinksReadAdapter } from '../modules/assurance/ports/assurance-subscriber-ticket-links-read.adapter';
import { SubscribersService } from '../modules/crm/subscribers/subscribers.service';
import { analyzeTicketSubscriberLinks } from './report-ticket-subscriber-links';

const schemaName = `tenant_ticket_link_report_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Reporte de vínculos de tickets con suscriptores — PostgreSQL real', () => {
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const linkedSubscriberId = randomUUID();
  const subscriberOwnedByOtherTenantId = randomUUID();
  const foreignSubscriberReferenceTicketId = randomUUID();
  const invalidIds = [randomUUID(), randomUUID()];
  const validIds = [randomUUID(), randomUUID()];

  function makeCrmReadAdapter(): SubscribersService {
    const adapter = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(adapter, 'dataSource', { value: dataSource });
    return adapter;
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
    // Esquema propio con la cadena tenant vigente. subscribers.tenant_id y
    // support_tickets.tenant_id no tienen FK, así que las filas con el tenant ajeno (estado
    // inconsistente que este reporte detecta) se siembran tal cual.
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Ticket link report synthetic',
        `ticket-link-report-${tenantId.slice(0, 8)}`,
        schemaName,
        'ticket-link-report@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `ticket-link-report-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await runInTenantSchema(dataSource, schemaName, async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO subscribers
          (id, tenant_id, deleted_at, person_type, customer_segment, vat_treatment, document_type,
           document_number_encrypted, first_name, last_name, stratum, address, created_by)
         VALUES
          ($1, $2, NULL, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'CC', 'synthetic-ciphertext',
           'Nombre sintético', 'Apellido sintético', 2, 'Dirección sintética', $5),
          ($3, $4, NULL, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'CC', 'synthetic-ciphertext',
           'Nombre sintético', 'Apellido sintético', 2, 'Dirección sintética', $5)`,
        [linkedSubscriberId, tenantId, subscriberOwnedByOtherTenantId, otherTenantId, randomUUID()],
      );
    });
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('CA-SO-08 compone proyecciones de los módulos dueños sin modificar ni exponer contenido', async () => {
    const tickets = [
      {
        id: validIds[0],
        owner: tenantId,
        requesterType: 'SUBSCRIBER',
        requesterRef: linkedSubscriberId,
      },
      {
        id: validIds[1],
        owner: tenantId,
        requesterType: 'SUBSCRIBER',
        requesterRef: linkedSubscriberId.toUpperCase(),
      },
      {
        id: invalidIds[0],
        owner: tenantId,
        requesterType: 'SUBSCRIBER',
        requesterRef: 'legacy-subscriber-reference',
      },
      { id: invalidIds[1], owner: tenantId, requesterType: 'SUBSCRIBER', requesterRef: null },
      {
        id: randomUUID(),
        owner: tenantId,
        requesterType: 'INTERNAL_USER',
        requesterRef: 'not-a-subscriber-id',
      },
      {
        id: randomUUID(),
        owner: otherTenantId,
        requesterType: 'SUBSCRIBER',
        requesterRef: 'another-tenant-reference',
      },
      {
        id: foreignSubscriberReferenceTicketId,
        owner: tenantId,
        requesterType: 'SUBSCRIBER',
        requesterRef: subscriberOwnedByOtherTenantId,
      },
    ];
    const creatorId = randomUUID();
    for (const [index, ticket] of tickets.entries()) {
      await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
        queryRunner.query(
          `INSERT INTO support_tickets
            (id, tenant_id, requester_type, requester_ref_id, subject, description,
             ticket_number, type, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'CUSTOMER_INCIDENT', $8)`,
          [
            ticket.id,
            ticket.owner,
            ticket.requesterType,
            ticket.requesterRef,
            'synthetic-ticket-title-private-sentinel',
            'synthetic-ticket-description-private-sentinel',
            `TKT-LINK-${index}`,
            creatorId,
          ],
        ),
      );
    }

    const before = await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.query(
        `SELECT COUNT(*)::int AS ticket_count FROM support_tickets WHERE tenant_id = $1`,
        [tenantId],
      ),
    );
    const report = await analyzeTicketSubscriberLinks(
      new AssuranceSubscriberTicketLinksReadAdapter(dataSource),
      makeCrmReadAdapter(),
      tenantId,
      schemaName,
    );
    const after = await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.query(
        `SELECT COUNT(*)::int AS ticket_count FROM support_tickets WHERE tenant_id = $1`,
        [tenantId],
      ),
    );

    expect(report).toEqual({
      ticketCount: 3,
      ticketIds: [...invalidIds, foreignSubscriberReferenceTicketId].sort(),
    });
    expect(after).toEqual(before);
    expect(JSON.stringify(report)).not.toContain('synthetic-ticket-title-private-sentinel');
    expect(JSON.stringify(report)).not.toContain('synthetic-ticket-description-private-sentinel');
  });
});
