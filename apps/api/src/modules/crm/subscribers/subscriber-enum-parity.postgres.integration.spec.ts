import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { dataSourceOptions } from '@iwana/db';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { Subscriber } from './entities/subscriber.entity';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
// Esquema propio e independiente: instala la cadena tenant vigente desde cero, así que no
// depende de ningún esquema preexistente de la base de desarrollo.
const tenantId = randomUUID();
const schemaName = `tenant_enum_parity_${randomUUID().replace(/-/g, '')}`;

describeWithDb('Subscriber enum metadata — parity con pg_type', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...(dataSourceOptions as PostgresConnectionOptions),
      entities: [Subscriber],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Enum parity synthetic',
        `enum-parity-${tenantId.slice(0, 8)}`,
        schemaName,
        'enum-parity@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `enum-parity-${schemaName}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('declara cada columna enum de subscribers con nombre y etiquetas idénticos a pg_type', async () => {
    const metadataEnums = dataSource
      .getMetadata(Subscriber)
      .columns.filter((column) => column.type === 'enum')
      .map((column) => ({
        columnName: column.databaseName,
        enumName: column.enumName,
        enumValues: Array.isArray(column.enum)
          ? column.enum.map(String)
          : Object.values(column.enum ?? {}).map(String),
      }))
      .sort((left, right) => left.columnName.localeCompare(right.columnName));

    const databaseEnums = (await dataSource.query(
      `SELECT a.attname AS "columnName",
              t.typname AS "enumName",
              json_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS "enumValuesJson"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_type t ON t.oid = a.atttypid
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = $1
          AND c.relname = 'subscribers'
          AND a.attnum > 0
          AND NOT a.attisdropped
        GROUP BY a.attname, t.typname
        ORDER BY a.attname`,
      [schemaName],
    )) as Array<{ columnName: string; enumName: string; enumValuesJson: string }>;

    expect(metadataEnums.length).toBeGreaterThan(0);
    expect(metadataEnums).toEqual(
      databaseEnums.map(({ columnName, enumName, enumValuesJson }) => ({
        columnName,
        enumName,
        enumValues: JSON.parse(enumValuesJson) as string[],
      })),
    );
  });
});
