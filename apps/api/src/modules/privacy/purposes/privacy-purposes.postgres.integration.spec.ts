import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { ConsentChannel } from '@iwana/shared';
import type { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import type { AuditEntryInput } from '../../audit/interfaces/audit-entry.interface';
import { resolveMigrationDbCredentials } from '../../../../../../packages/database/src/db-credentials';
import { PrivacyAuthorizationAdapter } from '../authorizations/privacy-authorization.adapter';
import { PurposesService } from './purposes.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_privacy_purposes_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = randomUUID();
const legalTextId = randomUUID();
const integrationDbName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !integrationDbName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Integración privacy purposes: DB_NAME no está permitido para schemas efímeros.');
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Privacy purposes — PostgreSQL real (CA-LT-05/06)', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;

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
      extra: { max: 3, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(`CREATE TABLE "${schemaName}".privacy_purpose_settings (
        purpose text PRIMARY KEY CHECK (purpose IN ('TRATAMIENTO_CONTRACTUAL','CONTACTO_COMERCIAL','REPORTE_CENTRALES_RIESGO','DATOS_BIOMETRICOS')),
        enabled boolean NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL
      )`);
      await bootstrap.query(`CREATE TABLE "${schemaName}".privacy_test_audit (
        entity_type text NOT NULL, entity_id uuid NOT NULL, old_value jsonb, new_value jsonb
      )`);
      await bootstrap.query(`CREATE TABLE "${schemaName}".data_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), party_id uuid NOT NULL, purpose text NOT NULL,
        kind text NOT NULL, granted boolean NOT NULL, channel text NOT NULL, legal_text_id uuid,
        evidence_media_id uuid, ip inet, user_agent text, captured_by uuid, captured_at timestamptz NOT NULL DEFAULT now(), source_ref text
      )`);
      await bootstrap.query(`INSERT INTO "${schemaName}".privacy_purpose_settings (purpose, enabled) VALUES
        ('TRATAMIENTO_CONTRACTUAL', true), ('CONTACTO_COMERCIAL', true),
        ('REPORTE_CENTRALES_RIESGO', true), ('DATOS_BIOMETRICOS', true)`);
    } finally {
      await bootstrap.release();
    }
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('rechaza concesiones deshabilitadas, conserva revocación y LEGACY_IMPORT, y audita antes/después sin PII', async () => {
    const source = dataSource;
    if (!source) throw new Error('DataSource de integración no inicializado.');
    const audit = {
      logWithin: jest.fn(
        async (entry: AuditEntryInput, manager: import('typeorm').EntityManager) => {
          await manager.query(
            'INSERT INTO privacy_test_audit (entity_type, entity_id, old_value, new_value) VALUES ($1, $2, $3, $4)',
            [entry.entityType, entry.entityId, entry.oldValue, entry.newValue],
          );
        },
      ),
    };
    const purposesService = new PurposesService(source, audit as never);
    const tenant = { tenantId, schemaName, tenantSlug: 'privacy-test' };
    const updated = await TenantContext.run(tenant, () =>
      purposesService.update(
        { items: [{ purpose: 'DATOS_BIOMETRICOS', enabled: false }] },
        actorId,
      ),
    );
    expect(updated.find((item) => item.purpose === 'DATOS_BIOMETRICOS')?.enabled).toBe(false);
    expect(audit.logWithin).toHaveBeenCalledTimes(1);

    const bootstrap = source.createQueryRunner();
    await bootstrap.connect();
    await bootstrap.startTransaction();
    await bootstrap.query(`SET LOCAL search_path TO "${schemaName}"`);
    runner = bootstrap;
    const active = requireRunner(runner);
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Partial<DataAuthorizationEntity>) => input),
      save: jest.fn(async (input: Partial<DataAuthorizationEntity>) => {
        const rows = (await active.query(
          `INSERT INTO data_authorizations (party_id, purpose, kind, granted, channel, legal_text_id, captured_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            input.partyId,
            input.purpose,
            input.kind,
            input.granted,
            input.channel,
            input.legalTextId,
            input.capturedBy,
          ],
        )) as Array<{ id: string }>;
        return { ...input, id: rows[0]?.id };
      }),
    };
    const manager = {
      query: (sql: string, parameters?: unknown[]) => active.query(sql, parameters),
      getRepository: jest.fn(() => repository),
    };
    const adapter = new PrivacyAuthorizationAdapter({} as never);
    const authorization = {
      partyId: randomUUID(),
      purpose: 'DATOS_BIOMETRICOS' as const,
      channel: ConsentChannel.EMAIL,
      legalTextId,
      actorId,
    };

    await expect(
      adapter.record(
        { ...authorization, granted: true },
        { ip: null, userAgent: null, manager: manager as never },
      ),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_PURPOSE_DISABLED' } });
    await expect(
      adapter.record(
        { ...authorization, granted: false },
        { ip: null, userAgent: null, manager: manager as never },
      ),
    ).resolves.toMatchObject({ created: true });
    await expect(
      adapter.record(
        {
          ...authorization,
          granted: true,
          kind: 'LEGACY_IMPORT',
          channel: 'CRM_CONVERSION',
          legalTextId: null,
        },
        { ip: null, userAgent: null, manager: manager as never },
      ),
    ).resolves.toMatchObject({ created: true });

    const authorizationCount = await active.query(
      'SELECT count(*)::int AS count FROM data_authorizations',
    );
    const auditRows = (await active.query(
      'SELECT entity_type, old_value, new_value FROM privacy_test_audit',
    )) as Array<{ entity_type: string; old_value: unknown; new_value: unknown }>;
    expect(authorizationCount[0]?.count).toBe(2);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toEqual(expect.objectContaining({ entity_type: 'PrivacyPurposeSetting' }));
    expect(auditRows[0]?.old_value).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ purpose: 'DATOS_BIOMETRICOS', enabled: true }),
        ]),
      }),
    );
    expect(auditRows[0]?.new_value).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ purpose: 'DATOS_BIOMETRICOS', enabled: false }),
        ]),
      }),
    );
    expect(JSON.stringify(auditRows[0])).not.toMatch(/email|name|document|phone|ip|userAgent/i);
  });
});
