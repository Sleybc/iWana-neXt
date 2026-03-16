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
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus, AuditAction, DocumentType } from '@iwana/shared';
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
function buildUserEntity(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
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

    it('crea usuario con campos de perfil y los cifra en la entidad', async () => {
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

      // firstName y lastName deben estar cifrados (formato iv:authTag:ciphertext)
      expect(typeof savedEntity!['firstName']).toBe('string');
      expect((savedEntity!['firstName'] as string).split(':').length).toBe(3);
      expect(typeof savedEntity!['lastName']).toBe('string');
      expect((savedEntity!['lastName'] as string).split(':').length).toBe(3);
      // documentNumber debe estar cifrado
      expect(typeof savedEntity!['documentNumber']).toBe('string');
      expect((savedEntity!['documentNumber'] as string).split(':').length).toBe(3);
      // phone y jobTitle no cifrados
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

    it('actualiza campos de perfil cifrando firstName, lastName y documentNumber', async () => {
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

      // Campos PII deben estar cifrados al guardar
      expect((savedEntity!['firstName'] as string).split(':').length).toBe(3);
      expect((savedEntity!['lastName'] as string).split(':').length).toBe(3);
      expect((savedEntity!['documentNumber'] as string).split(':').length).toBe(3);
      // phone no se cifra
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

    it('documentNumber NUNCA aparece en UserResponseDto', async () => {
      const entity = buildUserEntity({
        documentNumber: 'some:encrypted:value',
        documentType: DocumentType.CC,
      });
      setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

      const result = await service.findOne(entity['id'] as string);

      // Verificar que la propiedad no existe en el resultado
      expect('documentNumber' in result).toBe(false);
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
  // decryptValue — branch formato invalido
  // -------------------------------------------------------------------------

  describe('decryptValue() privado — branch formato invalido', () => {
    it('lanza Error cuando el valor cifrado no tiene el formato iv:tag:ciphertext', () => {
      expect(() => {
        (service as any).decryptValue('solo-dos:partes');
      }).toThrow('Formato de valor cifrado inválido.');
    });
  });
});
