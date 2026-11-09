/**
 * Integración del bloqueo de cuenta por intentos fallidos (Ola A — D1/D2).
 *
 * Spec: docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md §3 y §9.
 * Criterios: CA-1 a CA-6 contra PostgreSQL real, sin simular `runInTenantSchema`
 * (el defecto de §3 solo se ve sin mocks: la excepción revierte el contador).
 *
 * Requiere PostgreSQL alcanzable + IWANA_DB_INTEGRATION_AVAILABLE=true:
 *   pnpm --filter @iwana/api exec jest --config jest.integration.config.js \
 *     --runTestsByPath src/modules/auth/auth-login-lockout.postgres.integration.spec.ts --runInBand
 *
 * SEGURIDAD: sin PII real — correos sintéticos, claves de laboratorio con entropía
 * no nula (mismo criterio que test-setup-pii-hash-key.ts), sin secretos en logs.
 */
import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  PlatformUser,
  RefreshToken,
  runInTenantSchema,
  TenantContext,
  User,
} from '@iwana/db';
import { UserStatus } from '@iwana/shared';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { MailerService } from '../mailer/mailer.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type Redis from 'ioredis';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../packages/database/src/migrations/tenant/runner';

// otplib@13 arrastra @scure/base (ESM-only) que Jest-CJS no puede cargar.
// El mock es solo de carga: TOTP no interviene en login/changePassword
// sin MFA, y `runInTenantSchema`/bcrypt/auditoría quedan reales.
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generateSecret: jest.fn().mockReturnValue('MOCK_TOTP_SECRET_BASE32'),
    generate: jest.fn().mockResolvedValue('123456'),
    verify: jest.fn().mockResolvedValue({ valid: true, delta: 0 }),
    toURI: jest.fn().mockReturnValue('otpauth://totp/iWana%20Test:user%40example.invalid'),
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

/** Claves de laboratorio (64 hex, entropía no nula) — no son secretos. */
const TEST_PII_HASH_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_MFA_KEY_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const CORRECT_PASSWORD = 'Correcta1!';
const WRONG_PASSWORD = 'Incorrecta1!';

interface LockState {
  failed_login_attempts: number;
  locked_until: Date | null;
}

describeWithDb('AuthService bloqueo por intentos (PostgreSQL real)', () => {
  let dataSource: DataSource;
  let authService: AuthService;
  const tenantId = randomUUID();
  const schemaName = `tenant_authlx_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const tenantContext = { tenantId, schemaName, tenantSlug: 'auth-lockout-test' };

  function qSchema(): string {
    return `"${schemaName}"`;
  }

  function createAuthService(): AuthService {
    const configStub = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          PII_HASH_KEY: TEST_PII_HASH_KEY_HEX,
          MFA_ENCRYPTION_KEY: TEST_MFA_KEY_HEX,
        };
        return map[key] ?? fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'PII_HASH_KEY') return TEST_PII_HASH_KEY_HEX;
        if (key === 'MFA_ENCRYPTION_KEY') return TEST_MFA_KEY_HEX;
        throw new Error(`clave de test no mapeada: ${key}`);
      },
    } as unknown as ConfigService;

    const jwtStub = {
      sign: jest.fn().mockReturnValue('test-access-token'),
      verify: jest
        .fn()
        .mockReturnValue({ jti: 'integration-jti', exp: Math.floor(Date.now() / 1000) + 900 }),
    } as unknown as JwtService;

    const redisStub = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
    } as unknown as Redis;

    const platformAuditStub = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService;

    const auditService = new AuditService(dataSource, platformAuditStub);

    const mailerStub = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailerService;

    const platformUserRepositoryStub = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<PlatformUser>;

    return new AuthService(
      dataSource.getRepository(User),
      platformUserRepositoryStub,
      dataSource.getRepository(RefreshToken),
      jwtStub,
      configStub,
      dataSource,
      redisStub,
      auditService,
      platformAuditStub,
      mailerStub,
    );
  }

  async function seedUser(password: string): Promise<{ id: string; email: string }> {
    const id = randomUUID();
    const stamp = randomUUID().replace(/-/g, '').slice(0, 8);
    const email = `lockout-${stamp}@example.invalid`;
    const emailHash = hashEmail(email, Buffer.from(TEST_PII_HASH_KEY_HEX, 'hex'));
    const passwordHash = await bcrypt.hash(password, 4);

    // chk_users_role_tenant_domain solo admite roles de dominio tenant (ADMIN, NOC, ...).
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO users (
           id, email, email_hmac, password_hash, role, status, tenant_id,
           mfa_enabled, mfa_required, is_operational_resource,
           password_reset_required, failed_login_attempts, locked_until,
           email_verified, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', $5,
                   false, false, false, false, 0, NULL, false, now(), now())`,
        [id, email, emailHash, passwordHash, tenantId],
      );
    });

    return { id, email };
  }

  async function readLockState(userId: string): Promise<LockState> {
    const rows = (await dataSource.query(
      `SELECT failed_login_attempts, locked_until FROM ${qSchema()}.users WHERE id = $1`,
      [userId],
    )) as LockState[];
    const row = rows[0];
    if (!row) throw new Error(`usuario de test no encontrado: ${userId}`);
    return row;
  }

  /** Intenta un login y captura la excepción (401 esperado) o el resultado. */
  async function attemptLogin(email: string, password: string): Promise<unknown> {
    try {
      return await TenantContext.run(tenantContext, () => authService.login({ email, password }));
    } catch (err) {
      return err;
    }
  }

  /** Login que debe tener éxito; lanza si la respuesta es una excepción. */
  async function loginOk(email: string, password: string): Promise<unknown> {
    const result = await attemptLogin(email, password);
    if (result instanceof Error) {
      throw new Error(
        `loginOk esperaba éxito pero recibió: ${result.constructor.name}: ${result.message}`,
      );
    }
    return result;
  }

  /** Cambio de contraseña que captura la excepción (401/404 esperado) o vacío. */
  async function attemptChangePassword(userId: string, currentPassword: string): Promise<unknown> {
    try {
      await TenantContext.run(tenantContext, () =>
        authService.changePassword(tenantActor(userId), {
          currentPassword,
          newPassword: 'NuevaClave1!',
        }),
      );
      return null;
    } catch (err) {
      return err;
    }
  }

  async function readAuditCounts(userId: string): Promise<Record<string, number>> {
    const rows = (await dataSource.query(
      `SELECT action, COUNT(*)::int AS n
         FROM ${qSchema()}.audit_logs
        WHERE entity_id = $1
        GROUP BY action`,
      [userId],
    )) as Array<{ action: string; n: number }>;
    return Object.fromEntries(rows.map((r) => [r.action, r.n]));
  }

  function tenantActor(userId: string): JwtPayload {
    return {
      sub: userId,
      email: 'integration-hash',
      role: 'tenant_admin',
      tenantId,
      schemaName,
      jti: randomUUID(),
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    };
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog, RefreshToken, User],
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
        'Auth lockout sintético',
        `auth-lockout-${tenantId.slice(0, 8)}`,
        schemaName,
        'auth-lockout@example.invalid',
      ],
    );
    // El esquema lo crea la cadena de migraciones del tenant: users, refresh_tokens y
    // audit_logs con sus columnas, constraints y triggers reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA ${qSchema()}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `auth-lockout-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    authService = createAuthService();
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${qSchema()} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('CA-1 — 5 fallos persisten el contador y locked_until', async () => {
    const { id, email } = await seedUser(CORRECT_PASSWORD);

    for (let i = 0; i < 5; i += 1) {
      const err = await attemptLogin(email, WRONG_PASSWORD);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).toBe('Credenciales invalidas.');
    }

    const state = await readLockState(id);
    expect(state.failed_login_attempts).toBe(5);
    expect(state.locked_until).not.toBeNull();
    expect(new Date(state.locked_until as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('CA-2 — con la cuenta bloqueada, la contraseña correcta recibe 401 hasta que venza', async () => {
    const { id, email } = await seedUser(CORRECT_PASSWORD);

    for (let i = 0; i < 5; i += 1) {
      const err = await attemptLogin(email, WRONG_PASSWORD);
      expect(err).toBeInstanceOf(UnauthorizedException);
    }

    const blockedState = await readLockState(id);
    expect(blockedState.locked_until).not.toBeNull();

    // La contraseña correcta no abre la cuenta durante el lockout.
    const blocked = await attemptLogin(email, CORRECT_PASSWORD);
    expect(blocked).toBeInstanceOf(UnauthorizedException);
    expect((blocked as Error).message).toMatch(/bloqueada temporalmente/i);

    // Al vencer el lockout (simulado), la contraseña correcta entra.
    await dataSource.query(
      `UPDATE ${qSchema()}.users SET locked_until = now() - interval '1 second' WHERE id = $1`,
      [id],
    );
    const ok = await loginOk(email, CORRECT_PASSWORD);
    expect(ok).toMatchObject({ accessToken: expect.any(String) });
  });

  it('CA-3 — un login correcto reinicia el contador', async () => {
    const { id, email } = await seedUser(CORRECT_PASSWORD);

    for (let i = 0; i < 2; i += 1) {
      const err = await attemptLogin(email, WRONG_PASSWORD);
      expect(err).toBeInstanceOf(UnauthorizedException);
    }
    const afterFails = await readLockState(id);
    expect(afterFails.failed_login_attempts).toBe(2);

    const ok = await loginOk(email, CORRECT_PASSWORD);
    expect(ok).toMatchObject({ accessToken: expect.any(String) });

    const afterSuccess = await readLockState(id);
    expect(afterSuccess.failed_login_attempts).toBe(0);
    expect(afterSuccess.locked_until).toBeNull();
  });

  it('CA-4 — 10 fallos en paralelo dejan la cuenta bloqueada y el contador en 5 o más', async () => {
    const { id, email } = await seedUser(CORRECT_PASSWORD);

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => attemptLogin(email, WRONG_PASSWORD)),
    );
    // Todos los intentos fallidos responden 401 (genérico o bloqueado).
    for (const err of attempts) {
      expect(err).toBeInstanceOf(UnauthorizedException);
    }

    const state = await readLockState(id);
    expect(state.failed_login_attempts).toBeGreaterThanOrEqual(5);
    expect(state.locked_until).not.toBeNull();
  });

  it('CA-5 — changePassword persiste el intento fallido', async () => {
    const { id } = await seedUser(CORRECT_PASSWORD);

    const first = await attemptChangePassword(id, WRONG_PASSWORD);
    expect(first).toBeInstanceOf(UnauthorizedException);
    expect((first as Error).message).toBe(
      'La contraseña actual no coincide con la que usas para iniciar sesión.',
    );

    const afterOne = await readLockState(id);
    expect(afterOne.failed_login_attempts).toBe(1);

    // Hasta el umbral: 5 combinados bloquean también desde changePassword.
    for (let i = 0; i < 4; i += 1) {
      const err = await attemptChangePassword(id, WRONG_PASSWORD);
      expect(err).toBeInstanceOf(UnauthorizedException);
    }
    const afterFive = await readLockState(id);
    expect(afterFive.failed_login_attempts).toBe(5);
    expect(afterFive.locked_until).not.toBeNull();
  });

  it('CA-6 — LOGIN_FAILED y ACCOUNT_LOCKED quedan en auditoría', async () => {
    const { id, email } = await seedUser(CORRECT_PASSWORD);

    for (let i = 0; i < 5; i += 1) {
      const err = await attemptLogin(email, WRONG_PASSWORD);
      expect(err).toBeInstanceOf(UnauthorizedException);
    }

    const counts = await readAuditCounts(id);
    expect(counts['LOGIN_FAILED'] ?? 0).toBe(5);
    expect(counts['ACCOUNT_LOCKED'] ?? 0).toBeGreaterThanOrEqual(1);
  });
});
