import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { User, runInTenantSchema } from '@iwana/db';
import { UserRole, UserStatus } from '@iwana/shared';
import { TenantSeedService } from './tenant-seed.service';

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

  beforeEach(() => {
    service = new TenantSeedService({} as DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('crea el ADMIN inicial con password temporal hasheado e idempotencia de primer seed', async () => {
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
      adminEmail: 'admin@isptest.co',
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
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^IwN!a9-/), 12);
    expect(manager.create).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        email: 'admin@isptest.co',
        passwordHash: '$2b$12$seeded_hash',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        tenantId: 'tenant-uuid-1',
        passwordResetRequired: true,
        passwordResetExpiresAt: expect.any(Date),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(User, expect.any(Object));
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
      adminEmail: 'admin@isptest.co',
    });

    expect(result).toEqual({ created: false });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
});