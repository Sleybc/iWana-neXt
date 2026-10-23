import { randomBytes, randomUUID } from 'node:crypto';
import { SerializedAssetStatus } from '@iwana/shared';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { InstalledEquipmentReadAdapter } from './installed-equipment-read.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_installed_equipment_${randomBytes(5).toString('hex')}`;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración InstalledEquipmentReadAdapter: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crean y eliminan schemas efímeros.',
  );
}

describeWithDb('InstalledEquipmentReadAdapter — lectura tenant-aware en PostgreSQL', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let adapter: InstalledEquipmentReadAdapter;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    tenantId = randomUUID();
    await createTenantSchema();
    adapter = new InstalledEquipmentReadAdapter(dataSource);
  }, 30_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.destroy();
  });

  async function createTenantSchema(): Promise<void> {
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const statusValues = Object.values(SerializedAssetStatus)
      .map((status) => `'${status}'`)
      .join(', ');
    await dataSource.query(
      `CREATE TYPE "${schemaName}".serialized_asset_status AS ENUM (${statusValues})`,
    );
    await dataSource.query(`
      CREATE TABLE "${schemaName}".inventory_items (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        model varchar(120)
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".serialized_assets (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        inventory_item_id uuid NOT NULL,
        serial_number varchar(160),
        mac_address varchar(64),
        current_status "${schemaName}".serialized_asset_status NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".asset_loan_assignments (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        serialized_asset_id uuid NOT NULL,
        subscriber_ref_id uuid NOT NULL,
        installed_at timestamptz NOT NULL,
        removed_at timestamptz,
        execution_order_ref_id uuid NOT NULL
      )
    `);
  }

  async function insertAsset(input: {
    assetId: string;
    itemId: string;
    status: SerializedAssetStatus;
    serialNumber: string;
    macAddress: string;
    model: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO "${schemaName}".inventory_items (id, tenant_id, model)
       VALUES ($1, $2, $3)`,
      [input.itemId, tenantId, input.model],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".serialized_assets (
         id, tenant_id, inventory_item_id, serial_number, mac_address, current_status
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.assetId, tenantId, input.itemId, input.serialNumber, input.macAddress, input.status],
    );
  }

  async function insertAssignment(input: {
    assetId: string;
    executionOrderId: string;
    subscriberId: string;
    removedAt: Date | null;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO "${schemaName}".asset_loan_assignments (
         id, tenant_id, serialized_asset_id, subscriber_ref_id,
         installed_at, removed_at, execution_order_ref_id
       ) VALUES ($1, $2, $3, $4, now(), $5, $6)`,
      [
        randomUUID(),
        tenantId,
        input.assetId,
        input.subscriberId,
        input.removedAt,
        input.executionOrderId,
      ],
    );
  }

  function readFor(executionOrderId: string, subscriberId: string) {
    return TenantContext.run(
      { tenantId, schemaName, tenantSlug: 'installed-equipment-integration' },
      () => adapter.getFirstInstalledAtCustomer(executionOrderId, subscriberId),
    );
  }

  it('devuelve serial, MAC y modelo del activo abierto en comodato para la OT y suscriptor', async () => {
    const executionOrderId = randomUUID();
    const subscriberId = randomUUID();
    const assetId = randomUUID();
    await insertAsset({
      assetId,
      itemId: randomUUID(),
      status: SerializedAssetStatus.INSTALLED_COMODATO,
      serialNumber: 'SERIAL-CPE-01',
      macAddress: '00:11:22:33:44:55',
      model: 'Router modelo de prueba',
    });
    await insertAssignment({ assetId, executionOrderId, subscriberId, removedAt: null });

    await expect(readFor(executionOrderId, subscriberId)).resolves.toEqual({
      serialNumber: 'SERIAL-CPE-01',
      macAddress: '00:11:22:33:44:55',
      model: 'Router modelo de prueba',
    });
  });

  it('devuelve null si la asignación del activo está cerrada', async () => {
    const executionOrderId = randomUUID();
    const subscriberId = randomUUID();
    const assetId = randomUUID();
    await insertAsset({
      assetId,
      itemId: randomUUID(),
      status: SerializedAssetStatus.INSTALLED_COMODATO,
      serialNumber: 'SERIAL-CPE-CLOSED',
      macAddress: '00:11:22:33:44:66',
      model: 'Router modelo cerrado',
    });
    await insertAssignment({
      assetId,
      executionOrderId,
      subscriberId,
      removedAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    await expect(readFor(executionOrderId, subscriberId)).resolves.toBeNull();
  });

  it('devuelve null si la asignación apunta a un activo inexistente', async () => {
    const executionOrderId = randomUUID();
    const subscriberId = randomUUID();
    await insertAssignment({
      assetId: randomUUID(),
      executionOrderId,
      subscriberId,
      removedAt: null,
    });

    await expect(readFor(executionOrderId, subscriberId)).resolves.toBeNull();
  });
});
