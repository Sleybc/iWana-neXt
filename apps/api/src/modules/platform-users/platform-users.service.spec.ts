import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus, AuditAction } from '@iwana/shared';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PlatformUsersService } from './platform-users.service';

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

describe('PlatformUsersService', () => {
  let service: PlatformUsersService;
  let repo: jest.Mocked<Repository<PlatformUser>>;
  const auditServiceMock = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformUsersService,
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: AuditService, useValue: auditServiceMock },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('0'.repeat(64)),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformUsersService>(PlatformUsersService);
    repo = module.get(getRepositoryToken(PlatformUser));
    jest.clearAllMocks();
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
      (auditServiceMock.log as unknown as jest.Mock).mockImplementation(async () => {
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
      expect(result.role).toBe(PlatformRole.SYSTEM_ADMIN);
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'PlatformUser', action: AuditAction.CREATE }),
      );
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
    repo.findOne.mockResolvedValue(buildPlatformUser({ email: 'admin@iwana.co' }));

    const result = await service.getProfile('2cfa4585-c2f2-49d3-8f42-1265f951a7a9');

    expect(result.email).toBe('admin@iwana.co');
  });

  it('getProfile lanza 404 si el usuario no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
  });

  it('updateProfile actualiza solo campos enviados', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (data: unknown) => ({ ...entity, ...(data as object) }) as PlatformUser,
    );

    const result = await service.updateProfile(entity.id, {
      firstName: 'Nuevo',
    });

    expect(result.firstName).toBe('Nuevo');
    expect(result.lastName).toBe('Plataforma');
    expect(result.phone).toBe('+573001112233');
    expect(result.timezone).toBe('America/Bogota');
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
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (data: unknown) => ({ ...entity, ...(data as object) }) as PlatformUser,
    );

    await service.updateProfile(entity.id, { language: 'en-US' });

    expect(auditServiceMock.log).toHaveBeenCalledWith(
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
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (data: unknown) => ({ ...entity, ...(data as object) }) as PlatformUser,
    );

    const result = await service.updateProfile(entity.id, { phone: '' });

    // String vacio debe convertirse en null segun la logica del servicio
    expect(result.phone).toBeNull();
  });

  it('updateProfile actualiza lastName a null cuando se envia string vacio', async () => {
    const entity = buildPlatformUser();
    repo.findOne.mockResolvedValue(entity);
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (data: unknown) => ({ ...entity, ...(data as object) }) as PlatformUser,
    );

    const result = await service.updateProfile(entity.id, { lastName: '' });

    expect(result.lastName).toBeNull();
  });

  it('changeLoginEmail actualiza el correo de acceso cuando la contraseña actual es válida', async () => {
    const entity = buildPlatformUser({ email: 'admin@iwana.co', emailHash: 'hash-actual' });
    repo.findOne.mockResolvedValueOnce(entity).mockResolvedValueOnce(null);
    (repo.save as unknown as jest.Mock).mockImplementation(async (data: unknown) => {
      const saved = { ...entity, ...(data as object) } as PlatformUser;
      saved.email = 'nuevo.admin@iwana.co';
      return saved;
    });
    (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);

    const result = await service.changeLoginEmail(entity.id, {
      email: 'nuevo.admin@iwana.co',
      currentPassword: 'Passw0rd!Segura',
    });

    expect(result.email).toBe('nuevo.admin@iwana.co');
    expect(repo.save).toHaveBeenCalled();
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
    ).rejects.toThrow(BadRequestException);
  });
});
