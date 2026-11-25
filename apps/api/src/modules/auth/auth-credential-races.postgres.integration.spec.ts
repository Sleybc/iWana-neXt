/**
 * Carreras de credencial contra PostgreSQL real: portal (bloqueo por TOTP, restablecimiento
 * frente a cambio obligatorio, enlace de un solo uso, inscripción de MFA) y plataforma
 * (perfil, correo y contraseña simultáneos, refresh ligado a la contraseña).
 *
 * Los bloqueos y la reevaluación del WHERE solo existen en la base: con mocks no se ven.
 * Redis es un doble en memoria; la atomicidad del script Lua no se prueba aquí.
 *
 * SEGURIDAD: correos sintéticos y claves de laboratorio; sin PII ni secretos en logs.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  PlatformUser,
  RefreshToken,
  runInTenantSchema,
  TenantContext,
  User,
} from '@iwana/db';
import { PlatformRole, UserRole, UserStatus } from '@iwana/shared';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { MailerService } from '../mailer/mailer.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { hashOpaqueToken } from '../../common/crypto/hash-opaque-token.util';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type Redis from 'ioredis';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../packages/database/src/migrations/tenant/runner';
import { ephemeralSchemaName } from '../../../../../packages/database/test/ephemeral-schema';

// otplib@13 arrastra @scure/base (ESM-only) que Jest-CJS no puede cargar.
const mockTotpVerify = jest.fn();
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generateSecret: () => 'SECRETOPENDIENTE',
    verify: (...args: unknown[]) => mockTotpVerify(...args),
    toURI: () => 'otpauth://totp/prueba',
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;

const PII_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MFA_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const OLD = 'Vieja12345!';
const NEW = 'Nueva12345!';
const OTHER = 'Otra123456!';

/** Doble en memoria de las órdenes de Redis que usa la sesión. */
class MemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly sets = new Map<string, Set<string>>();
  clear(): void {
    this.values.clear();
    this.sets.clear();
  }
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }
  async exists(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }
  async del(key: string): Promise<number> {
    this.sets.delete(key);
    return this.values.delete(key) ? 1 : 0;
  }
  async sadd(key: string, member: string): Promise<number> {
    this.sets.set(key, (this.sets.get(key) ?? new Set()).add(member));
    return 1;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(): Promise<number> {
    return 1;
  }
  /** Equivale al script de rotación: compara y reemplaza. */
  async eval(_lua: string, _n: number, key: string, read: string, next: string): Promise<number> {
    if (this.values.get(key) !== read) return 0;
    this.values.set(key, next);
    return 1;
  }
}

type Outcome = { status: number; value?: any };
const settle = (operation: Promise<unknown>): Promise<Outcome> =>
  operation.then(
    (value) => ({ status: 200, value }),
    (error: { status?: number }) => {
      if (typeof error.status !== 'number') throw error;
      return { status: error.status };
    },
  );

describeWithDb('Carreras de credencial (PostgreSQL real)', () => {
  // hashEmail lee la clave del proceso, no de ConfigService.
  const previousHashKey = process.env['PII_HASH_KEY'];
  let dataSource: DataSource;
  let auth: AuthService;
  let users: UsersService;
  let platform: PlatformUsersService;
  const redis = new MemoryRedis();
  const platformIds: string[] = [];
  const tenantId = randomUUID();
  const schemaName = ephemeralSchemaName('tenant_authrc_');
  const context = { tenantId, schemaName, tenantSlug: 'auth-races-test' };
  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run(context, operation);
  const signed: Array<Record<string, unknown>> = [];

  const qSchema = (): string => `"${schemaName}"`;
  const config = {
    get: (key: string, fallback?: unknown) =>
      ({ PII_HASH_KEY: PII_KEY, MFA_ENCRYPTION_KEY: MFA_KEY, PII_ENCRYPTION_KEY: MFA_KEY })[key] ??
      fallback,
    getOrThrow: (key: string) => (key === 'PII_HASH_KEY' ? PII_KEY : MFA_KEY),
  } as unknown as ConfigService;
  const platformAudit = {
    log: jest.fn().mockResolvedValue(undefined),
    logWithin: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlatformAuditService;

  async function seedUser(columns: Record<string, unknown> = {}): Promise<string> {
    const id = randomUUID();
    const row: Record<string, unknown> = {
      id,
      email: `races-${id}@example.invalid`,
      email_hmac: hashEmail(`races-${id}@example.invalid`, Buffer.from(PII_KEY, 'hex')),
      password_hash: await bcrypt.hash(OLD, 4),
      role: UserRole.NOC,
      status: UserStatus.ACTIVE,
      tenant_id: tenantId,
      mfa_enabled: false,
      mfa_required: false,
      is_operational_resource: false,
      password_reset_required: false,
      failed_login_attempts: 0,
      email_verified: true,
      ...columns,
    };
    const names = Object.keys(row);
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO users (${names.join(', ')}) VALUES (${names.map((_, n) => `$${n + 1}`).join(', ')})`,
        Object.values(row),
      );
    });
    return id;
  }

  async function readUser(id: string): Promise<Record<string, any>> {
    const [row] = (await dataSource.query(`SELECT * FROM ${qSchema()}.users WHERE id = $1`, [
      id,
    ])) as Array<Record<string, any>>;
    return row!;
  }

  const login = (id: string, password: string, totpCode?: string): Promise<Outcome> =>
    settle(
      inTenant(() =>
        auth.login({
          email: `races-${id}@example.invalid`,
          password,
          ...(totpCode ? { totpCode } : {}),
        }),
      ),
    );

  /** Claims del último token de tenant firmado, como si lo presentara el cliente. */
  const lastActor = (): JwtPayload =>
    ({ ...signed.at(-1), exp: Math.floor(Date.now() / 1000) + 900 }) as unknown as JwtPayload;

  /** Espera a que otra sesión quede bloqueada por la fila: la carrera ocurre de verdad. */
  async function untilBlocked(): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = (await dataSource.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      )) as Array<{ n: number }>;
      if (row!.n > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('la segunda operación nunca esperó el bloqueo');
  }

  /** Mantiene bloqueada la fila, lanza `contender`, aplica `change` y libera. */
  async function whileLocked<T>(
    id: string,
    contender: () => Promise<T>,
    change: string,
    params: unknown[],
  ): Promise<T> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT 1 FROM ${qSchema()}.users WHERE id = $1 FOR UPDATE`, [id]);
      const pending = contender();
      await untilBlocked();
      await runner.query(change, params);
      await runner.commitTransaction();
      return await pending;
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  }

  /**
   * Ejecuta `writer` y, tras su primera lectura del usuario, lanza un cambio de contraseña. Sin
   * bloqueo el cambio se confirma y `writer` guarda la fila vieja; con bloqueo, el cambio espera.
   */
  async function raceAfterFirstRead(
    id: string,
    writer: () => Promise<unknown>,
  ): Promise<{ written: Outcome; changed: Outcome }> {
    const original = EntityManager.prototype.findOne;
    let change: Promise<Outcome> | undefined;
    const spy = jest.spyOn(EntityManager.prototype, 'findOne');
    spy.mockImplementation(async function (this: EntityManager, entity, options) {
      const row = await original.call(this, entity, options);
      if (!change && entity === User) {
        change = settle(
          inTenant(() =>
            auth.changePassword({ sub: id, type: 'tenant', jti: randomUUID(), exp: 0 } as never, {
              currentPassword: OLD,
              newPassword: NEW,
            }),
          ),
        );
        await Promise.race([change, untilBlocked()]);
      }
      return row;
    });
    try {
      const written = await settle(inTenant(writer));
      return { written, changed: await change! };
    } finally {
      spy.mockRestore();
    }
  }

  async function seedPlatformUser(): Promise<string> {
    const repository = dataSource.getRepository(PlatformUser);
    const saved = await repository.save(
      repository.create({
        email: 'sintetico',
        emailHash: randomUUID(),
        passwordHash: await bcrypt.hash(OLD, 4),
        role: PlatformRole.IWANA_SUPPORT,
        status: UserStatus.ACTIVE,
        mfaEnabled: true,
        mfaSecret: (auth as unknown as { encryptSecret: (value: string) => string }).encryptSecret(
          'SECRETO',
        ),
        passwordResetRequired: false,
      }),
    );
    platformIds.push(saved.id);
    return saved.id;
  }
  const readPlatform = (id: string): Promise<PlatformUser> =>
    dataSource.getRepository(PlatformUser).findOneByOrFail({ id });

  /** Servicio cuya primera lectura espera a que `meanwhile` termine. */
  function pausedPlatform(meanwhile: () => Promise<unknown>): PlatformUsersService {
    const repository = dataSource.getRepository(PlatformUser);
    let first = true;
    const paused = new Proxy(repository, {
      get(target, key) {
        const member = Reflect.get(target, key) as unknown;
        if (typeof member !== 'function') return member;
        if (key !== 'findOne') return member.bind(target);
        return async (options: never) => {
          const row = await target.findOne(options);
          if (first) {
            first = false;
            await meanwhile();
          }
          return row;
        };
      },
    });
    return new PlatformUsersService(paused, platformAudit, config);
  }

  beforeAll(async () => {
    process.env['PII_HASH_KEY'] = PII_KEY;
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog, PlatformUser, RefreshToken, User],
      migrations: [],
      logging: false,
      extra: { ...(dataSourceOptions.extra ?? {}), max: 15, min: 1 },
    });
    await dataSource.initialize();
    // La migración 092 exige un tenant canónico en public.tenants para su esquema.
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Auth carreras sintético',
        `auth-races-${tenantId.slice(0, 8)}`,
        schemaName,
        'auth-races@example.invalid',
      ],
    );
    // El esquema lo crea la cadena de migraciones del tenant: users, refresh_tokens y
    // audit_logs con sus columnas, constraints y triggers reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA ${qSchema()}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `auth-races-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const jwt = {
      sign: (claims: Record<string, unknown>) => {
        signed.push(claims);
        return 'token-sintetico';
      },
      verify: () => ({ jti: randomUUID(), exp: 0 }),
    } as unknown as JwtService;
    const audit = new AuditService(dataSource, platformAudit);
    auth = new AuthService(
      dataSource.getRepository(User),
      dataSource.getRepository(PlatformUser),
      dataSource.getRepository(RefreshToken),
      jwt,
      config,
      dataSource,
      redis as unknown as Redis,
      audit,
      platformAudit,
      { sendMail: jest.fn().mockResolvedValue(undefined) } as unknown as MailerService,
    );
    const unused = {} as never;
    const tenants = {
      getPrincipalAdminUserId: async () => null,
      updateTenantSelfProfile: async () => undefined,
    } as never;
    const search = { enqueueUserUpsert: async () => undefined } as never;
    const mailer = { sendMail: async () => undefined } as never;
    users = new UsersService(
      dataSource,
      audit,
      tenants,
      search,
      unused,
      mailer,
      config,
      redis as unknown as Redis,
      unused,
    );
    platform = new PlatformUsersService(
      dataSource.getRepository(PlatformUser) as Repository<PlatformUser>,
      platformAudit,
      config,
    );
  }, 180_000);

  beforeEach(() => {
    redis.clear();
    mockTotpVerify.mockReset().mockResolvedValue({ valid: true });
  });

  afterAll(async () => {
    if (previousHashKey === undefined) delete process.env['PII_HASH_KEY'];
    else process.env['PII_HASH_KEY'] = previousHashKey;
    if (!dataSource?.isInitialized) return;
    try {
      if (platformIds.length > 0) {
        await dataSource.getRepository(PlatformUser).delete({ id: In(platformIds) });
      }
      await dataSource.query(`DROP SCHEMA IF EXISTS ${qSchema()} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  describe('portal', () => {
    const encrypted = (): string =>
      (auth as unknown as { encryptSecret: (value: string) => string }).encryptSecret('SECRETO');

    it('cinco TOTP inválidos bloquean la cuenta aunque la contraseña sea correcta', async () => {
      const id = await seedUser({ mfa_enabled: true, mfa_secret: encrypted() });
      mockTotpVerify.mockResolvedValue({ valid: false });
      for (let n = 0; n < 5; n += 1) {
        expect((await login(id, OLD, '000000')).status).toBe(401);
      }
      mockTotpVerify.mockResolvedValue({ valid: true });

      expect((await readUser(id)).failed_login_attempts).toBe(5);
      expect((await login(id, OLD, '123456')).status).toBe(401);
    });

    const disableMfa = (id: string, password: string): Promise<Outcome> =>
      settle(inTenant(() => auth.disableMfa(id, { password, totpCode: '123456' })));

    it.each([
      ['intentos de contraseña', 'Errada12345!', true],
      ['TOTP', OLD, false],
    ])(
      'cinco %s inválidos al desactivar MFA bloquean la cuenta',
      async (_caso, password, valid) => {
        const id = await seedUser({ mfa_enabled: true, mfa_secret: encrypted() });
        mockTotpVerify.mockResolvedValue({ valid });
        for (let n = 0; n < 5; n += 1) expect((await disableMfa(id, password)).status).toBe(401);
        mockTotpVerify.mockResolvedValue({ valid: true });

        expect((await disableMfa(id, OLD)).status).toBe(401);
        const row = await readUser(id);
        expect(row['failed_login_attempts']).toBe(5);
        expect(row['locked_until']).not.toBeNull();
        expect(row['mfa_enabled']).toBe(true);
      },
    );

    it('diez intentos simultáneos de desactivar MFA no superan el límite', async () => {
      const id = await seedUser({ mfa_enabled: true, mfa_secret: encrypted() });
      const results = await Promise.all(
        Array.from({ length: 10 }, () => disableMfa(id, 'Errada12345!')),
      );

      expect(results.every((r) => r.status === 401)).toBe(true);
      expect((await readUser(id))['failed_login_attempts']).toBe(5);
    });

    it('desactivar MFA no usa la contraseña anterior a un cambio que esperaba', async () => {
      const id = await seedUser({ mfa_enabled: true, mfa_secret: encrypted() });
      const result = await whileLocked(
        id,
        () => disableMfa(id, OLD),
        `UPDATE ${qSchema()}.users SET password_hash = $2 WHERE id = $1`,
        [id, await bcrypt.hash(NEW, 4)],
      );

      expect(result.status).toBe(401);
      expect((await readUser(id))['mfa_enabled']).toBe(true);
    });

    it('contraseña y TOTP correctos desactivan MFA', async () => {
      const id = await seedUser({ mfa_enabled: true, mfa_secret: encrypted() });
      expect((await disableMfa(id, OLD)).status).toBe(200);
      const row = await readUser(id);
      expect(row['mfa_enabled']).toBe(false);
      expect(row['mfa_secret']).toBeNull();
    });

    it('un login en vuelo no entra si la cuenta se bloquea mientras valida', async () => {
      const id = await seedUser();
      const result = await whileLocked(
        id,
        () => login(id, OLD),
        `UPDATE ${qSchema()}.users SET locked_until = now() + interval '15 minutes' WHERE id = $1`,
        [id],
      );

      expect(result.status).toBe(401);
      expect((await readUser(id)).locked_until).not.toBeNull();
    });

    it('restablecer durante el cambio obligatorio deja la temporal marcada como temporal', async () => {
      const id = await seedUser({ password_reset_required: true });
      const chosen = await bcrypt.hash(NEW, 4);
      const reset = await whileLocked(
        id,
        () =>
          inTenant(() => users.resetPassword(id, randomUUID(), UserRole.ADMIN, '127.0.0.1', OTHER)),
        `UPDATE ${qSchema()}.users SET password_hash = $2, password_reset_required = false WHERE id = $1`,
        [id, chosen],
      );

      expect(reset.temporaryPassword).toBe(OTHER);
      const row = await readUser(id);
      expect(await bcrypt.compare(OTHER, row['password_hash'])).toBe(true);
      expect(row['password_reset_required']).toBe(true);
    });

    it('dos canjes simultáneos del mismo enlace: solo uno cambia la contraseña', async () => {
      const token = randomUUID();
      const id = await seedUser({
        password_reset_token: hashOpaqueToken(token),
        password_reset_token_expires_at: new Date(Date.now() + 600_000),
      });
      const redeem = (newPassword: string): Promise<Outcome> =>
        settle(inTenant(() => auth.resetPassword({ token, newPassword })));
      const results = await Promise.all([redeem(NEW), redeem(OTHER)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      const winner = results[0]!.status === 200 ? NEW : OTHER;
      expect(await bcrypt.compare(winner, (await readUser(id))['password_hash'])).toBe(true);
    });

    it('un restablecimiento administrativo anula el canje que esperaba la fila', async () => {
      const token = randomUUID();
      const id = await seedUser({
        password_reset_token: hashOpaqueToken(token),
        password_reset_token_expires_at: new Date(Date.now() + 600_000),
      });
      const temporary = await bcrypt.hash(OTHER, 4);
      const result = await whileLocked(
        id,
        () => settle(inTenant(() => auth.resetPassword({ token, newPassword: NEW }))),
        `UPDATE ${qSchema()}.users SET password_hash = $2, password_reset_required = true, password_reset_token = NULL WHERE id = $1`,
        [id, temporary],
      );

      expect(result.status).toBe(401);
      expect((await readUser(id))['password_reset_required']).toBe(true);
    });

    it.each<[string, Record<string, unknown>, (id: string) => Promise<unknown>]>([
      ['el perfil propio', {}, (id) => users.updateMe(id, { firstName: 'Nuevo' }, '::1')],
      [
        'la ficha por un administrador',
        {},
        (id) => users.update(id, { firstName: 'Nuevo' }, randomUUID(), UserRole.ADMIN),
      ],
      [
        'el correo por un administrador',
        {},
        (id) =>
          users.changeLoginEmailAsAdmin(
            id,
            { email: `admin-${id}@example.invalid`, syncCompanyContactEmail: false },
            randomUUID(),
            UserRole.ADMIN,
          ),
      ],
      [
        'el correo propio',
        {},
        (id) =>
          users.changeLoginEmail(
            id,
            { email: `propio-${id}@example.invalid`, currentPassword: OLD },
            id,
          ),
      ],
      [
        'la verificación del correo',
        { email_verified: false, email_verification_token: 'TOKEN' },
        (id) => auth.verifyEmail({ token: `v-${id}` }, schemaName),
      ],
      [
        'el reenvío de la verificación',
        { email_verified: false },
        (id) => auth.resendVerificationEmail({ email: `races-${id}@example.invalid` }, schemaName),
      ],
    ])('guardar %s durante un cambio no restaura la contraseña', async (_caso, columns, writer) => {
      const id = await seedUser(columns);
      if ('email_verification_token' in columns) {
        await dataSource.query(
          `UPDATE ${qSchema()}.users SET email_verification_token = $2 WHERE id = $1`,
          [id, `v-${id}`],
        );
      }
      const { written, changed } = await raceAfterFirstRead(id, () => writer(id));

      expect([written.status, changed.status]).toEqual([200, 200]);
      const row = await readUser(id);
      expect(await bcrypt.compare(NEW, row['password_hash'])).toBe(true);
    });

    it('cinco contraseñas erróneas al cambiar el correo bloquean la cuenta de verdad', async () => {
      const id = await seedUser();
      const attempt = (currentPassword: string): Promise<Outcome> =>
        settle(
          inTenant(() =>
            users.changeLoginEmail(
              id,
              { email: `otro-${id}@example.invalid`, currentPassword },
              id,
            ),
          ),
        );
      for (let n = 0; n < 5; n += 1) expect((await attempt('Errada12345!')).status).toBe(400);

      const row = await readUser(id);
      expect(row['failed_login_attempts']).toBe(5);
      expect(row['locked_until']).not.toBeNull();
      expect((await attempt(OLD)).status).toBe(401);
    });

    it('un login en vuelo no entra si el MFA se activa mientras valida', async () => {
      const id = await seedUser();
      const result = await whileLocked(
        id,
        () => login(id, OLD),
        `UPDATE ${qSchema()}.users SET mfa_enabled = true, mfa_secret = 'x' WHERE id = $1`,
        [id],
      );

      expect(result.status).toBe(401);
    });

    it('inscribe MFA una vez y no lo reemplaza con el mismo token', async () => {
      const id = await seedUser({ mfa_required: true });
      expect((await login(id, OLD)).value).toMatchObject({ mfaSetupRequired: true });
      const actor = lastActor();

      await inTenant(() => auth.setupMfa(actor));
      await inTenant(() => auth.verifyMfaSetup(actor, { totpCode: '123456' }));
      const secret = (await readUser(id))['mfa_secret'];

      expect((await settle(inTenant(() => auth.setupMfa(actor)))).status).toBe(409);
      expect((await readUser(id))['mfa_secret']).toBe(secret);
    });

    it('dos verificaciones simultáneas: una activa el MFA y la otra recibe 409', async () => {
      const id = await seedUser({ mfa_required: true });
      await login(id, OLD);
      const actor = lastActor();
      await inTenant(() => auth.setupMfa(actor));
      const verify = (): Promise<Outcome> =>
        settle(inTenant(() => auth.verifyMfaSetup(actor, { totpCode: '123456' })));
      const results = await Promise.all([verify(), verify()]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await readUser(id))['mfa_enabled']).toBe(true);
    });

    it('el token mfa-setup emitido antes de cambiar la contraseña ya no inscribe', async () => {
      const id = await seedUser({ mfa_required: true });
      await login(id, OLD);
      const stale = lastActor();
      await inTenant(() => auth.setupMfa(stale));
      await inTenant(() => users.resetPassword(id, randomUUID(), UserRole.ADMIN, '::1', OTHER));
      await inTenant(() =>
        auth.changePassword(
          { ...stale, jti: randomUUID() },
          { currentPassword: OTHER, newPassword: NEW },
        ),
      );

      expect((await settle(inTenant(() => auth.setupMfa(stale)))).status).toBe(401);
      expect(
        (await settle(inTenant(() => auth.verifyMfaSetup(stale, { totpCode: '123456' })))).status,
      ).toBe(401);
      expect((await readUser(id))['mfa_enabled']).toBe(false);
    });
  });

  describe('plataforma', () => {
    const session = async (id: string): Promise<string> =>
      (
        auth as unknown as {
          createPlatformRefreshToken: (user: PlatformUser) => Promise<string>;
        }
      ).createPlatformRefreshToken(await readPlatform(id));
    const change = (id: string): Promise<void> =>
      platform.changePassword(id, { currentPassword: OLD, newPassword: NEW });

    it('guardar el perfil durante un cambio no restaura la contraseña ni revive sesiones', async () => {
      const id = await seedPlatformUser();
      const refresh = await session(id);
      await pausedPlatform(() => change(id)).updateProfile(id, { firstName: 'Nuevo' });

      const row = await readPlatform(id);
      expect(row.firstName).toBe('Nuevo');
      expect(await bcrypt.compare(NEW, row.passwordHash)).toBe(true);
      expect((await settle(auth.refreshPlatformTokens(refresh))).status).toBe(401);
    });

    it.each([
      [
        'correo',
        (service: PlatformUsersService, id: string): Promise<unknown> =>
          service.changeLoginEmail(id, {
            email: `${id}@example.invalid`,
            currentPassword: OLD,
          }),
      ],
      [
        'contraseña',
        (service: PlatformUsersService, id: string): Promise<unknown> =>
          service.changePassword(id, { currentPassword: OLD, newPassword: OTHER }),
      ],
    ])('cambiar %s durante un cambio de contraseña recibe 409', async (_caso, operation) => {
      const id = await seedPlatformUser();
      const { emailHash } = await readPlatform(id);
      const result = await settle(
        operation(
          pausedPlatform(() => change(id)),
          id,
        ),
      );

      expect(result.status).toBe(409);
      const row = await readPlatform(id);
      expect(row.emailHash).toBe(emailHash);
      expect(await bcrypt.compare(NEW, row.passwordHash)).toBe(true);
    });

    it.each([
      ['el perfil', (id: string): Promise<unknown> => change(id)],
      [
        'el cambio de acceso',
        (id: string): Promise<unknown> =>
          auth.changePassword({ sub: id, type: 'platform', jti: randomUUID(), exp: 0 } as never, {
            currentPassword: OLD,
            newPassword: NEW,
          }),
      ],
    ])('cambiar la contraseña desde %s invalida todas las sesiones previas', async (_c, run) => {
      const id = await seedPlatformUser();
      const before = [await session(id), await session(id)];
      await run(id);

      for (const refresh of before) {
        expect((await settle(auth.refreshPlatformTokens(refresh))).status).toBe(401);
      }
      expect((await settle(auth.refreshPlatformTokens(await session(id)))).status).toBe(200);
    });

    const encryptSecret = (value: string): string =>
      (auth as unknown as { encryptSecret: (value: string) => string }).encryptSecret(value);

    it.each([
      ['no existía y se inscribe después', { mfaEnabled: false, mfaSecret: null }, {}],
      ['se desactiva', {}, { mfaEnabled: false, mfaSecret: null }],
      ['se reinscribe con otro secreto', {}, { mfaSecret: 'OTRO' }],
    ])('la sesión no se renueva y su familia cae si el MFA %s', async (_caso, before, after) => {
      const id = await seedPlatformUser();
      const repository = dataSource.getRepository(PlatformUser);
      const { mfaSecret } = await readPlatform(id);
      await repository.update(id, before);
      const refresh = await session(id);
      await repository.update(id, { mfaEnabled: true, mfaSecret, ...after });
      if ('mfaSecret' in after && after.mfaSecret) {
        await repository.update(id, { mfaSecret: encryptSecret(after.mfaSecret) });
      }

      expect((await settle(auth.refreshPlatformTokens(refresh))).status).toBe(401);
      expect(await redis.get(`platform:refresh:token:${hashOpaqueToken(refresh)}`)).toBeNull();
    });

    describe('inscripción de MFA', () => {
      const enrollmentActor = async (id: string): Promise<JwtPayload> => {
        const { accessToken: _token } = (
          auth as unknown as {
            signPlatformAccessToken: (user: PlatformUser, scope: string) => { accessToken: string };
          }
        ).signPlatformAccessToken(await readPlatform(id), 'platform-mfa-setup');
        return lastActor();
      };
      const seedWithoutMfa = async (): Promise<string> => {
        const id = await seedPlatformUser();
        await dataSource
          .getRepository(PlatformUser)
          .update(id, { mfaEnabled: false, mfaSecret: null });
        return id;
      };
      const verify = (actor: JwtPayload): Promise<Outcome> =>
        settle(auth.verifyPlatformMfa(actor, { totpCode: '123456' }, {}));

      it('de dos confirmaciones válidas simultáneas gana una', async () => {
        const id = await seedWithoutMfa();
        const actors = [await enrollmentActor(id), await enrollmentActor(id)];
        for (const actor of actors) await auth.setupPlatformMfa(actor);
        const results = await Promise.all(actors.map(verify));

        expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
        expect((await readPlatform(id)).mfaEnabled).toBe(true);
      });

      it('cambiar la contraseña de verdad invalida el token de inscripción', async () => {
        const id = await seedWithoutMfa();
        const actor = await enrollmentActor(id);
        await auth.setupPlatformMfa(actor);
        await change(id);

        expect((await settle(auth.setupPlatformMfa(actor))).status).toBe(403);
        expect((await verify(actor)).status).toBe(403);
        expect((await readPlatform(id)).mfaEnabled).toBe(false);
      });

      it('un secreto anterior guardado sin activar no sirve', async () => {
        const id = await seedWithoutMfa();
        await dataSource
          .getRepository(PlatformUser)
          .update(id, { mfaSecret: encryptSecret('ANTERIOR') });

        expect((await verify(await enrollmentActor(id))).status).toBe(401);
      });
    });

    it('la sesión sobrevive a rotaciones sucesivas', async () => {
      const id = await seedPlatformUser();
      let refresh = await session(id);
      for (let n = 0; n < 3; n += 1) {
        refresh = (await auth.refreshPlatformTokens(refresh)).refreshToken;
      }
      expect(refresh).toEqual(expect.any(String));
    });
  });
});
