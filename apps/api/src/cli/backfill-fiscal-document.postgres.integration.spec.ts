import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { createFiscalDocumentCryptoFromKeys } from '../common/crypto/fiscal-document.util';
import { runFiscalDocumentBackfillInTenantSchema } from './backfill-fiscal-document';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('Backfill fiscal — PostgreSQL real en schema sintético', () => {
  let dataSource: DataSource;
  let schemaName: string;
  const tenantId = randomUUID();
  let crypto: ReturnType<typeof createFiscalDocumentCryptoFromKeys>;

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración backfill fiscal: DB_NAME debe ser test o iwana_it_*; nunca la base de desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    schemaName = `tenant_fiscal_backfill_${randomBytes(5).toString('hex')}`;
    // Esquema propio con la cadena tenant vigente: contracts y expediente_records conservan la
    // columna fiscal_document en claro que este backfill vacía.
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Fiscal backfill synthetic',
        `fiscal-backfill-${tenantId.slice(0, 8)}`,
        schemaName,
        'fiscal-backfill@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `fiscal-backfill-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const activeKey = randomBytes(32);
    crypto = createFiscalDocumentCryptoFromKeys({
      activeEncryptionKey: activeKey,
      previousEncryptionKeys: null,
      hashKey: randomBytes(32),
    });
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (schemaName) {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      }
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  it('simula sin cambios, cifra filas heredadas, verifica 0 en claro y es idempotente', async () => {
    const schema = quoteIdentifier(schemaName);
    const contractId = randomUUID();
    const expedienteId = randomUUID();
    await dataSource.query(
      `INSERT INTO ${schema}.contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, fiscal_document)
       VALUES ($1, $2, $3, 'synthetic-plan', '{}'::jsonb, $4)`,
      [contractId, tenantId, randomUUID(), 'synthetic-contract-fiscal'],
    );
    await dataSource.query(
      `INSERT INTO ${schema}.expediente_records
         (id, tenant_id, full_name, created_by, fiscal_document)
       VALUES ($1, $2, 'Prospecto sintético', $3, $4)`,
      [expedienteId, tenantId, randomUUID(), 'synthetic-expediente-fiscal'],
    );

    const dryRun = await runFiscalDocumentBackfillInTenantSchema(
      dataSource,
      schemaName,
      crypto,
      'dry-run',
    );
    expect(dryRun.totals).toEqual({
      seen: 2,
      wouldEncrypt: 2,
      encrypted: 0,
      plaintextRemaining: 2,
    });
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count
           FROM ${schema}.contracts WHERE fiscal_document_encrypted IS NOT NULL`,
      ),
    ).toEqual([{ count: 0 }]);

    const applied = await runFiscalDocumentBackfillInTenantSchema(
      dataSource,
      schemaName,
      crypto,
      'apply',
    );
    expect(applied.totals).toEqual({
      seen: 2,
      wouldEncrypt: 2,
      encrypted: 2,
      plaintextRemaining: 0,
    });
    const rows = (await dataSource.query(
      `SELECT fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
         FROM ${schema}.contracts WHERE id = $1`,
      [contractId],
    )) as Array<{
      fiscal_document: string | null;
      fiscal_document_encrypted: string;
      fiscal_document_hmac: string;
    }>;
    expect(rows[0]?.fiscal_document).toBeNull();
    expect(crypto.decrypt(rows[0]!.fiscal_document_encrypted)).toBe('synthetic-contract-fiscal');
    expect(rows[0]?.fiscal_document_hmac).toHaveLength(64);

    const repeated = await runFiscalDocumentBackfillInTenantSchema(
      dataSource,
      schemaName,
      crypto,
      'apply',
    );
    expect(repeated.totals).toEqual({
      seen: 0,
      wouldEncrypt: 0,
      encrypted: 0,
      plaintextRemaining: 0,
    });
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM ${schema}.expediente_records
          WHERE fiscal_document IS NOT NULL`,
      ),
    ).toEqual([{ count: 0 }]);
  });
});
