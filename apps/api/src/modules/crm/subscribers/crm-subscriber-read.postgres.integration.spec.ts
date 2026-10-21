import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
import { SubscribersService } from './subscribers.service';

const SCHEMA = `tenant_mod05_crm_read_${randomBytes(4).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración CRM read port: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

describeWithDb('CrmSubscriberReadPort — alcance tenant en PostgreSQL real', () => {
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const subscriberId = randomUUID();
  const otherSubscriberId = randomUUID();
  const deletedSubscriberId = randomUUID();
  const malformedSubscriberId = 'legacy-subscriber-reference';
  const contractId = randomUUID();
  const otherTenantContractId = randomUUID();
  const otherSubscriberContractId = randomUUID();
  const deletedContractId = randomUUID();

  function makeReadAdapter(): SubscribersService {
    // Estos dos métodos solo necesitan DataSource; no se inicializan dependencias
    // ajenas a la proyección de lectura CRM bajo prueba.
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
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    await runInTenantSchema(dataSource, SCHEMA, async (queryRunner) => {
      await queryRunner.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          expediente_id uuid,
          deleted_at timestamptz
        )
      `);
      await queryRunner.query(`
        CREATE TABLE contracts (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          subscriber_id uuid NOT NULL,
          deleted_at timestamptz
        )
      `);
      await queryRunner.query(
        `INSERT INTO subscribers (id, tenant_id, expediente_id, deleted_at)
         VALUES ($1, $2, $3, NULL), ($4, $5, $6, NULL), ($7, $2, $8, now())`,
        [
          subscriberId,
          tenantId,
          randomUUID(),
          otherSubscriberId,
          tenantId,
          randomUUID(),
          deletedSubscriberId,
          randomUUID(),
        ],
      );
      await queryRunner.query(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, deleted_at)
         VALUES ($1, $2, $3, NULL), ($4, $5, $3, NULL), ($6, $2, $7, NULL), ($8, $2, $3, now())`,
        [
          contractId,
          tenantId,
          subscriberId,
          otherTenantContractId,
          otherTenantId,
          otherSubscriberContractId,
          otherSubscriberId,
          deletedContractId,
        ],
      );
    });
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await dataSource.destroy();
    }
  });

  it('lista solo contratos vigentes del suscriptor y tenant solicitados', async () => {
    const adapter = makeReadAdapter();

    await expect(adapter.listContractIds(tenantId, SCHEMA, subscriberId)).resolves.toEqual([
      contractId,
    ]);
    await expect(adapter.listContractIds(tenantId, SCHEMA, otherSubscriberId)).resolves.toEqual([
      otherSubscriberContractId,
    ]);
    await expect(adapter.listContractIds(otherTenantId, SCHEMA, subscriberId)).resolves.toEqual([
      otherTenantContractId,
    ]);
    await expect(adapter.listContractIds(tenantId, SCHEMA, deletedSubscriberId)).resolves.toEqual(
      [],
    );
  });

  it('busca el expediente dentro del tenant y devuelve null para ausentes o eliminados', async () => {
    const adapter = makeReadAdapter();
    const expedienteId = await runInTenantSchema(dataSource, SCHEMA, async (queryRunner) => {
      const rows = (await queryRunner.query(
        'SELECT expediente_id::text AS id FROM subscribers WHERE tenant_id = $1 AND id = $2',
        [tenantId, subscriberId],
      )) as Array<{ id: string }>;
      return rows[0]?.id ?? null;
    });

    await expect(adapter.findExpedienteId(tenantId, SCHEMA, subscriberId)).resolves.toBe(
      expedienteId,
    );
    await expect(adapter.findExpedienteId(otherTenantId, SCHEMA, subscriberId)).resolves.toBeNull();
    await expect(
      adapter.findExpedienteId(tenantId, SCHEMA, deletedSubscriberId),
    ).resolves.toBeNull();
    await expect(adapter.findExpedienteId(tenantId, SCHEMA, randomUUID())).resolves.toBeNull();
  });

  it('resuelve referencias existentes por lote dentro del tenant y omite eliminados o ids inválidos', async () => {
    const adapter = makeReadAdapter();

    await expect(
      adapter.findExistingSubscriberIds(tenantId, SCHEMA, [
        subscriberId,
        subscriberId.toUpperCase(),
        otherSubscriberId,
        deletedSubscriberId,
        malformedSubscriberId,
      ]),
    ).resolves.toEqual([subscriberId, otherSubscriberId].sort());
    await expect(
      adapter.findExistingSubscriberIds(otherTenantId, SCHEMA, [subscriberId]),
    ).resolves.toEqual([]);
    await expect(adapter.findExistingSubscriberIds(tenantId, SCHEMA, [])).resolves.toEqual([]);
  });
});
