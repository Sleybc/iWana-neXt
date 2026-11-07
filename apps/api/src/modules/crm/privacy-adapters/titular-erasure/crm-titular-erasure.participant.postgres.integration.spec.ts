import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import * as erasureSql from './titular-erasure-sql';
import type { ErasureKeys } from './titular-erasure-sql';
import type { TitularErasureTableResult } from './titular-erasure.types';
import { CrmTitularErasureParticipant } from './crm-titular-erasure.participant';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const safeDatabaseName = /^iwana_it_g7_[a-z0-9_]+$/u;
const supportedDatabaseName = databaseName === 'test' || safeDatabaseName.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B1c] Integración omitida: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

describeWithDb('B1c — supresión CRM sobre migraciones tenant reales', () => {
  const schemaName = `tenant_it_g7_b1c_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `privacy-g7-${randomUUID().slice(0, 8)}`;
  const subscriberId = randomUUID();
  const residentialContractId = randomUUID();
  const nonResidentialContractId = randomUUID();
  const actorId = randomUUID();
  const requestId = randomUUID();
  const keys: ErasureKeys = {
    hashKey: Buffer.alloc(32, 1),
    activeEncryptionKey: Buffer.alloc(32, 2),
    previousEncryptionKey: null,
  };
  let baseDataSource: DataSource | undefined;
  let tenantDataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
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
    await baseDataSource.initialize();

    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'B1c synthetic fixture', $2, $3, 'INACTIVE', 'b1c@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }

    tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource, {
      ...process.env,
      IWANA_APPLY_PII_CONTRACT: 'true',
    });
    queryRunner = tenantDataSource.createQueryRunner();
    await queryRunner.connect();
    const [migrationCountRow] = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    const appliedMigrationCount = migrationCountRow?.count ?? 0;
    console.info(
      `[B1c] Tenant migrations applied: ${appliedMigrationCount}/${TENANT_MIGRATIONS.length}.`,
    );
    expect(appliedMigrationCount).toBe(TENANT_MIGRATIONS.length);
  });

  afterAll(async () => {
    try {
      if (queryRunner && !queryRunner.isReleased) await queryRunner.release();
    } finally {
      if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
      if (baseDataSource?.isInitialized) {
        const cleanup = baseDataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        } finally {
          await cleanup.release();
          await baseDataSource.destroy();
        }
      }
    }
  });

  it('CA-BT-17 conserva RESIDENTIAL y NON_RESIDENTIAL y marca el estrato con 1', async () => {
    if (!queryRunner) throw new Error('QueryRunner de integración no inicializado.');

    await queryRunner.query(
      `INSERT INTO subscribers (
         id, tenant_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum,
         email_encrypted, phone_encrypted, vat_treatment, tax_regime,
         address, created_by
       ) VALUES (
         $1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'synthetic-encrypted',
         'Fixture', 'B1c', 3, 'synthetic-email', 'synthetic-phone',
         'STANDARD', 'SIMPLIFIED', 'Dirección sintética', $3
       )`,
      [subscriberId, tenantId, actorId],
    );

    await queryRunner.query(
      `INSERT INTO contracts (
         id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias,
         service_usage, installation_stratum, installation_city,
         installation_department, installation_address, installation_postal_code,
         installation_notes
       ) VALUES
         ($1, $2, $3, 'fixture-plan', '{}'::jsonb, 'DRAFT', 'Servicio sintético 1',
          'RESIDENTIAL', 4, 'Ciudad sintética', 'Departamento sintético',
          'Dirección sintética', '00000', 'Nota sintética'),
         ($4, $2, $3, 'fixture-plan', '{}'::jsonb, 'DRAFT', 'Servicio sintético 2',
          'NON_RESIDENTIAL', NULL, 'Ciudad sintética', 'Departamento sintético',
          'Dirección sintética', '00000', 'Nota sintética')`,
      [residentialContractId, tenantId, subscriberId, nonResidentialContractId],
    );

    const participant = new CrmTitularErasureParticipant(
      new ConfigService({ PII_HASH_KEY: keys.hashKey.toString('hex') }),
    );
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      await participant.apply(
        {
          partyId: null,
          subscriberIds: [subscriberId],
          expedienteIds: [],
          userIds: [],
          requestId,
          cryptoKeys: keys,
        },
        queryRunner,
        'apply',
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }

    const contracts = (await queryRunner.query(
      `SELECT id, service_usage, installation_stratum
         FROM contracts
        WHERE id = ANY($1::uuid[])
        ORDER BY service_usage`,
      [[residentialContractId, nonResidentialContractId]],
    )) as Array<{ id: string; service_usage: string; installation_stratum: number | null }>;

    expect(contracts).toEqual([
      {
        id: nonResidentialContractId,
        service_usage: 'NON_RESIDENTIAL',
        installation_stratum: null,
      },
      {
        id: residentialContractId,
        service_usage: 'RESIDENTIAL',
        installation_stratum: null,
      },
    ]);
  });

  describe('D-K2A-1 y D-K2A-3 — el documento queda en NULL y la fila se marca antes', () => {
    interface SubscriberState {
      document_number_encrypted: string | null;
      first_name: string | null;
      anonymized_at: Date | null;
    }

    function requireQueryRunner(): QueryRunner {
      if (!queryRunner) throw new Error('QueryRunner de integración no inicializado.');
      return queryRunner;
    }

    async function insertNatural(): Promise<string> {
      const id = randomUUID();
      await requireQueryRunner().query(
        `INSERT INTO subscribers (
           id, tenant_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum,
           email_encrypted, phone_encrypted, vat_treatment, tax_regime,
           address, created_by
         ) VALUES (
           $1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'synthetic-encrypted',
           'Fixture', 'K2A', 3, 'synthetic-email', 'synthetic-phone',
           'STANDARD', 'SIMPLIFIED', 'Dirección sintética', $3
         )`,
        [id, tenantId, actorId],
      );
      return id;
    }

    async function insertJuridica(): Promise<string> {
      const id = randomUUID();
      await requireQueryRunner().query(
        `INSERT INTO subscribers (
           id, tenant_id, person_type, customer_segment, nit, business_name,
           email_encrypted, phone_encrypted, vat_treatment, tax_regime,
           address, created_by
         ) VALUES (
           $1, $2, 'JURIDICA', 'PYME', '900000000', 'Empresa sintética',
           'synthetic-email', 'synthetic-phone', 'STANDARD', 'SIMPLIFIED',
           'Dirección sintética', $3
         )`,
        [id, tenantId, actorId],
      );
      return id;
    }

    async function readState(id: string): Promise<SubscriberState> {
      const rows = (await requireQueryRunner().query(
        `SELECT document_number_encrypted, first_name, anonymized_at
           FROM subscribers WHERE id = $1`,
        [id],
      )) as SubscriberState[];
      const [row] = rows;
      if (!row) throw new Error('El suscriptor de la prueba no existe.');
      return row;
    }

    async function erase(id: string): Promise<TitularErasureTableResult[]> {
      const runner = requireQueryRunner();
      const participant = new CrmTitularErasureParticipant(
        new ConfigService({ PII_HASH_KEY: keys.hashKey.toString('hex') }),
      );
      await runner.startTransaction();
      try {
        await runner.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
        const results = await participant.apply(
          {
            partyId: null,
            subscriberIds: [id],
            expedienteIds: [],
            userIds: [],
            requestId: randomUUID(),
            cryptoKeys: keys,
          },
          runner,
          'apply',
        );
        await runner.commitTransaction();
        return results;
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('CA-K2A-01 deja en NULL el documento de un titular natural, con marca y sin residuos', async () => {
      const id = await insertNatural();

      const results = await erase(id);

      const state = await readState(id);
      expect(state.document_number_encrypted).toBeNull();
      expect(state.anonymized_at).toBeInstanceOf(Date);
      expect(results.find((result) => result.table === 'subscribers')).toMatchObject({
        selected: 1,
        changed: 1,
        residual: 0,
      });
      expect(results.filter((result) => result.residual !== 0)).toEqual([]);
    });

    it('CA-K2A-01 no escribe marca cifrada en un titular jurídico sin documento', async () => {
      const id = await insertJuridica();

      const results = await erase(id);

      const state = await readState(id);
      expect(state.document_number_encrypted).toBeNull();
      expect(state.anonymized_at).toBeInstanceOf(Date);
      expect(results.filter((result) => result.residual !== 0)).toEqual([]);
    });

    it('D-K2A-3 marca antes de anular y avanza la versión una sola vez', async () => {
      const id = await insertNatural();
      const query = jest.spyOn(requireQueryRunner(), 'query');

      await erase(id);

      const updates = query.mock.calls
        .map(([sql]) => String(sql))
        .filter((sql) => /^\s*UPDATE "subscribers"/u.test(sql));
      expect(updates).toHaveLength(2);
      expect(updates[0]).toContain('anonymized_at = COALESCE');
      expect(updates[0]).toContain('updated_at');
      expect(updates[1]).toContain('"document_number_encrypted" = ');
      expect(updates[1]).not.toContain('updated_at');
    });

    it('CA-K2A-01 con el orden invertido falla con 23514 y no aplica nada', async () => {
      const id = await insertNatural();
      const before = await readState(id);
      const markAnonymizedRows = erasureSql.markAnonymizedRows;
      jest
        .spyOn(erasureSql, 'markAnonymizedRows')
        .mockImplementation(async (qr, table, ids, ...rest) =>
          table === 'subscribers'
            ? { changed: 0, residual: 0 }
            : markAnonymizedRows(qr, table, ids, ...rest),
        );

      await expect(erase(id)).rejects.toMatchObject({
        driverError: { code: '23514', constraint: 'chk_subscriber_person_fields' },
      });

      expect(await readState(id)).toEqual(before);
    });
  });
});
