import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { PrivacyAuthorizationAdapter } from './privacy-authorization.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_privacy_authorization_${randomBytes(5).toString('hex')}`;
const partyId = randomUUID();
const actorId = randomUUID();

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración authorization: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

describeWithDb('PrivacyAuthorizationAdapter — idempotencia en PostgreSQL real', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [DataAuthorizationEntity],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`CREATE TABLE "${schemaName}".party (id uuid PRIMARY KEY)`);
    await dataSource.query(`INSERT INTO "${schemaName}".party (id) VALUES ($1)`, [partyId]);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        party_id uuid NOT NULL REFERENCES "${schemaName}".party(id),
        purpose text NOT NULL,
        kind text NOT NULL,
        granted boolean NOT NULL,
        channel text NOT NULL,
        evidence_media_id uuid,
        legal_text_id uuid,
        ip inet,
        user_agent text,
        captured_by uuid,
        captured_at timestamptz NOT NULL DEFAULT now(),
        source_ref text
      )
    `);
    await dataSource.query(`
      CREATE UNIQUE INDEX uq_data_authorizations_source_ref
        ON "${schemaName}".data_authorizations (source_ref) WHERE source_ref IS NOT NULL
    `);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('devuelve la misma fila cuando sourceRef ya fue registrado', async () => {
    const adapter = new PrivacyAuthorizationAdapter(dataSource);
    const input = {
      partyId,
      purpose: 'TRATAMIENTO_CONTRACTUAL' as const,
      granted: true,
      channel: 'CRM_CONVERSION',
      legalTextId: null,
      kind: 'LEGACY_IMPORT' as const,
      capturedAt: '2026-10-13T12:00:00.000Z',
      sourceRef: 'consent_records:source-1',
      actorId,
    };

    const first = await dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${schemaName}"`);
      return adapter.record(input, { ip: null, userAgent: null, manager });
    });
    const second = await dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${schemaName}"`);
      return adapter.record(input, { ip: null, userAgent: null, manager });
    });
    const rows = (await dataSource.query(
      `SELECT id FROM "${schemaName}".data_authorizations WHERE source_ref = $1`,
      [input.sourceRef],
    )) as Array<{ id: string }>;

    expect(first.authorizationId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(first.created).toBe(true);
    expect(second).toEqual({ authorizationId: first.authorizationId, created: false });
    expect(rows).toHaveLength(1);
  });
});
