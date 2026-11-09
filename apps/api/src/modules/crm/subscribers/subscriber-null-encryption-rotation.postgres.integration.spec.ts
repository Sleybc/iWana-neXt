import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { decryptAes256Gcm, encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { TypeOrmReencryptDbAdapter } from '../../../common/crypto/reencrypt-aes.db-adapter';
import {
  runReencryptAes,
  type ReencryptDbPort,
} from '../../../common/crypto/reencrypt-aes.orchestrator';
import type { EncryptedColumnTarget } from '../../../common/crypto/reencrypt-aes.targets';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

const schemaName = `tenant_mod05_rotation_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const activeKey = Buffer.alloc(32, 0x22);
const previousKey = Buffer.alloc(32, 0x11);
const target: EncryptedColumnTarget = {
  entityType: 'subscriber.emailEncrypted',
  scope: 'tenant',
  table: 'subscribers',
  column: 'email_encrypted',
  idColumn: 'id',
  requireCiphertextShape: true,
};

describeWithDb('Rotación AES con contacto NULL — PostgreSQL real', () => {
  let dataSource: DataSource;
  const nullRowId = randomUUID();
  const ciphertextRowId = randomUUID();
  const syntheticValue = 'synthetic-rotation-fixture';

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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Rotation synthetic fixture', $2, $3, 'ACTIVE', 'rotation@example.invalid')`,
      [tenantId, `rotation-${schemaName.slice(-10)}`, schemaName],
    );
    // El esquema lo crea la cadena de migraciones del tenant: subscribers con su
    // email_encrypted real, constraints y triggers, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `rotation-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    // Columnas obligatorias del esquema migrado (persona natural con documento y estrato).
    await dataSource.query(
      `INSERT INTO "${schemaName}".subscribers
        (id, email_encrypted, tenant_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by)
       SELECT fixture.id, fixture.email_encrypted, $1, 'NATURAL', 'RESIDENTIAL', 'CC',
              'sintetico-cifrado', 'Titular', 'Sintético', 3, 'STANDARD', 'Dirección sintética', $2
         FROM (VALUES ($3::uuid, NULL::varchar), ($4::uuid, $5::varchar))
           AS fixture(id, email_encrypted)`,
      [
        tenantId,
        actorId,
        nullRowId,
        ciphertextRowId,
        encryptAes256Gcm(syntheticValue, previousKey),
      ],
    );
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('omite NULL, recifra el dato no nulo y deja la columna pendiente sin errores', async () => {
    const adapter = new TypeOrmReencryptDbAdapter(dataSource);
    const db: ReencryptDbPort = {
      listActiveTenantSchemas: async () => [schemaName],
      tableExists: (schema, table) => adapter.tableExists(schema, table),
      fetchEncryptedBatch: (schema, encryptedTarget, offset, limit) =>
        adapter.fetchEncryptedBatch(schema, encryptedTarget, offset, limit),
      updateEncryptedValue: (schema, encryptedTarget, id, ciphertext) =>
        adapter.updateEncryptedValue(schema, encryptedTarget, id, ciphertext),
    };

    const report = await runReencryptAes(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      activeKey,
      previousKey,
      publicTargets: [],
      tenantTargets: [target],
    });

    expect(report.hasBlockingIssues).toBe(false);
    expect(report.totals).toMatchObject({
      candidates: 1,
      reencrypted: 1,
      decryptErrors: 0,
      pending: 0,
    });
    const rows = (await dataSource.query(
      `SELECT id, email_encrypted FROM "${schemaName}".subscribers ORDER BY id`,
    )) as Array<{ id: string; email_encrypted: string | null }>;
    const nullRow = rows.find((row) => row.id === nullRowId);
    const encryptedRow = rows.find((row) => row.id === ciphertextRowId);
    expect(nullRow?.email_encrypted).toBeNull();
    if (!encryptedRow?.email_encrypted) throw new Error('No se recifró el dato sintético.');
    expect(decryptAes256Gcm(encryptedRow.email_encrypted, activeKey, null)).toBe(syntheticValue);
  });
});
