import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AssetLoanAssignment, resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
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
    await createTenantSchema(schemaA);
    await createTenantSchema(schemaB);
    service = new AssetLoanService(dataSource);
  }, 30_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
    await dataSource.destroy();
  });

  async function createTenantSchema(schemaName: string): Promise<void> {
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".asset_loan_assignments (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        serialized_asset_id uuid NOT NULL,
        subscriber_ref_id uuid NOT NULL,
        contract_ref_id uuid,
        installed_at timestamptz NOT NULL,
        removed_at timestamptz,
        execution_order_ref_id uuid,
        stock_movement_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async function insertLoan(
    schemaName: string,
    tenantId: string,
    contractId: string,
    removedAt: Date | null,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO "${schemaName}".asset_loan_assignments (
         id, tenant_id, serialized_asset_id, subscriber_ref_id, contract_ref_id,
         installed_at, removed_at, execution_order_ref_id, stock_movement_id
       ) VALUES ($1, $2, $3, $4, $5, now(), $6, NULL, $7)`,
      [randomUUID(), tenantId, randomUUID(), randomUUID(), contractId, removedAt, randomUUID()],
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
