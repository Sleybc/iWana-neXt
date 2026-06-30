/**
 * Tests unitarios de UsersService — Sprint 1.
 *
 * Verifica:
 * - findAll(): retorna lista paginada de usuarios del tenant con cursor-based pagination.
 * - findOne(): retorna usuario por id; lanza NotFoundException si no existe.
 * - create(): crea usuario con email en texto plano; lanza ConflictException si email ya existe.
 * - create(): genera password temporal cuando dto.password no se provee.
 * - create(): registra evento AuditAction.CREATE.
 * - update(): actualiza status y/o rol; lanza NotFoundException si no existe.
 * - update(): lanza ForbiddenException si el actor no es ADMIN y no es el propio usuario.
 * - update(): registra evento AuditAction.UPDATE con oldValue/newValue.
 * - remove(): realiza soft delete; lanza NotFoundException si no existe.
 * - remove(): lanza BadRequestException si el actor intenta eliminarse a si mismo.
 * - remove(): lanza ForbiddenException al intentar eliminar a un ADMIN (RF-RBAC-04).
 * - remove(): registra evento AuditAction.DELETE.
 *
 * MOCKS:
 * - @iwana/db: runInTenantSchema + TenantContext.getOrThrow() controlables.
 * - AuditService.log: void mock para verificar eventos.
 * - ConfigService.getOrThrow: retorna clave hex fija (no es PII real).
 *
 * SEGURIDAD: Sin PII real — todos los datos son ficticios de prueba.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus, AuditAction, DocumentType } from '@iwana/shared';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { SearchQueueService } from '../search/search-queue.service';
import { TenantService } from '../tenant/tenant.service';

jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs') as Record<string, unknown>;
  return {
    ...actual,
    compare: jest.fn(),
    hash: jest.fn(async (value: string) => `hashed:${value}`),
  };
});

// ---------------------------------------------------------------------------
// Mock global de @iwana/db
// ---------------------------------------------------------------------------

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
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
// Helpers
// ---------------------------------------------------------------------------

/** Clave hex de 64 chars valida para AES-256-GCM (solo para tests — no es PII real) */
const MOCK_KEY_HEX = '0'.repeat(64);

/** Contexto de tenant generico para todos los tests */
const MOCK_TENANT_CTX = {
  tenantId: 'ten-00000000-0000-4000-a000-000000000001',
  schemaName: 'tenant_test',
};

/** Usuario base que retorna el mock del manager */
function buildUserEntity(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'usr-00000000-0000-4000-a000-000000000001',
    email: 'usuario.mock@empresa.com',
    emailHash: 'hash-mock',
    passwordHash: 'hashed-pw',
    role: UserRole.NOC,
    status: UserStatus.ACTIVE,
    tenantId: MOCK_TENANT_CTX.tenantId,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRequired: false,
    isOperationalResource: false,
    passwordResetRequired: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    emailVerified: false,
    emailVerificationToken: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    // Campos de perfil (todos null por defecto)
    firstName: null,
    lastName: null,
    phone: null,
    jobTitle: null,
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

type MockQr = {
  manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
};

/**
 * Configura mockRunInTenantSchema para ejecutar el callback con un QR mockeado.
 * Retorna las funciones del manager para inspeccion en tests.
 */
function setupRunInTenantSchema(
  managerOverrides: Partial<MockQr['manager']> = {},
): MockQr['manager'] {
  const mgr: MockQr['manager'] = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
    // save() en TypeORM muta el objeto pasado (popula id, timestamps). El mock lo simula.
    save: jest
      .fn()
      .mockImplementation(async (_entity: unknown, entityInstance: Record<string, unknown>) => {
        if (!entityInstance['id'])
          entityInstance['id'] = 'usr-generated-00000000-0000-4000-a000-000000000001';
        return entityInstance;
      }),
    softRemove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
    ...managerOverrides,
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schema: string,
      callback: (qr: { manager: typeof mgr }) => Promise<unknown>,
    ) => callback({ manager: mgr }),
  );

  return mgr;
}

function encryptLegacyValue(plaintext: string): string {
  const iv = Buffer.from('00112233445566778899aabb', 'hex');
  const key = Buffer.from(MOCK_KEY_HEX, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;
  let auditServiceMock: { log: jest.Mock };
  let tenantServiceMock: { updateTenantSelfProfile: jest.Mock };
  let searchQueueServiceMock: { enqueueUserUpsert: jest.Mock; enqueueUserDelete: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(MOCK_TENANT_CTX);

    auditServiceMock = { log: jest.fn() };
    tenantServiceMock = { updateTenantSelfProfile: jest.fn() };
    searchQueueServiceMock = {
      enqueueUserUpsert: jest.fn(),
      enqueueUserDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: TenantService, useValue: tenantServiceMock },
        { provide: SearchQueueService, useValue: searchQueueServiceMock },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(MOCK_KEY_HEX),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll()', () => {
    it('retorna lista paginada de usuarios', async () => {
      const userEntity = buildUserEntity();
      setupRunInTenantSchema({
        find: jest.fn().mockResolvedValue([userEntity]),
        count: jest.fn().mockResolvedValue(1),
      });

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('indica nextCursor cuando hay mas items', async () => {
      // limit=2, find retorna 3 (limit+1) → nextCursor debe ser el id del segundo
      const users = [
        buildUserEntity({ id: 'id-1' }),
        buildUserEntity({ id: 'id-2' }),
        buildUserEntity({ id: 'id-3' }),
      ];
      setupRunInTenantSchema({
        find: jest.fn().mockResolvedValue(users),
        count: jest.fn().mockResolvedValue(3),
      });

      const result = await service.findAll({ limit: 2 });

      // Con limit=2, slice deja [id-1, id-2] y nextCursor = 'id-2'
      expect(result.data).toHaveLength(2);
      expect(result.meta.nextCursor).toBe('id-2');
    });

    it('busca por nombre sobre valores legacy decodificados y tolera mayusculas', async () => {
      setupRunInTenantSchema({
        find: jest.fn().mockResolvedValue([
          buildUserEntity({
            firstName: encryptLegacyValue('Liliana'),
            lastName: encryptLegacyValue('Ramirez'),
            email: 'liliana@empresa.com',
          }),
        ]),
      });

      const result = await service.findAll({ search: 'liliana', limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.firstName).toBe('Liliana');
    });

    it('combina search con filtros de status y role', async () => {
      const find = jest.fn().mockResolvedValue([
        buildUserEntity({
          role: UserRole.SUPPORT,
          status: UserStatus.ACTIVE,
          jobTitle: 'Soporte tecnico',
        }),
        buildUserEntity({
          id: 'usr-00000000-0000-4000-a000-000000000099',
          role: UserRole.NOC,
          status: UserStatus.ACTIVE,
          jobTitle: 'NOC',
        }),
      ]);

      setupRunInTenantSchema({ find });

      const result = await service.findAll({
        search: 'soporte',
        status: UserStatus.ACTIVE,
        role: UserRole.SUPPORT,
      });

      expect(find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({
            status: UserStatus.ACTIVE,
            role: UserRole.SUPPORT,
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('tolera coincidencias aproximadas en nombres', async () => {
      setupRunInTenantSchema({
        find: jest
          .fn()
          .mockResolvedValue([buildUserEntity({ firstName: 'Liliana', lastName: 'Gomez' })]),
      });

      const result = await service.findAll({ search: 'lilina', limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.firstName).toBe('Liliana');
    });
  });

  describe('resetPassword()', () => {
    it('genera password temporal y activa passwordResetRequired cuando no se provee password', async () => {
      const targetUser = buildUserEntity({ id: 'usr-target', role: UserRole.NOC });
      const mgr = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(targetUser) });

      const result = await service.resetPassword(
        'usr-target',
        'usr-admin',
        UserRole.ADMIN,
        '127.0.0.1',
      );

      expect(typeof result.temporaryPassword).toBe('string');
      expect(result.temporaryPassword).toHaveLength(32);
      expect(mgr.save).toHaveBeenCalled();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PASSWORD_CHANGED,
          entityType: 'UserPasswordReset',
          entityId: 'usr-target',
        }),
      );
    });

    it('rechaza cuando ADMIN intenta resetear a SYSTEM_ADMIN', async () => {
      const targetUser = buildUserEntity({ id: 'usr-platform', role: UserRole.SYSTEM_ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(targetUser) });

      await expect(
        service.resetPassword('usr-platform', 'usr-admin', UserRole.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('usa bcrypt 12 rounds para hashear un password provisto', async () => {
      const targetUser = buildUserEntity({ id: 'usr-target', role: UserRole.NOC });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(targetUser) });
      const hashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

      await service.resetPassword(
        'usr-target',
        'usr-admin',
        UserRole.ADMIN,
        '127.0.0.1',
        'PasswordTemporal!123',
      );

      expect(hashMock).toHaveBeenCalledWith('PasswordTemporal!123', 12);
    });

    it('lanza NotFoundException si usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(
        service.resetPassword('usr-missing', 'usr-admin', UserRole.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMe()', () => {
    it('retorna el perfil del actor autenticado', async () => {
      const entity = buildUserEntity({ id: 'usr-self', firstName: 'Ana', lastName: 'Perez' });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findMe('usr-self');

      expect(result.id).toBe('usr-self');
      expect(result.documentNumber).toBeNull();
    });

    it('lanza NotFoundException si actor no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.findMe('usr-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe()', () => {
    it('actualiza solo campos de perfil propio y preserva role/status', async () => {
      const entity = buildUserEntity({
        id: 'usr-self',
        role: UserRole.NOC,
        status: UserStatus.ACTIVE,
      });
      const mgr = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.updateMe(
        'usr-self',
        {
          firstName: 'Andrea',
          jobTitle: 'Soporte L2',
          documentNumber: '123456789',
        },
        '127.0.0.1',
      );

      expect(result.firstName).toBe('Andrea');
      expect(entity.role).toBe(UserRole.NOC);
      expect(entity.status).toBe(UserStatus.ACTIVE);
      expect(mgr.save).toHaveBeenCalled();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'UserProfile',
          entityId: 'usr-self',
        }),
      );
    });

    it('lanza NotFoundException si el perfil propio no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.updateMe('usr-missing', {}, '127.0.0.1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('changeLoginEmail()', () => {
    it('actualiza el email de acceso del propio usuario y sincroniza el contactEmail si es el admin principal', async () => {
      const actorId = 'usr-admin-principal';
      const entity = buildUserEntity({
        id: actorId,
        role: UserRole.ADMIN,
        emailHash: 'hash-actual',
        passwordHash: '$2b$12$hash',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      const mgr = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(entity)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(entity),
      });
      (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);

      const result = await service.changeLoginEmail(
        actorId,
        {
          email: 'principal.nuevo@empresa.com',
          currentPassword: 'Passw0rd!Segura',
        },
        actorId,
      );

      expect(result.email).toBe('principal.nuevo@empresa.com');
      expect(mgr.save).toHaveBeenCalled();
      expect(tenantServiceMock.updateTenantSelfProfile).toHaveBeenCalledWith(
        MOCK_TENANT_CTX.tenantId,
        { contactEmail: 'principal.nuevo@empresa.com' },
        actorId,
      );
    });

    it('no sincroniza contactEmail cuando el usuario no es el admin principal', async () => {
      const actorId = 'usr-secundario';
      const entity = buildUserEntity({
        id: actorId,
        role: UserRole.SUPPORT,
        emailHash: 'hash-secundario',
        passwordHash: '$2b$12$hash',
      });
      const principalAdmin = buildUserEntity({
        id: 'usr-admin-principal',
        role: UserRole.ADMIN,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(entity)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(principalAdmin),
      });
      (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => true);

      await service.changeLoginEmail(
        actorId,
        {
          email: 'operador.nuevo@empresa.com',
          currentPassword: 'Passw0rd!Segura',
        },
        actorId,
      );

      expect(tenantServiceMock.updateTenantSelfProfile).not.toHaveBeenCalled();
    });

    it('rechaza el cambio cuando la contraseña actual no coincide', async () => {
      const actorId = 'usr-admin-principal';
      const entity = buildUserEntity({ id: actorId, passwordHash: '$2b$12$hash' });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });
      (bcrypt.compare as unknown as jest.Mock).mockImplementation(async () => false);

      await expect(
        service.changeLoginEmail(
          actorId,
          {
            email: 'principal.nuevo@empresa.com',
            currentPassword: 'incorrecta',
          },
          actorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changeLoginEmailAsAdmin()', () => {
    it('actualiza el email de un tercero sin contraseña actual y sincroniza contacto si es admin principal', async () => {
      const targetUser = buildUserEntity({
        id: 'usr-admin-principal',
        role: UserRole.ADMIN,
        emailHash: 'hash-viejo',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      const mgr = setupRunInTenantSchema({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(targetUser)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(targetUser),
      });

      const result = await service.changeLoginEmailAsAdmin(
        'usr-admin-principal',
        { email: 'admin.principal.nuevo@empresa.com' },
        'usr-admin-operador',
        UserRole.ADMIN,
      );

      expect(result.email).toBe('admin.principal.nuevo@empresa.com');
      expect(mgr.save).toHaveBeenCalled();
      expect(tenantServiceMock.updateTenantSelfProfile).toHaveBeenCalledWith(
        MOCK_TENANT_CTX.tenantId,
        { contactEmail: 'admin.principal.nuevo@empresa.com' },
        'usr-admin-operador',
      );
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'UserLoginEmailAdmin',
          entityId: 'usr-admin-principal',
        }),
      );
    });

    it('rechaza cuando ADMIN intenta cambiar email de SYSTEM_ADMIN', async () => {
      const targetUser = buildUserEntity({ id: 'usr-platform', role: UserRole.SYSTEM_ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(targetUser) });

      await expect(
        service.changeLoginEmailAsAdmin(
          'usr-platform',
          { email: 'sadmin.nuevo@empresa.com' },
          'usr-admin',
          UserRole.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza cuando el nuevo email ya está en uso por otro usuario', async () => {
      const targetUser = buildUserEntity({ id: 'usr-target', role: UserRole.SUPPORT });
      const existingUser = buildUserEntity({ id: 'usr-other', email: 'ocupado@empresa.com' });
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValueOnce(targetUser).mockResolvedValueOnce(existingUser),
      });

      await expect(
        service.changeLoginEmailAsAdmin(
          'usr-target',
          { email: 'ocupado@empresa.com' },
          'usr-admin',
          UserRole.ADMIN,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // findOne
  // -------------------------------------------------------------------------

  describe('findOne()', () => {
    it('retorna UserResponseDto cuando el usuario existe', async () => {
      const entity = buildUserEntity({ role: UserRole.NOC });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity.id as string);

      expect(result.id).toBe(entity.id);
      expect(result.role).toBe(UserRole.NOC);
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('crea usuario exitosamente con password provisto', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null), // no existe duplicado
      });

      const result = await service.create({
        email: 'nuevo.usuario@empresa.com',
        role: UserRole.NOC,
        password: 'S3cur3P@ss!word123',
      });

      expect(result.id).toBeDefined();
      expect(
        (result as unknown as { temporaryPassword?: string }).temporaryPassword,
      ).toBeUndefined();
    });

    it('genera password temporal cuando no se provee password', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.create({
        email: 'otro.usuario@empresa.com',
        role: UserRole.NOC,
      });

      // La respuesta debe incluir el password temporal
      expect((result as unknown as { temporaryPassword?: string }).temporaryPassword).toBeDefined();
      expect(typeof (result as unknown as { temporaryPassword?: string }).temporaryPassword).toBe(
        'string',
      );
    });

    it('lanza ConflictException si ya existe un usuario con ese email', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUserEntity()), // existe duplicado
      });

      await expect(
        service.create({ email: 'duplicado@empresa.com', role: UserRole.NOC }),
      ).rejects.toThrow(ConflictException);
    });

    it('restaura y reinicializa un usuario previamente eliminado con el mismo email', async () => {
      // Usuario eliminado (soft delete) con el mismo emailHash
      const deletedUser = buildUserEntity({
        id: 'usr-deleted-000',
        deletedAt: new Date('2026-01-01'),
        role: UserRole.ADMIN,
        status: 'SUSPENDED',
      });
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(deletedUser),
      });
      // restore() debe llamarse para limpiar deletedAt en DB
      (mgr as unknown as Record<string, jest.Mock>)['restore'] = jest
        .fn()
        .mockResolvedValue(undefined);

      const result = await service.create({ email: 'restaurado@empresa.com', role: UserRole.NOC });

      // El registro restaurado debe tener los nuevos valores
      expect(result.role).toBe(UserRole.NOC);
      expect(result.status).toBe(UserStatus.PENDING_VERIFICATION);
      // No debe lanzar ConflictException
      expect(result.id).toBeDefined();
    });

    it('registra AuditAction.CREATE tras crear el usuario', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await service.create({ email: 'audit.test@empresa.com', role: UserRole.NOC });

      // Procesamos el evento void con un flush de microtasks
      await Promise.resolve();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.CREATE, entityType: 'User' }),
      );
    });

    it('crea usuario con campos de perfil en texto plano en la entidad', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      // Capturar el objeto que se pasa a save() para verificar cifrado
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-generated-profile';
          return entityInstance;
        },
      );

      await service.create({
        email: 'perfil.completo@empresa.com',
        role: UserRole.NOC,
        firstName: 'Carlos',
        lastName: 'García',
        phone: '+573001234567',
        jobTitle: 'Técnico de soporte',
        documentType: DocumentType.CC,
        documentNumber: '123456789',
        avatarUrl: 'https://cdn.ejemplo.com/avatar.png',
      });

      // Los campos del perfil ahora se persisten en texto plano.
      expect(typeof savedEntity!['firstName']).toBe('string');
      expect(savedEntity!['firstName']).toBe('Carlos');
      expect(typeof savedEntity!['lastName']).toBe('string');
      expect(savedEntity!['lastName']).toBe('García');
      // documentNumber también se mantiene en texto plano, aunque no se expone en DTOs.
      expect(typeof savedEntity!['documentNumber']).toBe('string');
      expect(savedEntity!['documentNumber']).toBe('123456789');
      expect(savedEntity!['phone']).toBe('+573001234567');
      expect(savedEntity!['jobTitle']).toBe('Técnico de soporte');
      expect(savedEntity!['documentType']).toBe(DocumentType.CC);
    });

    it('crea usuario sin perfil — campos de perfil quedan null', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-sin-perfil';
          return entityInstance;
        },
      );

      await service.create({ email: 'sin.perfil@empresa.com', role: UserRole.NOC });

      expect(savedEntity!['firstName']).toBeNull();
      expect(savedEntity!['lastName']).toBeNull();
      expect(savedEntity!['phone']).toBeNull();
      expect(savedEntity!['documentNumber']).toBeNull();
    });

    it('persiste mfaRequired=true cuando se envía en el DTO', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-mfa-required-true';
          return entityInstance;
        },
      );

      await service.create({
        email: 'mfa.requerido@empresa.com',
        role: UserRole.NOC,
        mfaRequired: true,
      });

      expect(savedEntity!['mfaRequired']).toBe(true);
    });

    it('persiste mfaRequired=false por defecto si no se envía en el DTO', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-mfa-required-false';
          return entityInstance;
        },
      );

      await service.create({ email: 'sin.mfa@empresa.com', role: UserRole.SUPPORT });

      expect(savedEntity!['mfaRequired']).toBe(false);
    });

    it('marca operativos por defecto a TECHNICIAN y CONTRACTOR', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-operativo-default';
          return entityInstance;
        },
      );

      await service.create({ email: 'operativo@empresa.com', role: UserRole.TECHNICIAN });

      expect(savedEntity!['isOperationalResource']).toBe(true);
    });

    it('respeta un override explícito de isOperationalResource', async () => {
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          if (!entityInstance['id']) entityInstance['id'] = 'usr-operativo-override';
          return entityInstance;
        },
      );

      await service.create({
        email: 'agenda.general@empresa.com',
        role: UserRole.TECHNICIAN,
        isOperationalResource: false,
      });

      expect(savedEntity!['isOperationalResource']).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update()', () => {
    const ADMIN_ID = 'usr-admin-00000000-0000-4000-a000-000000000100';
    const TARGET_ID = 'usr-00000000-0000-4000-a000-000000000001';

    it('actualiza status y rol cuando el actor es ADMIN', async () => {
      const entity = buildUserEntity({
        id: TARGET_ID,
        status: UserStatus.ACTIVE,
        role: UserRole.NOC,
      });
      const updatedEntity = buildUserEntity({
        id: TARGET_ID,
        status: UserStatus.SUSPENDED,
        role: UserRole.NOC,
      });
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
        save: jest.fn().mockResolvedValue(updatedEntity),
      });

      const result = await service.update(
        TARGET_ID,
        { status: UserStatus.SUSPENDED },
        ADMIN_ID,
        UserRole.ADMIN,
      );

      expect(result.id).toBe(TARGET_ID);
    });

    it('lanza ForbiddenException si no-ADMIN intenta modificar a otro usuario', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUserEntity({ id: TARGET_ID })),
      });

      await expect(
        service.update(TARGET_ID, { status: UserStatus.SUSPENDED }, 'otro-user-id', UserRole.NOC),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el usuario objetivo no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.update('no-existe', {}, ADMIN_ID, UserRole.ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('actualiza campos de perfil en texto plano', async () => {
      const TARGET_ID_PROFILE = 'usr-00000000-0000-4000-a000-000000000001';
      const ADMIN_ID_PROFILE = 'usr-admin-00000000-0000-4000-a000-000000000100';
      const entity = buildUserEntity({ id: TARGET_ID_PROFILE });
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          return entityInstance;
        },
      );

      await service.update(
        TARGET_ID_PROFILE,
        {
          firstName: 'Ana',
          lastName: 'López',
          phone: '+573109876543',
          documentNumber: '987654321',
        },
        ADMIN_ID_PROFILE,
        UserRole.ADMIN,
      );

      expect(savedEntity!['firstName']).toBe('Ana');
      expect(savedEntity!['lastName']).toBe('López');
      expect(savedEntity!['documentNumber']).toBe('987654321');
      expect(savedEntity!['phone']).toBe('+573109876543');
    });

    it('registra AuditAction.UPDATE con oldValue y newValue', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, status: UserStatus.ACTIVE });
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
        save: jest.fn().mockResolvedValue({ ...entity, status: UserStatus.SUSPENDED }),
      });

      await service.update(TARGET_ID, { status: UserStatus.SUSPENDED }, ADMIN_ID, UserRole.ADMIN);

      await Promise.resolve();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: TARGET_ID,
          oldValue: expect.objectContaining({ status: UserStatus.ACTIVE }),
          newValue: expect.objectContaining({ status: UserStatus.SUSPENDED }),
        }),
      );
    });

    it('actualiza isOperationalResource cuando se solicita', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, isOperationalResource: false });
      let savedEntity: Record<string, unknown> | null = null;
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
      });
      mgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          savedEntity = entityInstance;
          return entityInstance;
        },
      );

      const result = await service.update(
        TARGET_ID,
        { isOperationalResource: true },
        ADMIN_ID,
        UserRole.ADMIN,
      );

      expect(savedEntity!['isOperationalResource']).toBe(true);
      expect(result.isOperationalResource).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // toDto (via findOne) — descifrado de perfil y omisión de documentNumber
  // -------------------------------------------------------------------------

  describe('toDto() via findOne()', () => {
    it('desencripta firstName y lastName al retornar UserResponseDto', async () => {
      // Necesitamos cifrar valores con la misma clave para que el servicio los pueda descifrar.
      // Usamos el propio servicio como helper indirecto: create() cifra y findOne() descifra.
      // Creamos un usuario con perfil y luego lo recuperamos.
      let capturedEntity: Record<string, unknown> | null = null;

      const createMgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(null),
      });
      createMgr.save.mockImplementation(
        async (_entity: unknown, entityInstance: Record<string, unknown>) => {
          capturedEntity = { ...entityInstance, id: 'usr-dto-test' };
          return capturedEntity;
        },
      );

      await service.create({
        email: 'dto.test@empresa.com',
        role: UserRole.NOC,
        firstName: 'María',
        lastName: 'Rodríguez',
      });

      // Ahora usamos findOne() con la entidad capturada (que tiene los campos cifrados)
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(capturedEntity),
      });

      const result = await service.findOne('usr-dto-test');

      // El DTO debe exponer los valores descifrados
      expect(result.firstName).toBe('María');
      expect(result.lastName).toBe('Rodríguez');
    });

    it('incluye documentNumber en UserResponseDto para edicion interna', async () => {
      const entity = buildUserEntity({
        documentNumber: '123456789',
        documentType: DocumentType.CC,
        isOperationalResource: true,
      });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity['id'] as string);

      expect(result.documentNumber).toBe('123456789');
      expect(result.isOperationalResource).toBe(true);
    });

    it('retorna null para campos de perfil no establecidos', async () => {
      const entity = buildUserEntity(); // todos null por defecto
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity['id'] as string);

      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.jobTitle).toBeNull();
      expect(result.documentType).toBeNull();
      expect(result.avatarUrl).toBeNull();
      expect(result.documentNumber).toBeNull();
    });

    it('tolera nombres legados en texto plano sin lanzar error', async () => {
      const entity = buildUserEntity({
        firstName: 'Ana',
        lastName: 'Prueba',
      });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity['id'] as string);

      expect(result.firstName).toBe('Ana');
      expect(result.lastName).toBe('Prueba');
    });

    it('degrada a null cuando el valor parece cifrado pero es inválido', async () => {
      const entity = buildUserEntity({
        firstName: '00112233445566778899aabb:00112233445566778899aabbccddeeff:aabbccdd',
        lastName: 'ffeeddccbbaa998877665544:ffeeddccbbaa99887766554433221100:11223344',
      });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity['id'] as string);

      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove()', () => {
    const ADMIN_ID = 'usr-admin-00000000-0000-4000-a000-000000000100';
    const TARGET_ID = 'usr-00000000-0000-4000-a000-000000000001';

    it('realiza soft delete del usuario objetivo', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, role: UserRole.NOC });
      const mgr = setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
      });

      await service.remove(TARGET_ID, ADMIN_ID, UserRole.ADMIN);

      expect(mgr.softRemove).toHaveBeenCalledWith(expect.anything(), entity);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('no-existe', ADMIN_ID, UserRole.ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si el actor intenta eliminarse a si mismo', async () => {
      const entity = buildUserEntity({ id: ADMIN_ID, role: UserRole.ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      await expect(service.remove(ADMIN_ID, ADMIN_ID, UserRole.ADMIN)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza ForbiddenException al intentar eliminar a un ADMIN siendo ADMIN (RF-RBAC-04)', async () => {
      const otherAdmin = buildUserEntity({ id: TARGET_ID, role: UserRole.ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(otherAdmin) });

      await expect(service.remove(TARGET_ID, ADMIN_ID, UserRole.ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SYSTEM_ADMIN puede eliminar a un ADMIN de tenant (RF-RBAC-04 no aplica)', async () => {
      const otherAdmin = buildUserEntity({ id: TARGET_ID, role: UserRole.ADMIN });
      const mgr = setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(otherAdmin) });

      await service.remove(TARGET_ID, ADMIN_ID, UserRole.SYSTEM_ADMIN);

      expect(mgr.softRemove).toHaveBeenCalledWith(expect.anything(), otherAdmin);
    });

    it('registra AuditAction.DELETE tras soft delete exitoso', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, role: UserRole.NOC });
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
      });

      await service.remove(TARGET_ID, ADMIN_ID, UserRole.ADMIN);

      await Promise.resolve();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityType: 'User',
          entityId: TARGET_ID,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findAll() — branches cursor, status, role
  // -------------------------------------------------------------------------

  describe('findAll() — branches de filtros opcionales', () => {
    it('aplica filtro de cursor cuando se proporciona', async () => {
      const userEntity = buildUserEntity();
      const findMock = jest.fn().mockResolvedValue([userEntity]);
      const countMock = jest.fn().mockResolvedValue(1);
      setupRunInTenantSchema({ find: findMock, count: countMock });

      await service.findAll({ cursor: 'some-cursor-uuid' });

      // El where del find debe incluir MoreThan con el cursor
      expect(findMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({ id: expect.anything() }),
        }),
      );
    });

    it('aplica filtro de status cuando se proporciona', async () => {
      const userEntity = buildUserEntity();
      const findMock = jest.fn().mockResolvedValue([userEntity]);
      const countMock = jest.fn().mockResolvedValue(1);
      setupRunInTenantSchema({ find: findMock, count: countMock });

      await service.findAll({ status: UserStatus.ACTIVE });

      expect(findMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({ status: UserStatus.ACTIVE }),
        }),
      );
    });

    it('aplica filtro de role cuando se proporciona', async () => {
      const userEntity = buildUserEntity();
      const findMock = jest.fn().mockResolvedValue([userEntity]);
      const countMock = jest.fn().mockResolvedValue(1);
      setupRunInTenantSchema({ find: findMock, count: countMock });

      await service.findAll({ role: UserRole.NOC });

      expect(findMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({ role: UserRole.NOC }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // decryptLegacyValue — branch formato invalido
  // -------------------------------------------------------------------------

  describe('decryptLegacyValue() privado — branch formato invalido', () => {
    it('lanza Error cuando el valor cifrado no tiene el formato iv:tag:ciphertext', () => {
      expect(() => {
        (service as any).decryptLegacyValue('solo-dos:partes');
      }).toThrow('Formato de valor cifrado inválido.');
    });
  });

  describe('decodeLegacyValue()', () => {
    it('retorna texto plano sin cambios', () => {
      expect((service as any).decodeLegacyValue('Texto plano')).toBe('Texto plano');
    });

    it('descifra valor en formato legacy iv:tag:cipher', () => {
      const encrypted = encryptLegacyValue('Nombre Legacy');
      expect((service as any).decodeLegacyValue(encrypted)).toBe('Nombre Legacy');
    });
  });
});
