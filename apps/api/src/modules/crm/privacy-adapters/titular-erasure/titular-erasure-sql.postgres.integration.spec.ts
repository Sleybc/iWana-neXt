import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import { encryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import {
  anonymizeConfiguredTable,
  markAnonymizedRows,
  readTenantColumns,
  type ErasureKeys,
  type FieldRule,
} from './titular-erasure-sql';
import { CrmTitularErasureParticipant } from './crm-titular-erasure.participant';

const schema = `tenant_privacy_versions_${randomBytes(4).toString('hex')}`;
const schemaTenantId = randomUUID();
const fixtureActorId = randomUUID();
const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;
const safeDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (databaseAvailable && !safeDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración de versiones de supresión: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

const KEYS: ErasureKeys = {
  hashKey: Buffer.alloc(32, 1),
  activeEncryptionKey: Buffer.alloc(32, 2),
  previousEncryptionKey: null,
};

describeWithDb('Supresión CRM — versiones PostgreSQL reales', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;

  // Columnas obligatorias del esquema migrado: persona natural con documento y estrato
  // (chk_subscriber_person_fields), address, customer_segment, vat_treatment y created_by.
  async function insertSubscriberRow(
    target: QueryRunner,
    input: {
      id: string;
      firstName: string;
      updatedAt: Date;
      anonymizedRequestId?: string | null;
    },
  ): Promise<void> {
    const anonymized = input.anonymizedRequestId != null;
    await target.query(
      `INSERT INTO subscribers
        (id, tenant_id, person_type, customer_segment, document_type, document_number_encrypted,
         first_name, last_name, stratum, vat_treatment, address, created_by, anonymized_at,
         anonymized_request_id, updated_at)
       VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado', $3, 'Sintético', 3,
               'STANDARD', 'Dirección sintética', $4,
               CASE WHEN $5::boolean THEN now() ELSE NULL END, $6, $7)`,
      [
        input.id,
        schemaTenantId,
        input.firstName,
        fixtureActorId,
        anonymized,
        input.anonymizedRequestId ?? null,
        input.updatedAt,
      ],
    );
  }

  // contracts exige tenant_id, subscriber_id, plan_id y plan_snapshot_json (NOT NULL).
  async function insertContractRow(
    target: QueryRunner,
    input: {
      id: string;
      subscriberId: string;
      alias: string;
      updatedAt: Date;
      installationNotes?: string | null;
      fiscalName?: string | null;
      planSnapshotJson?: string;
    },
  ): Promise<void> {
    await target.query(
      `INSERT INTO contracts
        (id, tenant_id, subscriber_id, plan_id, alias, installation_notes, fiscal_name,
         plan_snapshot_json, updated_at)
       VALUES ($1, $2, $3, 'fixture-plan', $4, $5, $6, $7::jsonb, $8)`,
      [
        input.id,
        schemaTenantId,
        input.subscriberId,
        input.alias,
        input.installationNotes ?? null,
        input.fiscalName ?? null,
        input.planSnapshotJson ?? '{}',
        input.updatedAt,
      ],
    );
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
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Privacy versions synthetic fixture', $2, $3, 'ACTIVE', 'privacy-versions@example.invalid')`,
      [schemaTenantId, `privacy-versions-${schema.slice(-8)}`, schema],
    );
    // El esquema lo crea la cadena de migraciones del tenant: contracts y subscribers con sus
    // columnas, constraints y triggers de supresión reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    const versionsDataSource = createTenantDataSource(
      dataSource,
      schema,
      `privacy-versions-${schema}`,
    );
    await versionsDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(versionsDataSource);
    } finally {
      await versionsDataSource.destroy();
    }
    runner = dataSource.createQueryRunner();
    await runner.query(`SET search_path TO "${schema}"`);
  }, 180_000);

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [schemaTenantId]);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('avanza exactamente 1 ms una versión futura al redactar y al poner solo la marca', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const futureVersion = new Date('2099-01-01T00:00:00.000Z');
    await insertSubscriberRow(runner, {
      id: subscriberId,
      firstName: 'Anonimizado',
      updatedAt: futureVersion,
    });
    await insertContractRow(runner, {
      id: contractId,
      subscriberId,
      alias: 'Alias previo',
      updatedAt: futureVersion,
    });
    const columns = await readTenantColumns(runner);
    const contractRules: FieldRule[] = [{ column: 'alias', kind: 'marker' }];
    const contractResult = await anonymizeConfiguredTable(
      runner,
      'contracts',
      [contractId],
      contractRules,
      columns,
      KEYS,
      'apply',
    );
    const contractVersions = (await runner.query(`SELECT updated_at FROM contracts WHERE id = $1`, [
      contractId,
    ])) as Array<{ updated_at: Date }>;
    expect(contractResult).toMatchObject({ selected: 1, changed: 1, residual: 0 });
    expect(contractVersions[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(contractVersions[0]?.updated_at.getTime()).toBeGreaterThan(futureVersion.getTime());

    const subscriberVersionBeforeMark = (await runner.query(
      `SELECT updated_at FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date }>;
    const markResult = await markAnonymizedRows(
      runner,
      'subscribers',
      [subscriberId],
      requestId,
      columns,
    );
    const subscriberAfterMark = (await runner.query(
      `SELECT updated_at, anonymized_at, anonymized_request_id
         FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{
      updated_at: Date;
      anonymized_at: Date | null;
      anonymized_request_id: string | null;
    }>;
    expect(markResult).toEqual({ changed: 1, residual: 0 });
    expect(subscriberAfterMark[0]?.updated_at.getTime()).toBe(
      subscriberVersionBeforeMark[0]!.updated_at.getTime() + 1,
    );
    expect(subscriberAfterMark[0]?.anonymized_at).not.toBeNull();
    expect(subscriberAfterMark[0]?.anonymized_request_id).toBe(requestId);
  });

  it('no avanza updated_at cuando el registro ya está limpio y marcado', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const version = new Date('2099-01-01T00:00:00.000Z');
    await insertSubscriberRow(runner, {
      id: subscriberId,
      firstName: 'Anonimizado',
      updatedAt: version,
      anonymizedRequestId: requestId,
    });
    await insertContractRow(runner, {
      id: contractId,
      subscriberId,
      alias: 'ANONIMIZADO',
      updatedAt: version,
    });
    const columns = await readTenantColumns(runner);
    const contractResult = await anonymizeConfiguredTable(
      runner,
      'contracts',
      [contractId],
      [{ column: 'alias', kind: 'marker' }],
      columns,
      KEYS,
      'apply',
    );
    const markResult = await markAnonymizedRows(
      runner,
      'subscribers',
      [subscriberId],
      requestId,
      columns,
    );
    const versions = (await runner.query(`SELECT updated_at FROM contracts WHERE id = $1`, [
      contractId,
    ])) as Array<{ updated_at: Date }>;
    const subscriberVersions = (await runner.query(
      `SELECT updated_at FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date }>;
    expect(contractResult).toEqual({ selected: 1, changed: 0, residual: 0 });
    expect(markResult).toEqual({ changed: 0, residual: 0 });
    expect(versions[0]?.updated_at.getTime()).toBe(version.getTime());
    expect(subscriberVersions[0]?.updated_at.getTime()).toBe(version.getTime());
  });

  it('avanza solo una vez por fila durante la supresión CRM completa', async () => {
    if (!runner) throw new Error('QueryRunner de integración no inicializado.');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    const futureVersion = new Date('2099-01-01T00:00:00.000Z');
    await insertSubscriberRow(runner, {
      id: subscriberId,
      firstName: 'Nombre previo',
      updatedAt: futureVersion,
    });
    await insertContractRow(runner, {
      id: contractId,
      subscriberId,
      alias: 'Alias previo',
      installationNotes: 'Nota previa',
      fiscalName: 'Nombre fiscal previo',
      planSnapshotJson: JSON.stringify({ plan: { name: 'dato personal sintético', code: 'keep' } }),
      updatedAt: futureVersion,
    });

    const participant = new CrmTitularErasureParticipant(
      new ConfigService({ PII_HASH_KEY: Buffer.alloc(32, 1).toString('hex') }),
    );
    // Precondición del llamador real: el CLI anonymize-titular y CrmPersonalDataErasureAdapter
    // abren la transacción y activan iwana.titular_erasure antes de invocar al participante;
    // sin ella, el trigger 169 bloquea la segunda escritura sobre el titular ya marcado.
    await runner.startTransaction();
    try {
      await runner.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
      await participant.apply(
        {
          partyId: null,
          subscriberIds: [subscriberId],
          expedienteIds: [],
          userIds: [],
          requestId,
          cryptoKeys: KEYS,
        },
        runner,
        'apply',
      );
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    }

    const contract = (await runner.query(
      `SELECT updated_at, alias, installation_notes, fiscal_name, plan_snapshot_json
         FROM contracts WHERE id = $1`,
      [contractId],
    )) as Array<{
      updated_at: Date;
      alias: string;
      installation_notes: string | null;
      fiscal_name: string | null;
      plan_snapshot_json: Record<string, unknown>;
    }>;
    const subscriber = (await runner.query(
      `SELECT updated_at, anonymized_at, anonymized_request_id
         FROM subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ updated_at: Date; anonymized_at: Date | null; anonymized_request_id: string }>;
    expect(contract[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(contract[0]).toMatchObject({
      alias: 'ANONIMIZADO',
      installation_notes: null,
      fiscal_name: null,
      plan_snapshot_json: { plan: { code: 'keep' } },
    });
    expect(subscriber[0]?.updated_at.getTime()).toBe(futureVersion.getTime() + 1);
    expect(subscriber[0]?.anonymized_at).not.toBeNull();
    expect(subscriber[0]?.anonymized_request_id).toBe(requestId);
  });

  it('ancla la columna cifrada de historial al esquema migrado y detecta su renombre', async () => {
    if (!dataSource?.isInitialized) throw new Error('DataSource de integración no inicializado.');
    const migratedSchema = `tenant_privacy_migration_${randomBytes(5).toString('hex')}`;
    const quotedSchema = `"${migratedSchema}"`;
    const tenantId = randomUUID();
    const subscriberId = randomUUID();
    const actorId = randomUUID();
    const migrationDataSource = createTenantDataSource(
      dataSource,
      migratedSchema,
      `privacy-migration-${migratedSchema}`,
    );
    let migrationRunner: QueryRunner | undefined;

    try {
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'Privacy migration synthetic fixture', $2, $3, 'ACTIVE', 'privacy-it@example.invalid')`,
        [tenantId, `privacy-migration-${migratedSchema.slice(-10)}`, migratedSchema],
      );
      await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
      await migrationDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(migrationDataSource);
      } finally {
        await migrationDataSource.destroy();
      }

      migrationRunner = dataSource.createQueryRunner();
      await migrationRunner.connect();
      await migrationRunner.startTransaction();
      await migrationRunner.query(`SET LOCAL search_path TO ${quotedSchema}`);
      const columns = await readTenantColumns(migrationRunner);
      expect(columns.has('crm_lifecycle_changes.note_encrypted')).toBe(true);
      await migrationRunner.query(
        `INSERT INTO subscribers
          (id, tenant_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', $3,
           'Nombre sintético', 'Apellido sintético', 2, $4, $5, 'STANDARD', 'COMMON',
           'RESPONSABLE', 'Dirección sintética', $6)`,
        [
          subscriberId,
          tenantId,
          encryptAes256Gcm('synthetic-subscriber-document', KEYS.activeEncryptionKey),
          encryptAes256Gcm('synthetic-email', KEYS.activeEncryptionKey),
          encryptAes256Gcm('synthetic-phone', KEYS.activeEncryptionKey),
          actorId,
        ],
      );
      await migrationRunner.query(
        `INSERT INTO crm_lifecycle_changes
          (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
           reason_code, note_encrypted, source, batch_id, actor_id)
         VALUES ($1, 'SUBSCRIBER', $2, $2, 'ACTIVE', 'CANCELLED',
           'SOLICITUD_TITULAR', $3, 'MANUAL', $4, $5)`,
        [
          tenantId,
          subscriberId,
          encryptAes256Gcm('synthetic lifecycle note', KEYS.activeEncryptionKey),
          randomUUID(),
          actorId,
        ],
      );
      const participant = new CrmTitularErasureParticipant(
        new ConfigService({ PII_HASH_KEY: KEYS.hashKey.toString('hex') }),
      );
      const scope = {
        partyId: null,
        subscriberIds: [subscriberId],
        expedienteIds: [],
        userIds: [],
        cryptoKeys: KEYS,
      };
      const plan = await participant.plan(scope, migrationRunner);
      expect(plan.find((result) => result.table === 'crm_lifecycle_changes')).toMatchObject({
        selected: 1,
        residual: 1,
      });

      await migrationRunner.query(
        'ALTER TABLE crm_lifecycle_changes RENAME COLUMN note_encrypted TO note_ciphertext',
      );
      await expect(participant.plan(scope, migrationRunner)).rejects.toThrow();
    } finally {
      if (migrationRunner && !migrationRunner.isReleased) {
        if (migrationRunner.isTransactionActive) await migrationRunner.rollbackTransaction();
        await migrationRunner.release();
      }
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
  }, 180_000);
});
