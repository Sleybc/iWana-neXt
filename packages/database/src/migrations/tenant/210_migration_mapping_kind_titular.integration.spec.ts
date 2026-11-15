import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { MigrationMappingKindTitular2100000000210 } from './210_migration_mapping_kind_titular';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Migración 210 en PostgreSQL real (spec 2026-11-15 «complementar titular», §3; ADR-110 D11):
 * `chk_migration_mappings_kind` admite `TITULAR`; `TITULAR` solo admite `EQUIVALE` con destino.
 * down bloquea si hay equivalencias `TITULAR` (salvo la variable destructiva, que las borra) y
 * up vuelve a aplicar.
 */
const SCHEMA = `tenant_m210_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseAllowed = /^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '');
const describeWithDb = dbAvailable && databaseAllowed ? describe : describe.skip;

jest.setTimeout(900_000);

describeWithDb('Migración 210 — equivalencia de tipo TITULAR', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m210 = new MigrationMappingKindTitular2100000000210();
  const insert = `INSERT INTO migration_mappings
                    (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
                  VALUES ($1, 'UISP', $2, $3, $4, $5, $6)`;

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function sqlstateOf(sql: string, params: unknown[] = []): Promise<string> {
    await qr().query('SAVEPOINT sp_m210');
    try {
      await qr().query(sql, params);
    } catch (error) {
      await qr().query('ROLLBACK TO SAVEPOINT sp_m210');
      return (error as { code?: string }).code ?? 'sin-codigo';
    }
    await qr().query('RELEASE SAVEPOINT sp_m210');
    return 'aceptado';
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Migración 210 sintética', $2, $3, 'INACTIVE', $4)`,
      [TENANT_ID, SCHEMA.replaceAll('_', '-'), SCHEMA, `${SCHEMA}@invalid.example`],
    );
    const tenantDataSource = createTenantDataSource(dataSource, SCHEMA);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await runner.startTransaction();
  });

  afterAll(async () => {
    delete process.env[DESTRUCTIVE];
    try {
      if (runner && !runner.isReleased) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
        await dataSource.destroy();
      }
    }
  });

  it('up: TITULAR con EQUIVALE y destino se acepta', async () => {
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'TITULAR', 'c-1', 'EQUIVALE', randomUUID(), ACTOR_ID]),
    ).toBe('aceptado');
  });

  it('up: TITULAR con DESCARTAR o NOTA viola chk_migration_mappings_action_kind', async () => {
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'TITULAR', 'c-2', 'DESCARTAR', null, ACTOR_ID]),
    ).toBe('23514');
    expect(await sqlstateOf(insert, [TENANT_ID, 'TITULAR', 'c-3', 'NOTA', null, ACTOR_ID])).toBe(
      '23514',
    );
  });

  it('up: un tipo desconocido sigue rechazado', async () => {
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'OTRO', 'x', 'EQUIVALE', randomUUID(), ACTOR_ID]),
    ).toBe('23514');
  });

  it('down: bloquea si hay equivalencias TITULAR y no cambia nada', async () => {
    await qr().query('SAVEPOINT sp_down');
    await expect(m210.down(qr())).rejects.toThrow(/TITULAR/u);
    await qr().query('ROLLBACK TO SAVEPOINT sp_down');
    const [row] = (await qr().query(
      `SELECT COUNT(*)::int AS n FROM migration_mappings WHERE kind = 'TITULAR'`,
    )) as Array<{ n: number }>;
    expect(row?.n).toBe(1);
  });

  it('down destructivo borra las TITULAR y restaura el CHECK; up vuelve a admitirlo', async () => {
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m210.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'TITULAR', 'c-4', 'EQUIVALE', randomUUID(), ACTOR_ID]),
    ).toBe('23514');
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'PLAN', 'p-1', 'EQUIVALE', randomUUID(), ACTOR_ID]),
    ).toBe('aceptado');
    await m210.up(qr());
    expect(
      await sqlstateOf(insert, [TENANT_ID, 'TITULAR', 'c-5', 'EQUIVALE', randomUUID(), ACTOR_ID]),
    ).toBe('aceptado');
  });
});
