import { randomBytes, randomUUID } from 'node:crypto';
import { SerializedAssetStatus } from '@iwana/shared';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
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

  // El esquema lo crea la cadena de migraciones tenant vigente, no un DDL escrito a mano.
  async function createTenantSchema(): Promise<void> {
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Installed equipment sintético',
        `installed-equipment-${tenantId.slice(0, 8)}`,
        schemaName,
        'installed-equipment@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `installed-equipment-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  async function insertAsset(input: {
    assetId: string;
    itemId: string;
    status: SerializedAssetStatus;
    serialNumber: string;
    macAddress: string;
    model: string;
  }): Promise<void> {
    // La cadena exige categoría (047/051) y los NOT NULL del maestro de ítems.
    const suffix = randomBytes(4).toString('hex');
    const [category] = (await dataSource.query(
      `INSERT INTO "${schemaName}".inventory_categories (tenant_id, code, code_prefix, name)
       VALUES ($1, $2, $3, 'Categoría sintética')
       RETURNING id::text AS id`,
      [tenantId, `CAT-${suffix}`, suffix.slice(0, 3)],
    )) as Array<{ id: string }>;
    await dataSource.query(
      `INSERT INTO "${schemaName}".inventory_items (
         id, tenant_id, sku, name, category, category_id, tracking_mode, unit_of_measure, model
       ) VALUES ($1, $2, $3, 'Equipo sintético', 'CPE', $4, 'SERIALIZED', 'UNIT', $5)`,
      [input.itemId, tenantId, `SKU-${suffix}`, category!.id, input.model],
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

  // Un comodato huérfano es imposible en la cadena: fk_asset_loan_assignments_asset nace
  // validada en la 047. Para ejercitar el JOIN defensivo del adaptador se suelta la FK en una
  // transacción y se repone NOT VALID (sigue aplicando a filas nuevas). Es el último test y el
  // esquema se destruye en afterAll.
  async function insertOrphanAssignment(input: {
    assetId: string;
    executionOrderId: string;
    subscriberId: string;
    removedAt: Date | null;
  }): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const table = `"${schemaName}".asset_loan_assignments`;
      await queryRunner.query(
        `ALTER TABLE ${table} DROP CONSTRAINT fk_asset_loan_assignments_asset`,
      );
      await queryRunner.query(
        `INSERT INTO ${table} (
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
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT fk_asset_loan_assignments_asset
           FOREIGN KEY (serialized_asset_id) REFERENCES "${schemaName}".serialized_assets (id)
           NOT VALID`,
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
    await insertOrphanAssignment({
      assetId: randomUUID(),
      executionOrderId,
      subscriberId,
      removedAt: null,
    });

    await expect(readFor(executionOrderId, subscriberId)).resolves.toBeNull();
  });
});
