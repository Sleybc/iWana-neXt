import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { PrivacyAuthorizationAdapter } from './privacy-authorization.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_privacy_authorization_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
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
    // El esquema lo instala la cadena de migraciones tenant (P3-5), no un DDL escrito a mano;
    // la migración 092 exige el tenant canónico en public.tenants.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Privacy authorization sintético',
        `privacy-authorization-${tenantId.slice(0, 8)}`,
        schemaName,
        'privacy-authorization@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `privacy-authorization-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await dataSource.query(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico-autorizacion', 'Titular sintético')`,
      [partyId],
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
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
