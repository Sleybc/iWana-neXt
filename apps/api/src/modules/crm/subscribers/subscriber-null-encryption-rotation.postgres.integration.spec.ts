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

const schemaName = `tenant_mod05_rotation_${randomBytes(5).toString('hex')}`;
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
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".subscribers (
        id uuid PRIMARY KEY,
        email_encrypted varchar(500)
      )
    `);
    await dataSource.query(
      `INSERT INTO "${schemaName}".subscribers (id, email_encrypted) VALUES ($1, NULL), ($2, $3)`,
      [nullRowId, ciphertextRowId, encryptAes256Gcm(syntheticValue, previousKey)],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
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
