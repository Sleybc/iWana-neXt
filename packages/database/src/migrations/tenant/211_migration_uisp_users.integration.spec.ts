import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { MigrationUispUsers2110000000211 } from './211_migration_uisp_users';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Migración 211 en PostgreSQL real (spec 2026-11-15 «importación UISP: usuarios», §2.1–§2.5 y
 * §3; ADR-110 D15): conexión con UISP (una por tenant, clave cifrada), filas de revisión de
 * usuarios con la PII purgada al resolver y equivalencia `USUARIO` sin PII. down bloquea con
 * filas (salvo la variable destructiva, que las borra) y up vuelve a aplicar.
 *
 * Los valores cifrados y hashes son marcadores sintéticos: aquí solo se prueban las reglas.
 */
const SCHEMA = `tenant_m211_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const HASH = 'c'.repeat(64);
const CIPHER = 'synthetic-ciphertext';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseAllowed = /^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '');
const describeWithDb = dbAvailable && databaseAllowed ? describe : describe.skip;

jest.setTimeout(900_000);

describeWithDb('Migración 211 — usuarios del personal desde UISP', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m211 = new MigrationUispUsers2110000000211();

  const insertConnection = `INSERT INTO migration_source_connections
      (tenant_id, source_system, base_url, app_key_encrypted, trusted_certificate_sha256,
       last_checked_at, last_check_result, created_by)
    VALUES ($1, 'UISP', $2, $3, $4, $5, $6, $7)`;
  const insertUser = `INSERT INTO migration_uisp_users
      (tenant_id, uisp_user_id, display_name_encrypted, email_encrypted, email_hash,
       is_active_in_uisp, source, status, target_user_id, proposed_role)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
  const insertMapping = `INSERT INTO migration_mappings
      (tenant_id, source_system, kind, external_value, external_label, action, target_ref,
       created_by)
    VALUES ($1, 'UISP', $2, $3, $4, $5, $6, $7)`;

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  async function sqlstateOf(sql: string, params: unknown[] = []): Promise<string> {
    await qr().query('SAVEPOINT sp_m211');
    try {
      await qr().query(sql, params);
    } catch (error) {
      await qr().query('ROLLBACK TO SAVEPOINT sp_m211');
      return (error as { code?: string }).code ?? 'sin-codigo';
    }
    await qr().query('RELEASE SAVEPOINT sp_m211');
    return 'aceptado';
  }

  function connection(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
    const row = {
      baseUrl: 'https://uisp.example.test',
      appKey: CIPHER,
      sha: null as string | null,
      checkedAt: null as string | null,
      result: null as string | null,
      ...overrides,
    };
    return [TENANT_ID, row.baseUrl, row.appKey, row.sha, row.checkedAt, row.result, ACTOR_ID];
  }

  function user(uispUserId: number, overrides: Partial<Record<string, unknown>> = {}): unknown[] {
    const row = {
      name: CIPHER as string | null,
      email: CIPHER as string | null,
      hash: HASH as string | null,
      active: true as boolean | null,
      source: 'API',
      status: 'PENDIENTE',
      target: null as string | null,
      role: null as string | null,
      ...overrides,
    };
    return [
      TENANT_ID,
      uispUserId,
      row.name,
      row.email,
      row.hash,
      row.active,
      row.source,
      row.status,
      row.target,
      row.role,
    ];
  }

  async function count(sql: string): Promise<number> {
    const [row] = (await qr().query(sql)) as Array<{ n: number }>;
    return row?.n ?? 0;
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
       VALUES ($1, 'Migración 211 sintética', $2, $3, 'INACTIVE', $4)`,
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

  describe('migration_source_connections', () => {
    it('acepta una conexión https con huella y prueba registradas', async () => {
      expect(
        await sqlstateOf(
          insertConnection,
          connection({ sha: 'a'.repeat(64), checkedAt: new Date().toISOString(), result: 'OK' }),
        ),
      ).toBe('aceptado');
    });

    it('una sola conexión por tenant y sistema de origen', async () => {
      expect(await sqlstateOf(insertConnection, connection())).toBe('23505');
    });

    it.each([
      ['dirección http', { baseUrl: 'http://uisp.example.test' }],
      ['dirección con credenciales', { baseUrl: 'https://u:p@uisp.example.test' }],
      ['clave vacía', { appKey: '' }],
      ['huella no hex', { sha: 'Z'.repeat(64) }],
      ['huella en mayúsculas', { sha: 'A'.repeat(64) }],
      ['resultado desconocido', { checkedAt: new Date().toISOString(), result: 'TIMEOUT' }],
      ['resultado sin fecha', { result: 'OK' }],
      ['fecha sin resultado', { checkedAt: new Date().toISOString() }],
    ])('rechaza %s', async (_name, overrides) => {
      await qr().query('SAVEPOINT sp_conn');
      await qr().query('DELETE FROM migration_source_connections');
      expect(await sqlstateOf(insertConnection, connection(overrides))).toBe('23514');
      await qr().query('ROLLBACK TO SAVEPOINT sp_conn');
    });
  });

  describe('migration_uisp_users', () => {
    it('acepta una fila pendiente con PII cifrada', async () => {
      expect(await sqlstateOf(insertUser, user(101))).toBe('aceptado');
    });

    it('un número de UISP por tenant', async () => {
      expect(await sqlstateOf(insertUser, user(101))).toBe('23505');
    });

    it('acepta una fila «sin datos» pendiente y filas resueltas sin PII', async () => {
      const purged = { name: null, email: null, hash: null };
      expect(
        await sqlstateOf(insertUser, user(102, { ...purged, active: null, source: 'SIN_DATOS' })),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(
          insertUser,
          user(103, { ...purged, status: 'CREADO', target: randomUUID(), role: 'TECHNICIAN' }),
        ),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(
          insertUser,
          user(104, { ...purged, status: 'ENLAZADO', target: randomUUID() }),
        ),
      ).toBe('aceptado');
      expect(await sqlstateOf(insertUser, user(105, { ...purged, status: 'DESCARTADO' }))).toBe(
        'aceptado',
      );
    });

    it.each([
      ['número no positivo', 0, {}],
      ['fuente desconocida', 201, { source: 'ZIP' }],
      ['estado desconocido', 202, { status: 'BORRADO' }],
      ['resuelta con nombre', 203, { status: 'DESCARTADO', email: null, hash: null }],
      ['resuelta con correo', 204, { status: 'DESCARTADO', name: null }],
      ['creada sin usuario', 205, { status: 'CREADO', name: null, email: null, hash: null }],
      [
        'descartada con usuario',
        206,
        { status: 'DESCARTADO', name: null, email: null, hash: null, target: randomUUID() },
      ],
      ['correo sin hash', 207, { hash: null }],
      ['hash sin correo', 208, { email: null }],
      ['hash no hex', 209, { hash: 'x'.repeat(64) }],
      ['«sin datos» con nombre', 210, { source: 'SIN_DATOS', email: null, hash: null }],
      ['rol de suscriptor', 211, { role: 'SUBSCRIBER' }],
      ['rol externo', 212, { role: 'PARTNER' }],
      ['cifrado vacío', 213, { name: '' }],
    ])('rechaza %s', async (_name, uispUserId, overrides) => {
      expect(await sqlstateOf(insertUser, user(uispUserId, overrides))).toBe('23514');
    });
  });

  describe('equivalencia USUARIO', () => {
    it('acepta USUARIO con EQUIVALE, número de UISP y sin etiqueta', async () => {
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'USUARIO',
          '1234',
          null,
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('aceptado');
    });

    it.each([
      ['DESCARTAR', ['USUARIO', '1235', null, 'DESCARTAR', null]],
      ['NOTA', ['USUARIO', '1236', null, 'NOTA', null]],
      ['etiqueta con PII', ['USUARIO', '1237', 'Persona sintética', 'EQUIVALE', randomUUID()]],
      ['valor no numérico', ['USUARIO', 'persona', null, 'EQUIVALE', randomUUID()]],
      ['valor con cero inicial', ['USUARIO', '0123', null, 'EQUIVALE', randomUUID()]],
    ])('rechaza %s', async (_name, values) => {
      expect(await sqlstateOf(insertMapping, [TENANT_ID, ...values, ACTOR_ID])).toBe('23514');
    });

    it('TITULAR sigue admitido y las demás reglas no cambian', async () => {
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'TITULAR',
          'c-1',
          null,
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'OTRO',
          'x',
          null,
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('23514');
    });
  });

  describe('reversión', () => {
    it('down bloquea si hay conexión, filas o equivalencias USUARIO y no cambia nada', async () => {
      await qr().query('SAVEPOINT sp_down');
      await expect(m211.down(qr())).rejects.toThrow(/211/u);
      await qr().query('ROLLBACK TO SAVEPOINT sp_down');
      expect(await count(`SELECT COUNT(*)::int AS n FROM migration_uisp_users`)).toBe(5);
      expect(
        await count(`SELECT COUNT(*)::int AS n FROM migration_mappings WHERE kind = 'USUARIO'`),
      ).toBe(1);
    });

    it('down destructivo borra lo de la 211 y restaura la 210; up vuelve a aplicarla', async () => {
      process.env[DESTRUCTIVE] = 'true';
      try {
        await m211.down(qr());
      } finally {
        delete process.env[DESTRUCTIVE];
      }
      expect(
        await count(
          `SELECT COUNT(*)::int AS n FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name IN ('migration_source_connections', 'migration_uisp_users')`,
        ),
      ).toBe(0);
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'USUARIO',
          '99',
          null,
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'TITULAR',
          'c-2',
          'etiqueta',
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('aceptado');

      await m211.up(qr());
      expect(await sqlstateOf(insertConnection, connection())).toBe('aceptado');
      expect(await sqlstateOf(insertUser, user(301))).toBe('aceptado');
      expect(
        await sqlstateOf(insertMapping, [
          TENANT_ID,
          'USUARIO',
          '99',
          null,
          'EQUIVALE',
          randomUUID(),
          ACTOR_ID,
        ]),
      ).toBe('aceptado');
    });

    it('down sin filas no exige la variable destructiva', async () => {
      await qr().query('DELETE FROM migration_source_connections');
      await qr().query('DELETE FROM migration_uisp_users');
      await qr().query(`DELETE FROM migration_mappings WHERE kind = 'USUARIO'`);
      await m211.down(qr());
      await m211.up(qr());
      expect(
        await count(
          `SELECT COUNT(*)::int AS n FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name IN ('migration_source_connections', 'migration_uisp_users')`,
        ),
      ).toBe(2);
    });
  });
});
