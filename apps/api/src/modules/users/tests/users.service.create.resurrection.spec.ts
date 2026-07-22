/**
 * Regresion H-04 y H-01 (allowlist de roles) sobre `UsersService.create()` /
 * `update()`.
 *
 * H-04: la rama que resucita un usuario soft-deleted reinicializaba los campos
 * a mano y olvidaba `passwordResetToken`, `passwordResetTokenExpiresAt` y
 * `passwordResetExpiresAt`. Un token de recuperacion emitido en la vida
 * anterior del registro seguia siendo canjeable tras recrear la cuenta, y el
 * `passwordResetExpiresAt` heredado —vencido— impedia el primer ingreso con la
 * contrasena temporal.
 *
 * El invariante que se fija aqui no es "tres campos mas": es que el estado
 * inicial de un alta sea IDENTICO por ambas ramas salvo la identidad del
 * registro. Asi, una columna nueva de `User` no puede volver a filtrarse.
 *
 * SEGURIDAD: sin PII real — todos los datos son ficticios.
 */

import { ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PlatformRole, UserRole, UserStatus, USERS_BULK_CREATE_QUEUE } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SearchQueueService } from '../../search/search-queue.service';
import { TenantService } from '../../tenant/tenant.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UsersService } from '../users.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (value: string) => `hashed:${value}`),
  compare: jest.fn(),
}));

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

/** Actor administrativo generico — no es PII real */
const ACTOR_ID = 'usr-00000000-0000-4000-a000-000000000099';

const redisProvider = {
  provide: REDIS_CLIENT,
  useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
};

const bulkQueueProvider = {
  provide: getQueueToken(USERS_BULK_CREATE_QUEUE),
  useValue: {
    add: jest.fn().mockResolvedValue({ id: 'job-bulk-1' }),
    getJob: jest.fn().mockResolvedValue(null),
  },
};

/** Campos que la resurreccion NO debe heredar de la vida anterior del registro. */
const CREDENCIALES_DE_RECUPERACION = [
  'passwordResetToken',
  'passwordResetTokenExpiresAt',
  'passwordResetExpiresAt',
] as const;

function buildCreateDto(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
  const dto = new CreateUserDto();
  dto.email = 'nuevo.usuario@empresa-demo.test';
  dto.role = UserRole.TECHNICIAN;
  return Object.assign(dto, overrides);
}

/** Registro soft-deleted con un reset de contrasena pendiente de su vida anterior. */
function buildSoftDeletedUser(): Record<string, unknown> {
  return {
    id: 'usr-00000000-0000-4000-a000-000000000009',
    email: 'nuevo.usuario@empresa-demo.test',
    emailHash: 'hash-previo',
    passwordHash: 'hashed:anterior',
    role: UserRole.SALES,
    status: UserStatus.SUSPENDED,
    tenantId: 'ten-00000000-0000-4000-a000-000000000001',
    mfaEnabled: true,
    mfaSecret: 'iv:tag:cipher',
    mfaRequired: true,
    isOperationalResource: true,
    passwordResetRequired: true,
    // Rastro de la vida anterior: token vigente + credencial temporal vencida.
    passwordResetToken: 'token-de-la-vida-anterior',
    passwordResetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    passwordResetExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    failedLoginAttempts: 4,
    lockedUntil: new Date(Date.now() + 60 * 1000),
    lastLoginAt: new Date('2026-01-01'),
    emailVerified: true,
    emailVerificationToken: 'token-verificacion-previo',
    firstName: 'Nombre previo',
    lastName: 'Apellido previo',
    phone: '+570000000000',
    jobTitle: 'Cargo previo',
    documentType: null,
    documentNumber: '000000000',
    avatarUrl: 'https://ejemplo.test/avatar-previo.png',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    deletedAt: new Date('2026-02-01'),
  };
}

interface ManagerMock {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  restore: jest.Mock;
}

function setupManager(findOneResult: unknown): ManagerMock {
  const manager: ManagerMock = {
    findOne: jest.fn().mockResolvedValue(findOneResult),
    create: jest
      .fn()
      .mockImplementation((_entity: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest
      .fn()
      .mockImplementation(async (_entity: unknown, instance: Record<string, unknown>) => {
        if (!instance['id']) instance['id'] = 'usr-generado-0000-4000-a000-000000000002';
        return instance;
      }),
    restore: jest.fn().mockResolvedValue(undefined),
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schema: string,
      callback: (qr: { manager: ManagerMock }) => Promise<unknown>,
    ) => callback({ manager }),
  );

  return manager;
}

describe('UsersService.create() — resurreccion de un usuario soft-deleted', () => {
  let service: UsersService;

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: TenantService, useValue: {} },
        {
          provide: SearchQueueService,
          useValue: { enqueueUserUpsert: jest.fn(), enqueueUserDelete: jest.fn() },
        },
        redisProvider,
        bulkQueueProvider,
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it.each(CREDENCIALES_DE_RECUPERACION)(
    'limpia %s heredado de la vida anterior del registro',
    async (campo) => {
      const manager = setupManager(buildSoftDeletedUser());

      await service.create(buildCreateDto(), ACTOR_ID);

      const persistido = manager.save.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(persistido[campo]).toBeNull();
    },
  );

  it('restaura el registro y lo deja sin marca de borrado', async () => {
    const manager = setupManager(buildSoftDeletedUser());

    await service.create(buildCreateDto(), ACTOR_ID);

    expect(manager.restore).toHaveBeenCalledTimes(1);
    const persistido = manager.save.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(persistido['deletedAt']).toBeNull();
  });

  it('el estado inicial es identico por ambas ramas salvo la identidad del registro', async () => {
    const dto = buildCreateDto({ firstName: 'Ana', lastName: 'Perez' });

    const managerResurreccion = setupManager(buildSoftDeletedUser());
    await service.create(dto, ACTOR_ID);
    const resucitado = { ...(managerResurreccion.save.mock.calls[0]?.[1] as object) } as Record<
      string,
      unknown
    >;

    const managerAlta = setupManager(null);
    await service.create(dto, ACTOR_ID);
    const nuevo = { ...(managerAlta.save.mock.calls[0]?.[1] as object) } as Record<string, unknown>;

    // Lo unico que sobrevive a una resurreccion: identidad y marcas de TypeORM.
    for (const campo of ['id', 'createdAt', 'updatedAt', 'deletedAt']) {
      delete resucitado[campo];
      delete nuevo[campo];
    }

    // El hash de contrasena difiere porque la temporal se genera al azar.
    delete resucitado['passwordHash'];
    delete nuevo['passwordHash'];

    expect(resucitado).toEqual(nuevo);
  });

  it('el usuario resucitado sin password explicito no arrastra una credencial temporal vencida', async () => {
    const manager = setupManager(buildSoftDeletedUser());

    await service.create(buildCreateDto(), ACTOR_ID);

    const persistido = manager.save.mock.calls[0]?.[1] as Record<string, unknown>;
    // passwordResetRequired sin expiracion vencida = puede iniciar sesion con la temporal.
    expect(persistido['passwordResetRequired']).toBe(true);
    expect(persistido['passwordResetExpiresAt']).toBeNull();
  });
});

describe('UsersService — allowlist de roles asignables desde el tenant (H-01)', () => {
  let service: UsersService;

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: TenantService, useValue: {} },
        {
          provide: SearchQueueService,
          useValue: { enqueueUserUpsert: jest.fn(), enqueueUserDelete: jest.fn() },
        },
        redisProvider,
        bulkQueueProvider,
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // Tras ADR-061 §4 los roles de plataforma ya no son miembros de `UserRole`, asi
  // que el tipo por si solo impide construir el DTO invalido. El invariante que
  // interesa es el de tiempo de ejecucion: un payload que trae ese literal —por
  // JSON crudo, por un cliente antiguo— sigue siendo rechazado. De ahi el cast.
  const PLATFORM_ROLES_AS_USER_ROLE = [
    PlatformRole.SYSTEM_ADMIN,
    PlatformRole.IWANA_SUPPORT,
  ] as unknown as UserRole[];

  it.each(PLATFORM_ROLES_AS_USER_ROLE)('create() rechaza el rol de plataforma %s', async (role) => {
    setupManager(null);

    await expect(service.create(buildCreateDto({ role }), ACTOR_ID)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each(PLATFORM_ROLES_AS_USER_ROLE)('update() rechaza escalar a %s', async (role) => {
    setupManager(null);
    const dto = new UpdateUserDto();
    dto.role = role;

    await expect(
      service.update('usr-00000000-0000-4000-a000-000000000001', dto, 'actor-uuid', UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('update() no toca la base de datos cuando el rol esta prohibido', async () => {
    const manager = setupManager(null);
    const dto = new UpdateUserDto();
    dto.role = PlatformRole.SYSTEM_ADMIN as unknown as UserRole;

    await expect(
      service.update('usr-00000000-0000-4000-a000-000000000001', dto, 'actor-uuid', UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('sigue admitiendo un rol legitimo de tenant', async () => {
    const manager = setupManager(null);

    await service.create(buildCreateDto({ role: UserRole.NOC }), ACTOR_ID);

    expect(manager.save).toHaveBeenCalledTimes(1);
  });
});
