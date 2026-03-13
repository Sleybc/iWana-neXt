/**
 * Tests unitarios de UsersService — Sprint 1.
 *
 * Verifica:
 * - findAll(): retorna lista paginada de usuarios del tenant con cursor-based pagination.
 * - findOne(): retorna usuario por id; lanza NotFoundException si no existe.
 * - create(): crea usuario con email cifrado; lanza ConflictException si email ya existe.
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
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, AuditAction } from '@iwana/shared';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';

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
function buildUserEntity(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'usr-00000000-0000-4000-a000-000000000001',
    email: 'encrypted:mock',
    emailHash: 'hash-mock',
    passwordHash: 'hashed-pw',
    role: UserRole.NOC,
    status: UserStatus.ACTIVE,
    tenantId: MOCK_TENANT_CTX.tenantId,
    mfaEnabled: false,
    mfaSecret: null,
    passwordResetRequired: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    emailVerified: false,
    emailVerificationToken: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

type MockQr = {
  manager: {
    findOne: jest.Mock;
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
function setupRunInTenantSchema(managerOverrides: Partial<MockQr['manager']> = {}): MockQr['manager'] {
  const mgr: MockQr['manager'] = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
    // save() en TypeORM muta el objeto pasado (popula id, timestamps). El mock lo simula.
    save: jest.fn().mockImplementation(async (_entity: unknown, entityInstance: Record<string, unknown>) => {
      if (!entityInstance['id']) entityInstance['id'] = 'usr-generated-00000000-0000-4000-a000-000000000001';
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

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;
  let auditServiceMock: { log: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(MOCK_TENANT_CTX);

    auditServiceMock = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
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
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[userEntity], 1]),
      };
      setupRunInTenantSchema({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('indica nextCursor cuando hay mas items', async () => {
      // limit=2, pero hay 3 resultados → nextCursor debe ser el id del ultimo
      const users = [buildUserEntity({ id: 'id-1' }), buildUserEntity({ id: 'id-2' }), buildUserEntity({ id: 'id-3' })];
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([users, 3]),
      };
      setupRunInTenantSchema({ createQueryBuilder: jest.fn().mockReturnValue(qb) });

      const result = await service.findAll({ limit: 2 });

      // Con limit=2, slice deja [id-1, id-2] y nextCursor = 'id-2'
      expect(result.data).toHaveLength(2);
      expect(result.meta.nextCursor).toBe('id-2');
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
      expect((result as unknown as { temporaryPassword?: string }).temporaryPassword).toBeUndefined();
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
      expect(typeof (result as unknown as { temporaryPassword?: string }).temporaryPassword).toBe('string');
    });

    it('lanza ConflictException si ya existe un usuario con ese email', async () => {
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(buildUserEntity()), // existe duplicado
      });

      await expect(
        service.create({ email: 'duplicado@empresa.com', role: UserRole.NOC }),
      ).rejects.toThrow(ConflictException);
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
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update()', () => {
    const ADMIN_ID = 'usr-admin-00000000-0000-4000-a000-000000000100';
    const TARGET_ID = 'usr-00000000-0000-4000-a000-000000000001';

    it('actualiza status y rol cuando el actor es ADMIN', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, status: UserStatus.ACTIVE, role: UserRole.NOC });
      const updatedEntity = buildUserEntity({ id: TARGET_ID, status: UserStatus.SUSPENDED, role: UserRole.NOC });
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

      await expect(
        service.update('no-existe', {}, ADMIN_ID, UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
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

      await service.remove(TARGET_ID, ADMIN_ID);

      expect(mgr.softRemove).toHaveBeenCalledWith(expect.anything(), entity);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('no-existe', ADMIN_ID)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el actor intenta eliminarse a si mismo', async () => {
      const entity = buildUserEntity({ id: ADMIN_ID, role: UserRole.ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      await expect(service.remove(ADMIN_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });

    it('lanza ForbiddenException al intentar eliminar a un ADMIN (RF-RBAC-04)', async () => {
      const otherAdmin = buildUserEntity({ id: TARGET_ID, role: UserRole.ADMIN });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(otherAdmin) });

      await expect(service.remove(TARGET_ID, ADMIN_ID)).rejects.toThrow(ForbiddenException);
    });

    it('registra AuditAction.DELETE tras soft delete exitoso', async () => {
      const entity = buildUserEntity({ id: TARGET_ID, role: UserRole.NOC });
      setupRunInTenantSchema({
        findOne: jest.fn().mockResolvedValue(entity),
      });

      await service.remove(TARGET_ID, ADMIN_ID);

      await Promise.resolve();
      expect(auditServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DELETE, entityType: 'User', entityId: TARGET_ID }),
      );
    });
  });
});
