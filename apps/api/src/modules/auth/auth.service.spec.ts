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

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
import { LoginDto, MfaVerifyDto, MfaDisableDto } from './dto/auth.dto';
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
    emailHash: 'abc123hash',
    passwordHash: '$2b$12$hash',
    role: 'tenant_admin',
    tenantId: 'tenant-test-uuid',
    status: UserStatus.ACTIVE,
    mfaEnabled: false,
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
              const map: Record<string, unknown> = { APP_NAME: 'iWana Test' };
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

      // Debe haber guardado el secret en Redis con TTL de 600s
      expect(mockRedis.set).toHaveBeenCalledWith(
        'mfa:pending:user-uuid-1',
        expect.any(String),
        'EX',
        600,
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
      const adminUser = buildUser({ role: UserRole.ADMIN, emailHash: 'admin-hash-1' });
      const { manager } = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(adminUser),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const result = await service.regenerateTenantAdminCredentials({
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_test',
        adminEmail: 'admin@isptest.co',
        idempotencyKey: 'idem-key-1',
      });

      expect(result.adminEmail).toBe('admin@isptest.co');
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
        adminEmail: 'admin@isptest.co',
        idempotencyKey: 'idem-key-2',
      });

      expect(result.temporaryPassword).toBe('IwN!a9-cachedpass');
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });
});
