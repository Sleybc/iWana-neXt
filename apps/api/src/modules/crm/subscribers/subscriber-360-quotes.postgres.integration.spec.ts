import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Subscriber360Quote } from '@iwana/shared';
import { resolveMigrationDbCredentials, runInTenantSchema, TenantContext } from '@iwana/db';
import { CreateCrmQuotesAndContracts1700000000028 } from '../../../../../../packages/database/src/migrations/tenant/028_create_crm_quotes_and_contracts';
import { Quote } from '../quotes/entities/quote.entity';
import { CrmQuoteReadAdapter } from '../quotes/crm-quote-read.adapter';
import type { Subscriber } from './entities/subscriber.entity';
import { SubscribersService } from './subscribers.service';

const SCHEMA = `tenant_mod05_360_quotes_${randomBytes(4).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 360° cotizaciones: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

type QuoteLoader = {
  loadSubscriberQuotes(subscriber: Subscriber, schemaName: string): Promise<Subscriber360Quote[]>;
};

describeWithDb('Ficha 360° — cotizaciones sobre la tabla real de la migración 028', () => {
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const subscriberId = randomUUID();
  const expedienteId = randomUUID();
  const bySubscriber = randomUUID();
  const byExpediente = randomUUID();

  function makeLoader(): QuoteLoader {
    // La consulta real queda dentro del adaptador dueño de Quote.
    const service = Object.create(SubscribersService.prototype) as SubscribersService;
    Object.defineProperty(service, 'dataSource', { value: dataSource });
    Object.defineProperty(service, 'crmQuoteReadPort', {
      value: new CrmQuoteReadAdapter(dataSource),
    });
    return service as unknown as QuoteLoader;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [Quote],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    await runInTenantSchema(dataSource, SCHEMA, async (queryRunner) => {
      await new CreateCrmQuotesAndContracts1700000000028().up(queryRunner);
      const insert = `INSERT INTO quotes
        (id, tenant_id, expediente_id, subscriber_id, plan_id, plan_snapshot_json, monthly_amount, status, expires_at, created_at, deleted_at)
        VALUES ($1, $2, $3, $4, $5, '{"name":"sintético"}'::jsonb, $6, $7, $8, $9, $10)`;
      await queryRunner.query(insert, [
        bySubscriber,
        tenantId,
        null,
        subscriberId,
        'plan-300',
        '89900.00',
        'SENT',
        '2026-11-15T00:00:00Z',
        '2026-10-30T10:00:00Z',
        null,
      ]);
      await queryRunner.query(insert, [
        byExpediente,
        tenantId,
        expedienteId,
        null,
        'plan-100',
        '59900.50',
        'APPROVED',
        null,
        '2026-10-20T10:00:00Z',
        null,
      ]);
      await queryRunner.query(insert, [
        randomUUID(),
        tenantId,
        null,
        randomUUID(),
        'plan-ajeno',
        '1.00',
        'DRAFT',
        null,
        '2026-10-29T10:00:00Z',
        null,
      ]);
      await queryRunner.query(insert, [
        randomUUID(),
        tenantId,
        null,
        subscriberId,
        'plan-borrado',
        '2.00',
        'DRAFT',
        null,
        '2026-10-31T10:00:00Z',
        '2026-10-31T11:00:00Z',
      ]);
    });
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await dataSource.destroy();
  });

  it('devuelve las del suscriptor y su expediente, más recientes primero, sin borradas ni ajenas', async () => {
    const subscriber = { id: subscriberId, expedienteId, anonymizedAt: null } as Subscriber;
    const quotes = await TenantContext.run(
      { tenantId, schemaName: SCHEMA, tenantSlug: 'quotes-360' },
      () => makeLoader().loadSubscriberQuotes(subscriber, SCHEMA),
    );

    expect(quotes).toEqual([
      {
        id: bySubscriber,
        expedienteId: null,
        status: 'SENT',
        planId: 'plan-300',
        monthlyAmount: 89900,
        expiresAt: '2026-11-15T00:00:00.000Z',
        createdAt: '2026-10-30T10:00:00.000Z',
      },
      {
        id: byExpediente,
        expedienteId,
        status: 'APPROVED',
        planId: 'plan-100',
        monthlyAmount: 59900.5,
        expiresAt: null,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ]);
  });
});
