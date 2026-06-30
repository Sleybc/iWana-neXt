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
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PlatformUser, RefreshToken, User } from '@iwana/db';
import { UserRole, UserStatus } from '@iwana/shared';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
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
    verify: jest.fn().mockResolvedValue({ valid: true, delta: 0 }),
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
    passwordResetRequired: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as User;
}

/** Configura mockRunInTenantSchema para ejecutar el callback con un EntityManager mockeado */
function setupRunInTenantSchema(managerOverrides: Record<string, jest.Mock> = {}): {
  manager: Record<string, jest.Mock>;
} {
  const manager: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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
  };

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
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
          useValue: { findOne: jest.fn(), update: jest.fn() },
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
                TENANT_INITIAL_ADMIN_PASSWORD: 'InitAdmin!2026',
              };
              return map[key] ?? def;
            }),
            // getOrThrow necesario para derivar la clave AES-256-GCM en el constructor de AuthService
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              if (key === 'MFA_ENCRYPTION_KEY') return 'a'.repeat(64); // 32 bytes hex para tests
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
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
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

    it('incrementa failedLoginAttempts cuando la contrasena es incorrecta', async () => {
      const user = buildUser({ failedLoginAttempts: 0 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const dto: LoginDto = { email: 'test@example.com', password: 'WrongPass1!' };

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);

      // Debe actualizar failedLoginAttempts a 1
      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({ failedLoginAttempts: 1 }),
      );
    });

    it('lanza UnauthorizedException cuando la cuenta esta bloqueada por lockout', async () => {
      const future = new Date(Date.now() + 5 * 60 * 1000); // bloqueada 5 min en el futuro
      const user = buildUser({ lockedUntil: future, failedLoginAttempts: 5 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: LoginDto = { email: 'locked@example.com', password: 'Passw0rd!' };
      const err = await service.login(dto).catch((e: UnauthorizedException) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).message).toMatch(/bloqueada temporalmente/i);
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
        .spyOn(service as unknown as { verifyTotp: () => Promise<boolean> }, 'verifyTotp')
        .mockResolvedValue(false);

      const dto: LoginDto = { email: 'mfa@example.com', password: 'Passw0rd!', totpCode: '000000' };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
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
        tokenEntity.id,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
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
      const result = await service.setupMfa('user-uuid-1', 'user@example.com');

      expect(typeof result.qrCodeBase64).toBe('string');
      expect(result.qrCodeBase64).toMatch(/^data:image\/png/);
      expect(typeof result.otpauthUri).toBe('string');
      expect(result.otpauthUri).toMatch(/otpauth:\/\/totp\//);

      // Debe haber guardado el secret en Redis con TTL de 1800s (30 min)
      expect(mockRedis.set).toHaveBeenCalledWith(
        'mfa:pending:user-uuid-1',
        expect.any(String),
        'EX',
        1800,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // MFA — VERIFY SETUP
  // ---------------------------------------------------------------------------

  describe('verifyMfaSetup()', () => {
    it('activa MFA cuando el codigo TOTP es valido', async () => {
      const pendingSecret = 'PENDINGBASE32SECRET';
      mockRedis.get.mockResolvedValue(pendingSecret);
      jest
        .spyOn(service as unknown as { verifyTotp: () => Promise<boolean> }, 'verifyTotp')
        .mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const dto: MfaVerifyDto = { totpCode: '123456' };
      const result = await service.verifyMfaSetup('user-uuid-1', dto);

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

      expect(mockRedis.del).toHaveBeenCalledWith('mfa:pending:user-uuid-1');
    });

    it('lanza UnauthorizedException cuando no hay secret pendiente en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      setupRunInTenantSchema({});

      const dto: MfaVerifyDto = { totpCode: '000000' };
      await expect(service.verifyMfaSetup('user-uuid-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
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
      await expect(service.verifyMfaSetup('user-uuid-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
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
        .spyOn(service as unknown as { verifyTotp: () => Promise<boolean> }, 'verifyTotp')
        .mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const dto: MfaDisableDto = { password: 'Passw0rd!', totpCode: '654321' };
      const result = await service.disableMfa('user-uuid-1', dto);

      expect(result.mfaEnabled).toBe(false);
      expect(manager.update).toHaveBeenCalledWith(User, 'user-uuid-1', {
        mfaEnabled: false,
        mfaSecret: null,
      });
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      const dto: MfaDisableDto = { password: 'Passw0rd!', totpCode: '123456' };
      await expect(service.disableMfa('ghost-uuid', dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza UnauthorizedException cuando la contrasena es incorrecta', async () => {
      const user = buildUser({ mfaEnabled: true, mfaSecret: 'MFASECRET' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(user) });

      const dto: MfaDisableDto = { password: 'WrongPass!', totpCode: '000000' };
      await expect(service.disableMfa('user-uuid-1', dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // CREDENCIALES TEMPORALES DEL ADMIN INICIAL
  // ---------------------------------------------------------------------------

  describe('regenerateTenantAdminCredentials()', () => {
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

    it('retorna la misma respuesta cacheada si llega el mismo Idempotency-Key', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          message: 'Credenciales temporales regeneradas para el ADMIN inicial del tenant.',
          adminEmail: 'admin@isptest.co',
          temporaryPassword: 'IwN!a9-cachedpass',
          expiresAt: '2026-03-20T00:00:00.000Z',
        }),
      );

      const result = await service.regenerateTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
        idempotencyKey: 'idem-key-2',
      });

      expect(result.temporaryPassword).toBe('IwN!a9-cachedpass');
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe('getBootstrapTenantAdminCredentials()', () => {
    it('retorna el acceso fijo inicial mientras el admin siga en primer ingreso', async () => {
      const adminUser = buildUser({
        role: UserRole.ADMIN,
        emailHash: 'admin-hash-1',
        email: 'admin@iwana.co',
        passwordResetRequired: true,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(adminUser),
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.getBootstrapTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
      });

      expect(result.adminEmail).toBe('admin@iwana.co');
      expect(result.temporaryPassword).toBe('InitAdmin!2026');
    });

    it('rechaza consultar el acceso fijo si el admin ya rotó o regeneró la contraseña', async () => {
      const adminUser = buildUser({
        role: UserRole.ADMIN,
        emailHash: 'admin-hash-1',
        email: 'admin@iwana.co',
        passwordResetRequired: true,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(adminUser),
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.getBootstrapTenantAdminCredentials({
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_test',
        }),
      ).rejects.toThrow(ConflictException);
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
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
      };
      platformUserRepo.findOne.mockResolvedValue(platformUser);
      platformUserRepo.update.mockResolvedValue({ affected: 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const dto = { email: 'admin@iwana.co', password: 'Passw0rd!' };
      const result = await service.loginPlatform(dto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.mfaRequired).toBeUndefined();
    });

    it('lanza UnauthorizedException cuando el usuario de plataforma no existe', async () => {
      platformUserRepo.findOne.mockResolvedValue(null);

      const dto = { email: 'noexiste@iwana.co', password: 'Any1pass!' };
      await expect(service.loginPlatform(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza ForbiddenException cuando la cuenta de plataforma esta suspendida', async () => {
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
        .spyOn(service as unknown as { verifyTotp: () => Promise<boolean> }, 'verifyTotp')
        .mockResolvedValue(false);

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

    it('genera el token de reset y envia el correo cuando el usuario existe', async () => {
      const user = buildUser();

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const mailerService = (service as unknown as { mailerService: { sendMail: jest.Mock } })
        .mailerService;

      await service.forgotPassword({ email: 'test@example.com' });

      // Debe haber actualizado al usuario con el token de reset
      expect(manager.update).toHaveBeenCalledWith(
        User,
        user.id,
        expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        }),
      );

      // Debe haber llamado a sendMail (fire-and-forget)
      // Nota: el void no garantiza espera, pero el mock se registra igualmente
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
        }),
      );
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

    it('lanza UnauthorizedException cuando el token de reset esta expirado', async () => {
      const user = buildUser({
        passwordResetToken: 'token-expirado',
        passwordResetExpiresAt: new Date(Date.now() - 60_000), // expirado hace 1 minuto
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
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // expira en 30 min
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

    it('envia correo de confirmacion cuando el DTO incluye email', async () => {
      const user = buildUser({
        passwordResetToken: 'token-valido-con-email',
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
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

  describe('changePassword()', () => {
    it('cambia la contrasena cuando la contrasena actual es correcta', async () => {
      const user = buildUser();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      await service.changePassword(user.id, {
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
        service.changePassword('ghost-uuid', {
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
        service.changePassword(user.id, {
          currentPassword: 'WrongPass1!',
          newPassword: 'NewPass1!',
        }),
      ).rejects.toThrow('La contraseña actual no coincide con la que usas para iniciar sesión.');
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
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
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
      const user = buildUser({ failedLoginAttempts: 4 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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
});
