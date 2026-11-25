/**
 * Tests unitarios de AuthService — Sprint 1 Semana 2.
 *
 * Cobertura objetivo: login (exito, fallo, lockout, MFA), refresh (rotacion y reuse attack),
 * logout (blacklist JTI), setupMfa / verifyMfaSetup / disableMfa.
 *
 * MOCKS:
 * - runInTenantSchema y TenantContext se mockean via jest.mock('@iwana/db')
 * - DataSource: mock con createQueryRunner falso (no usado directamente aqui)
 * - UserRepository / RefreshTokenRepository: jest.fn()
 * - JwtService: jest.fn()
 * - ConfigService: jest.fn()
 * - Redis client: jest.fn()
 *
 * SEGURIDAD:
 * - Ningun dato PII real en los tests — solo datos ficticios de prueba.
 */

import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import { PlatformUser, RefreshToken, User } from '@iwana/db';
import { AuditAction, PlatformRole, UserRole, UserStatus } from '@iwana/shared';
import { createHash } from 'crypto';
import { SessionEndedException } from './auth-errors';
import { AuthService } from './auth.service';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from './auth.constants';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { MailerService } from '../mailer/mailer.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import {
  ChangePasswordDto,
  EmailVerifyDto,
  ForgotPasswordDto,
  LoginDto,
  MfaVerifyDto,
  MfaDisableDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const PLATFORM_HASH = '$2b$12$hash';
const platformCredentialVersion = (hash: string): string =>
  createHash('sha256').update(hash).digest('hex');

// ---------------------------------------------------------------------------
// Mock global de bcryptjs — compare/hash son non-configurable en el modulo CJS;
// jest.mock reemplaza todo el modulo con funciones controlables antes de la carga.
// ---------------------------------------------------------------------------

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$12$hashed_password'),
  genSalt: jest.fn().mockResolvedValue('$2b$12$salt'),
}));

// ---------------------------------------------------------------------------
// Mock global de otplib — evita carga de @scure/base (ESM-only, incompatible con Jest CJS)
// Los metodos de TOTP se mockean; los tests de MFA usan (service as any).totp.verify
// ---------------------------------------------------------------------------

jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generateSecret: jest.fn().mockReturnValue('MOCK_TOTP_SECRET_BASE32'),
    generate: jest.fn().mockResolvedValue('123456'),
    verify: jest.fn().mockResolvedValue({ valid: true, delta: 0, timeStep: 1 }),
    toURI: jest.fn().mockReturnValue('otpauth://totp/iWana%20Test:user%40example.com'),
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock global de @iwana/db — intercepta runInTenantSchema y TenantContext
// ---------------------------------------------------------------------------

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn().mockReturnValue({
  tenantId: 'tenant-test-uuid',
  schemaName: 'tenant_test',
});

jest.mock('@iwana/db', () => {
  // Re-exportar lo que no se mockea (User, RefreshToken necesarios por Jest para tokens)
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers de test — fabrica de entidades ficticias
// ---------------------------------------------------------------------------

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'admin@iwana.co',
    emailHash: 'abc123hash',
    passwordHash: '$2b$12$hash',
    role: 'tenant_admin',
    tenantId: 'tenant-test-uuid',
    status: UserStatus.ACTIVE,
    mfaEnabled: false,
    mfaRequired: false,
    mfaSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    passwordResetTokenExpiresAt: null,
    emailVerified: true,
    passwordResetRequired: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as User;
}

/** Payload de un usuario de tenant autenticado, tal como lo entrega JwtStrategy. */
function tenantActor(sub: string): JwtPayload {
  return {
    sub,
    email: 'abc123hash',
    role: 'tenant_admin',
    tenantId: 'tenant-test-uuid',
    schemaName: 'tenant_test',
    jti: 'jti-tenant-test',
    type: 'tenant',
    exp: Math.floor(Date.now() / 1000) + 900,
  };
}

/** Payload de un usuario de plataforma autenticado. */
function platformActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'platform-uuid-1',
    email: 'platform-hash',
    role: 'system_admin',
    tenantId: null,
    schemaName: null,
    jti: 'jti-platform-test',
    type: 'platform',
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

/** Token de tenant ligado a la contraseña de `buildUser()`. */
function mfaActor(): JwtPayload {
  return {
    sub: 'user-uuid-1',
    email: 'hash',
    role: 'tenant_admin',
    tenantId: 'tenant-uuid-1',
    schemaName: 'tenant_test',
    jti: 'jti-mfa',
    type: 'tenant',
    credentialVersion: platformCredentialVersion(buildUser().passwordHash),
  };
}

function mfaPendingKey(): string {
  return `mfa:pending:user-uuid-1:${mfaActor().credentialVersion}`;
}

/** Configura mockRunInTenantSchema para ejecutar el callback con un EntityManager mockeado */
/** Consultas del segundo factor de plataforma: sin espera, y UPDATE de una fila. */
const mockPlatformQuery = jest.fn();
const platformQuery =
  (waiting = false, affected = 1, lockedUntil: Date | null = null) =>
  async (sql: string): Promise<unknown> =>
    sql.startsWith('SELECT') ? [{ waiting }] : [[{ locked_until: lockedUntil }], affected];

function setupRunInTenantSchema(managerOverrides: Record<string, jest.Mock> = {}): {
  manager: Record<string, jest.Mock>;
} {
  const manager: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    // `manager.query` en Postgres devuelve las sentencias UPDATE como tupla
    // `[filas, rowCount]` — el mock reproduce esa forma real.
    query: jest.fn(async (sql: string) =>
      sql.includes('min(LEAST')
        ? [{ started: new Date(Date.now() - 60_000) }]
        : [[{ failed_login_attempts: 1, locked_until: null }], 1],
    ),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((_, partial) => partial),
    ...managerOverrides,
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _dataSource: unknown,
      _schema: string,
      callback: (qr: { manager: typeof manager }) => Promise<unknown>,
    ) => callback({ manager }),
  );

  return { manager };
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  const injectedPiiHashKeyHex = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const originalPiiHashKey = process.env.PII_HASH_KEY;
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let redis: Record<string, jest.Mock>;

  // Mocks compartidos — se resetean antes de cada test
  let userManager: Record<string, jest.Mock>;
  let mockRedis: {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    expire: jest.Mock;
    smembers: jest.Mock;
    exists: jest.Mock;
    eval: jest.Mock;
  };

  beforeEach(async () => {
    process.env.PII_HASH_KEY = injectedPiiHashKeyHex;
    mockPlatformQuery.mockImplementation(platformQuery());
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(0),
      eval: jest.fn().mockResolvedValue(1),
    };
    // Alias para compatibilidad con codigo anterior que usa 'redis'
    redis = mockRedis as unknown as typeof redis;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(PlatformUser),
          useFactory: () => {
            const repository: Record<string, unknown> = {
              findOne: jest.fn(),
              find: jest.fn().mockResolvedValue([]),
              update: jest.fn().mockResolvedValue({ affected: 1 }),
            };
            // La fila bloqueada es la misma que leyó el login; la espera y el consumo los fija cada prueba.
            const manager = {
              findOne: () => (repository['findOne'] as jest.Mock)({}),
              update: jest.fn(),
              query: mockPlatformQuery,
            };
            repository['manager'] = {
              ...manager,
              transaction: (run: (m: unknown) => unknown) => run(manager),
            };
            return repository;
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
            verify: jest
              .fn()
              .mockReturnValue({ jti: 'test-jti', exp: Math.floor(Date.now() / 1000) + 900 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                APP_NAME: 'iWana Test',
                PII_HASH_KEY: injectedPiiHashKeyHex,
              };
              return map[key] ?? def;
            }),
            // getOrThrow necesario para derivar la clave AES-256-GCM en el constructor de AuthService
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              // Clave de test con entropía no nula (no es secreto real)
              if (key === 'MFA_ENCRYPTION_KEY') {
                return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
              }
              if (key === 'PII_HASH_KEY') {
                return injectedPiiHashKeyHex;
              }
              throw new Error(`ConfigService.getOrThrow: clave no mapeada en test: ${key}`);
            }),
          },
        },
        {
          provide: DataSource,
          useValue: {},
        },
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
        {
          // AuditService: mock fire-and-forget — no debe bloquear los tests de auth
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logWithin: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // PlatformAuditService: sink público (public.platform_audit_logs), el
          // trail de S-8. Es el destino de los eventos de cuentas de plataforma
          // —loginPlatform entre ellos—, que no tienen TenantContext.
          provide: PlatformAuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logWithin: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // MailerService: mock — no enviar correos reales en tests
          provide: MailerService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    if (originalPiiHashKey === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = originalPiiHashKey;
    }
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------

  describe('login()', () => {
    it('retorna accessToken + refreshToken cuando las credenciales son validas', async () => {
      const user = buildUser();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });
      userManager = manager;

      const dto: LoginDto = { email: 'test@example.com', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(10);
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
    });

    it('lanza UnauthorizedException cuando el usuario no existe', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const dto: LoginDto = { email: 'noexiste@example.com', password: 'Any1pass!' };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza ForbiddenException cuando la cuenta esta suspendida', async () => {
      const user = buildUser({ status: UserStatus.SUSPENDED });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'susp@example.com', password: 'Pass1234!' };
      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('incrementa (atomico) failedLoginAttempts cuando la contrasena es incorrecta', async () => {
      // D1: el incremento pasa de `manager.update` (lee-escribe, pierde cuentas
      // en paralelo) a `UPDATE ... RETURNING` atómico. La expectativa anterior
      // (`update` con { failedLoginAttempts: 1 }) describía la implementación
      // rota, no el comportamiento; el comportamiento es "persiste el intento".
      const user = buildUser({ failedLoginAttempts: 0 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([[{ failed_login_attempts: 1, locked_until: null }], 1]),
      });

      const dto: LoginDto = { email: 'test@example.com', password: 'WrongPass1!' };

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);

      // Debe ejecutar el UPDATE atómico con el id del usuario como parámetro
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = failed_login_attempts + 1'),
        expect.arrayContaining([user.id]),
      );
    });

    it('CA-7 — usuario inexistente y contraseña errónea responden el mismo mensaje', async () => {
      // Anti-enumeración: la respuesta no debe distinguir entre «cuenta no
      // existe» y «contraseña incorrecta». Ambos caminos deben lanzar el mismo
      // mensaje genérico. (CA-7 — spec §9)
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const missingError = await service
        .login({ email: 'noexiste@example.com', password: 'Any1pass!!' })
        .catch((e: unknown) => e);
      expect(missingError).toBeInstanceOf(UnauthorizedException);
      expect((missingError as Error).message).toBe('Credenciales invalidas.');

      const user = buildUser({ failedLoginAttempts: 0 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([[{ failed_login_attempts: 1, locked_until: null }], 1]),
      });

      const wrongError = await service
        .login({ email: 'test@example.com', password: 'WrongPass1!' })
        .catch((e: unknown) => e);
      expect(wrongError).toBeInstanceOf(UnauthorizedException);
      expect((wrongError as Error).message).toBe('Credenciales invalidas.');
      expect((wrongError as Error).message).toBe((missingError as Error).message);
    });

    it('lanza UnauthorizedException cuando la cuenta esta bloqueada por lockout', async () => {
      const future = new Date(Date.now() + 5 * 60 * 1000); // bloqueada 5 min en el futuro
      const user = buildUser({ lockedUntil: future, failedLoginAttempts: 5 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'locked@example.com', password: 'Passw0rd!' };
      const err = await service.login(dto).catch((e: UnauthorizedException) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).getResponse()).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'AUTH_ACCOUNT_LOCKED',
        message: 'Cuenta bloqueada temporalmente. Intenta en 5 minuto(s).',
      });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('retorna mfaRequired=true cuando MFA esta habilitado y no se envio totpCode', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'BASE32SECRET' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'mfa@example.com', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.mfaRequired).toBe(true);
      expect(result.accessToken).toBe('');
    });

    it('lanza UnauthorizedException cuando MFA esta habilitado y el codigo TOTP es invalido', async () => {
      // mfaSecret debe estar cifrado; se usa el mismo key que retorna getOrThrow en el mock
      const encryptedSecret = (service as any).encryptSecret('TESTSECRET123') as string;
      const user = buildUser({ mfaEnabled: true, mfaSecret: encryptedSecret });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      // Mock del metodo privado verifyTotp para retornar false
      jest
        .spyOn(
          service as unknown as { matchTotpStep: () => Promise<number | null> },
          'matchTotpStep',
        )
        .mockResolvedValue(null);

      const dto: LoginDto = { email: 'mfa@example.com', password: 'Passw0rd!', totpCode: '000000' };
      await expect(service.login(dto)).rejects.toMatchObject({
        status: 401,
        response: {
          code: 'AUTH_MFA_CODE_INVALID',
          message: 'Código incorrecto o ya usado. Espera el siguiente código.',
        },
      });
    });

    it.each([
      [1, null, false],
      [5, new Date(Date.now() + 900_000), true],
    ])(
      'un TOTP inválido cuenta como intento fallido y se audita (intentos: %s)',
      async (attempts, lockedUntil, locks) => {
        const user = buildUser({
          mfaEnabled: true,
          mfaSecret: (service as any).encryptSecret('TESTSECRET123') as string,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        const { manager } = setupRunInTenantSchema({
          findOne: jest.fn().mockResolvedValue(user),
          query: jest
            .fn()
            .mockResolvedValue([
              [{ failed_login_attempts: attempts, locked_until: lockedUntil }],
              1,
            ]),
        });
        jest
          .spyOn(
            service as unknown as { matchTotpStep: () => Promise<number | null> },
            'matchTotpStep',
          )
          .mockResolvedValue(null);
        const { auditService } = service as unknown as { auditService: { log: jest.Mock } };
        auditService.log.mockClear();

        await expect(
          service.login({ email: 'mfa@example.com', password: 'Passw0rd!', totpCode: '000000' }),
        ).rejects.toMatchObject({
          status: 401,
          response: {
            code: 'AUTH_MFA_CODE_INVALID',
            message: 'Código incorrecto o ya usado. Espera el siguiente código.',
          },
        });

        expect(manager.query).toHaveBeenCalledWith(
          expect.stringContaining('failed_login_attempts = failed_login_attempts + 1'),
          expect.arrayContaining([user.id]),
        );
        const actions = auditService.log.mock.calls.map(([entry]) => entry.action);
        expect(actions).toEqual(locks ? ['LOGIN_FAILED', 'ACCOUNT_LOCKED'] : ['LOGIN_FAILED']);
      },
    );

    it.each<[string, Partial<User>]>([
      ['la cuenta se bloqueó', { lockedUntil: new Date(Date.now() + 900_000) }],
      ['se activó el MFA', { mfaEnabled: true }],
      ['cambió el secreto MFA', { mfaSecret: 'otro' }],
      ['se exigió MFA', { mfaRequired: true }],
      ['se suspendió la cuenta', { status: UserStatus.SUSPENDED }],
    ])('no emite sesión si %s mientras se validaba', async (_caso, changes) => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const { manager } = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(buildUser())
          .mockResolvedValueOnce(buildUser(changes)),
      });
      jwtService.sign.mockClear();

      await expect(
        service.login({ email: 'a@example.com', password: 'Passw0rd!' }),
      ).rejects.toThrow('Credenciales invalidas.');
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rechaza el primer ingreso cuando la credencial temporal del ADMIN ya expiro', async () => {
      const user = buildUser({
        passwordResetRequired: true,
        passwordResetExpiresAt: new Date(Date.now() - 60_000),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'admin@tenant.co', password: 'Passw0rd!' };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // REFRESH TOKENS
  // ---------------------------------------------------------------------------

  describe('refreshTokens()', () => {
    it('rota el refresh token y retorna nuevos tokens', async () => {
      const rawToken = 'a'.repeat(96); // 96 chars hex = 48 bytes
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      const tokenEntity = {
        id: 'rt-uuid-1',
        userId: 'user-uuid-1',
        tokenHash: hashedToken,
        familyId: 'family-uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const user = buildUser();

      const { manager } = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(tokenEntity) // primera llamada: buscar refresh token
          .mockResolvedValueOnce(user), // segunda llamada: buscar usuario
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      mockRedis.get.mockResolvedValue(null); // JTI no en blacklist
      const result = await service.refreshTokens(rawToken);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      // El token antiguo debe haberse revocado
      expect(manager.update).toHaveBeenCalledWith(
        RefreshToken,
        { id: tokenEntity.id, revokedAt: IsNull() },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it.each([
      ['se revocó en paralelo', { affected: 0 }, {}],
      [
        'la cuenta tiene un cambio de contraseña pendiente',
        { affected: 1 },
        { passwordResetRequired: true },
      ],
    ])('no emite tokens si %s', async (_caso, updated, overrides) => {
      const { manager } = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'rt-1',
            userId: 'user-uuid-1',
            familyId: 'family-uuid-1',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          })
          .mockResolvedValueOnce(buildUser(overrides as Partial<User>)),
        update: jest.fn().mockResolvedValue(updated),
      });

      await expect(service.refreshTokens('f'.repeat(96))).rejects.toThrow(UnauthorizedException);
      expect(manager['save']).not.toHaveBeenCalled();
    });

    it('confirma la revocación por reuso: la excepción sale después de la transacción', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue({
          id: 'rt-old',
          userId: 'user-uuid-1',
          familyId: 'family-uuid-1',
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        }),
      });
      const run = mockRunInTenantSchema.getMockImplementation()!;
      let committed = false;
      mockRunInTenantSchema.mockImplementation(async (...args) => {
        const result = await run(...args);
        committed = true;
        return result;
      });

      await expect(service.refreshTokens('g'.repeat(96))).rejects.toThrow(UnauthorizedException);
      expect(committed).toBe(true);
    });

    it('revoca la familia completa ante reuse attack (token ya revocado)', async () => {
      const rawToken = 'b'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      // Token YA revocado — indica reuse attack
      const revokedToken = {
        id: 'rt-uuid-old',
        userId: 'user-uuid-1',
        tokenHash: hashedToken,
        familyId: 'family-uuid-1',
        revokedAt: new Date(), // ya esta revocado
        expiresAt: new Date(Date.now() + 86400000),
      };

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(revokedToken),
        update: jest.fn().mockResolvedValue({ affected: 3 }),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);

      // Debe haber revocado la familia completa
      expect(manager.update).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ familyId: 'family-uuid-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date), revokeReason: 'REUSE_ATTACK' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------

  describe('logout()', () => {
    it('agrega el JTI a la blacklist de Redis con TTL correcto', async () => {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 900;
      const jti = 'test-jti-blacklist';

      const payload: JwtPayload = {
        sub: 'user-uuid-1',
        email: 'hash123',
        role: 'tenant_admin',
        tenantId: 'tenant-test-uuid',
        schemaName: 'tenant_test',
        jti,
        type: 'tenant',
        exp,
      };
      jwtService.verify.mockReturnValue(payload as never);

      setupRunInTenantSchema({
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.logout(payload, 'raw-refresh-token');

      // El servicio usa redis.set(key, value, 'EX', ttl) — no setex
      expect(mockRedis.set).toHaveBeenCalledWith(
        `jti:blacklist:${jti}`,
        '1',
        'EX',
        expect.any(Number),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // MFA — SETUP
  // ---------------------------------------------------------------------------

  describe('setupMfa()', () => {
    it('guarda el secret temporal en Redis y retorna QR code', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(buildUser()) });
      const result = await service.setupMfa(mfaActor());

      expect(typeof result.qrCodeBase64).toBe('string');
      expect(result.qrCodeBase64).toMatch(/^data:image\/png/);
      expect(typeof result.otpauthUri).toBe('string');
      expect(result.otpauthUri).toMatch(/otpauth:\/\/totp\//);

      // Debe haber guardado el secret en Redis con TTL de 1800s (30 min)
      expect(mockRedis.set).toHaveBeenCalledWith(mfaPendingKey(), expect.any(String), 'EX', 1800);
    });
  });

  // ---------------------------------------------------------------------------
  // MFA — VERIFY SETUP
  // ---------------------------------------------------------------------------

  describe('inscripción MFA ligada a la credencial vigente', () => {
    const blocked: Array<[string, number, Partial<User>, Record<string, unknown>]> = [
      ['el MFA ya está activo', 409, { mfaEnabled: true }, {}],
      ['hay cambio de contraseña pendiente', 401, { passwordResetRequired: true }, {}],
      ['la contraseña cambió tras emitir el token', 401, { passwordHash: 'otro-hash' }, {}],
      ['el token no trae versión de credencial', 401, {}, { credentialVersion: undefined }],
      ['el token es de plataforma', 403, {}, { type: 'platform' }],
    ];

    const expectedError = (status: number) => ({
      status,
      ...(status === 401 && {
        response: {
          code: 'AUTH_SESSION_NOT_CURRENT',
          message: 'Tu sesión ya no es vigente. Inicia sesión de nuevo.',
        },
      }),
    });

    it.each(blocked)('setup se rechaza si %s', async (_caso, status, user, actor) => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(buildUser(user)) });

      await expect(
        service.setupMfa({ ...mfaActor(), ...actor } as JwtPayload),
      ).rejects.toMatchObject(expectedError(status));
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it.each(blocked)('verify se rechaza y no escribe si %s', async (_caso, status, user, actor) => {
      mockRedis.get.mockResolvedValue('PENDING');
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser(user)),
      });

      await expect(
        service.verifyMfaSetup({ ...mfaActor(), ...actor } as JwtPayload, { totpCode: '123456' }),
      ).rejects.toMatchObject(expectedError(status));
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('verify revalida bajo bloqueo y no reemplaza un MFA activado en paralelo', async () => {
      mockRedis.get.mockResolvedValue('PENDING');
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser({ mfaEnabled: true })),
      });

      await expect(service.verifyMfaSetup(mfaActor(), { totpCode: '123456' })).rejects.toThrow(
        ConflictException,
      );
      expect(manager.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });
  });

  describe('verifyMfaSetup()', () => {
    it('activa MFA cuando el codigo TOTP es valido', async () => {
      const pendingSecret = 'PENDINGBASE32SECRET';
      mockRedis.get.mockResolvedValue(pendingSecret);
      jest
        .spyOn(
          service as unknown as { matchTotpStep: () => Promise<number | null> },
          'matchTotpStep',
        )
        .mockResolvedValue(1);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser()),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const dto: MfaVerifyDto = { totpCode: '123456' };
      const result = await service.verifyMfaSetup(mfaActor(), dto);

      expect(result.mfaEnabled).toBe(true);

      // El mfaSecret almacenado debe estar cifrado (AES-256-GCM), no en texto plano
      const [, , updatePayload] = (manager.update as jest.Mock).mock.calls[0] as [
        unknown,
        unknown,
        { mfaSecret: string; mfaEnabled: boolean },
      ];
      expect(updatePayload.mfaEnabled).toBe(true);
      expect(updatePayload.mfaSecret).not.toBe(pendingSecret); // no plano
      expect(updatePayload.mfaSecret.split(':')).toHaveLength(3); // formato iv:tag:ciphertext

      expect(mockRedis.del).toHaveBeenCalledWith(mfaPendingKey());
    });

    it('lanza UnauthorizedException cuando no hay secret pendiente en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      setupRunInTenantSchema({});

      const dto: MfaVerifyDto = { totpCode: '000000' };
      await expect(service.verifyMfaSetup(mfaActor(), dto)).rejects.toMatchObject({
        status: 401,
        response: {
          code: 'AUTH_MFA_SETUP_NOT_PENDING',
          message: 'No hay configuracion MFA pendiente. Reinicia el setup.',
        },
      });
    });

    it('lanza UnauthorizedException cuando el codigo TOTP es invalido', async () => {
      mockRedis.get.mockResolvedValue('VALIDBASE32SECRET');

      // verifyMfaSetup llama this.totp.verify directamente (no verifyTotp);
      // acceder a la instancia privada para sobreescribir el mock en este test.
      (service as unknown as { totp: { verify: jest.Mock } }).totp.verify.mockResolvedValue({
        valid: false,
        delta: 0,
      });

      setupRunInTenantSchema({});

      const dto: MfaVerifyDto = { totpCode: '999999' };
      await expect(service.verifyMfaSetup(mfaActor(), dto)).rejects.toMatchObject({
        status: 401,
        response: {
          code: 'AUTH_MFA_CODE_INVALID',
          message: 'Código incorrecto o ya usado. Espera el siguiente código.',
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // MFA — DISABLE
  // ---------------------------------------------------------------------------

  describe('disableMfa()', () => {
    it('desactiva MFA cuando la contrasena y el codigo TOTP son correctos', async () => {
      // mfaSecret debe estar cifrado en DB; encryptSecret usa la clave del mock de tests
      const encryptedSecret = (service as any).encryptSecret('MFASECRET123') as string;
      const user = buildUser({ mfaEnabled: true, mfaSecret: encryptedSecret });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest
        .spyOn(
          service as unknown as { matchTotpStep: () => Promise<number | null> },
          'matchTotpStep',
        )
        .mockResolvedValue(1);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const dto: MfaDisableDto = { password: 'Passw0rd!', totpCode: '654321' };
      const result = await service.disableMfa(mfaActor(), dto);

      expect(result.mfaEnabled).toBe(false);
      expect(manager.update).toHaveBeenCalledWith(User, 'user-uuid-1', {
        mfaEnabled: false,
        mfaSecret: null,
        mfaLastUsedStep: null,
      });
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      const dto: MfaDisableDto = { password: 'Passw0rd!', totpCode: '123456' };
      await expect(service.disableMfa(mfaActor(), dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza UnauthorizedException cuando la contrasena es incorrecta', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'MFASECRET' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: MfaDisableDto = { password: 'WrongPass!', totpCode: '000000' };
      await expect(service.disableMfa(mfaActor(), dto)).rejects.toThrow(UnauthorizedException);
    });

    it.each([
      ['contraseña', false, 'Contrasena incorrecta.'],
      ['TOTP', true, 'Código incorrecto o ya usado. Espera el siguiente código.'],
    ])('cuenta el fallo de %s y lanza después del commit', async (_caso, passwordOk, message) => {
      const mfaSecret = (service as any).encryptSecret('MFASECRET123') as string;
      const user = buildUser({ mfaEnabled: true, mfaSecret });
      (bcrypt.compare as jest.Mock).mockResolvedValue(passwordOk);
      jest
        .spyOn(
          service as unknown as { matchTotpStep: () => Promise<number | null> },
          'matchTotpStep',
        )
        .mockResolvedValue(null);
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest
          .fn()
          .mockResolvedValue([[{ failed_login_attempts: 5, locked_until: new Date() }], 1]),
      });
      const runInSchema = mockRunInTenantSchema.getMockImplementation()!;
      let committed = false;
      mockRunInTenantSchema.mockImplementation(async (...args: unknown[]) => {
        const result = await (runInSchema as (...a: unknown[]) => Promise<unknown>)(...args);
        committed = true;
        return result;
      });

      await expect(
        service.disableMfa(mfaActor(), { password: 'Passw0rd!', totpCode: '000000' }),
      ).rejects.toThrow(message);

      expect(committed).toBe(true);
      expect(manager.findOne).toHaveBeenCalledWith(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.update).not.toHaveBeenCalled();
      const { auditService } = service as unknown as { auditService: { log: jest.Mock } };
      for (const action of [AuditAction.LOGIN_FAILED, AuditAction.ACCOUNT_LOCKED]) {
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action }));
      }
    });

    it('rechaza un token de plataforma sin tocar el tenant', async () => {
      mockRunInTenantSchema.mockClear();
      await expect(
        service.disableMfa({ ...mfaActor(), type: 'platform' } as JwtPayload, {
          password: 'Passw0rd!',
          totpCode: '123456',
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('un código ya usado no desactiva ni cuenta como fallo', async () => {
      const user = buildUser({
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFASECRET123'),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([[], 0]),
      });

      await expect(
        service.disableMfa(mfaActor(), { password: 'Passw0rd!', totpCode: '123456' }),
      ).rejects.toMatchObject({ status: 401, response: { code: 'AUTH_MFA_CODE_INVALID' } });

      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query?.mock.calls[0]?.[0]).toContain('mfa_last_used_step');
      const { auditService } = service as unknown as { auditService: { log: jest.Mock } };
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ newValue: { motivo: 'MFA_CODIGO_REUTILIZADO' } }),
      );
    });

    it('rechaza una cuenta bloqueada sin comparar la contraseña', async () => {
      const user = buildUser({ mfaEnabled: true, lockedUntil: new Date(Date.now() + 600_000) });
      (bcrypt.compare as jest.Mock).mockClear();
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      await expect(
        service.disableMfa(mfaActor(), { password: 'Passw0rd!', totpCode: '123456' }),
      ).rejects.toMatchObject({ status: 401, response: { code: 'AUTH_ACCOUNT_LOCKED' } });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // CREDENCIALES TEMPORALES DEL ADMIN INICIAL
  // ---------------------------------------------------------------------------

  const credentialActor = { actorUserId: 'actor-1', ipAddress: '10.0.0.5', userAgent: 'jest' };

  describe('regenerateTenantAdminCredentials()', () => {
    it('registra quién emitió la credencial en la misma transacción y sin el secreto', async () => {
      const adminUser = buildUser({ role: UserRole.ADMIN, email: 'admin@iwana.co' });
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(adminUser),
      });

      const result = await service.regenerateTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
        idempotencyKey: 'idem-key-audit',
        ...credentialActor,
        userAgent: 'x'.repeat(600),
      });

      const { logWithin } = (
        service as unknown as { platformAuditService: { logWithin: jest.Mock } }
      ).platformAuditService;
      const [entry, usedManager] = logWithin.mock.calls.at(-1) as [unknown, unknown];
      expect(usedManager).toBe(manager);
      expect(entry).toEqual({
        userId: 'actor-1',
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'TenantAdmin',
        entityId: adminUser.id,
        newValue: { tenantId: 'tenant-uuid-1', expiresAt: result.expiresAt },
        ipAddress: '10.0.0.5',
        userAgent: 'x'.repeat(512),
      });
      expect(manager['update']).toHaveBeenCalledWith(
        RefreshToken,
        { userId: adminUser.id, revokedAt: IsNull() },
        { revokedAt: expect.any(Date), revokeReason: 'ADMIN' },
      );
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain(result.temporaryPassword);
      expect(serialized).not.toContain('admin@iwana.co');
    });

    it('si el registro falla no entrega la credencial ni marca la clave como usada', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser({ role: UserRole.ADMIN })),
      });
      (
        service as unknown as { platformAuditService: { logWithin: jest.Mock } }
      ).platformAuditService.logWithin.mockRejectedValueOnce(new Error('auditoría caída'));
      mockRedis.set.mockClear();

      await expect(
        service.regenerateTenantAdminCredentials({
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_test',
          idempotencyKey: 'idem-key-audit-fail',
          ...credentialActor,
        }),
      ).rejects.toThrow('auditoría caída');
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('regenera el password temporal, lo marca como obligatorio y cachea la respuesta por idempotencia', async () => {
      const adminUser = buildUser({
        role: UserRole.ADMIN,
        emailHash: 'admin-hash-1',
        email: 'admin@iwana.co',
      });
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(adminUser),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const result = await service.regenerateTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
        idempotencyKey: 'idem-key-1',
        ...credentialActor,
      });

      expect(result.adminEmail).toBe('admin@iwana.co');
      expect(result.message).toMatch(/regeneradas/i);
      expect(result.temporaryPassword).toMatch(/^IwN!a9-/);
      expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^IwN!a9-/), 12);
      expect(manager.update).toHaveBeenCalledWith(
        User,
        adminUser.id,
        expect.objectContaining({
          passwordResetRequired: true,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          passwordResetExpiresAt: expect.any(Date),
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'tenant-admin-credentials:tenant-uuid-1:idem-key-1',
        expect.any(String),
        'EX',
        86400,
      );
    });

    it('no vuelve a rotar si llega el mismo Idempotency-Key: rechaza con 409', async () => {
      // La idempotencia debe impedir una segunda rotación, no reservir el
      // secreto. Antes se cacheaba la respuesta entera 24h y la contraseña
      // quedaba en claro en Redis, recuperable por quien repitiera la clave.
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          adminEmail: 'admin@isptest.co',
          expiresAt: '2026-03-20T00:00:00.000Z',
        }),
      );

      await expect(
        service.regenerateTenantAdminCredentials({
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_test',
          idempotencyKey: 'idem-key-2',
          ...credentialActor,
        }),
      ).rejects.toThrow(ConflictException);

      // Lo esencial: el reintento no vuelve a tocar la base ni rehashea.
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('el rastro de idempotencia no contiene la contraseña', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      await service.regenerateTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
        idempotencyKey: 'idem-key-3',
        ...credentialActor,
      });

      const [, cachedPayload] = mockRedis.set.mock.calls.at(-1) as [string, string];

      expect(cachedPayload).not.toMatch(/IwN!a9-/);
      expect(JSON.parse(cachedPayload)).toEqual({
        adminEmail: expect.any(String),
        expiresAt: expect.any(String),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // VERIFICACION DE EMAIL
  // ---------------------------------------------------------------------------

  describe('verifyEmail()', () => {
    it('activa el usuario cuando el token de verificacion es valido', async () => {
      // Usuario con estado PENDING_VERIFICATION y token pendiente
      const user = buildUser({
        status: UserStatus.PENDING_VERIFICATION,
        emailVerified: false,
        emailVerificationToken: 'raw-valid-token-hex',
      } as Partial<User>);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue({}),
      });

      const dto: EmailVerifyDto = { token: 'raw-valid-token-hex' };
      await service.verifyEmail(dto, 'tenant_test');

      // Verificar que se guardo el usuario con el estado correcto
      const [, savedUser] = (manager.save as jest.Mock).mock.calls[0] as [unknown, User];
      expect(savedUser.emailVerified).toBe(true);
      expect(savedUser.emailVerificationToken).toBeNull();
      expect(savedUser.status).toBe(UserStatus.ACTIVE);
    });

    it('no cambia el status si el usuario ya estaba ACTIVE', async () => {
      // Usuario activo que de alguna forma aun no verifico el email
      const user = buildUser({
        status: UserStatus.ACTIVE,
        emailVerified: false,
        emailVerificationToken: 'another-valid-token',
      } as Partial<User>);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue({}),
      });

      const dto: EmailVerifyDto = { token: 'another-valid-token' };
      await service.verifyEmail(dto, 'tenant_test');

      const [, savedUser] = (manager.save as jest.Mock).mock.calls[0] as [unknown, User];
      expect(savedUser.emailVerified).toBe(true);
      expect(savedUser.status).toBe(UserStatus.ACTIVE); // No cambia si ya era ACTIVE
    });

    it('lanza UnauthorizedException cuando el token de verificacion no existe en DB', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const dto: EmailVerifyDto = { token: 'token-inexistente' };
      await expect(service.verifyEmail(dto, 'tenant_test')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resendVerificationEmail()', () => {
    it('retorna void sin lanzar error aunque el email no exista (OWASP — no revelar existencia)', async () => {
      // No existe ningun usuario con ese email hash
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      });

      const dto: ResendVerificationDto = { email: 'noexiste@example.com' };
      await expect(service.resendVerificationEmail(dto, 'tenant_test')).resolves.toBeUndefined();

      // No debe haber persistido ni enviado nada
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('genera un nuevo token y envia el email cuando el usuario existe y no esta verificado', async () => {
      const user = buildUser({
        emailVerified: false,
        emailVerificationToken: 'token-anterior',
      } as Partial<User>);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue({}),
      });

      // Acceder al MailerService mockeado desde el modulo de testing
      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      const dto: ResendVerificationDto = { email: 'usuario@example.com' };
      await service.resendVerificationEmail(dto, 'tenant_test');

      // Debe haber guardado el usuario con un nuevo token
      const [, savedUser] = (manager.save as jest.Mock).mock.calls[0] as [unknown, User];
      expect(typeof savedUser.emailVerificationToken).toBe('string');
      expect(savedUser.emailVerificationToken).not.toBe('token-anterior');
      expect(savedUser.emailVerificationToken!.length).toBeGreaterThan(10);

      // Debe haber enviado el correo de verificacion
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'usuario@example.com',
          subject: expect.stringContaining('Verifica'),
        }),
      );
    });

    it('no propaga un rechazo de SMTP y lo registra sin incluir el destinatario', async () => {
      const user = buildUser({
        emailVerified: false,
        emailVerificationToken: 'token-anterior',
      } as Partial<User>);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue({}),
      });

      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;
      // El mensaje de error del SMTP puede repetir el destinatario: no debe llegar al log
      mailerService.sendMail.mockRejectedValueOnce(new Error('SMTP rechazo usuario@example.com'));
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const dto: ResendVerificationDto = { email: 'usuario@example.com' };
      await expect(service.resendVerificationEmail(dto, 'tenant_test')).resolves.toBeUndefined();

      // El rechazo se observa en la siguiente vuelta del event loop
      await new Promise((resolve) => setImmediate(resolve));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fallo en correo de verificacion de email'),
      );
      const registrado = warnSpy.mock.calls.map((llamada) => String(llamada[0])).join(' ');
      expect(registrado).not.toContain('usuario@example.com');
      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // LOGIN PLATAFORMA
  // ---------------------------------------------------------------------------

  describe('loginPlatform()', () => {
    let platformUserRepo: { findOne: jest.Mock; update: jest.Mock };

    beforeEach(() => {
      // Acceder al repositorio de PlatformUser inyectado en el servicio
      platformUserRepo = (
        service as unknown as {
          platformUserRepository: { findOne: jest.Mock; update: jest.Mock };
        }
      ).platformUserRepository;
    });

    it('retorna accessToken cuando las credenciales de plataforma son validas', async () => {
      const platformUser = {
        id: 'platform-user-uuid-1',
        emailHash: 'platform-hash',
        passwordHash: '$2b$12$hash',
        role: 'system_admin',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        lastLoginAt: null,
      };
      platformUserRepo.findOne.mockResolvedValue(platformUser);
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!', totpCode: '123456' };
      const result = await service.loginPlatform(dto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.mfaRequired).toBeUndefined();
      expect(result.refreshToken).toBeDefined();
    });

    it.each([UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION])(
      'sin MFA y en estado %s solo entrega el alcance de inscripción',
      async (status) => {
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-1',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status,
          mfaEnabled: false,
          mfaSecret: null,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await service.loginPlatform({
          email: 'admin@iwana.co',
          password: 'Passw0rd!',
          totpCode: '123456',
        });

        expect(result).toEqual({ accessToken: 'mock.jwt.token', mfaSetupRequired: true });
        expect(jwtService.sign).toHaveBeenLastCalledWith(
          expect.objectContaining({
            scope: 'platform-mfa-setup',
            credentialVersion: platformCredentialVersion('$2b$12$hash'),
          }),
          expect.anything(),
        );
        expect(mockRedis.sadd).not.toHaveBeenCalled();
      },
    );

    describe('sin oráculos por estado de la cuenta', () => {
      const compare = bcrypt.compare as jest.Mock;
      const account = (status: UserStatus) => ({
        id: 'p1',
        emailHash: 'h',
        passwordHash: '$2b$12$hash',
        status,
        passwordResetRequired: false,
        mfaEnabled: true,
        mfaSecret: null,
      });
      const attempt = () =>
        service
          .loginPlatform({ email: 'admin@iwana.co', password: 'x' })
          .then(() => null)
          .catch((error: { getResponse: () => unknown }) => error.getResponse());

      it.each([
        ['inexistente', null],
        ['activa', account(UserStatus.ACTIVE)],
        ['inactiva', account(UserStatus.INACTIVE)],
        ['suspendida', account(UserStatus.SUSPENDED)],
        ['pendiente', account(UserStatus.PENDING_VERIFICATION)],
      ])('%s: una comparación de coste 12 y el mismo 401', async (_caso, user) => {
        platformUserRepo.findOne.mockResolvedValue(user);
        compare.mockClear().mockResolvedValue(false);
        expect(await attempt()).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Credenciales invalidas.',
        });
        expect(compare).toHaveBeenCalledTimes(1);
        const hash = String(compare.mock.calls[0]?.[1]);
        expect(hash).toMatch(/^\$2[aby]\$12\$/u);
        if (!user) {
          // El hash fijo es válido: uno truncado respondería al instante.
          const real = jest.requireActual<typeof bcrypt>('bcryptjs');
          expect(real.getRounds(hash)).toBe(12);
          expect(hash).toHaveLength(60);
        }
      });

      it('inactiva con contraseña correcta responde igual que con una errónea', async () => {
        platformUserRepo.findOne.mockResolvedValue(account(UserStatus.INACTIVE));
        compare.mockResolvedValue(true);
        expect(await attempt()).toMatchObject({ statusCode: 401 });
      });

      it.each([
        ['existente', true],
        ['inexistente', false],
      ])('freno y ataque sobre una cuenta %s', async (_caso, exists) => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const internals = service as unknown as {
          platformAuditService: { log: jest.Mock };
          mailerService: { sendMail: jest.Mock };
        };
        platformUserRepo.findOne.mockResolvedValue(exists ? account(UserStatus.ACTIVE) : null);
        (platformUserRepo as unknown as { find: jest.Mock }).find.mockResolvedValue([
          { id: 'p1', email: 'titular@example.test' },
        ]);
        internals.mailerService.sendMail.mockClear();
        internals.platformAuditService.log.mockClear();
        compare.mockResolvedValue(false);
        const reservation = {
          failed: jest.fn().mockResolvedValue({ locked: true, alert: true }),
          succeeded: jest.fn(),
          release: jest.fn(),
        };
        await expect(
          service.loginPlatform(
            { email: 'admin@iwana.co', password: 'x' },
            '203.0.113.7',
            'ua',
            reservation,
          ),
        ).rejects.toMatchObject({ status: 401 });
        await new Promise(setImmediate);

        expect(reservation.failed).toHaveBeenCalledTimes(1);
        expect(reservation.succeeded).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('PLATFORM_PASSWORD_ATTACK'));
        const motives = internals.platformAuditService.log.mock.calls.map(
          ([entry]) => entry.newValue.motivo,
        );
        expect(motives).toEqual(
          exists
            ? ['CONTRASENA_INVALIDA', 'FRENO_CONTRASENA', 'ATAQUE_CONTRASENA']
            : ['USUARIO_NO_ENCONTRADO', 'FRENO_CONTRASENA'],
        );
        expect(internals.mailerService.sendMail).toHaveBeenCalledTimes(exists ? 1 : 0);
        error.mockRestore();
      });

      it('la contraseña correcta liquida el intento aunque falte el código', async () => {
        platformUserRepo.findOne.mockResolvedValue(account(UserStatus.ACTIVE));
        compare.mockResolvedValue(true);
        const reservation = { failed: jest.fn(), succeeded: jest.fn(), release: jest.fn() };
        const result = await service.loginPlatform(
          { email: 'admin@iwana.co', password: 'x' },
          '203.0.113.7',
          'ua',
          reservation,
        );
        expect(result.mfaRequired).toBe(true);
        expect(reservation.succeeded).toHaveBeenCalledTimes(1);
      });

      it('suspendida solo se revela con la contraseña correcta', async () => {
        platformUserRepo.findOne.mockResolvedValue(account(UserStatus.SUSPENDED));
        compare.mockResolvedValue(true);
        expect(await attempt()).toMatchObject({ statusCode: 403 });
      });
    });

    describe('segundo factor', () => {
      const audit = (): jest.Mock =>
        (service as unknown as { platformAuditService: { log: jest.Mock } }).platformAuditService
          .log;
      const attempt = () =>
        service.loginPlatform({
          email: 'admin@iwana.co',
          password: 'Passw0rd!',
          totpCode: '123456',
        });
      const verify = (): jest.Mock =>
        (service as unknown as { totp: { verify: jest.Mock } }).totp.verify;

      beforeEach(() => {
        platformUserRepo.findOne.mockResolvedValue({
          id: 'p1',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: UserStatus.ACTIVE,
          passwordResetRequired: false,
          mfaEnabled: true,
          mfaSecret: (service as any).encryptSecret('MFA'),
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        audit().mockClear();
      });

      it('en espera no verifica el código', async () => {
        const { sendMail } = (service as unknown as { mailerService: { sendMail: jest.Mock } })
          .mailerService;
        mockPlatformQuery.mockImplementation(platformQuery(true));
        await expect(attempt()).rejects.toMatchObject({
          status: 401,
          response: { code: 'AUTH_ACCOUNT_LOCKED' },
        });
        expect(verify()).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
      });

      it('una contraseña errónea no llega al segundo factor', async () => {
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        await expect(attempt()).rejects.toMatchObject({ status: 401 });
        expect(mockPlatformQuery).not.toHaveBeenCalled();
      });

      it('el código erróneo cuenta y el inicio de la espera se audita y se registra', async () => {
        const lockedUntil = new Date();
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        mockPlatformQuery.mockImplementation(platformQuery(false, 1, lockedUntil));
        (platformUserRepo as unknown as { find: jest.Mock }).find.mockResolvedValue([
          { id: 'p1', email: 'titular@example.test' },
          { id: 'p2', email: 'otro@example.test' },
        ]);
        // Un correo que falla no altera la respuesta ni impide el siguiente.
        const { sendMail } = (service as unknown as { mailerService: { sendMail: jest.Mock } })
          .mailerService;
        sendMail.mockRejectedValueOnce(new Error('SMTP caído'));
        verify().mockResolvedValueOnce({ valid: false });

        await expect(attempt()).rejects.toMatchObject({
          response: { code: 'AUTH_MFA_CODE_INVALID' },
        });

        expect(
          mockPlatformQuery.mock.calls.some(([sql]) =>
            String(sql).includes('mfa_failed_attempts = mfa_failed_attempts + 1'),
          ),
        ).toBe(true);
        expect(audit()).toHaveBeenCalledWith(
          expect.objectContaining({ action: AuditAction.ACCOUNT_LOCKED, entityId: 'p1' }),
        );
        expect(error).toHaveBeenCalledWith(expect.stringContaining('PLATFORM_MFA_LOCKED'));
        await new Promise(setImmediate);
        const mails = sendMail.mock.calls.map(([mail]) => mail as { to: string; text: string });
        expect(mails.map((mail) => mail.to)).toEqual(['titular@example.test', 'otro@example.test']);
        expect(mails[0]!.text).not.toContain('p1');
        expect(mails[1]!.text).toContain('p1');
        expect(JSON.stringify(mails)).not.toContain('123456');
        for (const { to: _to, ...content } of mails) {
          expect(JSON.stringify(content)).not.toContain('@example.test');
        }
        expect((platformUserRepo as unknown as { find: jest.Mock }).find).toHaveBeenCalledWith({
          where: [{ id: 'p1' }, { role: PlatformRole.SYSTEM_ADMIN, status: UserStatus.ACTIVE }],
        });
        error.mockRestore();
      });

      it('un código reutilizado o de un paso anterior da 401 y no cuenta', async () => {
        mockPlatformQuery.mockImplementation(platformQuery(false, 0));
        await expect(attempt()).rejects.toMatchObject({
          status: 401,
          response: { code: 'AUTH_MFA_CODE_INVALID' },
        });
        const statements = mockPlatformQuery.mock.calls.map(([sql]) => String(sql));
        expect(statements.some((sql) => sql.includes('mfa_failed_attempts'))).toBe(false);
        expect(audit()).toHaveBeenCalledWith(
          expect.objectContaining({ newValue: { motivo: 'MFA_CODIGO_REUTILIZADO' } }),
        );
      });

      it('si Redis falla tras consumir el código responde 503 sin sesión', async () => {
        mockRedis.set.mockRejectedValueOnce(new Error('caído'));
        await expect(attempt()).rejects.toMatchObject({ status: 503 });
        expect(
          mockPlatformQuery.mock.calls.some(([sql]) => String(sql).includes('mfa_last_used_step')),
        ).toBe(true);
      });
    });

    describe('inscripción de MFA', () => {
      const actor = () =>
        ({
          sub: 'p1',
          jti: 'j1',
          type: 'platform',
          scope: 'platform-mfa-setup',
          exp: Math.floor(Date.now() / 1000) + 600,
          credentialVersion: platformCredentialVersion('$2b$12$hash'),
        }) as JwtPayload;

      it('Redis caído responde 503 en setup y en verify', async () => {
        jest
          .spyOn(service as any, 'lockPlatformMfaEnrollment')
          .mockResolvedValue({ id: 'p1', email: 'x' });
        (platformUserRepo as any).manager = {
          transaction: (run: (m: unknown) => unknown) => run({}),
        };
        mockRedis.set.mockRejectedValueOnce(new Error('caído'));
        await expect(service.setupPlatformMfa(actor())).rejects.toMatchObject({ status: 503 });
        mockRedis.get.mockRejectedValueOnce(new Error('caído'));
        await expect(
          service.verifyPlatformMfa(actor(), { totpCode: '123456' }, {}),
        ).rejects.toMatchObject({ status: 503 });
      });
    });

    // ADR-116 (A-01 de la revisión de AI-SEC-ENG): la cuenta del CLI de arranque nace
    // PENDING_VERIFICATION. Ni el primer ingreso ni el siguiente al cambio de contraseña
    // pueden entregar una sesión completa sin enrolar MFA.
    it('cuenta del CLI de arranque: cambio de contraseña y luego solo enrolamiento MFA', async () => {
      const bootstrapAdmin = {
        id: 'platform-bootstrap-uuid',
        emailHash: 'platform-hash',
        passwordHash: '$2b$12$hash',
        role: 'SYSTEM_ADMIN',
        status: UserStatus.PENDING_VERIFICATION,
        mfaEnabled: false,
        mfaSecret: null,
        passwordResetRequired: true,
        lastLoginAt: null,
      };
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!' };

      platformUserRepo.findOne.mockResolvedValue(bootstrapAdmin);
      const first = await service.loginPlatform(dto);
      expect(first).toMatchObject({ passwordResetRequired: true });
      expect(first.refreshToken).toBeUndefined();

      platformUserRepo.findOne.mockResolvedValue({
        ...bootstrapAdmin,
        passwordResetRequired: false,
      });
      const afterChange = await service.loginPlatform(dto);
      expect(afterChange).toMatchObject({ mfaSetupRequired: true });
      expect(afterChange.refreshToken).toBeUndefined();
    });

    it('usa la clave HMAC inyectada si PII_HASH_KEY no está en process.env', async () => {
      const previousPiiHashKey = process.env.PII_HASH_KEY;
      delete process.env.PII_HASH_KEY;
      const email = 'admin-l1@example.test';
      const expectedEmailHash = hashEmail(email, Buffer.from(injectedPiiHashKeyHex, 'hex'));
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-user-uuid-1',
        emailHash: expectedEmailHash,
        passwordHash: '$2b$12$hash',
        role: 'system_admin',
        status: UserStatus.ACTIVE,
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        passwordResetRequired: false,
      });
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      try {
        await service.loginPlatform({ email, password: 'Passw0rd!' });

        expect(platformUserRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ where: { emailHash: expectedEmailHash } }),
        );
      } finally {
        if (previousPiiHashKey === undefined) {
          delete process.env.PII_HASH_KEY;
        } else {
          process.env.PII_HASH_KEY = previousPiiHashKey;
        }
      }
    });

    it('mantiene el HMAC cuando ConfigService y process.env tienen la misma clave', async () => {
      const previousPiiHashKey = process.env.PII_HASH_KEY;
      process.env.PII_HASH_KEY = injectedPiiHashKeyHex;
      const email = 'admin-l1@example.test';
      const expectedEmailHash = hashEmail(email, Buffer.from(injectedPiiHashKeyHex, 'hex'));
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-user-uuid-1',
        emailHash: expectedEmailHash,
        passwordHash: '$2b$12$hash',
        role: 'system_admin',
        status: UserStatus.ACTIVE,
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        passwordResetRequired: false,
      });
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      try {
        expect(hashEmail(email)).toBe(expectedEmailHash);
        await service.loginPlatform({ email, password: 'Passw0rd!' });

        expect(platformUserRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ where: { emailHash: expectedEmailHash } }),
        );
      } finally {
        if (previousPiiHashKey === undefined) {
          delete process.env.PII_HASH_KEY;
        } else {
          process.env.PII_HASH_KEY = previousPiiHashKey;
        }
      }
    });

    it('lanza UnauthorizedException cuando el usuario de plataforma no existe', async () => {
      platformUserRepo.findOne.mockResolvedValue(null);

      const dto = { email: 'noexiste@iwana.co', password: 'Any1pass!' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza ForbiddenException cuando la cuenta de plataforma esta suspendida', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-1',
        emailHash: 'h',
        passwordHash: 'ph',
        status: UserStatus.SUSPENDED,
        mfaEnabled: false,
      });

      const dto = { email: 'susp@iwana.co', password: 'Pass1234!' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(ForbiddenException);
    });

    it('lanza UnauthorizedException cuando la cuenta de plataforma esta inactiva', async () => {
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-2',
        emailHash: 'h',
        passwordHash: 'ph',
        status: UserStatus.INACTIVE,
        mfaEnabled: false,
      });

      const dto = { email: 'inact@iwana.co', password: 'Pass1234!' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException cuando la contrasena de plataforma es incorrecta', async () => {
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-3',
        emailHash: 'h',
        passwordHash: '$2b$12$real_hash',
        status: 'active',
        mfaEnabled: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const dto = { email: 'admin@iwana.co', password: 'WrongPass!' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('retorna mfaRequired=true cuando la cuenta tiene MFA y no se envio totpCode', async () => {
      const encryptedSecret = (service as any).encryptSecret('PLATFORMMFASECRET') as string;
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-4',
        emailHash: 'h',
        passwordHash: '$2b$12$hash',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!' };
      const result = await service.loginPlatform(dto);

      expect(result.mfaRequired).toBe(true);
      expect(result.accessToken).toBe('');
    });

    it('lanza UnauthorizedException cuando el codigo MFA de plataforma es invalido', async () => {
      const encryptedSecret = (service as any).encryptSecret('PLATFORMMFASECRET') as string;
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-5',
        emailHash: 'h',
        passwordHash: '$2b$12$hash',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest
        .spyOn(
          service as unknown as { matchTotpStep: () => Promise<number | null> },
          'matchTotpStep',
        )
        .mockResolvedValue(null);

      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!', totpCode: '000000' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException cuando MFA esta habilitado pero el secret es nulo', async () => {
      platformUserRepo.findOne.mockResolvedValue({
        id: 'pu-6',
        emailHash: 'h',
        passwordHash: '$2b$12$hash',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: null, // secret nulo — setup incompleto
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // Se envia totpCode pero el secret no esta configurado
      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!', totpCode: '123456' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    // -------------------------------------------------------------------------
    // S-8: el login de plataforma no dejaba NINGUN rastro, ni de exito ni de
    // fallo. La ruta es @Public(), asi que AuditInterceptor tampoco la cubre.
    // -------------------------------------------------------------------------

    describe('audit trail (S-8)', () => {
      function platformAuditLog(): jest.Mock {
        return (service as unknown as { platformAuditService: { log: jest.Mock } })
          .platformAuditService.log;
      }

      /** Une todos los payloads auditados en un solo string para buscar filtraciones. */
      function serializarLlamadas(): string {
        return JSON.stringify(platformAuditLog().mock.calls);
      }

      it('registra LOGIN en el trail de plataforma cuando el login es valido', async () => {
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-1',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: 'active',
          mfaEnabled: true,
          mfaSecret: (service as any).encryptSecret('MFA'),
        });
        platformUserRepo.update.mockResolvedValue({ affected: 1 });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        await service.loginPlatform(
          { email: 'admin@iwana.co', password: 'Passw0rd!', totpCode: '123456' },
          '203.0.113.10',
          'agente-de-prueba',
        );

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN,
            entityType: 'PlatformUser',
            entityId: 'platform-user-uuid-1',
            userId: 'platform-user-uuid-1',
            ipAddress: '203.0.113.10',
            userAgent: 'agente-de-prueba',
            newValue: { mfaAplicado: true },
          }),
        );
      });

      it('registra LOGIN_FAILED cuando la contrasena es incorrecta', async () => {
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-2',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: 'active',
          mfaEnabled: false,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(
          service.loginPlatform({ email: 'admin@iwana.co', password: 'ClaveIncorrecta!' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN_FAILED,
            entityType: 'PlatformUser',
            entityId: 'platform-user-uuid-2',
            userId: 'platform-user-uuid-2',
            newValue: { motivo: 'CONTRASENA_INVALIDA' },
          }),
        );
      });

      it('registra LOGIN_FAILED sin userId ni correo cuando la cuenta no existe', async () => {
        platformUserRepo.findOne.mockResolvedValue(null);

        await expect(
          service.loginPlatform({ email: 'noexiste@iwana.co', password: 'Any1pass!' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN_FAILED,
            entityId: 'USUARIO_DESCONOCIDO',
            userId: null,
            newValue: { motivo: 'USUARIO_NO_ENCONTRADO' },
          }),
        );

        // El correo tecleado es PII: no puede acabar en el trail
        expect(serializarLlamadas()).not.toContain('noexiste@iwana.co');
      });

      it('registra LOGIN_FAILED cuando la cuenta esta suspendida', async () => {
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-3',
          emailHash: 'h',
          passwordHash: 'ph',
          status: UserStatus.SUSPENDED,
          mfaEnabled: false,
        });

        await expect(
          service.loginPlatform({ email: 'susp@iwana.co', password: 'Pass1234!' }),
        ).rejects.toThrow(ForbiddenException);

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN_FAILED,
            newValue: { motivo: 'CUENTA_SUSPENDIDA' },
          }),
        );
      });

      it('registra LOGIN_FAILED cuando el codigo MFA es invalido', async () => {
        const encryptedSecret = (service as any).encryptSecret('PLATFORMMFASECRET') as string;
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-4',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: 'active',
          mfaEnabled: true,
          mfaSecret: encryptedSecret,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        jest
          .spyOn(
            service as unknown as { matchTotpStep: () => Promise<number | null> },
            'matchTotpStep',
          )
          .mockResolvedValue(null);

        await expect(
          service.loginPlatform({
            email: 'admin@iwana.co',
            password: 'Passw0rd!',
            totpCode: '000000',
          }),
        ).rejects.toThrow(UnauthorizedException);

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN_FAILED,
            newValue: { motivo: 'MFA_INVALIDO' },
          }),
        );
      });

      it('no filtra contrasena, codigo TOTP ni token en ningun payload auditado', async () => {
        const contrasena = 'ClaveDePruebaNoReal!2026';
        const totp = '424242';

        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-5',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: 'active',
          mfaEnabled: false,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(
          service.loginPlatform({
            email: 'admin@iwana.co',
            password: contrasena,
            totpCode: totp,
          }),
        ).rejects.toThrow(UnauthorizedException);

        const auditado = serializarLlamadas();
        expect(auditado).not.toContain(contrasena);
        expect(auditado).not.toContain(totp);
        expect(auditado).not.toContain('mock.jwt.token');
      });

      it('no audita como intento el reto MFA pendiente de codigo', async () => {
        const encryptedSecret = (service as any).encryptSecret('PLATFORMMFASECRET') as string;
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-user-uuid-6',
          emailHash: 'h',
          passwordHash: '$2b$12$hash',
          status: 'active',
          mfaEnabled: true,
          mfaSecret: encryptedSecret,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await service.loginPlatform({
          email: 'admin@iwana.co',
          password: 'Passw0rd!',
        });

        expect(result.mfaRequired).toBe(true);
        expect(platformAuditLog()).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // REFRESH TOKEN DE PLATAFORMA (C-6, ADR-081)
  //
  // La consola de plataforma no tiene schema de tenant: su refresh token vive en
  // Redis con las mismas garantias que el de tenant (hash, familia, rotacion,
  // deteccion de reuse attack). Sin cambios de schema de BD.
  // ---------------------------------------------------------------------------

  describe('refreshPlatformTokens() — ciclo de refresco de la consola (C-6)', () => {
    let platformUserRepo: { findOne: jest.Mock; update: jest.Mock };

    beforeEach(() => {
      platformUserRepo = (
        service as unknown as {
          platformUserRepository: { findOne: jest.Mock; update: jest.Mock };
        }
      ).platformUserRepository;
    });

    function platformRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        userId: 'platform-uuid-1',
        familyId: 'family-uuid-1',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        revokedAt: null,
        credentialVersion: platformCredentialVersion(PLATFORM_HASH),
        mfaVersion: platformCredentialVersion('MFA'),
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        ...overrides,
      };
    }

    it('rota el token y devuelve access + refresh nuevos', async () => {
      const presented = JSON.stringify(platformRecord());
      mockRedis.get.mockResolvedValue(presented);
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash: PLATFORM_HASH,
        passwordResetRequired: false,
      });

      const result = await service.refreshPlatformTokens('synthetic.platform.refresh.token');

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeTruthy();
      // Rotacion: se revoca el presentado y se crea el nuevo en la misma familia
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('GET', KEYS[1])"),
        1,
        expect.stringContaining('platform:refresh:token:'),
        presented,
        expect.stringMatching(/"revokedAt":"[^"]+"/),
        expect.any(String),
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'platform:refresh:family:family-uuid-1',
        expect.any(String),
      );
      // El sucesor hereda la huella: sin ella no sobreviviría a la siguiente renovación.
      const successor = mockRedis.set.mock.calls.find(([key]) =>
        String(key).startsWith('platform:refresh:token:'),
      );
      expect(JSON.parse(String(successor?.[1]))).toMatchObject({
        familyId: 'family-uuid-1',
        revokedAt: null,
        credentialVersion: platformCredentialVersion(PLATFORM_HASH),
      });
      // El registro revocado conserva el TTL completo para detectar reuso.
      expect(Number(mockRedis.eval.mock.calls[0]?.[5])).toBeGreaterThanOrEqual(
        Number(successor?.[3]),
      );
      // 12 h desde el ingreso, hace un minuto: ni 7 días ni un inicio nuevo.
      expect(Number(successor?.[3])).toBeLessThanOrEqual(12 * 3600 - 60);
      expect(JSON.parse(String(successor?.[1])).startedAt).toBe(JSON.parse(presented).startedAt);
    });

    it.each([
      ['la contraseña cambió', {}, { passwordHash: '$2b$12$otro' }],
      ['el registro no tiene huella', { credentialVersion: undefined }, {}],
      ['hay cambio de contraseña pendiente', {}, { passwordResetRequired: true }],
      ['la cuenta no tiene MFA', {}, { mfaEnabled: false, mfaSecret: null }],
      ['la sesión es anterior al MFA', { mfaVersion: undefined }, {}],
      ['el MFA se reinscribió', { mfaVersion: 'otra' }, {}],
    ])('rechaza y no emite sucesor cuando %s', async (_caso, record, user) => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord(record)));
      mockRedis.smembers.mockResolvedValue(['hash-1']);
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash: PLATFORM_HASH,
        passwordResetRequired: false,
        ...user,
      });

      await expect(service.refreshPlatformTokens('synthetic.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.eval).not.toHaveBeenCalled();
      expect(mockRedis.sadd).not.toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-1');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:family:family-uuid-1');
    });

    it.each<[string, Record<string, unknown>]>([
      ['no se conoce su inicio', { startedAt: undefined }],
      ['su inicio no es una fecha', { startedAt: 'x' }],
      ['su inicio está en el futuro', { startedAt: new Date(Date.now() + 60_000).toISOString() }],
      [
        'superó las 12 horas, aunque el registro esté vencido',
        {
          startedAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    ])('la sesión terminó cuando %s: borra cookies, revoca y no emite', async (_caso, record) => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord(record)));
      mockRedis.smembers.mockResolvedValue(['hash-1']);

      await expect(service.refreshPlatformTokens('synthetic.token')).rejects.toBeInstanceOf(
        SessionEndedException,
      );
      expect(mockRedis.eval).not.toHaveBeenCalled();
      expect(mockRedis.sadd).not.toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'platform:refresh:family-revoked:family-uuid-1',
        '1',
        'EX',
        expect.any(Number),
      );
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-1');
    });

    describe('reloj controlado: el access nunca vence después del máximo', () => {
      const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const pem = { type: 'pkcs8', format: 'pem' } as const;
      const base = Date.parse('2026-11-25T12:00:00Z');
      let clock: number;
      let spy: jest.SpyInstance;

      beforeEach(() => {
        clock = base;
        spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
        (service as unknown as { jwtService: JwtService }).jwtService = new JwtService({
          privateKey: keys.privateKey.export(pem) as string,
        });
      });
      afterEach(() => spy.mockRestore());

      const expOf = (token: string): number =>
        (new JwtService({}).decode(token) as { exp: number }).exp * 1000;

      const platform = (wait: number): Promise<{ accessToken: string; cookieTtl: any }> => {
        mockRedis.get.mockResolvedValue(
          JSON.stringify(
            platformRecord({
              startedAt: new Date(base - 12 * 3600_000 + 100_000).toISOString(),
              expiresAt: new Date(base + 100_000_000_000).toISOString(),
            }),
          ),
        );
        mockRedis.smembers.mockResolvedValue(['hash-1']);
        mockRedis.exists.mockResolvedValueOnce(0).mockImplementationOnce(async () => {
          clock += wait;
          return 0;
        });
        platformUserRepo.findOne.mockResolvedValue({
          id: 'platform-uuid-1',
          status: UserStatus.ACTIVE,
          role: 'system_admin',
          mfaEnabled: true,
          mfaSecret: (service as any).encryptSecret('MFA'),
          passwordHash: PLATFORM_HASH,
          passwordResetRequired: false,
        });
        return service.refreshPlatformTokens('synthetic.token');
      };

      const tenant = (wait: number) => {
        const { manager } = setupRunInTenantSchema({
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'rt',
              userId: 'user-uuid-1',
              familyId: 'family-uuid-1',
              revokedAt: null,
              expiresAt: new Date(base + 100_000_000_000),
            })
            .mockResolvedValueOnce(buildUser()),
          query: jest
            .fn()
            .mockResolvedValue([{ started: new Date(base - 30 * 86_400_000 + 100_000) }]),
          save: jest.fn(async () => {
            clock += wait;
            return {};
          }),
        });
        return { manager, run: () => service.refreshTokens('x'.repeat(96)) };
      };

      it.each([
        ['plataforma', () => platform(60_000)],
        ['empresa', () => tenant(60_000).run()],
      ])('%s: lo que tardó la renovación se descuenta', async (_caso, run) => {
        const result = await run();
        expect(expOf(result.accessToken)).toBeLessThanOrEqual(base + 100_000);
        expect(result.cookieTtl).toMatchObject({ accessSeconds: 40, refreshSeconds: 40 });
      });

      it('plataforma: si venció durante la renovación, revoca la familia y termina', async () => {
        await expect(platform(100_000)).rejects.toBeInstanceOf(SessionEndedException);
        expect(mockRedis.set).toHaveBeenCalledWith(
          'platform:refresh:family-revoked:family-uuid-1',
          '1',
          'EX',
          expect.any(Number),
        );
      });

      it('empresa: si venció durante la renovación, confirma la revocación y termina', async () => {
        const { manager, run } = tenant(100_000);
        let committed = false;
        const inner = mockRunInTenantSchema.getMockImplementation()!;
        mockRunInTenantSchema.mockImplementation(async (...args: unknown[]) => {
          const result = await (inner as (...a: unknown[]) => Promise<unknown>)(...args);
          committed = true;
          return result;
        });
        await expect(run()).rejects.toBeInstanceOf(SessionEndedException);
        expect(committed).toBe(true);
        expect(manager['update']).toHaveBeenLastCalledWith(
          RefreshToken,
          expect.objectContaining({ familyId: 'family-uuid-1' }),
          expect.objectContaining({ revokeReason: 'SESSION_MAX' }),
        );
      });
    });

    it('el login guarda la huella, nunca el hash de la contraseña', async () => {
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash: PLATFORM_HASH,
        passwordResetRequired: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.loginPlatform({
        email: 'admin@example.test',
        password: 'Sintetica123!',
        totpCode: '123456',
      });

      const call = mockRedis.set.mock.calls.find(([key]) =>
        String(key).startsWith('platform:refresh:token:'),
      );
      expect(JSON.parse(String(call?.[1]))).toMatchObject({
        credentialVersion: platformCredentialVersion(PLATFORM_HASH),
        mfaVersion: platformCredentialVersion('MFA'),
      });
      expect(String(call?.[1])).not.toContain(PLATFORM_HASH);
    });

    it('rechaza el sucesor creado mientras se revocaba su familia', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.exists.mockResolvedValue(1);

      await expect(service.refreshPlatformTokens('synthetic.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.exists).toHaveBeenCalledWith(
        'platform:refresh:family-revoked:family-uuid-1',
      );
      expect(mockRedis.eval).not.toHaveBeenCalled();
      expect(mockRedis.sadd).not.toHaveBeenCalled();
    });

    it('renovar con la cuenta no activa revoca la familia', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.SUSPENDED,
      });

      await expect(service.refreshPlatformTokens('synthetic.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:family:family-uuid-1');
    });

    it('el logout marca la familia antes de borrarla: cubre al sucesor en vuelo', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.smembers.mockResolvedValue(['hash-1']);

      await service.logout(
        {
          sub: 'platform-uuid-1',
          type: 'platform',
          jti: 'jti-1',
          exp: 0,
          schemaName: 'x',
        } as never,
        undefined,
        'synthetic.token',
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'platform:refresh:family-revoked:family-uuid-1',
        '1',
        'EX',
        expect.any(Number),
      );
      // La marca debe sobrevivir a cualquier sucesor emitido en paralelo.
      const { refreshTokenTtlSeconds } = service as unknown as { refreshTokenTtlSeconds: number };
      expect(Number(mockRedis.set.mock.calls[0]?.[3])).toBeGreaterThan(refreshTokenTtlSeconds);
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:family:family-uuid-1');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-1');
      expect(mockRedis.set.mock.invocationCallOrder[0]).toBeLessThan(
        mockRedis.smembers.mock.invocationCallOrder[0]!,
      );
    });

    it('si la familia se revoca mientras se emite el sucesor, no entrega tokens', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.exists.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash: PLATFORM_HASH,
        passwordResetRequired: false,
      });
      jwtService.sign.mockClear();

      await expect(service.refreshPlatformTokens('synthetic.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.sadd).toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('el logout revoca la familia antes de anotar el JTI: un fallo deja reintentar', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.set.mockRejectedValueOnce(new Error('redis caído'));

      await expect(
        service.logout(
          {
            sub: 'platform-uuid-1',
            type: 'platform',
            jti: 'jti-1',
            exp: Math.floor(Date.now() / 1000) + 600,
            schemaName: 'x',
          } as never,
          undefined,
          'synthetic.token',
        ),
      ).rejects.toThrow('redis caído');
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).not.toHaveBeenCalledWith(
        'jti:blacklist:jti-1',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('quien pierde la carrera de rotación recibe 401 y no obtiene sucesor', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.eval.mockResolvedValue(0);
      platformUserRepo.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash: PLATFORM_HASH,
        passwordResetRequired: false,
      });

      const error: unknown = await service
        .refreshPlatformTokens('synthetic.token')
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).not.toBeInstanceOf(SessionEndedException);
      expect(mockRedis.sadd).not.toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      // Paridad con el portal: perder la carrera no revoca la familia.
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('detecta reuse attack y revoca la familia completa', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify(platformRecord({ revokedAt: new Date().toISOString() })),
      );
      mockRedis.smembers.mockResolvedValue(['hash-1', 'hash-2']);

      await expect(
        service.refreshPlatformTokens('synthetic.platform.reused.token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-1');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-2');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:family:family-uuid-1');
    });

    it('lanza UnauthorizedException cuando el token no existe en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.refreshPlatformTokens('synthetic.unknown.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException cuando el token esta expirado', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify(platformRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
      );

      await expect(service.refreshPlatformTokens('synthetic.expired.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // REFRESH TOKEN — branches adicionales
  // ---------------------------------------------------------------------------

  describe('refreshTokens() — branches adicionales', () => {
    it('lanza UnauthorizedException cuando el refresh token no existe en DB', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const rawToken = 'c'.repeat(96);
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException cuando el refresh token esta expirado', async () => {
      const rawToken = 'd'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      const expiredToken = {
        id: 'rt-expired',
        userId: 'user-uuid-1',
        tokenHash: hashedToken,
        familyId: 'family-uuid-expired',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // ya expiro
      };

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(expiredToken),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException cuando el usuario no esta activo al refrescar', async () => {
      const rawToken = 'e'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      const validToken = {
        id: 'rt-valid',
        userId: 'user-uuid-suspended',
        tokenHash: hashedToken,
        familyId: 'family-uuid-2',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      };

      const suspendedUser = buildUser({ status: 'suspended' as any });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValueOnce(validToken).mockResolvedValueOnce(suspendedUser),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // RECUPERACION DE CONTRASENA
  // ---------------------------------------------------------------------------

  describe('forgotPassword()', () => {
    it('retorna void sin error cuando el email no existe (OWASP — no revelar existencia)', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.forgotPassword({ email: 'noexiste@example.com' }),
      ).resolves.toBeUndefined();
    });

    it('S-2: no emite token a una cuenta PENDING_VERIFICATION (importado sin invitar); respuesta idéntica', async () => {
      const user = buildUser({ status: UserStatus.PENDING_VERIFICATION });
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });
      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      await expect(service.forgotPassword({ email: 'test@example.com' })).resolves.toBeUndefined();

      // Sin token no hay enlace con el que resetPassword pueda activar la cuenta: solo la
      // invitación del administrador activa a un usuario importado de UISP.
      expect(manager.update).not.toHaveBeenCalled();
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });

    it('ADR-117 D6: no emite enlace a un correo sin verificar; respuesta idéntica', async () => {
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser({ emailVerified: false })),
      });

      await expect(service.forgotPassword({ email: 'a@demo.co' })).resolves.toBeUndefined();
      expect(manager['update']).not.toHaveBeenCalled();
    });

    it('genera el token de reset y envia el correo cuando el usuario existe', async () => {
      const user = buildUser();

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      await service.forgotPassword({ email: 'test@example.com' });

      // Debe haber actualizado al usuario con el token de reset (TTL propio, SEC-03)
      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetTokenExpiresAt: expect.any(Date),
        }),
      );

      const updatePayload = (manager.update as jest.Mock).mock.calls[0]![2] as Record<
        string,
        unknown
      >;
      expect(updatePayload).not.toHaveProperty('passwordResetExpiresAt');

      // Debe haber llamado a sendMail (fire-and-forget)
      // Nota: el void no garantiza espera, pero el mock se registra igualmente
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
        }),
      );
    });

    it('SEC-03: no pisa passwordResetExpiresAt de credencial temporal (+20h)', async () => {
      const tempExpiresAt = new Date(Date.now() + 20 * 60 * 60 * 1000);
      const user = buildUser({
        passwordResetRequired: true,
        passwordResetExpiresAt: tempExpiresAt,
      });

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const before = Date.now();
      await service.forgotPassword({ email: 'test@example.com' });
      const after = Date.now();

      const updatePayload = (manager.update as jest.Mock).mock.calls[0]![2] as {
        passwordResetToken: string;
        passwordResetTokenExpiresAt: Date;
        passwordResetExpiresAt?: Date;
      };

      expect(updatePayload.passwordResetExpiresAt).toBeUndefined();
      expect(user.passwordResetExpiresAt).toEqual(tempExpiresAt);

      const tokenTtlMs = updatePayload.passwordResetTokenExpiresAt.getTime() - before;
      // TTL ~1h (PASSWORD_RESET_TOKEN_TTL_MS), no 24h de credencial temporal
      expect(tokenTtlMs).toBeGreaterThanOrEqual(55 * 60 * 1000);
      expect(tokenTtlMs).toBeLessThanOrEqual(65 * 60 * 1000 + (after - before));
    });
  });

  describe('resetPassword()', () => {
    it('lanza UnauthorizedException cuando el token de reset no existe', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.resetPassword({
          token: 'token-invalido',
          newPassword: 'NuevoPass1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('bloquea la fila del token: otro canje o un restablecimiento no se pisan', async () => {
      const user = buildUser({
        passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      const { manager } = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      await service.resetPassword({ token: 't', newPassword: 'NuevoPass1!' });

      expect(manager.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('lanza UnauthorizedException cuando el token de reset esta expirado', async () => {
      const user = buildUser({
        passwordResetToken: 'token-expirado',
        passwordResetTokenExpiresAt: new Date(Date.now() - 60_000), // expirado hace 1 minuto
      });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.resetPassword({
          token: 'token-expirado',
          newPassword: 'NuevoPass1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('actualiza la contrasena y revoca refresh tokens cuando el token es valido', async () => {
      const user = buildUser({
        passwordResetToken: 'token-valido-hex',
        passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // expira en 30 min
      });

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.resetPassword({
        token: 'token-valido-hex',
        newPassword: 'NuevoPass1!',
      });

      // Debe actualizar la contrasena del usuario
      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({
          passwordHash: expect.any(String),
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          passwordResetExpiresAt: null,
          passwordResetRequired: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );

      // Debe revocar los refresh tokens
      expect(manager.update).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ userId: user.id }),
        expect.objectContaining({ revokeReason: 'PASSWORD_CHANGE' }),
      );
    });

    describe('activación por invitación (crear la contraseña prueba el correo)', () => {
      /** Corre un reset válido para un usuario en `status` y devuelve el payload del UPDATE. */
      async function resetFrom(status: UserStatus): Promise<Record<string, unknown>> {
        const user = buildUser({
          status,
          emailVerified: false,
          emailVerificationToken: 'verificacion-vieja',
          passwordResetRequired: true,
          passwordResetToken: 'token-invitacion',
          passwordResetTokenExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        });
        const { manager } = setupRunInTenantSchema({
          findOne: jest.fn().mockResolvedValue(user),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        });
        await service.resetPassword({ token: 'token-invitacion', newPassword: 'NuevoPass1!' });
        const call = (manager.update as jest.Mock).mock.calls.find(([entity]) => entity === User);
        return call?.[2] as Record<string, unknown>;
      }

      it('PENDING_VERIFICATION queda ACTIVE, con correo verificado y sin exigir cambio', async () => {
        const update = await resetFrom(UserStatus.PENDING_VERIFICATION);
        expect(update).toMatchObject({
          status: UserStatus.ACTIVE,
          emailVerified: true,
          emailVerificationToken: null,
          passwordResetRequired: false,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        });
      });

      it('audita la activación sin el token', async () => {
        await resetFrom(UserStatus.PENDING_VERIFICATION);
        const auditService = (service as unknown as { auditService: { log: jest.Mock } })
          .auditService;
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PASSWORD_RESET_COMPLETED',
            newValue: { status: UserStatus.ACTIVE, emailVerified: true },
          }),
        );
        expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('token-invitacion');
      });

      it('un usuario ACTIVE sigue ACTIVE (olvidé mi contraseña no cambia el estado)', async () => {
        const update = await resetFrom(UserStatus.ACTIVE);
        expect(update).not.toHaveProperty('status');
        expect(update).not.toHaveProperty('emailVerified');
        expect(update).toMatchObject({ passwordResetRequired: false });
      });

      it.each([UserStatus.INACTIVE, UserStatus.SUSPENDED])(
        'un usuario %s no se activa por esta vía',
        async (status) => {
          const update = await resetFrom(status);
          expect(update).not.toHaveProperty('status');
          expect(update).not.toHaveProperty('emailVerified');
          expect(update).not.toHaveProperty('emailVerificationToken');
        },
      );
    });

    it('envia correo de confirmacion cuando el DTO incluye email', async () => {
      const user = buildUser({
        passwordResetToken: 'token-valido-con-email',
        passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      await service.resetPassword({
        token: 'token-valido-con-email',
        newPassword: 'NuevoPass1!',
        email: 'usuario@example.com',
      });

      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'usuario@example.com' }),
      );
    });
  });

  describe('contraseña temporal del portal (ADR-117)', () => {
    const temporary = (overrides: Partial<User> = {}) =>
      buildUser({ passwordResetRequired: true, mfaRequired: true, ...overrides });

    it('entrega solo el token password-change, sin refresh y antes de configurar MFA', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(temporary()),
      });

      const result = await service.login({ email: 'a@demo.co', password: 'Temporal1!' });

      expect(result).toEqual({
        accessToken: 'mock.jwt.token',
        passwordResetRequired: true,
        refreshToken: '',
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'password-change', type: 'tenant' }),
        expect.anything(),
      );
      expect(manager['save']).not.toHaveBeenCalled();
    });

    it('con MFA activo exige el código antes de entregar el token', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(temporary({ mfaEnabled: true })),
      });
      jwtService.sign.mockClear();

      const result = await service.login({ email: 'a@demo.co', password: 'Temporal1!' });

      expect(result).toEqual({ accessToken: '', mfaRequired: true, refreshToken: '' });
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('no emite nada si la contraseña se restableció mientras se validaba', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(buildUser())
          .mockResolvedValueOnce(buildUser({ passwordHash: 'otro-hash' })),
      });

      await expect(service.login({ email: 'a@demo.co', password: 'Passw0rd!' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it.each([
      ['activa una cuenta pendiente', UserStatus.PENDING_VERIFICATION, true, UserStatus.ACTIVE],
      ['no toca una cuenta suspendida', UserStatus.SUSPENDED, true, undefined],
      ['sin cambio obligatorio no activa', UserStatus.PENDING_VERIFICATION, false, undefined],
    ])('el cambio %s', async (_caso, status, passwordResetRequired, expected) => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const user = buildUser({ status, passwordResetRequired });
      const { manager } = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      await service.changePassword(tenantActor(user.id), {
        currentPassword: 'Temporal1!',
        newPassword: 'Definitiva1!',
      });

      const [, , patch] = manager['update']!.mock.calls[0] as [unknown, unknown, Partial<User>];
      expect(patch.status).toBe(expected);
      expect(patch).not.toHaveProperty('emailVerified');
    });

    it('rechaza repetir la contraseña temporal', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const user = temporary();
      const { manager } = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      await expect(
        service.changePassword(tenantActor(user.id), {
          currentPassword: 'Temporal1!',
          newPassword: 'Temporal1!',
        }),
      ).rejects.toThrow('diferente de la temporal');
      expect(manager['update']).not.toHaveBeenCalled();
    });
  });

  describe('changePassword()', () => {
    it('cambia la contrasena cuando la contrasena actual es correcta', async () => {
      const user = buildUser();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.changePassword(tenantActor(user.id), {
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      });

      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );
    });

    it('lanza NotFoundException cuando el usuario no existe al cambiar contrasena', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.changePassword(tenantActor('ghost-uuid'), {
          currentPassword: 'OldPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza UnauthorizedException cuando la contrasena actual es incorrecta', async () => {
      const user = buildUser();
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.changePassword(tenantActor(user.id), {
          currentPassword: 'WrongPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow('La contraseña actual no coincide con la que usas para iniciar sesión.');
    });

    it('P-05: pone el jti en curso en blacklist en la rama de tenant', async () => {
      const user = buildUser();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.changePassword(tenantActor(user.id), {
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'jti:blacklist:jti-tenant-test',
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('P-05: limpia el contador de fallos al cambiar con exito', async () => {
      const user = buildUser({ failedLoginAttempts: 3 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.changePassword(tenantActor(user.id), {
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      });

      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
      );
    });

    it('P-09: cuenta el fallo de currentPassword en change-password', async () => {
      // Mismo arreglo que login (D1): el incremento es el UPDATE atómico
      // `UPDATE ... RETURNING`; la expectativa anterior (manager.update con
      // { failedLoginAttempts: 1 }) describía la implementación rota.
      const user = buildUser({ failedLoginAttempts: 0 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([[{ failed_login_attempts: 1, locked_until: null }], 1]),
      });

      await expect(
        service.changePassword(tenantActor(user.id), {
          currentPassword: 'WrongPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = failed_login_attempts + 1'),
        expect.arrayContaining([user.id]),
      );
    });

    it('P-09: rechaza change-password cuando la cuenta esta en lockout', async () => {
      const user = buildUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      (bcrypt.compare as jest.Mock).mockClear();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await expect(
        service.changePassword(tenantActor(user.id), {
          currentPassword: 'OldPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow('Cuenta bloqueada temporalmente');

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // MOD01 — primer ingreso con la credencial de arranque
  // ---------------------------------------------------------------------------

  describe('primer ingreso de plataforma (passwordResetRequired)', () => {
    let platformUserRepo: { findOne: jest.Mock; update: jest.Mock };

    /** Usuario de plataforma con la credencial de arranque sin cambiar. */
    function buildPlatformUser(overrides: Record<string, unknown> = {}) {
      return {
        id: 'platform-uuid-1',
        emailHash: 'platform-hash',
        passwordHash: '$2b$12$hash',
        role: 'system_admin',
        status: UserStatus.ACTIVE,
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        passwordResetRequired: true,
        ...overrides,
      };
    }

    beforeEach(() => {
      platformUserRepo = (
        service as unknown as {
          platformUserRepository: { findOne: jest.Mock; update: jest.Mock };
        }
      ).platformUserRepository;
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('el login devuelve passwordResetRequired y NO entrega una sesion completa', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

      const result = await service.loginPlatform({
        email: 'admin@example.test',
        password: 'CredencialArranque1!',
      });

      expect(result.passwordResetRequired).toBe(true);
      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('el token emitido lleva scope password-change: no abre la consola', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

      await service.loginPlatform({
        email: 'admin@example.test',
        password: 'CredencialArranque1!',
      });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'platform',
          scope: 'password-change',
          passwordResetRequired: true,
        }),
        expect.objectContaining({ audience: JWT_CLAIMS_BY_TOKEN_TYPE.platform.audience }),
      );
    });

    it('el cambio de contrasena va ANTES que el MFA (§3.3): no pide TOTP todavia', async () => {
      // Vincular un segundo factor a una cuenta cuya primera credencial es
      // conocida ampliaria la ventana en vez de cerrarla.
      platformUserRepo.findOne.mockResolvedValue(
        buildPlatformUser({ mfaEnabled: true, mfaSecret: null }),
      );

      const result = await service.loginPlatform({
        email: 'admin@example.test',
        password: 'CredencialArranque1!',
      });

      expect(result.passwordResetRequired).toBe(true);
      expect(result.mfaRequired).toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // Auditoria del primer ingreso — defecto detectado al fusionar MOD01 con S-8
    // -------------------------------------------------------------------------
    //
    // El `return` del primer ingreso se inserto por encima del `log()` de LOGIN
    // que S-8 emite al cierre del metodo. Git fusiono ambos lados sin marcar
    // conflicto: el resultado compilaba, pasaba los tests de las dos ramas y
    // dejaba sin rastro el unico ingreso que usa una credencial conocida por
    // todo el que despliega. Estos casos son la red que lo impide.

    describe('auditoria del primer ingreso', () => {
      function platformAuditLog(): jest.Mock {
        return (service as unknown as { platformAuditService: { log: jest.Mock } })
          .platformAuditService.log;
      }

      it('deja fila LOGIN aunque el metodo retorne antes del bloque MFA', async () => {
        platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

        await service.loginPlatform(
          { email: 'admin@example.test', password: 'CredencialArranque1!' },
          '203.0.113.10',
          'agente-de-prueba',
        );

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN,
            entityType: 'PlatformUser',
            entityId: 'platform-uuid-1',
            userId: 'platform-uuid-1',
            ipAddress: '203.0.113.10',
            userAgent: 'agente-de-prueba',
          }),
        );
      });

      it('la fila distingue el primer ingreso del login ordinario', async () => {
        // Sin esto el trail no permitiria separar el ingreso con la credencial
        // de arranque de cualquier otro login de plataforma.
        platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

        await service.loginPlatform({
          email: 'admin@example.test',
          password: 'CredencialArranque1!',
        });

        expect(platformAuditLog()).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.LOGIN,
            newValue: expect.objectContaining({ passwordResetRequired: true }),
          }),
        );
      });

      it('emite exactamente un LOGIN: el camino no cae ademas en el del cierre', async () => {
        platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

        await service.loginPlatform({
          email: 'admin@example.test',
          password: 'CredencialArranque1!',
        });

        const logins = platformAuditLog().mock.calls.filter(
          ([entrada]: [{ action: string }]) => entrada.action === AuditAction.LOGIN,
        );

        expect(logins).toHaveLength(1);
      });

      it('no filtra la contrasena, el token ni el correo en la fila', async () => {
        platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

        await service.loginPlatform({
          email: 'admin@example.test',
          password: 'CredencialArranque1!',
        });

        const auditado = JSON.stringify(platformAuditLog().mock.calls);

        expect(auditado).not.toContain('CredencialArranque1!');
        expect(auditado).not.toContain('admin@example.test');
        expect(auditado).not.toContain('mock.jwt.token');
        expect(auditado).not.toContain('$2b$12$hash');
      });

      // No se prueba "el fallo del sink no bloquea el login": `PlatformAuditService.log()`
      // atrapa sus propios errores y nunca rechaza, asi que forzar el rechazo con el
      // mock probaria el mock, no el servicio. Por eso el `await` va desnudo aqui,
      // igual que en el resto de llamadas de auditoria de este metodo.
    });

    it('una credencial incorrecta sigue fallando aunque la marca este activa', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.loginPlatform({ email: 'admin@example.test', password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('sin la marca, el login de plataforma sigue su curso normal', async () => {
      platformUserRepo.findOne.mockResolvedValue(
        buildPlatformUser({ passwordResetRequired: false }),
      );

      const result = await service.loginPlatform({
        email: 'admin@example.test',
        password: 'ContrasenaElegida1!',
      });

      expect(result.passwordResetRequired).toBeUndefined();
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ passwordResetRequired: false }),
        expect.anything(),
      );
      expect(jwtService.sign).not.toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'password-change' }),
        expect.anything(),
      );
    });

    it('changePassword de plataforma limpia la marca en la misma escritura del hash', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

      await service.changePassword(platformActor(), {
        currentPassword: 'CredencialArranque1!',
        newPassword: 'ContrasenaElegida1!',
      });

      expect(platformUserRepo.update).toHaveBeenCalledWith(
        { id: 'platform-uuid-1', passwordHash: '$2b$12$hash', deletedAt: IsNull() },
        { passwordHash: expect.any(String), passwordResetRequired: false },
      );
    });

    it('changePassword de plataforma responde 409 si la contraseña cambió en paralelo', async () => {
      platformUserRepo.findOne.mockResolvedValue(
        buildPlatformUser({ passwordResetRequired: false }),
      );
      platformUserRepo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.changePassword(
          {
            sub: 'platform-uuid-1',
            type: 'platform',
            jti: 'jti-1',
            exp: Math.floor(Date.now() / 1000) + 600,
          } as never,
          { currentPassword: 'CredencialArranque1!', newPassword: 'ContrasenaElegida1!' },
        ),
      ).rejects.toThrow(ConflictException);
      expect(platformUserRepo.update).toHaveBeenCalledWith(
        { id: 'platform-uuid-1', passwordHash: '$2b$12$hash', deletedAt: IsNull() },
        expect.anything(),
      );
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('la activación pendiente exige estado, marca y contraseña vigentes', async () => {
      platformUserRepo.findOne.mockResolvedValue(
        buildPlatformUser({ status: UserStatus.PENDING_VERIFICATION }),
      );
      platformUserRepo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.changePassword(platformActor(), {
          currentPassword: 'CredencialArranque1!',
          newPassword: 'ContrasenaElegida1!',
        }),
      ).rejects.toThrow('La contraseña temporal ya se cambió. Inicia sesión de nuevo.');
      expect(platformUserRepo.update).toHaveBeenCalledWith(
        {
          id: 'platform-uuid-1',
          deletedAt: IsNull(),
          status: UserStatus.PENDING_VERIFICATION,
          passwordHash: '$2b$12$hash',
          passwordResetRequired: true,
        },
        expect.anything(),
      );
    });

    it('changePassword de plataforma NO resuelve el usuario por TenantContext', async () => {
      // TenantContext.getOrThrow() lanza un Error generico (→ HTTP 500) fuera de
      // un schema de tenant: por ahi el primer ingreso se caeria con un 500.
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());
      mockTenantContextGetOrThrow.mockClear();

      await service.changePassword(platformActor(), {
        currentPassword: 'CredencialArranque1!',
        newPassword: 'ContrasenaElegida1!',
      });

      expect(mockTenantContextGetOrThrow).not.toHaveBeenCalled();
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('changePassword de plataforma revoca el token de alcance limitado que lo trajo', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());

      await service.changePassword(platformActor({ jti: 'jti-scoped-1' }), {
        currentPassword: 'CredencialArranque1!',
        newPassword: 'ContrasenaElegida1!',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'jti:blacklist:jti-scoped-1',
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('changePassword de plataforma rechaza una contrasena actual incorrecta', async () => {
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(platformActor(), {
          currentPassword: 'incorrecta',
          newPassword: 'ContrasenaElegida1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(platformUserRepo.update).not.toHaveBeenCalled();
    });

    it('changePassword de plataforma lanza NotFound si la cuenta ya no existe', async () => {
      platformUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword(platformActor(), {
          currentPassword: 'CredencialArranque1!',
          newPassword: 'ContrasenaElegida1!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('el audit trail registra el evento sin ningun valor de credencial', async () => {
      // Precedente real: migraciones 074 (tenant) y 012 (publica) existen porque
      // una contrasena llego en claro al trail. El evento se audita; los valores no.
      //
      // Y va por el sink PUBLICO: `AuditService.log()` descarta en silencio toda
      // entrada sin TenantContext, que es justo el caso de una cuenta de
      // plataforma. Por ahi el evento se perdia sin que nada fallara.
      platformUserRepo.findOne.mockResolvedValue(buildPlatformUser());
      const auditLog = (service as unknown as { platformAuditService: { log: jest.Mock } })
        .platformAuditService.log;
      const tenantAuditLog = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService.log;
      auditLog.mockClear();
      tenantAuditLog.mockClear();

      await service.changePassword(platformActor(), {
        currentPassword: 'CredencialArranque1!',
        newPassword: 'ContrasenaElegida1!',
      });

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(tenantAuditLog).not.toHaveBeenCalled();
      const payload = auditLog.mock.calls[0][0] as Record<string, unknown>;
      expect(payload['action']).toBe('PASSWORD_CHANGED');
      expect(payload['entityType']).toBe('PlatformUser');
      expect(payload['oldValue']).toBeUndefined();
      expect(payload['newValue']).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain('CredencialArranque1!');
      expect(JSON.stringify(payload)).not.toContain('ContrasenaElegida1!');
    });
  });

  // ---------------------------------------------------------------------------
  // BRANCHES adicionales
  // ---------------------------------------------------------------------------

  describe('login() — branch INACTIVE', () => {
    it('lanza UnauthorizedException cuando el usuario tiene estado INACTIVE', async () => {
      const user = buildUser({ status: UserStatus.INACTIVE });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto = { email: 'inact@example.com', password: 'Passw0rd!' };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('regenerateTenantAdminCredentials() — branch adminUser no encontrado', () => {
    it('lanza NotFoundException cuando el admin inicial no existe en el tenant', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.regenerateTenantAdminCredentials({
          tenantId: 'tenant-uuid-2',
          schemaName: 'tenant_test',
          idempotencyKey: 'idem-key-no-admin',
          ...credentialActor,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('decryptSecret() — branch formato invalido', () => {
    it('lanza Error cuando el mfaSecret tiene formato incorrecto (no iv:tag:ciphertext)', () => {
      // Llamar al metodo privado directamente para cubrir el branch de validacion
      expect(() => {
        (service as any).decryptSecret('solo-dos:partes');
      }).toThrow('Formato de mfaSecret cifrado invalido');
    });
  });

  // ---------------------------------------------------------------------------
  // MOD02 — MFA ENFORCEMENT POR ROL CRITICO (RF-AUTH-04, RF-MFA-04)
  // ---------------------------------------------------------------------------

  describe('login() — MFA enforcement MOD02', () => {
    it('retorna mfaSetupRequired=true para ADMIN sin MFA configurado', async () => {
      // ADMIN activo, sin MFA habilitado — debe recibir token de alcance limitado
      const user = buildUser({ role: UserRole.ADMIN, mfaEnabled: false, mfaRequired: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      const dto: LoginDto = { email: 'admin@tenant.co', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.mfaSetupRequired).toBe(true);
      // El access token es emitido (token limitado scope=mfa-setup)
      expect(result.accessToken).toBe('mock.jwt.token');
      // NO se emite refresh token en el flujo de mfa-setup
      expect(result.refreshToken).toBe('');
    });

    it('retorna mfaSetupRequired=true para NOC sin MFA configurado', async () => {
      const user = buildUser({ role: UserRole.NOC, mfaEnabled: false, mfaRequired: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      const dto: LoginDto = { email: 'noc@tenant.co', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.mfaSetupRequired).toBe(true);
    });

    it('retorna mfaSetupRequired=true para ACCOUNTANT sin MFA configurado', async () => {
      const user = buildUser({ role: UserRole.ACCOUNTANT, mfaEnabled: false, mfaRequired: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      const dto: LoginDto = { email: 'accountant@tenant.co', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.mfaSetupRequired).toBe(true);
    });

    it('login normal para SUPPORT sin MFA — no es rol critico, no debe forzar MFA setup', async () => {
      // SUPPORT (tenant_support) no esta en MFA_REQUIRED_ROLES — login normal sin mfaSetupRequired
      const user = buildUser({ role: 'tenant_support' as UserRole, mfaEnabled: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      const dto: LoginDto = { email: 'support@tenant.co', password: 'Passw0rd!' };
      const result = await service.login(dto);

      expect(result.mfaSetupRequired).toBeFalsy();
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(10);
    });

    it('ADMIN con MFA ya configurado recibe mfaRequired=true al hacer login sin TOTP', async () => {
      // ADMIN con mfaEnabled=true — no se emite token limitado, se pide el TOTP
      const user = buildUser({ role: UserRole.ADMIN, mfaEnabled: true, mfaSecret: 'BASE32SECRET' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'admin@tenant.co', password: 'Passw0rd!' };
      const result = await service.login(dto);

      // MFA configurado pero no enviado — flujo normal de MFA verify
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaSetupRequired).toBeFalsy();
    });

    it('signAccessToken emite scope=mfa-setup en el payload JWT para token limitado', async () => {
      const user = buildUser({ role: UserRole.ADMIN, mfaEnabled: false, mfaRequired: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      const dto: LoginDto = { email: 'admin@tenant.co', password: 'Passw0rd!' };
      await service.login(dto);

      // jwtService.sign debe haber sido llamado con scope='mfa-setup' en el payload
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'mfa-setup' }),
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // MOD02 — AUDIT EVENTS (RF-AUD-02)
  // ---------------------------------------------------------------------------

  describe('refreshTokens() — audit REFRESH (MOD02)', () => {
    it('emite audit REFRESH tras rotar el token exitosamente', async () => {
      const rawToken = 'c'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      const tokenEntity = {
        id: 'rt-audit-uuid',
        userId: 'user-uuid-1',
        tokenHash: hashedToken,
        familyId: 'family-uuid-audit',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const user = buildUser();

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValueOnce(tokenEntity).mockResolvedValueOnce(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, p) => p),
      });

      mockRedis.get.mockResolvedValue(null);
      const auditService = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService;

      await service.refreshTokens(rawToken);

      // Debe haber llamado a auditService.log con AuditAction.REFRESH
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'REFRESH' }));
    });
  });

  describe('resetPassword() — audit PASSWORD_RESET_COMPLETED (MOD02)', () => {
    it('emite audit PASSWORD_RESET_COMPLETED tras reset exitoso', async () => {
      const user = buildUser({
        passwordResetToken: 'token-reset-audit',
        passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const auditService = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService;

      await service.resetPassword({
        token: 'token-reset-audit',
        newPassword: 'NuevoPass1!',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED' }),
      );
    });
  });

  describe('registerFailedAttempt() — audit ACCOUNT_LOCKED (MOD02)', () => {
    it('emite audit ACCOUNT_LOCKED cuando se alcanza el limite de intentos fallidos', async () => {
      // 4 intentos previos — el 5to debe bloquear la cuenta y emitir ACCOUNT_LOCKED
      // D1: la auditoría ya no sale de `registerFailedAttempt` (dentro de la tx
      // que fallaba) sino del llamador tras el commit; el valor que dispara el
      // evento es el devuelto por el UPDATE atómico.
      const user = buildUser({ failedLoginAttempts: 4 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([
          [
            {
              failed_login_attempts: 5,
              locked_until: new Date(Date.now() + 15 * 60 * 1000),
            },
          ],
          1,
        ]),
      });

      const auditService = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService;

      // Login fallido con 4 intentos previos = 5to intento = lockout
      await expect(
        service.login({ email: 'admin@tenant.co', password: 'WrongPass1!' }),
      ).rejects.toThrow();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_LOCKED' }),
      );
    });

    it('no emite ACCOUNT_LOCKED cuando los intentos son menos de 5', async () => {
      // 3 intentos previos — el 4to falla pero no bloquea
      const user = buildUser({ failedLoginAttempts: 3 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        query: jest.fn().mockResolvedValue([[{ failed_login_attempts: 4, locked_until: null }], 1]),
      });

      const auditService = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService;

      await expect(
        service.login({ email: 'admin@tenant.co', password: 'WrongPass1!' }),
      ).rejects.toThrow();

      // AuditAction.ACCOUNT_LOCKED no debe aparecer — solo LOGIN_FAILED
      const calls = (auditService.log as jest.Mock).mock.calls as Array<[{ action: string }]>;
      const accountLockedCalls = calls.filter(([args]) => args.action === 'ACCOUNT_LOCKED');
      expect(accountLockedCalls).toHaveLength(0);
    });
  });

  describe('verifyEmail() — audit EMAIL_VERIFIED (MOD02)', () => {
    it('emite audit EMAIL_VERIFIED (no UPDATE) al verificar el email exitosamente', async () => {
      const user = buildUser({
        status: UserStatus.PENDING_VERIFICATION,
        emailVerified: false,
        emailVerificationToken: 'token-verificacion-audit',
      } as Partial<User>);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue({}),
      });

      const auditService = (service as unknown as { auditService: { log: jest.Mock } })
        .auditService;

      await service.verifyEmail({ token: 'token-verificacion-audit' }, 'tenant_test');

      // Debe haber emitido EMAIL_VERIFIED — NO el generico UPDATE
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EMAIL_VERIFIED' }),
      );

      const calls = (auditService.log as jest.Mock).mock.calls as Array<[{ action: string }]>;
      const updateCalls = calls.filter(([args]) => args.action === 'UPDATE');
      expect(updateCalls).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // H-04 — ciclo de vida del token de reset
  // ---------------------------------------------------------------------------

  describe('ciclo de vida del token de reset (H-04)', () => {
    /** Simula la columna `password_reset_token`, que ahora guarda solo el hash. */
    function findOneByStoredToken(storedToken: string | null): jest.Mock {
      return jest.fn().mockImplementation(async (_entity: unknown, options: unknown) => {
        const where = (options as { where?: { passwordResetToken?: string } }).where;
        if (!where?.passwordResetToken || where.passwordResetToken !== storedToken) {
          return null;
        }
        return buildUser({
          passwordResetToken: storedToken,
          passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        });
      });
    }

    it('forgotPassword persiste el hash, nunca el token en claro', async () => {
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser()),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      await service.forgotPassword({ email: 'test@example.com' });

      const persistido = (manager.update as jest.Mock).mock.calls[0]![2] as {
        passwordResetToken: string;
      };
      const enlace = (mailerService.sendMail as jest.Mock).mock.calls[0]![0] as { html?: string };
      const tokenEnClaro = /token=([a-f0-9]{64})/.exec(enlace.html ?? '')?.[1];

      expect(tokenEnClaro).toBeDefined();
      expect(persistido.passwordResetToken).not.toBe(tokenEnClaro);
      expect(persistido.passwordResetToken).toBe(
        createHash('sha256').update(tokenEnClaro!).digest('hex'),
      );
    });

    it('canjea el token en claro contra el hash almacenado', async () => {
      const tokenEnClaro = 'a'.repeat(64);
      const hashAlmacenado = createHash('sha256').update(tokenEnClaro).digest('hex');

      setupRunInTenantSchema({
        findOne: findOneByStoredToken(hashAlmacenado),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await expect(
        service.resetPassword({ token: tokenEnClaro, newPassword: 'NuevoPass1!' }),
      ).resolves.toBeUndefined();
    });

    it('rechaza el token emitido antes de que el registro fuera recreado', async () => {
      const tokenDeLaVidaAnterior = 'b'.repeat(64);

      // Estado tras la recreacion: `UsersService.create()` deja la columna a null.
      setupRunInTenantSchema({
        findOne: findOneByStoredToken(null),
      });

      await expect(
        service.resetPassword({ token: tokenDeLaVidaAnterior, newPassword: 'NuevoPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('el usuario resucitado sin password explicito puede iniciar sesion con su temporal', async () => {
      // Estado exacto que produce `UsersService.create()` en la rama de resurreccion:
      // credencial temporal obligatoria y SIN expiracion heredada.
      const user = buildUser({
        status: UserStatus.ACTIVE,
        passwordResetRequired: true,
        passwordResetExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, partial) => partial),
      });

      const result = await service.login({
        email: 'resucitado@empresa-demo.test',
        password: 'TemporalGenerada1!',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
    });
  });

  // ---------------------------------------------------------------------------
  // H-01 — separacion criptografica de audiencias
  // ---------------------------------------------------------------------------

  describe('separacion de audiencias en la firma (H-01)', () => {
    it('el token de tenant se firma con el emisor y la audiencia de tenant', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUser()),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, partial) => partial),
      });

      await service.login({ email: 'test@example.com', password: 'Passw0rd!' });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tenant' }),
        expect.objectContaining({
          issuer: JWT_CLAIMS_BY_TOKEN_TYPE.tenant.issuer,
          audience: JWT_CLAIMS_BY_TOKEN_TYPE.tenant.audience,
        }),
      );
    });

    it('el token de plataforma usa un emisor y una audiencia distintos', () => {
      const platformUser = {
        id: 'platform-uuid',
        emailHash: 'hash-plataforma',
        role: 'SYSTEM_ADMIN',
      } as unknown as PlatformUser;

      (service as any).signPlatformAccessToken(platformUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'platform' }),
        expect.objectContaining({
          issuer: JWT_CLAIMS_BY_TOKEN_TYPE.platform.issuer,
          audience: JWT_CLAIMS_BY_TOKEN_TYPE.platform.audience,
        }),
      );
      expect(JWT_CLAIMS_BY_TOKEN_TYPE.platform.issuer).not.toBe(
        JWT_CLAIMS_BY_TOKEN_TYPE.tenant.issuer,
      );
      expect(JWT_CLAIMS_BY_TOKEN_TYPE.platform.audience).not.toBe(
        JWT_CLAIMS_BY_TOKEN_TYPE.tenant.audience,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // OBSERVABILIDAD — reason codes de sesion (sin PII)
  // ---------------------------------------------------------------------------

  describe('refreshTokens() — reason codes de observabilidad', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('emite REFRESH_INVALID cuando el token no existe', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await expect(service.refreshTokens('x'.repeat(96))).rejects.toThrow(UnauthorizedException);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('REFRESH_INVALID'));
    });

    it('emite REFRESH_REUSE_DETECTED con familyId truncado a 8 caracteres y mantiene la revocacion', async () => {
      const rawToken = 'f'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');
      const familyId = 'family-uuid-1';

      const revokedToken = {
        id: 'rt-uuid-old',
        userId: 'user-uuid-1',
        tokenHash: hashedToken,
        familyId,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      };

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(revokedToken),
        update: jest.fn().mockResolvedValue({ affected: 3 }),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('REFRESH_REUSE_DETECTED'));
      const loggedLine = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes('REFRESH_REUSE_DETECTED'));
      expect(loggedLine).toContain(familyId.slice(0, 8));
      // El identificador completo de la familia nunca llega al log.
      expect(loggedLine).not.toContain(familyId);
      // La deteccion de reuse no cambio: la familia se revoca igual.
      expect(manager.update).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ familyId }),
        expect.objectContaining({ revokeReason: 'REUSE_ATTACK' }),
      );
      // Sin PII: el token raw y su hash no aparecen en el log.
      expect(loggedLine).not.toContain(rawToken);
      expect(loggedLine).not.toContain(hashedToken);
    });

    it('emite REFRESH_EXPIRED cuando el token esta vencido', async () => {
      const rawToken = '0'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue({
          id: 'rt-expired-2',
          userId: 'user-uuid-1',
          tokenHash: hashedToken,
          familyId: 'family-uuid-9',
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        }),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('REFRESH_EXPIRED'));
    });

    it('emite REFRESH_USER_UNAVAILABLE cuando el usuario no esta activo', async () => {
      const rawToken = '1'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'rt-valid-2',
            userId: 'user-uuid-1',
            tokenHash: hashedToken,
            familyId: 'family-uuid-8',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          })
          .mockResolvedValueOnce(buildUser({ status: UserStatus.INACTIVE })),
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('REFRESH_USER_UNAVAILABLE'));
    });
  });

  describe('refreshPlatformTokens() — reason codes de observabilidad', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    function platformRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        userId: 'platform-uuid-1',
        familyId: 'family-uuid-plat',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        revokedAt: null,
        credentialVersion: platformCredentialVersion(PLATFORM_HASH),
        mfaVersion: platformCredentialVersion('MFA'),
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        ...overrides,
      };
    }

    it('emite PLATFORM_REFRESH_INVALID cuando el token no existe en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.refreshPlatformTokens('token-desconocido')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PLATFORM_REFRESH_INVALID'));
    });

    it('emite PLATFORM_REFRESH_REUSE_DETECTED con familyId truncado y mantiene la revocacion de familia', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify(platformRecord({ revokedAt: new Date().toISOString() })),
      );
      mockRedis.smembers.mockResolvedValue(['hash-1']);

      await expect(service.refreshPlatformTokens('token-reusado')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('PLATFORM_REFRESH_REUSE_DETECTED'),
      );
      const loggedLine = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes('PLATFORM_REFRESH_REUSE_DETECTED'));
      expect(loggedLine).toContain('family-uuid-plat'.slice(0, 8));
      expect(loggedLine).not.toContain('family-uuid-plat');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:token:hash-1');
      expect(mockRedis.del).toHaveBeenCalledWith('platform:refresh:family:family-uuid-plat');
    });

    it('emite PLATFORM_REFRESH_EXPIRED cuando el token esta vencido', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify(platformRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
      );

      await expect(service.refreshPlatformTokens('token-vencido')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PLATFORM_REFRESH_EXPIRED'));
    });

    it.each([
      ['PLATFORM_REFRESH_CREDENTIAL_CHANGED', '$2b$12$otro', 1],
      ['PLATFORM_REFRESH_RACE_LOST', PLATFORM_HASH, 0],
    ])('emite %s sin exponer la familia ni el hash', async (reason, passwordHash, rotated) => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      mockRedis.eval.mockResolvedValue(rotated);
      (
        service as unknown as {
          platformUserRepository: { findOne: jest.Mock };
        }
      ).platformUserRepository.findOne.mockResolvedValue({
        id: 'platform-uuid-1',
        status: UserStatus.ACTIVE,
        role: 'system_admin',
        mfaEnabled: true,
        mfaSecret: (service as any).encryptSecret('MFA'),
        passwordHash,
        passwordResetRequired: false,
      });

      await expect(service.refreshPlatformTokens('token-sintetico')).rejects.toThrow(
        UnauthorizedException,
      );

      const logged = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).toContain(reason);
      expect(logged).not.toContain('family-uuid-plat');
      expect(logged).not.toContain(passwordHash);
    });

    it('emite PLATFORM_REFRESH_USER_UNAVAILABLE cuando el usuario no esta activo', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(platformRecord()));
      (
        service as unknown as {
          platformUserRepository: { findOne: jest.Mock };
        }
      ).platformUserRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshPlatformTokens('token-sin-usuario')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('PLATFORM_REFRESH_USER_UNAVAILABLE'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // TTL DE SESION CONFIGURABLE (JWT_ACCESS_EXPIRATION / JWT_REFRESH_EXPIRATION)
  // ---------------------------------------------------------------------------

  describe('TTL de sesion configurable', () => {
    /**
     * Compila un AuthService con la configuracion dada. Los TTL se resuelven en
     * el constructor, asi que cada combinacion requiere su propio modulo.
     */
    async function compileServiceWithConfig(configMap: Record<string, string>): Promise<{
      service: AuthService;
      jwtSign: jest.Mock;
    }> {
      const jwtSign = jest.fn().mockReturnValue('mock.jwt.token');
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
          {
            provide: getRepositoryToken(PlatformUser),
            useValue: { findOne: jest.fn(), update: jest.fn() },
          },
          { provide: getRepositoryToken(RefreshToken), useValue: { findOne: jest.fn() } },
          {
            provide: JwtService,
            useValue: {
              sign: jwtSign,
              verify: jest.fn().mockReturnValue({ jti: 'test-jti', exp: 0 }),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string, def?: unknown) => {
                if (key === 'PII_HASH_KEY') {
                  return configMap[key] ?? injectedPiiHashKeyHex;
                }

                return configMap[key] ?? def;
              }),
              getOrThrow: jest.fn().mockImplementation((key: string) => {
                if (key === 'MFA_ENCRYPTION_KEY') {
                  return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
                }
                if (key === 'PII_HASH_KEY') {
                  return injectedPiiHashKeyHex;
                }
                throw new Error(`ConfigService.getOrThrow: clave no mapeada en test: ${key}`);
              }),
            },
          },
          { provide: DataSource, useValue: {} },
          { provide: REDIS_CLIENT, useValue: mockRedis },
          { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
          {
            provide: PlatformAuditService,
            useValue: {
              log: jest.fn().mockResolvedValue(undefined),
              logWithin: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: MailerService,
            useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();

      return { service: moduleRef.get<AuthService>(AuthService), jwtSign };
    }

    /** Ejecuta un refresh valido y devuelve la entidad de refresh token creada. */
    async function refreshConTokenValido(
      target: AuthService,
    ): Promise<{ expiresAt: Date } | undefined> {
      const rawToken = '2'.repeat(96);
      const hashedToken = require('crypto').createHash('sha256').update(rawToken).digest('hex');

      const { manager } = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'rt-ttl',
            userId: 'user-uuid-1',
            tokenHash: hashedToken,
            familyId: 'family-uuid-ttl',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          })
          .mockResolvedValueOnce(buildUser()),
      });

      await target.refreshTokens(rawToken);

      return manager.create?.mock.calls[0]?.[1] as { expiresAt: Date } | undefined;
    }

    it('usa JWT_REFRESH_EXPIRATION para la expiracion del refresh token persistido', async () => {
      const { service: ttlService } = await compileServiceWithConfig({
        JWT_ACCESS_EXPIRATION: '1h',
        JWT_REFRESH_EXPIRATION: '30d',
        SESSION_MAX_TENANT: '60d',
      });

      const creado = await refreshConTokenValido(ttlService);

      expect(creado).toBeDefined();
      const vidaMs = creado!.expiresAt.getTime() - Date.now();
      const treintaDiasMs = 30 * 24 * 60 * 60 * 1000;
      expect(vidaMs).toBeGreaterThan(treintaDiasMs - 60_000);
      expect(vidaMs).toBeLessThanOrEqual(treintaDiasMs);
    });

    it('usa JWT_ACCESS_EXPIRATION en el expiresIn del access token firmado', async () => {
      const { service: ttlService, jwtSign } = await compileServiceWithConfig({
        JWT_ACCESS_EXPIRATION: '1h',
        JWT_REFRESH_EXPIRATION: '30d',
      });

      await refreshConTokenValido(ttlService);

      expect(jwtSign).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expiresIn: '3600s' }),
      );
    });

    it('aplica los defaults 15m / 7d cuando la configuracion no trae las variables', async () => {
      const { service: defaultService, jwtSign } = await compileServiceWithConfig({});

      const creado = await refreshConTokenValido(defaultService);

      expect(jwtSign).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expiresIn: '900s' }),
      );

      expect(creado).toBeDefined();
      const vidaMs = creado!.expiresAt.getTime() - Date.now();
      const sieteDiasMs = 7 * 24 * 60 * 60 * 1000;
      expect(vidaMs).toBeGreaterThan(sieteDiasMs - 60_000);
      expect(vidaMs).toBeLessThanOrEqual(sieteDiasMs);
    });
  });
});
