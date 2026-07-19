/**
 * Alta de un SEGUNDO tenant: cadena de migraciones tenant aplicada a un schema
 * nuevo en una base donde YA existe otro tenant migrado.
 *
 * Por qué el aislamiento invertido: los defectos que esta prueba cubre solo
 * existen cuando dos schemas conviven en la misma base. Las guardas de tipos
 * ENUM consultan `pg_type`/`pg_enum`, que son catálogos de toda la base y no del
 * schema; con un único tenant nunca se distingue "el tipo existe aquí" de "el
 * tipo existe en algún sitio". Migrar un schema sobre una base limpia pasa
 * siempre y no prueba nada de esto.
 *
 * Dos modos de fallo, uno de ellos silencioso:
 * - 071 (stock_count_status): la guarda salta el CREATE TYPE y el CREATE TABLE
 *   siguiente rompe con 42704. Ruidoso.
 * - 057 (stock_location_type) y 058 (stock_movement_origin): la guarda salta el
 *   ALTER TYPE ... ADD VALUE y el enum del schema nuevo queda incompleto sin que
 *   ninguna migración falle. Por eso esta prueba verifica los LABELS del enum y
 *   no solo que la cadena termine: "no falla" es precisamente la forma del bug.
 *
 * Ejecutar:
 *   TENANT_MIGRATIONS_REAL_DB=1 pnpm --filter @iwana/api test -- tenant-migrations-second-schema.spec.ts --coverage=false
 *
 * Sin la variable la suite se omite. Opera sobre una base desechable
 * (`dbiw_migguard_test`) que crea y elimina; nunca toca `dbiw` ni `tenant_iwana`.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';

import {
  TENANT_MIGRATIONS,
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../packages/database/src/migrations/tenant/runner';

function loadWorkspaceEnv(): void {
  if (process.env.DB_HOST && process.env.DB_PASSWORD) {
    return;
  }

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../../.env'),
    resolve(__dirname, '../../../../../../.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

loadWorkspaceEnv();

const REAL_DB = process.env.TENANT_MIGRATIONS_REAL_DB === '1';
const TEST_DB = 'dbiw_migguard_test';
const FIRST_SCHEMA = 'tenant_guard_first';
const SECOND_SCHEMA = 'tenant_guard_second';

/** Enums que las guardas con alcance cruzado ponían en riesgo, con su contenido esperado. */
const EXPECTED_ENUMS: Record<string, string[]> = {
  stock_count_status: ['OPEN', 'COUNTING', 'CLOSED', 'CANCELLED'],
  stock_location_type: [
    'MAIN_WAREHOUSE',
    'MOBILE_TECHNICIAN',
    'MOBILE_CREW',
    'CUSTOMER_SITE',
    'QUARANTINE',
    'REPAIR',
    'SCRAP',
    'INTERNAL_CONSUMPTION',
    'OFFICE_STOCK',
    'NODE_STOCK',
  ],
  stock_movement_origin: [
    'PURCHASE_RECEIPT',
    'TRANSFER',
    'EXECUTION_ORDER',
    'SALE',
    'INTERNAL_CONSUMPTION',
    'RETURN',
    'REFURBISH',
    'ADJUSTMENT',
    'WRITE_OFF',
    'COUNTER_PURCHASE',
  ],
};

function connectionConfig() {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USER ?? 'iwana',
    password: process.env.DB_PASSWORD ?? '',
  };
}

async function queryOn(database: string, sql: string): Promise<Array<Record<string, unknown>>> {
  const client = new Client({ ...connectionConfig(), database });
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows as Array<Record<string, unknown>>;
  } finally {
    await client.end();
  }
}

const describeReal = REAL_DB ? describe : describe.skip;

describeReal('Alta de un segundo tenant — migraciones tenant con dos schemas conviviendo', () => {
  let base: DataSource;

  jest.setTimeout(300_000);

  beforeAll(async () => {
    await queryOn('postgres', `DROP DATABASE IF EXISTS ${TEST_DB}`);
    await queryOn('postgres', `CREATE DATABASE ${TEST_DB}`);

    const config = connectionConfig();
    base = new DataSource({
      type: 'postgres',
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      database: TEST_DB,
      name: `migguard-base-${Date.now()}`,
      synchronize: false,
      logging: false,
    });
    await base.initialize();

    // El provisioning crea el schema antes de invocar las migraciones (ver 000).
    for (const schema of [FIRST_SCHEMA, SECOND_SCHEMA]) {
      await queryOn(TEST_DB, `CREATE SCHEMA IF NOT EXISTS ${schema}`);
    }
  });

  afterAll(async () => {
    if (base?.isInitialized) {
      await base.destroy();
    }
    await queryOn('postgres', `DROP DATABASE IF EXISTS ${TEST_DB}`);
  });

  async function migrate(schema: string): Promise<void> {
    const ds = createTenantDataSource(base, schema, `migguard-${schema}-${Date.now()}`);
    await ds.initialize();
    try {
      await applyTenantMigrationsInOrder(ds);
    } finally {
      await ds.destroy();
    }
  }

  async function appliedCount(schema: string): Promise<number> {
    const rows = await queryOn(
      TEST_DB,
      `SELECT count(*)::int AS n FROM "${schema}".typeorm_migrations`,
    );
    return rows[0]?.n as number;
  }

  async function enumLabels(schema: string, typeName: string): Promise<string[]> {
    const rows = await queryOn(
      TEST_DB,
      `SELECT e.enumlabel AS label
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = '${schema}' AND t.typname = '${typeName}'
        ORDER BY e.enumsortorder`,
    );
    return rows.map((row) => row.label as string);
  }

  it('migra el primer tenant completo (línea base, equivale al estado actual del entorno)', async () => {
    await migrate(FIRST_SCHEMA);

    expect(await appliedCount(FIRST_SCHEMA)).toBe(TENANT_MIGRATIONS.length);
  });

  it('migra un segundo tenant completo en la misma base, sin error', async () => {
    await expect(migrate(SECOND_SCHEMA)).resolves.toBeUndefined();

    expect(await appliedCount(SECOND_SCHEMA)).toBe(TENANT_MIGRATIONS.length);
  });

  // El fallo de 057/058 no lanza: se manifiesta como un enum incompleto en el
  // segundo schema. Verificar los labels es la única forma de detectarlo.
  it.each(Object.entries(EXPECTED_ENUMS))(
    'el enum %s del segundo tenant queda completo',
    async (typeName, expectedLabels) => {
      expect(await enumLabels(SECOND_SCHEMA, typeName)).toEqual(expectedLabels);
    },
  );

  it('los enums de ambos tenants son independientes y equivalentes', async () => {
    for (const typeName of Object.keys(EXPECTED_ENUMS)) {
      expect(await enumLabels(FIRST_SCHEMA, typeName)).toEqual(
        await enumLabels(SECOND_SCHEMA, typeName),
      );
    }
  });

  // Las guardas corregidas deben seguir siendo idempotentes sobre un schema ya
  // migrado: es la condición que permite editar migraciones ya aplicadas.
  it('reaplicar la cadena sobre un schema ya migrado es un no-op', async () => {
    const before = await appliedCount(SECOND_SCHEMA);

    await migrate(SECOND_SCHEMA);

    expect(await appliedCount(SECOND_SCHEMA)).toBe(before);
    expect(await enumLabels(SECOND_SCHEMA, 'stock_location_type')).toEqual(
      EXPECTED_ENUMS.stock_location_type,
    );
  });
});
