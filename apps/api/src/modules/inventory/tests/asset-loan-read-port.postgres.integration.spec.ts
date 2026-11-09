import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AssetLoanAssignment, resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { AssetLoanService } from '../services/asset-loan.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaA = `tenant_b4_asset_loan_${randomBytes(5).toString('hex')}`;
const schemaB = `tenant_b4_asset_loan_${randomBytes(5).toString('hex')}`;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración AssetLoanReadPort: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crean y eliminan schemas efímeros.',
  );
}

describeWithDb('AssetLoanReadPort — consulta tenant-aware en PostgreSQL', () => {
  let dataSource: DataSource;
  let tenantA: string;
  let tenantB: string;
  let service: AssetLoanService;

  const contracts = {
    openA: randomUUID(),
    closedA: randomUUID(),
    otherTenantA: randomUUID(),
    openB: randomUUID(),
    notSelected: randomUUID(),
  };

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [AssetLoanAssignment],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    tenantA = randomUUID();
    tenantB = randomUUID();
    await createTenantSchema(schemaA, tenantA);
    await createTenantSchema(schemaB, tenantB);
    service = new AssetLoanService(dataSource);
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [
      [tenantA, tenantB],
    ]);
    await dataSource.destroy();
  });

  // El esquema lo crea la cadena de migraciones tenant vigente, no un DDL escrito a mano.
  async function createTenantSchema(schemaName: string, tenantId: string): Promise<void> {
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Asset loan read port sintético',
        `asset-loan-read-${tenantId.slice(0, 8)}`,
        schemaName,
        'asset-loan-read@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `asset-loan-read-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }

  // La cadena exige que cada comodato apunte a un activo serializado real
  // (fk_asset_loan_assignments_asset → serialized_assets → inventory_items → inventory_categories).
  async function insertSerializedAsset(schemaName: string, tenantId: string): Promise<string> {
    const suffix = randomBytes(4).toString('hex');
    const [category] = (await dataSource.query(
      `INSERT INTO "${schemaName}".inventory_categories (tenant_id, code, code_prefix, name)
       VALUES ($1, $2, $3, 'Categoría sintética')
       RETURNING id::text AS id`,
      [tenantId, `CAT-${suffix}`, suffix.slice(0, 3)],
    )) as Array<{ id: string }>;
    const [item] = (await dataSource.query(
      `INSERT INTO "${schemaName}".inventory_items (
         tenant_id, sku, name, category, category_id, tracking_mode, unit_of_measure
       ) VALUES ($1, $2, 'Equipo sintético', 'CPE', $3, 'SERIALIZED', 'UNIT')
       RETURNING id::text AS id`,
      [tenantId, `SKU-${suffix}`, category!.id],
    )) as Array<{ id: string }>;
    const [asset] = (await dataSource.query(
      `INSERT INTO "${schemaName}".serialized_assets (tenant_id, inventory_item_id, current_status)
       VALUES ($1, $2, 'INSTALLED_COMODATO')
       RETURNING id::text AS id`,
      [tenantId, item!.id],
    )) as Array<{ id: string }>;
    return asset!.id;
  }

  async function insertLoan(
    schemaName: string,
    tenantId: string,
    contractId: string,
    removedAt: Date | null,
  ): Promise<void> {
    const assetId = await insertSerializedAsset(schemaName, tenantId);
    // stock_movement_id queda NULL: la cadena lo ata por FK a stock_movements y la consulta no lo lee.
    await dataSource.query(
      `INSERT INTO "${schemaName}".asset_loan_assignments (
         id, tenant_id, serialized_asset_id, subscriber_ref_id, contract_ref_id,
         installed_at, removed_at, execution_order_ref_id, stock_movement_id
       ) VALUES ($1, $2, $3, $4, $5, now(), $6, NULL, NULL)`,
      [randomUUID(), tenantId, assetId, randomUUID(), contractId, removedAt],
    );
  }

  it('incluye abiertos seleccionados, excluye cerrados y separa schemas y tenant_id', async () => {
    await insertLoan(schemaA, tenantA, contracts.openA, null);
    await insertLoan(schemaA, tenantA, contracts.openA, null);
    await insertLoan(schemaA, tenantA, contracts.closedA, new Date('2026-10-01T00:00:00.000Z'));
    await insertLoan(schemaA, tenantB, contracts.otherTenantA, null);
    await insertLoan(schemaB, tenantB, contracts.openB, null);
    await insertLoan(schemaB, tenantB, contracts.notSelected, null);

    const resultA = await TenantContext.run(
      { tenantId: tenantA, schemaName: schemaA, tenantSlug: 'b4-a' },
      () =>
        service.findOpenContractIds([
          contracts.openA,
          contracts.closedA,
          contracts.otherTenantA,
          contracts.notSelected,
        ]),
    );
    const resultB = await TenantContext.run(
      { tenantId: tenantB, schemaName: schemaB, tenantSlug: 'b4-b' },
      () => service.findOpenContractIds([contracts.openB]),
    );

    expect(resultA).toEqual([contracts.openA]);
    expect(resultB).toEqual([contracts.openB]);
  });
});
