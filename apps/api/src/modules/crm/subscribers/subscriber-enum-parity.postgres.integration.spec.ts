import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { dataSourceOptions } from '@iwana/db';
import { Subscriber } from './entities/subscriber.entity';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = 'tenant_test';

describeWithDb('Subscriber enum metadata — parity con pg_type', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...(dataSourceOptions as PostgresConnectionOptions),
      schema: schemaName,
      entities: [Subscriber],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
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
