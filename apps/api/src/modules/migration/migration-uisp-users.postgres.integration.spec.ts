import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  RefreshToken,
  TenantContext,
  User,
  dataSourceOptions,
  isValidSchemaName,
  runInTenantSchema,
} from '@iwana/db';
import {
  MigrationUispUserSchema,
  MigrationUispUsersInviteResultSchema,
  UserRole,
} from '@iwana/shared';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { hashOpaqueToken } from '../../common/crypto/hash-opaque-token.util';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import {
  INVITATION_TOKEN_TTL_MS,
  UsersMigrationProvisioningAdapter,
} from '../users/migration-adapters/users-migration-provisioning.adapter';
import { MigrationUispUsersResolutionService } from './migration-uisp-users-resolution.service';
import { MigrationImportTables1940000000194 } from '../../../../../packages/database/src/migrations/tenant/194_migration_import_tables';
import { MigrationMappingKindTitular2100000000210 } from '../../../../../packages/database/src/migrations/tenant/210_migration_mapping_kind_titular';
import { MigrationUispUsers2110000000211 } from '../../../../../packages/database/src/migrations/tenant/211_migration_uisp_users';
import { UsersMigrationDirectoryAdapter } from '../users/migration-adapters/users-migration-directory.adapter';
import { MigrationCrypto } from './migration-crypto';
import { MigrationPurgeService } from './migration-purge.service';
import { MigrationSourceConnectionService } from './migration-source-connection.service';
import { MigrationUispUsersService } from './migration-uisp-users.service';
import { FAKE_UISP_APP_KEY, startFakeUisp, type FakeUispServer } from './test/fake-uisp-server';
import { UISP_ADMINS_PATH, UISP_VERSION_PATH, UispApiClient } from './uisp-api/uisp-api.client';

// otplib@13 arrastra @scure/base (ESM-only) que Jest-CJS no puede cargar al importar AuthService.
// Mock solo de carga: TOTP no interviene en restablecer la contraseña ni en el login sin MFA.
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({})),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

/**
 * Bloque B contra PostgreSQL real y un UISP falso https local (spec 2026-11-15 «usuarios» §6;
 * ADR-110 D15): la 211 real, la conexión cifrada con huella fijada, la lectura idempotente que
 * no reabre filas resueltas, la coincidencia por HMAC con Usuarios y las filas «sin datos»
 * desde las intermedias vigentes. Nunca se llama a una instancia real de UISP.
 */
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;
const enabled =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' &&
  INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '');
const describeDb = enabled ? describe : describe.skip;

describeDb('Usuarios de UISP — conexión y lectura sobre PostgreSQL real', () => {
  let ds: DataSource;
  let uisp: FakeUispServer;
  const schemaName = `tenant_migr_uisp_${randomBytes(5).toString('hex')}`;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const matchedUserId = randomUUID();
  const scope = { tenantId, schemaName };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const logs: string[] = [];
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '9a'.repeat(32),
    MFA_ENCRYPTION_KEY: '8b'.repeat(32),
    PII_HASH_KEY: '7c'.repeat(32),
    NODE_ENV: 'test',
  });
  const crypto = new MigrationCrypto(config);
  let connections: MigrationSourceConnectionService;
  let uispUsers: MigrationUispUsersService;

  const MATCHED_EMAIL = 'coincide.sintetico@example.test';
  const admins = (activeName = 'Tecnico Sintetico') => [
    {
      id: 11,
      email: MATCHED_EMAIL,
      username: 'tsint',
      firstName: activeName,
      lastName: null,
      isActive: true,
    },
    {
      id: 12,
      email: 'inactivo.sintetico@example.test',
      username: 'isint',
      firstName: 'Inactivo',
      lastName: 'Sintetico',
      isActive: false,
    },
  ];

  const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, params) as Promise<T[]>);

  async function stageBatch(purged: boolean, records: Array<[string, string, unknown]>) {
    const batchId = randomUUID();
    await sql(
      `INSERT INTO migration_batches (id, tenant_id, source, status, created_by, purged_at)
       VALUES ($1, $2, 'UISP_ZIP', 'PROMOVIDO', $3, $4)`,
      [batchId, tenantId, actorId, purged ? new Date() : null],
    );
    for (const [entity, externalId, raw] of records) {
      await sql(
        `INSERT INTO migration_staging_records
           (tenant_id, batch_id, entity, external_id, payload_encrypted)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, batchId, entity, externalId, crypto.encryptPayload({ raw })],
      );
    }
    return batchId;
  }

  beforeAll(async () => {
    uisp = await startFakeUisp();
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 4, connectionTimeoutMillis: 5000 },
    });
    await ds.initialize();
    await ds.query(`CREATE SCHEMA "${schemaName}"`);
    await ds.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email, status)
       VALUES ($1, 'Fixture usuarios UISP', $2, $3, $4, 'ACTIVE')`,
      [
        tenantId,
        `${schemaName}-slug`.replaceAll('_', '-'),
        schemaName,
        `${schemaName}@invalid.example`,
      ],
    );
    await runInTenantSchema(ds, schemaName, async (qr) => {
      await new MigrationImportTables1940000000194().up(qr);
      await new MigrationMappingKindTitular2100000000210().up(qr);
      await new MigrationUispUsers2110000000211().up(qr);
      // Solo las columnas de `users` que lee el adaptador de Usuarios.
      await qr.query(`
        CREATE TABLE users (
          id uuid PRIMARY KEY, tenant_id uuid NOT NULL, email_hmac varchar(64) NOT NULL,
          role varchar(20) NOT NULL DEFAULT 'TECHNICIAN', deleted_at timestamptz NULL)`);
      await qr.query(
        `INSERT INTO users (id, tenant_id, email_hmac) VALUES ($1, $2, $3), ($4, $2, $5)`,
        [
          matchedUserId,
          tenantId,
          crypto.emailHmac(MATCHED_EMAIL),
          randomUUID(),
          crypto.emailHmac('borrado@example.test'),
        ],
      );
      await qr.query(`UPDATE users SET deleted_at = now() WHERE id <> $1`, [matchedUserId]);
    });

    // El UISP falso escucha en 127.0.0.1: excepción SSRF explícita de pruebas (S-1).
    const client = new UispApiClient({
      timeoutMs: 2_000,
      retries: 1,
      retryDelayMs: 5,
      allowedPrivateHosts: ['127.0.0.1'],
    });
    connections = new MigrationSourceConnectionService(ds, crypto, audit as never, client);
    uispUsers = new MigrationUispUsersService(
      ds,
      queue as never,
      crypto,
      audit as never,
      connections,
      client,
      new UsersMigrationDirectoryAdapter(),
    );
  });

  afterAll(async () => {
    await uisp?.close();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await ds.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
      await ds.destroy();
    }
  });

  beforeEach(() => {
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('con huella distinta no guarda nada ni envía la clave', async () => {
    uisp.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });

    const error = await connections
      .upsert(
        scope,
        {
          baseUrl: uisp.baseUrl,
          appKey: FAKE_UISP_APP_KEY,
          trustedCertificateSha256: 'ab'.repeat(32),
        },
        actorId,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      code: 'MIGRATION_SOURCE_UNREACHABLE',
      details: { reason: 'CERTIFICADO_NO_COINCIDE' },
    });
    expect(uisp.requests).toHaveLength(0);
    expect(await sql(`SELECT id FROM migration_source_connections`)).toHaveLength(0);
  });

  it('con la huella correcta guarda la clave cifrada y nunca la devuelve', async () => {
    const connection = await connections.upsert(
      scope,
      { baseUrl: uisp.baseUrl, appKey: FAKE_UISP_APP_KEY, trustedCertificateSha256: uisp.sha256 },
      actorId,
    );

    expect(connection).toMatchObject({ hasAppKey: true, lastCheckResult: 'OK' });
    const [stored] = await sql<{ app_key_encrypted: string }>(
      `SELECT app_key_encrypted FROM migration_source_connections`,
    );
    expect(stored!.app_key_encrypted).not.toContain(FAKE_UISP_APP_KEY);
    expect(crypto.decryptText(stored!.app_key_encrypted)).toBe(FAKE_UISP_APP_KEY);
    expect(uisp.requests.at(-1)).toEqual({
      method: 'GET',
      path: UISP_VERSION_PATH,
      appKey: FAKE_UISP_APP_KEY,
    });
    expect(JSON.stringify(await connections.get(scope))).not.toContain(FAKE_UISP_APP_KEY);
  });

  it('una clave revocada en UISP queda registrada como UNAUTHORIZED', async () => {
    uisp.routes.set(UISP_VERSION_PATH, { status: 401 });

    await expect(connections.test(scope, actorId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect((await connections.get(scope))!.lastCheckResult).toBe('UNAUTHORIZED');
    uisp.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });
  });

  it('trae usuarios: activo con coincidencia, inactivo y «sin datos» de lotes vigentes', async () => {
    await stageBatch(false, [
      ['TICKET', 'uisp:ticket:1', { assignedUserId: 11, activity: [{ userId: 40 }] }],
      ['PAGO', 'uisp:payment:1', { userId: 41 }],
    ]);
    await stageBatch(true, [['PAGO', 'uisp:payment:2', { userId: 50 }]]);
    uisp.routes.set(UISP_ADMINS_PATH, { status: 200, body: admins() });

    const accepted = await uispUsers.requestFetch(scope, actorId);
    expect(accepted.status).toBe('EN_CURSO');
    expect(queue.add.mock.calls[0]![1]).toEqual({ version: 1, tenantId, actorId });

    const summary = await uispUsers.fetch(scope, actorId);

    expect(summary).toMatchObject({ api: 2, nuevos: 2, coincidencias: 1, sinDatos: 2 });
    const rows = await sql<Record<string, unknown>>(
      `SELECT uisp_user_id, source, status, is_active_in_uisp, matched_user_id,
              email_hash IS NOT NULL AS has_hash, display_name_encrypted IS NOT NULL AS has_name
         FROM migration_uisp_users ORDER BY uisp_user_id`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        uisp_user_id: 11,
        source: 'API',
        is_active_in_uisp: true,
        matched_user_id: matchedUserId,
        has_hash: true,
      }),
      expect.objectContaining({
        uisp_user_id: 12,
        source: 'API',
        is_active_in_uisp: false,
        matched_user_id: null,
      }),
      expect.objectContaining({
        uisp_user_id: 40,
        source: 'SIN_DATOS',
        has_name: false,
        is_active_in_uisp: null,
      }),
      expect.objectContaining({ uisp_user_id: 41, source: 'SIN_DATOS', has_name: false }),
    ]);
    expect((await connections.get(scope))!.lastCheckResult).toBe('OK');
  });

  it('repetir actualiza sin duplicar y no reabre ni repone PII de filas resueltas', async () => {
    // Como haría el bloque C al descartar: estado resuelto y PII purgada.
    await sql(
      `UPDATE migration_uisp_users
          SET status = 'DESCARTADO', display_name_encrypted = NULL, email_encrypted = NULL,
              email_hash = NULL
        WHERE uisp_user_id IN (12, 41)`,
    );
    uisp.routes.set(UISP_ADMINS_PATH, { status: 200, body: admins('Nombre Cambiado') });

    const summary = await uispUsers.fetch(scope, actorId);

    expect(summary).toMatchObject({ api: 2, nuevos: 0, actualizados: 1, intactos: 1, sinDatos: 0 });
    const rows = await sql<{
      uisp_user_id: number;
      status: string;
      display_name_encrypted: string | null;
    }>(
      `SELECT uisp_user_id, status, display_name_encrypted FROM migration_uisp_users
        ORDER BY uisp_user_id`,
    );
    expect(rows.map((row) => [row.uisp_user_id, row.status])).toEqual([
      [11, 'PENDIENTE'],
      [12, 'DESCARTADO'],
      [40, 'PENDIENTE'],
      [41, 'DESCARTADO'],
    ]);
    expect(crypto.decryptText(rows[0]!.display_name_encrypted!)).toBe('Nombre Cambiado');
    expect(rows[1]!.display_name_encrypted).toBeNull();
    expect(rows[3]!.display_name_encrypted).toBeNull();
  });

  it('la lista descifra, cuenta lotes vigentes y cumple el contrato', async () => {
    const { data, meta } = await uispUsers.list(scope, { id: actorId, role: UserRole.ADMIN });

    for (const item of data) MigrationUispUserSchema.parse(item);
    const byId = new Map(data.map((item) => [item.uispUserId, item]));
    expect(byId.get(11)).toMatchObject({
      displayName: 'Nombre Cambiado',
      email: MATCHED_EMAIL,
      matchedUserId,
      referencedInBatches: 1,
    });
    expect(byId.get(40)).toMatchObject({
      source: 'SIN_DATOS',
      displayName: null,
      referencedInBatches: 1,
    });
    expect(byId.get(12)).toMatchObject({ status: 'DESCARTADO', displayName: null, email: null });
    expect(byId.has(50)).toBe(false);
    expect(meta.total).toBe(4);
    expect(meta.lastFetchedAt).not.toBeNull();

    const masked = await uispUsers.list(scope, { id: actorId, role: UserRole.NOC });
    expect(masked.data.find((item) => item.uispUserId === 11)!.email).toBe('c***@example.test');
  });

  it('una clave revocada durante la lectura es permanente y no toca las filas', async () => {
    uisp.routes.set(UISP_ADMINS_PATH, { status: 403 });

    await expect(uispUsers.fetch(scope, actorId)).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_UNAUTHORIZED',
    });
    expect((await connections.get(scope))!.lastCheckResult).toBe('UNAUTHORIZED');
    expect(await sql(`SELECT id FROM migration_uisp_users`)).toHaveLength(4);
  });

  it('la clave, los nombres y los correos no aparecen en auditoría, cola ni logs', () => {
    const exposed = JSON.stringify([
      audit.logWithin.mock.calls.map(([entry]) => entry as unknown),
      queue.add.mock.calls,
      logs,
    ]);
    for (const secret of [
      FAKE_UISP_APP_KEY,
      MATCHED_EMAIL,
      'inactivo.sintetico@example.test',
      'Tecnico Sintetico',
      'Nombre Cambiado',
    ]) {
      expect(exposed).not.toContain(secret);
    }
    expect(audit.logWithin).toHaveBeenCalled();
  });

  it('la purga diaria borra con su PII las filas PENDIENTE leídas hace más de 30 días', async () => {
    const [stale] = await sql<{ id: string }>(
      `SELECT id::text AS id FROM migration_uisp_users
        WHERE status = 'PENDIENTE' AND source = 'API' ORDER BY uisp_user_id LIMIT 1`,
    );
    const [resolvedOld] = await sql<{ id: string }>(
      `SELECT id::text AS id FROM migration_uisp_users WHERE status <> 'PENDIENTE' LIMIT 1`,
    );
    expect(stale).toBeDefined();
    expect(resolvedOld).toBeDefined();
    await sql(
      `UPDATE migration_uisp_users SET last_fetched_at = now() - interval '31 days' WHERE id = $1`,
      [stale!.id],
    );
    await sql(
      `UPDATE migration_uisp_users SET last_fetched_at = now() - interval '90 days' WHERE id = $1`,
      [resolvedOld!.id],
    );
    const before = await sql(`SELECT id FROM migration_uisp_users`);
    const purge = new MigrationPurgeService(
      ds,
      { deleteObject: jest.fn() } as never,
      audit as never,
    );

    await purge.purgeTenant(scope);

    const after = await sql<{ id: string }>(`SELECT id::text AS id FROM migration_uisp_users`);
    expect(after).toHaveLength(before.length - 1);
    expect(after.map((row) => row.id)).not.toContain(stale!.id);
    // Las resueltas ya no guardan PII y se conservan aunque sean viejas.
    expect(after.map((row) => row.id)).toContain(resolvedOld!.id);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'MigrationUispUsers',
        newValue: { retencion: 'PENDIENTE_30_DIAS', filasBorradas: 1 },
      }),
      expect.anything(),
    );
  });

  it('retirar la conexión borra la clave cifrada y las filas PENDIENTE (S-3)', async () => {
    const pending = await sql(`SELECT id FROM migration_uisp_users WHERE status = 'PENDIENTE'`);
    expect(pending.length).toBeGreaterThan(0);
    const resolved = await sql(`SELECT id FROM migration_uisp_users WHERE status <> 'PENDIENTE'`);
    await connections.remove(scope, actorId);
    expect(await sql(`SELECT id FROM migration_source_connections`)).toHaveLength(0);
    expect(
      await sql(`SELECT id FROM migration_uisp_users WHERE status = 'PENDIENTE'`),
    ).toHaveLength(0);
    expect(
      await sql(`SELECT id FROM migration_uisp_users WHERE status <> 'PENDIENTE'`),
    ).toHaveLength(resolved.length);
    await expect(uispUsers.requestFetch(scope, actorId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MIGRATION_SOURCE_NOT_CONFIGURED' }),
    });
  });
});

/**
 * Bloque C contra el schema completo del tenant de pruebas (spec 2026-11-15 «usuarios»
 * §2.3–§2.5, CA-2, CA-3, CA-4): crear, enlazar y descartar con la tabla `users` real, la
 * auditoría real y el CHECK de PII purgada de la 211. El correo es un doble; cada corrida usa
 * números de UISP aleatorios y borra los usuarios, filas y equivalencias que crea.
 */
const tenantSlug = process.env['E2E_TENANT_SLUG'];
const describeTenant = enabled && tenantSlug ? describe : describe.skip;

describeTenant('Usuarios de UISP — resolver e invitar sobre el tenant de pruebas', () => {
  let ds: DataSource;
  let tenantId: string;
  let schemaName: string;
  let resolution: MigrationUispUsersResolutionService;
  const actorId = randomUUID();
  const run = randomInt(10_000_000, 99_999_999);
  const uispId = (offset: number) => run * 10 + offset;
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const search = { enqueueUserUpsert: jest.fn().mockResolvedValue(undefined) };
  const previousHashKey = process.env['PII_HASH_KEY'];
  const hashKey = previousHashKey ?? '5d'.repeat(32);
  const crypto = new MigrationCrypto(
    new ConfigService({
      PII_ENCRYPTION_KEY: '4e'.repeat(32),
      MFA_ENCRYPTION_KEY: '3f'.repeat(32),
      PII_HASH_KEY: hashKey,
      NODE_ENV: 'test',
    }),
  );
  const tag = `${run}`;
  const EMAILS = {
    active: `uisp-activo-${tag}@example.test`,
    inactive: `uisp-inactivo-${tag}@example.test`,
    matched: `uisp-coincide-${tag}@example.test`,
  };
  const NAMES = {
    active: `Tecnica Activa ${tag}`,
    inactive: `Tecnico Retirado ${tag}`,
    matched: `Persona Enlazada ${tag}`,
    collision: `Persona Repetida ${tag}`,
  };
  const rows = {
    active: randomUUID(),
    inactive: randomUUID(),
    matched: randomUUID(),
    collision: randomUUID(),
    sinDatos: randomUUID(),
    discard: randomUUID(),
  };
  const matchedUserId = randomUUID();
  const createdUserIds: string[] = [];
  /** Enlaces en claro de la primera invitación y del reenvío (solo en memoria). */
  const invitationTokens = { first: '', second: '' };
  const NEW_PASSWORD = `Creada-${tag}-Aa1!`;

  const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, params) as Promise<T[]>);

  async function insertRow(
    id: string,
    uisp: number,
    data: { name: string; email: string; active: boolean; matched?: string } | null,
  ) {
    await sql(
      `INSERT INTO migration_uisp_users
         (id, tenant_id, uisp_user_id, display_name_encrypted, email_encrypted, email_hash,
          is_active_in_uisp, source, status, matched_user_id, last_fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDIENTE', $9, now())`,
      [
        id,
        tenantId,
        uisp,
        data ? crypto.encryptText(data.name) : null,
        data ? crypto.encryptText(data.email) : null,
        data ? crypto.emailHmac(data.email) : null,
        data ? data.active : null,
        data ? 'API' : 'SIN_DATOS',
        data?.matched ?? null,
      ],
    );
  }

  beforeAll(async () => {
    process.env['PII_HASH_KEY'] = hashKey;
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [User, AuditLog, RefreshToken],
      migrations: [],
      logging: false,
      extra: { max: 4, connectionTimeoutMillis: 5000 },
    });
    await ds.initialize();
    const [tenant] = (await ds.query(
      `SELECT id::text, schema_name FROM public.tenants WHERE slug = $1 AND status = 'ACTIVE'`,
      [tenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant || !isValidSchemaName(tenant.schema_name)) {
      throw new Error('El tenant de pruebas no existe o no está activo.');
    }
    tenantId = tenant.id;
    schemaName = tenant.schema_name;
    const [migrated] = (await ds.query(`SELECT to_regclass($1) IS NOT NULL AS ready`, [
      `"${schemaName}".migration_uisp_users`,
    ])) as Array<{ ready: boolean }>;
    if (!migrated?.ready) throw new Error('El tenant de pruebas no tiene la migración 211.');

    await sql(
      `INSERT INTO users (
         id, email, email_hmac, password_hash, role, status, tenant_id,
         mfa_enabled, mfa_required, is_operational_resource,
         password_reset_required, failed_login_attempts, email_verified, first_name,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'SUPPORT', 'ACTIVE', $5,
                 false, false, false, false, 0, true, 'Original', now(), now())`,
      [matchedUserId, EMAILS.matched, hashEmail(EMAILS.matched), '!'.repeat(60), tenantId],
    );
    await insertRow(rows.active, uispId(1), {
      name: NAMES.active,
      email: EMAILS.active,
      active: true,
    });
    await insertRow(rows.inactive, uispId(2), {
      name: NAMES.inactive,
      email: EMAILS.inactive,
      active: false,
    });
    await insertRow(rows.matched, uispId(3), {
      name: NAMES.matched,
      email: EMAILS.matched,
      active: true,
      matched: matchedUserId,
    });
    // Mismo correo que el usuario enlazado, pero sin proponerse como coincidencia.
    await insertRow(rows.collision, uispId(4), {
      name: NAMES.collision,
      email: EMAILS.matched,
      active: true,
    });
    await insertRow(rows.sinDatos, uispId(5), null);
    await insertRow(rows.discard, uispId(6), null);

    const audit = new AuditService(ds, {} as never);
    const config = new ConfigService({ PORTAL_URL: 'https://portal.example.test' });
    resolution = new MigrationUispUsersResolutionService(
      ds,
      crypto,
      audit,
      new MigrationUispUsersService(
        ds,
        {} as never,
        crypto,
        audit,
        {} as never,
        {} as never,
        new UsersMigrationDirectoryAdapter(),
      ),
      new UsersMigrationDirectoryAdapter(),
      new UsersMigrationProvisioningAdapter(audit, mailer as never, config, search as never),
    );
  });

  afterAll(async () => {
    if (previousHashKey === undefined) delete process.env['PII_HASH_KEY'];
    else process.env['PII_HASH_KEY'] = previousHashKey;
    if (!ds?.isInitialized) return;
    const numbers = [1, 2, 3, 4, 5, 6].map((offset) => String(uispId(offset)));
    await sql(
      `DELETE FROM migration_mappings
        WHERE tenant_id = $1 AND kind = 'USUARIO' AND external_value = ANY($2::varchar[])`,
      [tenantId, numbers],
    );
    await sql(`DELETE FROM migration_uisp_users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [
      tenantId,
      Object.values(rows),
    ]);
    await sql(`DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
    await sql(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[...createdUserIds, matchedUserId]]);
    await ds.destroy();
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('un rol no permitido revierte el lote completo (todo o nada)', async () => {
    const error = await resolution
      .resolve(
        { tenantId, schemaName },
        [
          { id: rows.discard, action: 'DESCARTAR' },
          { id: rows.active, action: 'CREAR', role: UserRole.SUBSCRIBER },
        ],
        actorId,
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const [discard] = await sql<{ status: string }>(
      `SELECT status FROM migration_uisp_users WHERE id = $1`,
      [rows.discard],
    );
    expect(discard?.status).toBe('PENDIENTE');
  });

  it('crea, enlaza y descarta: estados, correo provisional, equivalencias y PII purgada', async () => {
    const before = await sql<{ updated_at: Date; role: string; status: string }>(
      `SELECT updated_at, role, status FROM users WHERE id = $1`,
      [matchedUserId],
    );
    const result = await resolution.resolve(
      { tenantId, schemaName },
      [
        { id: rows.active, action: 'CREAR', role: UserRole.TECHNICIAN },
        {
          id: rows.inactive,
          action: 'CREAR',
          role: UserRole.TECHNICIAN,
          isOperationalResource: true,
        },
        { id: rows.matched, action: 'ENLAZAR' },
        { id: rows.collision, action: 'CREAR', role: UserRole.SUPPORT },
        {
          id: rows.sinDatos,
          action: 'CREAR',
          role: UserRole.SUPPORT,
          displayName: `Sin Datos ${tag}`,
        },
        { id: rows.discard, action: 'DESCARTAR' },
      ],
      actorId,
    );

    expect(result.map((row) => MigrationUispUserSchema.parse(row).status).sort()).toEqual(
      ['CREADO', 'CREADO', 'CREADO', 'CREADO', 'DESCARTADO', 'ENLAZADO'].sort(),
    );
    const answered = JSON.stringify(result);
    for (const value of [...Object.values(EMAILS), ...Object.values(NAMES)]) {
      expect(answered).not.toContain(value);
    }
    const byId = new Map(result.map((row) => [row.id, row]));
    for (const id of [rows.active, rows.inactive, rows.collision, rows.sinDatos]) {
      createdUserIds.push(byId.get(id)!.targetUserId!);
    }
    expect(byId.get(rows.matched)?.targetUserId).toBe(matchedUserId);
    expect(byId.get(rows.discard)?.targetUserId).toBeNull();

    const users = await sql<{
      id: string;
      email: string;
      status: string;
      role: string;
      is_operational_resource: boolean;
      first_name: string;
      email_verification_token: string | null;
    }>(
      `SELECT id::text, email, status, role, is_operational_resource, first_name,
              email_verification_token
         FROM users WHERE id = ANY($1::uuid[])`,
      [createdUserIds],
    );
    const user = (row: string) => users.find((u) => u.id === byId.get(row)!.targetUserId)!;
    expect(user(rows.active)).toMatchObject({
      email: EMAILS.active,
      status: 'PENDING_VERIFICATION',
      role: UserRole.TECHNICIAN,
      is_operational_resource: true,
      first_name: 'Tecnica',
      email_verification_token: null,
    });
    expect(user(rows.inactive)).toMatchObject({
      email: EMAILS.inactive,
      status: 'INACTIVE',
      is_operational_resource: false,
    });
    expect(user(rows.collision)).toMatchObject({
      email: `uisp-${uispId(4)}@importado.invalid`,
      status: 'PENDING_VERIFICATION',
    });
    expect(user(rows.sinDatos)).toMatchObject({
      email: `uisp-${uispId(5)}@importado.invalid`,
      status: 'INACTIVE',
      is_operational_resource: false,
    });

    // El inactivo no aparece entre los recursos operativos que Programación puede asignar.
    const operational = await sql<{ id: string }>(
      `SELECT id::text FROM users
        WHERE id = ANY($1::uuid[]) AND is_operational_resource AND status = 'ACTIVE'
          AND deleted_at IS NULL`,
      [createdUserIds],
    );
    expect(operational.map((u) => u.id)).not.toContain(user(rows.inactive).id);

    // Enlazar no cambia al usuario de iWana.
    const after = await sql<{ updated_at: Date; role: string; status: string }>(
      `SELECT updated_at, role, status FROM users WHERE id = $1`,
      [matchedUserId],
    );
    expect(after).toEqual(before);

    const mappings = await sql<{ external_value: string; target_ref: string; label: unknown }>(
      `SELECT external_value, target_ref, external_label AS label FROM migration_mappings
        WHERE tenant_id = $1 AND kind = 'USUARIO' AND external_value = ANY($2::varchar[])
        ORDER BY external_value`,
      [tenantId, [1, 2, 3, 4, 5, 6].map((offset) => String(uispId(offset)))],
    );
    expect(mappings).toHaveLength(5);
    expect(mappings.every((mapping) => mapping.label === null)).toBe(true);
    expect(mappings.find((m) => m.external_value === String(uispId(3)))?.target_ref).toBe(
      matchedUserId,
    );

    const stored = await sql<Record<string, unknown>>(
      `SELECT display_name_encrypted, email_encrypted, email_hash FROM migration_uisp_users
        WHERE id = ANY($1::uuid[])`,
      [Object.values(rows)],
    );
    expect(stored).toHaveLength(6);
    expect(stored.every((row) => Object.values(row).every((value) => value === null))).toBe(true);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it('el CHECK de la 211 impide reponer PII en una fila resuelta', async () => {
    const error = await sql(
      `UPDATE migration_uisp_users SET display_name_encrypted = 'x' WHERE id = $1`,
      [rows.active],
    ).catch((caught: unknown) => caught);
    expect((error as { code?: string }).code).toBe('23514');
  });

  it('una fila ya resuelta responde 409 y no cambia nada', async () => {
    await expect(
      resolution.resolve(
        { tenantId, schemaName },
        [{ id: rows.discard, action: 'DESCARTAR' }],
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('invitar solo envía al creado activo con correo real; reenviar renueva el token', async () => {
    const ids = [rows.active, rows.inactive, rows.collision, rows.matched, rows.discard];
    const first = await resolution.invite(
      { tenantId, schemaName, tenantSlug: String(tenantSlug) },
      ids,
      actorId,
    );
    expect(MigrationUispUsersInviteResultSchema.parse(first)).toEqual({
      invitados: 1,
      omitidos: 4,
    });
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    expect(mailer.sendMail.mock.calls[0]?.[0]).toMatchObject({ to: EMAILS.active });

    const stored = async () =>
      (
        await sql<{ hash: string | null; expires: Date | null; verification: string | null }>(
          `SELECT u.password_reset_token AS hash, u.password_reset_token_expires_at AS expires,
                  u.email_verification_token AS verification
             FROM users u JOIN migration_uisp_users r ON r.target_user_id = u.id
            WHERE r.id = $1`,
          [rows.active],
        )
      )[0];
    const linkToken = (call: number) => {
      const message = mailer.sendMail.mock.calls[call]?.[0] as { subject: string; text: string };
      expect(message.subject).toBe('Te invitaron a iWana');
      expect(message.text).toContain(
        `https://portal.example.test/auth/reset-password?tenant=${String(tenantSlug)}&token=`,
      );
      expect(message.text).toMatch(/[?&]token=[0-9a-f]{64}&origen=invitacion/u);
      return /[?&]token=([0-9a-f]{64})/u.exec(message.text)?.[1] ?? '';
    };
    const firstStored = await stored();
    invitationTokens.first = linkToken(0);
    expect(invitationTokens.first).toMatch(/^[0-9a-f]{64}$/u);
    // En BD solo el hash del enlace, con vencimiento a 7 días y sin token de verificación.
    expect(firstStored?.hash).toBe(hashOpaqueToken(invitationTokens.first));
    expect(firstStored?.verification).toBeNull();
    const ttl = (firstStored?.expires?.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(INVITATION_TOKEN_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(INVITATION_TOKEN_TTL_MS);

    await resolution.invite(
      { tenantId, schemaName, tenantSlug: String(tenantSlug) },
      [rows.active],
      actorId,
    );
    expect(mailer.sendMail).toHaveBeenCalledTimes(2);
    invitationTokens.second = linkToken(1);
    expect(invitationTokens.second).not.toBe(invitationTokens.first);
    expect((await stored())?.hash).toBe(hashOpaqueToken(invitationTokens.second));
  });

  it('crear la contraseña con la invitación activa la cuenta y permite entrar', async () => {
    const auth = new AuthService(
      ds.getRepository(User),
      {} as never,
      ds.getRepository(RefreshToken),
      {
        sign: jest.fn().mockReturnValue('access-de-prueba'),
        verify: jest.fn().mockReturnValue({ jti: 'jti-de-prueba', exp: 0 }),
      } as never,
      new ConfigService({ PII_HASH_KEY: hashKey, MFA_ENCRYPTION_KEY: '3f'.repeat(32) }),
      ds,
      {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue([]),
      } as never,
      new AuditService(ds, {} as never),
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      { sendMail: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const context = { tenantId, schemaName, tenantSlug: String(tenantSlug) };
    const reset = (token: string) =>
      TenantContext.run(context, () => auth.resetPassword({ token, newPassword: NEW_PASSWORD }));

    // S-2: «olvidé mi contraseña» no emite enlace a una cuenta PENDING_VERIFICATION; el único
    // enlace que activa al importado sigue siendo el de la invitación (no se pisa).
    const tokenOf = async () =>
      (
        await sql<{ token: string | null }>(
          `SELECT u.password_reset_token AS token
             FROM users u JOIN migration_uisp_users r ON r.target_user_id = u.id
            WHERE r.id = $1`,
          [rows.active],
        )
      )[0]?.token ?? null;
    const invitationHash = await tokenOf();
    expect(invitationHash).toBe(hashOpaqueToken(invitationTokens.second));
    await expect(
      TenantContext.run(context, () => auth.forgotPassword({ email: EMAILS.active })),
    ).resolves.toBeUndefined();
    expect(await tokenOf()).toBe(invitationHash);

    // Reenviar anuló el primer enlace.
    await expect(reset(invitationTokens.first)).rejects.toBeInstanceOf(UnauthorizedException);
    await reset(invitationTokens.second);

    const [user] = await sql<{
      status: string;
      email_verified: boolean;
      password_reset_required: boolean;
      password_reset_token: string | null;
      password_hash: string;
    }>(
      `SELECT u.status, u.email_verified, u.password_reset_required, u.password_reset_token,
              u.password_hash
         FROM users u JOIN migration_uisp_users r ON r.target_user_id = u.id
        WHERE r.id = $1`,
      [rows.active],
    );
    expect(user).toMatchObject({
      status: 'ACTIVE',
      email_verified: true,
      password_reset_required: false,
      password_reset_token: null,
    });
    expect(await bcrypt.compare(NEW_PASSWORD, String(user?.password_hash))).toBe(true);

    // El enlace es de un solo uso.
    await expect(reset(invitationTokens.second)).rejects.toBeInstanceOf(UnauthorizedException);

    const session = await TenantContext.run(context, () =>
      auth.login({ email: EMAILS.active, password: NEW_PASSWORD }),
    );
    expect(session).toMatchObject({ refreshToken: expect.any(String) });
  });

  it('gate de ola: ni las respuestas ni la auditoría llevan el correo de UISP en claro', async () => {
    const entityIds = [...Object.values(rows), ...createdUserIds, tenantId];
    const audits = await sql<{ old_value: unknown; new_value: unknown }>(
      `SELECT old_value, new_value FROM audit_logs
        WHERE entity_id = ANY($1::varchar[]) AND user_id = $2`,
      [entityIds, actorId],
    );
    expect(audits.length).toBeGreaterThan(0);
    const audited = JSON.stringify(audits);
    for (const value of [...Object.values(EMAILS), ...Object.values(NAMES)]) {
      expect(audited).not.toContain(value);
    }
    // El único lugar con el correo en claro es el usuario creado.
    const holders = await sql<{ id: string }>(
      `SELECT id::text FROM users WHERE lower(email) = $1`,
      [EMAILS.active],
    );
    expect(holders.map((h) => h.id)).toEqual([createdUserIds[0]]);
  });
});
