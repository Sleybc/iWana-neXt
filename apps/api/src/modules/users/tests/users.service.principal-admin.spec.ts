/**
 * Regresion de la Ola D sobre `UsersService`:
 *
 * - ADR-063: el administrador principal designado NO puede eliminarse mientras
 *   lo sea. El modo de fallo que motivo el ADR es que el borrado moviera la
 *   designacion en silencio; que `remove()` la reasignara «amablemente» seria
 *   reintroducirlo por otra via. La designacion se lee del atributo explicito
 *   `public.tenants.principal_admin_user_id`, no se deriva por `createdAt`.
 *
 * - Punto 2 de la Ola D: la regla de borrado solo contemplaba
 *   `target.role === ADMIN`, asi que un objetivo con rol de plataforma
 *   PERSISTIDO no quedaba protegido en absoluto. Tras ADR-061 §4 ese estado ya
 *   no deberia existir, pero la comprobacion opera sobre el literal leido de la
 *   base y sigue siendo la red para un schema sin el CHECK de la migracion 085.
 *
 * - E-01 (alcance corregido): en `update()` la barrera del principal aplica
 *   solo a cambios reales de `status`/`role` (comparados con el valor actual),
 *   no a perfil / mfaRequired / reenvio idempotente de role+status. En
 *   `resetPassword()` no hay barrera de principal (soporte de plataforma).
 *
 * SEGURIDAD: sin PII real — todos los datos son ficticios.
 */

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PlatformRole, UserRole, UserStatus, USERS_BULK_CREATE_QUEUE } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SearchQueueService } from '../../search/search-queue.service';
import { TenantService } from '../../tenant/tenant.service';
import { UsersService } from '../users.service';

jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs') as Record<string, unknown>;
  return {
    ...actual,
    compare: jest.fn(),
    hash: jest.fn(async (value: string) => `hashed:${value}`),
  };
});

const TENANT_ID = 'ten-00000000-0000-4000-a000-000000000001';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => ({
        tenantId: 'ten-00000000-0000-4000-a000-000000000001',
        schemaName: 'tenant_test',
        tenantSlug: 'test',
      }),
    },
  };
});

const ACTOR_ID = 'usr-00000000-0000-4000-a000-000000000099';
const PRINCIPAL_ID = 'usr-00000000-0000-4000-a000-000000000001';
const SUCESOR_ID = 'usr-00000000-0000-4000-a000-000000000002';

function buildUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PRINCIPAL_ID,
    email: 'admin.principal@empresa-demo.test',
    emailHash: 'hash-mock',
    passwordHash: 'hashed-pw',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    tenantId: TENANT_ID,
    mfaEnabled: false,
    mfaRequired: false,
    isOperationalResource: false,
    emailVerified: false,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
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

describe('UsersService — administrador principal y objetivos de plataforma', () => {
  let service: UsersService;
  let tenantServiceMock: {
    updateTenantSelfProfile: jest.Mock;
    getPrincipalAdminUserId: jest.Mock;
    setPrincipalAdminUserId: jest.Mock;
  };
  let managerMock: { findOne: jest.Mock; softRemove: jest.Mock; save: jest.Mock };

  function setupManager(user: Record<string, unknown> | null): void {
    managerMock = {
      findOne: jest.fn().mockResolvedValue(user),
      softRemove: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => value),
    };

    mockRunInTenantSchema.mockImplementation(
      async (_ds: unknown, _schema: string, cb: (qr: unknown) => Promise<unknown>) =>
        cb({ manager: managerMock, query: jest.fn().mockResolvedValue([]) }),
    );
  }

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();

    tenantServiceMock = {
      updateTenantSelfProfile: jest.fn(),
      getPrincipalAdminUserId: jest.fn().mockResolvedValue(null),
      setPrincipalAdminUserId: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: TenantService, useValue: tenantServiceMock },
        {
          provide: SearchQueueService,
          useValue: { enqueueUserUpsert: jest.fn(), enqueueUserDelete: jest.fn() },
        },
        {
          provide: REDIS_CLIENT,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
          },
        },
        {
          provide: getQueueToken(USERS_BULK_CREATE_QUEUE),
          useValue: { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('remove() — ADR-063', () => {
    it('no permite eliminar al administrador principal designado', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.remove(PRINCIPAL_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN),
      ).rejects.toThrow(ConflictException);

      expect(managerMock.softRemove).not.toHaveBeenCalled();
    });

    it('tampoco lo permite a un SYSTEM_ADMIN de plataforma', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.remove(PRINCIPAL_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('NO reasigna la designacion como efecto colateral del intento de borrado', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.remove(PRINCIPAL_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN),
      ).rejects.toThrow(ConflictException);

      expect(tenantServiceMock.setPrincipalAdminUserId).not.toHaveBeenCalled();
    });

    it('permite eliminar a un ADMIN que NO es el principal', async () => {
      setupManager(buildUser({ id: SUCESOR_ID }));
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await service.remove(SUCESOR_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN);

      expect(managerMock.softRemove).toHaveBeenCalled();
    });

    it('permite eliminar tras transferir la designacion al sucesor', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(SUCESOR_ID);

      await service.remove(PRINCIPAL_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN);

      expect(managerMock.softRemove).toHaveBeenCalled();
    });
  });

  describe('remove() — objetivo con rol de plataforma persistido (punto 2)', () => {
    it.each([PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT])(
      'un ADMIN de tenant no puede eliminar a un objetivo con rol %s',
      async (role) => {
        setupManager(buildUser({ role: role as unknown as UserRole }));

        await expect(service.remove(PRINCIPAL_ID, ACTOR_ID, UserRole.ADMIN)).rejects.toThrow(
          ForbiddenException,
        );

        expect(managerMock.softRemove).not.toHaveBeenCalled();
      },
    );

    it('un actor de plataforma si puede eliminarlo', async () => {
      setupManager(buildUser({ role: PlatformRole.IWANA_SUPPORT as unknown as UserRole }));

      await service.remove(PRINCIPAL_ID, ACTOR_ID, PlatformRole.SYSTEM_ADMIN);

      expect(managerMock.softRemove).toHaveBeenCalled();
    });
  });

  describe('transferPrincipalAdmin()', () => {
    it('designa al sucesor y deja el cambio en manos de TenantService (auditado)', async () => {
      setupManager(buildUser({ id: SUCESOR_ID }));

      const result = await service.transferPrincipalAdmin(SUCESOR_ID, ACTOR_ID);

      expect(result.id).toBe(SUCESOR_ID);
      expect(tenantServiceMock.setPrincipalAdminUserId).toHaveBeenCalledWith(
        TENANT_ID,
        SUCESOR_ID,
        ACTOR_ID,
      );
    });

    it('rechaza a un usuario que no es ADMIN', async () => {
      setupManager(buildUser({ id: SUCESOR_ID, role: UserRole.NOC }));

      await expect(service.transferPrincipalAdmin(SUCESOR_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantServiceMock.setPrincipalAdminUserId).not.toHaveBeenCalled();
    });

    it('rechaza a un usuario inactivo', async () => {
      setupManager(buildUser({ id: SUCESOR_ID, status: UserStatus.SUSPENDED }));

      await expect(service.transferPrincipalAdmin(SUCESOR_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantServiceMock.setPrincipalAdminUserId).not.toHaveBeenCalled();
    });

    it('rechaza a un usuario con soft-delete', async () => {
      setupManager(buildUser({ id: SUCESOR_ID, deletedAt: new Date('2026-01-01') }));

      await expect(service.transferPrincipalAdmin(SUCESOR_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantServiceMock.setPrincipalAdminUserId).not.toHaveBeenCalled();
    });
  });

  describe('update() — barrera del principal (E-01 alcance corregido)', () => {
    it('permite actualizar solo perfil del principal (SYSTEM_ADMIN)', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      const result = await service.update(
        PRINCIPAL_ID,
        { firstName: 'Ana' },
        ACTOR_ID,
        PlatformRole.SYSTEM_ADMIN,
      );

      expect(result.firstName).toBe('Ana');
      expect(result.isPrincipalAdmin).toBe(true);
      expect(managerMock.save).toHaveBeenCalled();
    });

    it('permite reenviar el mismo role/status junto con perfil', async () => {
      setupManager(buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }));
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      const result = await service.update(
        PRINCIPAL_ID,
        {
          firstName: 'Ana',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          mfaRequired: true,
        },
        ACTOR_ID,
        PlatformRole.SYSTEM_ADMIN,
      );

      expect(result.firstName).toBe('Ana');
      expect(result.mfaRequired).toBe(true);
      expect(result.role).toBe(UserRole.ADMIN);
      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(managerMock.save).toHaveBeenCalled();
    });

    it('rechaza cambiar status del principal a SUSPENDED', async () => {
      setupManager(buildUser({ status: UserStatus.ACTIVE }));
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.update(
          PRINCIPAL_ID,
          { status: UserStatus.SUSPENDED },
          ACTOR_ID,
          PlatformRole.SYSTEM_ADMIN,
        ),
      ).rejects.toThrow(ConflictException);

      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('rechaza cambiar role del principal', async () => {
      setupManager(buildUser({ role: UserRole.ADMIN }));
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.update(PRINCIPAL_ID, { role: UserRole.NOC }, ACTOR_ID, PlatformRole.SYSTEM_ADMIN),
      ).rejects.toThrow(ConflictException);

      expect(managerMock.save).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword() — sin barrera de principal', () => {
    it('permite a SYSTEM_ADMIN resetear la contraseña del principal', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      const result = await service.resetPassword(
        PRINCIPAL_ID,
        ACTOR_ID,
        PlatformRole.SYSTEM_ADMIN,
        '127.0.0.1',
      );

      expect(typeof result.temporaryPassword).toBe('string');
      expect(result.temporaryPassword).toHaveLength(32);
      expect(managerMock.save).toHaveBeenCalled();
    });

    it('sigue bloqueando peer-ADMIN (Forbidden)', async () => {
      setupManager(buildUser());
      tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(PRINCIPAL_ID);

      await expect(
        service.resetPassword(PRINCIPAL_ID, ACTOR_ID, UserRole.ADMIN, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);

      expect(managerMock.save).not.toHaveBeenCalled();
    });
  });
});
