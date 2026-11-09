import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { ConsentChannel } from '@iwana/shared';
import type { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import type { AuditEntryInput } from '../../audit/interfaces/audit-entry.interface';
import { resolveMigrationDbCredentials } from '../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { PrivacyAuthorizationAdapter } from '../authorizations/privacy-authorization.adapter';
import { PurposesService } from './purposes.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_privacy_purposes_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = randomUUID();
const legalTextId = randomUUID();
// La cadena real exige FK de data_authorizations a party y a legal_texts (migración 146).
const authorizationPartyId = randomUUID();
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
    // El esquema lo instala la cadena de migraciones tenant (P3-5), no un DDL escrito a mano.
    // privacy_purpose_settings y sus cuatro finalidades habilitadas las crea la migración 166;
    // data_authorizations y legal_texts, la 146. La 092 exige el tenant canónico en public.tenants.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Privacy purposes sintético',
        `privacy-purposes-${tenantId.slice(0, 8)}`,
        schemaName,
        'privacy-purposes@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `privacy-purposes-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      // Sumidero solo de prueba: el AuditService real escribe en public.audit_logs; esta tabla
      // no existe en la cadena tenant y solo recoge lo que el doble de logWithin recibe dentro
      // de la misma transacción del servicio.
      await bootstrap.query(`CREATE TABLE "${schemaName}".privacy_test_audit (
        entity_type text NOT NULL, entity_id uuid NOT NULL, old_value jsonb, new_value jsonb
      )`);
      await bootstrap.query(
        `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', 'sintetico-finalidades', 'Titular sintético')`,
        [authorizationPartyId],
      );
      await bootstrap.query(
        `INSERT INTO "${schemaName}".legal_texts (id, type, version, sha256, content, published_at)
         VALUES ($1, 'AUTORIZACION', 'v-integracion', $2, 'Texto sintético de integración', now())`,
        [legalTextId, 'a'.repeat(64)],
      );
    } finally {
      await bootstrap.release();
    }
  }, 180_000);

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
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
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
      partyId: authorizationPartyId,
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
