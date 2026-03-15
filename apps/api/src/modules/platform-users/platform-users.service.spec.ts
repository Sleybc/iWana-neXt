import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PlatformUsersService } from './platform-users.service';

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
          },
        },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<PlatformUsersService>(PlatformUsersService);
    repo = module.get(getRepositoryToken(PlatformUser));
    jest.clearAllMocks();
  });

  it('getProfile retorna datos sin campos sensibles', async () => {
    repo.findOne.mockResolvedValue(buildPlatformUser());

    const result = await service.getProfile('2cfa4585-c2f2-49d3-8f42-1265f951a7a9');

    expect(result.id).toBeDefined();
    expect((result as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
    expect((result as unknown as { mfaSecret?: string }).mfaSecret).toBeUndefined();
    expect((result as unknown as { emailHash?: string }).emailHash).toBeUndefined();
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
});
