import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User, runInTenantSchema } from '@iwana/db';
import { UserRole, UserStatus } from '@iwana/shared';
import { INITIAL_TENANT_ADMIN_EMAIL, TenantSeedService } from './tenant-seed.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

describe('TenantSeedService', () => {
  let service: TenantSeedService;
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY') {
        return '0'.repeat(64);
      }

      if (key === 'TENANT_INITIAL_ADMIN_PASSWORD') {
        return 'InicioAdmin!2026';
      }

      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    service = new TenantSeedService({} as DataSource, configService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('crea el ADMIN inicial con contraseña fija hasheada e idempotencia de primer seed', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_: unknown, partial: unknown) => partial),
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockRunInTenantSchema.mockImplementation(
      async (
        _dataSource: unknown,
        _schemaName: string,
        callback: (qr: { manager: typeof manager }) => Promise<unknown>,
      ) => callback({ manager }),
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$seeded_hash');

    const result = await service.seedInitialAdmin({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
    });

    expect(result).toEqual({ created: true });
    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.any(Object),
      'tenant_isp_test',
      expect.any(Function),
    );
    expect(manager.findOne).toHaveBeenCalledWith(User, {
      where: { emailHash: expect.any(String) },
      withDeleted: true,
    });
    expect(bcrypt.hash).toHaveBeenCalledWith('InicioAdmin!2026', 12);
    expect(manager.create).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        email: expect.any(String),
        passwordHash: '$2b$12$seeded_hash',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        tenantId: 'tenant-uuid-1',
        passwordResetRequired: true,
        passwordResetExpiresAt: expect.any(Date),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(User, expect.any(Object));

    const [, createdUser] = manager.create.mock.calls[0] as [unknown, { emailHash: string }];
    expect(createdUser.emailHash).toBe(
      require('crypto').createHash('sha256').update(INITIAL_TENANT_ADMIN_EMAIL).digest('hex'),
    );
  });

  it('no crea un segundo ADMIN si el email ya existe en el schema del tenant', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'existing-admin' }),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockRunInTenantSchema.mockImplementation(
      async (
        _dataSource: unknown,
        _schemaName: string,
        callback: (qr: { manager: typeof manager }) => Promise<unknown>,
      ) => callback({ manager }),
    );

    const result = await service.seedInitialAdmin({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
    });

    expect(result).toEqual({ created: false });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('falla temprano si la contraseña fija inicial no cumple la política mínima', () => {
    const invalidConfigService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') {
          return '0'.repeat(64);
        }

        if (key === 'TENANT_INITIAL_ADMIN_PASSWORD') {
          return 'debilenv';
        }

        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as ConfigService;

    expect(() => new TenantSeedService({} as DataSource, invalidConfigService)).toThrow(
      'TENANT_INITIAL_ADMIN_PASSWORD no cumple la política mínima',
    );
  });
});
