import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
import { SubscribersService } from './subscribers.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

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
  const actorId = randomUUID();

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
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'CRM read synthetic fixture', $2, $3, 'ACTIVE', 'crm-read@example.invalid')`,
      [tenantId, `crm-read-${SCHEMA.slice(-8)}`, SCHEMA],
    );
    // El esquema lo crea la cadena de migraciones del tenant: subscribers, contracts y
    // expediente_records con sus columnas, constraints y FK reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    const tenantDataSource = createTenantDataSource(dataSource, SCHEMA, `crm-read-${SCHEMA}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await runInTenantSchema(dataSource, SCHEMA, async (queryRunner) => {
      // fk_subscribers_expediente_id exige que cada expediente exista en expediente_records.
      const expedienteIds = [randomUUID(), randomUUID(), randomUUID()];
      await queryRunner.query(
        `INSERT INTO expediente_records (id, tenant_id, full_name, created_by)
         SELECT unnest($1::uuid[]), $2, 'Expediente sintético', $3`,
        [expedienteIds, tenantId, actorId],
      );
      // Columnas obligatorias del esquema migrado (persona natural con documento y estrato).
      await queryRunner.query(
        `INSERT INTO subscribers
          (id, tenant_id, expediente_id, deleted_at, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
           created_by)
         SELECT fixture.id, $1, fixture.expediente_id, fixture.deleted_at, 'NATURAL',
                'RESIDENTIAL', 'CC', 'sintetico-cifrado', 'Titular', 'Sintético', 3, 'STANDARD',
                'Dirección sintética', $2
           FROM (VALUES ($3::uuid, $4::uuid, NULL::timestamptz),
                        ($5::uuid, $6::uuid, NULL::timestamptz),
                        ($7::uuid, $8::uuid, now())) AS fixture(id, expediente_id, deleted_at)`,
        [
          tenantId,
          actorId,
          subscriberId,
          expedienteIds[0],
          otherSubscriberId,
          expedienteIds[1],
          deletedSubscriberId,
          expedienteIds[2],
        ],
      );
      await queryRunner.query(
        `INSERT INTO contracts
          (id, tenant_id, subscriber_id, deleted_at, plan_id, plan_snapshot_json)
         SELECT fixture.id, fixture.tenant_id, fixture.subscriber_id, fixture.deleted_at,
                'fixture-plan', '{}'::jsonb
           FROM (VALUES ($1::uuid, $2::uuid, $3::uuid, NULL::timestamptz),
                        ($4::uuid, $5::uuid, $3::uuid, NULL::timestamptz),
                        ($6::uuid, $2::uuid, $7::uuid, NULL::timestamptz),
                        ($8::uuid, $2::uuid, $3::uuid, now()))
             AS fixture(id, tenant_id, subscriber_id, deleted_at)`,
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
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
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
