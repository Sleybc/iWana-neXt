import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus, AuditAction } from '@iwana/shared';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformUsersService } from './platform-users.service';
import { hashEmail } from '../../common/crypto/hash-email.util';

const INJECTED_PII_HASH_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

function buildPlatformUser(overrides: Partial<PlatformUser> = {}): PlatformUser {
  return {
    id: '2cfa4585-c2f2-49d3-8f42-1265f951a7a9',
    email: 'enc',
    emailHash: 'hash',
    passwordHash: 'hashpw',
    role: PlatformRole.SYSTEM_ADMIN,
    status: UserStatus.ACTIVE,
    mfaEnabled: true,
    mfaSecret: null,
    firstName: 'Admin',
    lastName: 'Plataforma',
    phone: '+573001112233',
    timezone: 'America/Bogota',
    language: 'es-CO',
    lastLoginAt: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as PlatformUser;
}

function encryptPlatformEmail(
  plaintext: string,
  keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

describe('PlatformUsersService', () => {
  const originalPiiHashKey = process.env.PII_HASH_KEY;
  let service: PlatformUsersService;
  let repo: jest.Mocked<Repository<PlatformUser>>;
  // S-8: las operaciones de plataforma no tienen TenantContext; su trail es
  // public.platform_audit_logs, no el schema de un tenant.
  const platformAuditServiceMock = { log: jest.fn(), logWithin: jest.fn() };
  const directoryQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  const manager = { update: jest.fn() };

  beforeEach(async () => {
    process.env.PII_HASH_KEY = INJECTED_PII_HASH_KEY_HEX;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformUsersService,
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(directoryQuery),
            save: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            query: jest.fn(),
            manager: { transaction: jest.fn((operation) => operation(manager)) },
          },
        },
        { provide: PlatformAuditService, useValue: platformAuditServiceMock },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest
              .fn()
              .mockReturnValue('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformUsersService>(PlatformUsersService);
    repo = module.get(getRepositoryToken(PlatformUser));
    jest.clearAllMocks();
    (repo.update as jest.Mock).mockResolvedValue({ affected: 1 });
  });

  afterEach(() => {
    if (originalPiiHashKey === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = originalPiiHashKey;
    }
    jest.clearAllMocks();
  });

  it('lista cuentas de plataforma sin borrados, proyecta solo el directorio y audita el acceso', async () => {
    const user = buildPlatformUser({ mfaEnabled: false, passwordResetRequired: true });
    directoryQuery.getManyAndCount.mockResolvedValue([[user], 21]);

    const result = await service.listDirectory(2, { sub: user.id, role: user.role }, {});

    expect(directoryQuery.where).toHaveBeenCalledWith('account.deletedAt IS NULL');
    expect(directoryQuery.setParameter).toHaveBeenCalledWith(
      'pending',
      UserStatus.PENDING_VERIFICATION,
    );
    expect(directoryQuery.skip).toHaveBeenCalledWith(20);
    expect(directoryQuery.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      items: [
        {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          mfaEnabled: false,
          passwordResetRequired: true,
          lastLoginAt: null,
        },
      ],
      pageSize: 20,
      total: 21,
    });
    expect(platformAuditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LIST_ACCESS,
        userId: user.id,
        newValue: { actorRole: user.role, page: 2, pageSize: 20, served: 1, total: 21 },
      }),
    );
  });

  it('actualiza solo el nombre y registra al administrador dentro de la misma transacción', async () => {
    manager.update.mockResolvedValue({ affected: 1 });
    await service.updateDirectoryName(
      'account',
      { firstName: ' Cuenta ', lastName: ' ' },
      'admin',
      {},
    );

    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      PlatformUser,
      { id: 'account', deletedAt: IsNull() },
      { firstName: 'Cuenta', lastName: null },
    );
    expect(platformAuditServiceMock.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: 'account',
        userId: 'admin',
        newValue: { changedFields: ['firstName', 'lastName'] },
      }),
      manager,
    );
  });

  it('devuelve 404 cuando la cuenta a editar fue eliminada', async () => {
    manager.update.mockResolvedValue({ affected: 0 });
    await expect(
      service.updateDirectoryName('account', { firstName: 'Cuenta', lastName: '' }, 'admin', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(platformAuditServiceMock.logWithin).not.toHaveBeenCalled();
  });

  describe('getSummary', () => {
    it('agrega por rol, rellena con 0 y suma sin MFA y sin acceso en 30 días', async () => {
      (repo.query as jest.Mock).mockResolvedValue([
        { role: 'SYSTEM_ADMIN', count: '3', without_mfa: '1', without_access: '2' },
        { role: 'IWANA_SUPPORT', count: '2', without_mfa: '0', without_access: '1' },
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(5);
      expect(summary.withoutMfa).toBe(1);
      expect(summary.withoutAccess30d).toBe(3);
      expect(Object.keys(summary.byRole).sort()).toEqual(Object.values(PlatformRole).sort());
      expect(summary.byRole[PlatformRole.SYSTEM_ADMIN]).toBe(3);
      expect(summary.byRole[PlatformRole.IWANA_SUPPORT]).toBe(2);
      expect(Object.keys(summary).sort()).toEqual(
        ['byRole', 'generatedAt', 'total', 'withoutAccess30d', 'withoutMfa'].sort(),
      );
    });

    it('una consulta parametrizada, excluye borrados y ancla la ventana a generatedAt − 30 días', async () => {
      (repo.query as jest.Mock).mockResolvedValue([]);

      const summary = await service.getSummary();

      expect(repo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = (repo.query as jest.Mock).mock.calls[0] as [string, string[]];
      expect(sql).toMatch(/deleted_at IS NULL/);
      expect(sql).toMatch(/last_login_at IS NULL OR last_login_at < \$1/);
      expect(Date.parse(summary.generatedAt) - Date.parse(params[0] as string)).toBe(
        30 * 24 * 60 * 60 * 1000,
      );
      expect(summary.total).toBe(0);
      expect(Object.values(summary.byRole).every((n) => n === 0)).toBe(true);
    });

    it('propaga el error de la base', async () => {
      (repo.query as jest.Mock).mockRejectedValue(new Error('connection lost'));
      await expect(service.getSummary()).rejects.toThrow('connection lost');
    });
  });

  describe('getBootstrapStatus', () => {
    it('retorna hasUsers=false cuando no hay usuarios', async () => {
      repo.count.mockResolvedValue(0);
      const result = await service.getBootstrapStatus();
      expect(result).toEqual({ hasUsers: false, pendingUser: false });
    });

    it('retorna hasUsers=true cuando existe al menos un usuario', async () => {
      repo.count.mockResolvedValue(1);
      const result = await service.getBootstrapStatus();
      expect(result).toEqual({ hasUsers: true, pendingUser: false });
    });
  });

  it('createBootstrapUser en producción responde 404 sin consultar ni crear nada (ADR-116)', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        service.createBootstrapUser({
          email: 'admin@iwana.co',
          password: 'Passw0rd!!',
          confirmPassword: 'Passw0rd!!',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.count).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('createBootstrapUser', () => {
    beforeEach(() => {
      repo.count.mockResolvedValue(0);
      (repo.create as unknown as jest.Mock).mockImplementation(
        (data: unknown) => data as PlatformUser,
      );
      (repo.save as unknown as jest.Mock).mockImplementation(
        async (user: unknown) => ({ ...(user as object), id: 'new-uuid' }) as PlatformUser,
      );
      (bcrypt.hash as unknown as jest.Mock).mockImplementation(async () => 'hashed_password');
      (platformAuditServiceMock.log as unknown as jest.Mock).mockImplementation(async () => {
        /* void */
      });
    });

    it('crea usuario admin con SYSTEM_ADMIN cuando no hay usuarios', async () => {
      const dto: CreatePlatformUserBootstrapDto = {
        email: 'admin@iwana.co',
        password: 'Admin123!@#',
        confirmPassword: 'Admin123!@#',
      };
      const result = await service.createBootstrapUser(dto);
      expect(result.email).toBe('admin@iwana.co');
      expect(result.role).toBe(PlatformRole.SYSTEM_ADMIN);
      expect(platformAuditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'PlatformUser', action: AuditAction.CREATE }),
      );
    });

    it('crea el HMAC desde ConfigService sin depender de process.env', async () => {
      const previousPiiHashKey = process.env.PII_HASH_KEY;
      delete process.env.PII_HASH_KEY;
      const dto: CreatePlatformUserBootstrapDto = {
        email: 'admin@iwana.co',
        password: 'Admin123!@#',
        confirmPassword: 'Admin123!@#',
      };
      const expectedEmailHash = hashEmail(dto.email, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data) => data as PlatformUser);
      repo.save.mockImplementation(async (data) => ({ ...data, id: 'new-uuid' }) as PlatformUser);

      try {
        await service.createBootstrapUser(dto);

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ emailHash: expectedEmailHash }),
        );
      } finally {
        if (previousPiiHashKey === undefined) {
          delete process.env.PII_HASH_KEY;
        } else {
          process.env.PII_HASH_KEY = previousPiiHashKey;
        }
      }
    });

    it('mantiene el HMAC de bootstrap cuando ConfigService y process.env coinciden', async () => {
      process.env.PII_HASH_KEY = INJECTED_PII_HASH_KEY_HEX;
      const dto: CreatePlatformUserBootstrapDto = {
        email: 'admin@iwana.co',
        password: 'Admin123!@#',
        confirmPassword: 'Admin123!@#',
      };
      const expectedEmailHash = hashEmail(dto.email, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data) => data as PlatformUser);
      repo.save.mockImplementation(async (data) => ({ ...data, id: 'new-uuid' }) as PlatformUser);

      expect(hashEmail(dto.email)).toBe(expectedEmailHash);
      await service.createBootstrapUser(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailHash: expectedEmailHash }),
      );
    });

    it('mantiene el HMAC de bootstrap si ConfigService y process.env coinciden', async () => {
      const previousPiiHashKey = process.env.PII_HASH_KEY;
      process.env.PII_HASH_KEY = INJECTED_PII_HASH_KEY_HEX;
      const dto: CreatePlatformUserBootstrapDto = {
        email: 'admin@iwana.co',
        password: 'Admin123!@#',
        confirmPassword: 'Admin123!@#',
      };
      const expectedEmailHash = hashEmail(dto.email, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data) => data as PlatformUser);
      repo.save.mockImplementation(async (data) => ({ ...data, id: 'new-uuid' }) as PlatformUser);

      try {
        expect(hashEmail(dto.email)).toBe(expectedEmailHash);
        await service.createBootstrapUser(dto);

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ emailHash: expectedEmailHash }),
        );
      } finally {
        if (previousPiiHashKey === undefined) {
          delete process.env.PII_HASH_KEY;
        } else {
          process.env.PII_HASH_KEY = previousPiiHashKey;
        }
      }
    });

    it('lanza ConflictException si ya existen usuarios', async () => {
      repo.count.mockResolvedValue(1);
      await expect(
        service.createBootstrapUser({
          email: 'admin@iwana.co',
          password: 'Admin123!@#',
          confirmPassword: 'Admin123!@#',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza BadRequestException si el email no es admin@iwana.co', async () => {
      await expect(
        service.createBootstrapUser({
          email: 'otro@iwana.co',
          password: 'Admin123!@#',
          confirmPassword: 'Admin123!@#',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si las contraseñas no coinciden', async () => {
      await expect(
        service.createBootstrapUser({
          email: 'admin@iwana.co',
          password: 'Admin123!@#',
          confirmPassword: 'Different123!@#',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('getProfile retorna datos sin campos sensibles', async () => {
    repo.findOne.mockResolvedValue(buildPlatformUser());

    const result = await service.getProfile('2cfa4585-c2f2-49d3-8f42-1265f951a7a9');

    expect(result.id).toBeDefined();
    expect((result as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
    expect((result as unknown as { mfaSecret?: string }).mfaSecret).toBeUndefined();
    expect((result as unknown as { emailHash?: string }).emailHash).toBeUndefined();
  });

  it('getProfile retorna el email de acceso actual', async () => {
    repo.findOne.mockResolvedValue(
      buildPlatformUser({ email: encryptPlatformEmail('admin@iwana.co') }),
    );

    const result = await service.getProfile('2cfa4585-c2f2-49d3-8f42-1265f951a7a9');

    expect(result.email).toBe('admin@iwana.co');
  });

  it('getProfile omite el ciphertext si el email almacenado parece cifrado pero es inválido', async () => {
    repo.findOne.mockResolvedValue(
      buildPlatformUser({
        email: '00112233445566778899aabb:00112233445566778899aabbccddeeff:aabbccdd',
      }),
    );

    const result = await service.getProfile('2cfa4585-c2f2-49d3-8f42-1265f951a7a9');

    expect(result.email).toBe('');
  });

  it('getProfile lanza 404 si el usuario no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
  });

  it('updateProfile actualiza solo campos enviados', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    const result = await service.updateProfile(entity.id, {
      firstName: 'Nuevo',
    });

    expect(result.firstName).toBe('Nuevo');
    expect(result.lastName).toBe('Plataforma');
    expect(result.phone).toBe('+573001112233');
    expect(result.timezone).toBe('America/Bogota');
    // Reescribir la fila completa restauraría una contraseña cambiada en paralelo.
    expect(repo.update).toHaveBeenCalledWith(
      { id: entity.id, deletedAt: IsNull() },
      { firstName: 'Nuevo', updatedAt: expect.any(Date) },
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateProfile sin cambios no escribe la fila', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    const result = await service.updateProfile(entity.id, {});

    expect(result.firstName).toBe('Admin');
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateProfile lanza 404 y no audita si la cuenta se elimina en paralelo', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);
    (repo.update as jest.Mock).mockResolvedValue({ affected: 0 });

    await expect(service.updateProfile(entity.id, { firstName: 'Nuevo' })).rejects.toThrow(
      NotFoundException,
    );
    expect(platformAuditServiceMock.log).not.toHaveBeenCalled();
  });

  it('updateProfile valida timezone IANA', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    await expect(service.updateProfile(entity.id, { timezone: 'not-a-timezone' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updateProfile registra auditoría', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    await service.updateProfile(entity.id, { language: 'en-US' });

    expect(platformAuditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PlatformUser',
        action: 'UPDATE',
      }),
    );
  });

  it('updateProfile lanza 404 si el usuario no existe al actualizar', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.updateProfile('missing-id', { firstName: 'Test' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateProfile lanza BadRequestException para idioma no permitido', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    await expect(service.updateProfile(entity.id, { language: 'fr-FR' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updateProfile actualiza phone a null cuando se envia string vacio', async () => {
    const entity = buildPlatformUser({ phone: '+573001112233' });
    repo.findOne.mockResolvedValue(entity);

    const result = await service.updateProfile(entity.id, { phone: '' });

    // String vacio debe convertirse en null segun la logica del servicio
    expect(result.phone).toBeNull();
  });

  it('updateProfile actualiza lastName a null cuando se envia string vacio', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);

    const result = await service.updateProfile(entity.id, { lastName: '' });

    expect(result.lastName).toBeNull();
  });

  it('changeLoginEmail actualiza el correo de acceso cuando la contraseña actual es válida', async () => {
    const entity = buildPlatformUser({ email: 'admin@iwana.co', emailHash: 'hash-actual' });
    repo.findOne.mockResolvedValueOnce(entity).mockResolvedValueOnce(null);
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);

    const result = await service.changeLoginEmail(entity.id, {
      email: 'nuevo.admin@iwana.co',
      currentPassword: 'Passw0rd!Segura',
    });

    expect(result.email).toBe('nuevo.admin@iwana.co');
    // Escribe solo el correo y exige que siga vigente la contraseña verificada.
    expect(repo.update).toHaveBeenCalledWith(
      {
        id: entity.id,
        passwordHash: 'hashpw',
        deletedAt: IsNull(),
        emailHash: 'hash-actual',
      },
      { email: expect.any(String), emailHash: expect.any(String), updatedAt: expect.any(Date) },
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cambia el email usando la clave HMAC inyectada sin process.env', async () => {
    const previousPiiHashKey = process.env.PII_HASH_KEY;
    delete process.env.PII_HASH_KEY;
    const currentEmail = 'admin@iwana.co';
    const nextEmail = 'nuevo-admin@example.test';
    const entity = buildPlatformUser({ email: encryptPlatformEmail(currentEmail) });
    repo.findOne.mockResolvedValueOnce(entity).mockResolvedValueOnce(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const expectedEmailHash = hashEmail(nextEmail, Buffer.from(INJECTED_PII_HASH_KEY_HEX, 'hex'));

    try {
      await service.changeLoginEmail(entity.id, {
        email: nextEmail,
        currentPassword: 'Passw0rd!Segura',
      });

      expect(repo.findOne).toHaveBeenNthCalledWith(2, { where: { emailHash: expectedEmailHash } });
    } finally {
      if (previousPiiHashKey === undefined) {
        delete process.env.PII_HASH_KEY;
      } else {
        process.env.PII_HASH_KEY = previousPiiHashKey;
      }
    }
  });

  it('changeLoginEmail responde 409 si otra cuenta toma el correo en paralelo', async () => {
    repo.findOne.mockResolvedValueOnce(buildPlatformUser()).mockResolvedValueOnce(null);
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);
    (repo.update as jest.Mock).mockRejectedValue(
      new QueryFailedError('UPDATE', [], Object.assign(new Error('unique'), { code: '23505' })),
    );

    await expect(
      service.changeLoginEmail('id', {
        email: 'nuevo@example.test',
        currentPassword: 'Vieja!2026',
      }),
    ).rejects.toThrow(ConflictException);
    expect(platformAuditServiceMock.log).not.toHaveBeenCalled();
  });

  it('changeLoginEmail rechaza el cambio cuando el correo es igual al actual', async () => {
    const currentEmail = 'admin@iwana.co';
    const currentEmailHash = require('../../common/crypto/hash-email.util').hashEmail(currentEmail);
    const entity = buildPlatformUser({ email: currentEmail, emailHash: currentEmailHash });
    repo.findOne.mockResolvedValue(entity);
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);

    await expect(
      service.changeLoginEmail(entity.id, {
        email: currentEmail,
        currentPassword: 'Passw0rd!Segura',
      }),
    ).rejects.toThrow('Ingresa un correo de acceso diferente al actual.');
  });

  it('changeLoginEmail rechaza el cambio cuando la contraseña actual no coincide', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => false);

    await expect(
      service.changeLoginEmail(entity.id, {
        email: 'otro.admin@iwana.co',
        currentPassword: 'incorrecta',
      }),
    ).rejects.toThrow('La contraseña actual no coincide con la que usas para iniciar sesión.');
  });

  it('changePassword actualiza la contraseña del usuario de plataforma', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);
    (bcrypt.hash as unknown as jest.Mock).mockImplementation(async () => 'hashed_nueva_password');

    await service.changePassword(entity.id, {
      currentPassword: 'Passw0rd!Segura',
      newPassword: 'NuevaPass!2026',
    });

    expect(repo.update).toHaveBeenCalledWith(
      { id: entity.id, passwordHash: 'hashpw', deletedAt: IsNull() },
      { passwordHash: 'hashed_nueva_password' },
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(platformAuditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'PlatformUser',
      }),
    );
  });

  it.each([
    [
      'changePassword',
      () =>
        service.changePassword('id', { currentPassword: 'Vieja!2026', newPassword: 'Nueva!2026' }),
    ],
    [
      'changeLoginEmail',
      () =>
        service.changeLoginEmail('id', {
          email: 'nuevo@example.test',
          currentPassword: 'Vieja!2026',
        }),
    ],
  ])(
    '%s responde 409 y no audita si la contraseña cambió en paralelo',
    async (_nombre, operation) => {
      repo.findOne.mockResolvedValueOnce(buildPlatformUser()).mockResolvedValueOnce(null);
      (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);
      (repo.update as jest.Mock).mockResolvedValue({ affected: 0 });

      await expect(operation()).rejects.toThrow(ConflictException);
      expect(platformAuditServiceMock.log).not.toHaveBeenCalled();
    },
  );
});
