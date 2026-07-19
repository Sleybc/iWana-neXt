import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User, runInTenantSchema } from '@iwana/db';
import { UserRole, UserStatus } from '@iwana/shared';
import { TenantSeedService } from './tenant-seed.service';

/** Email del ADMIN indicado al crear la empresa: ya no es una constante del seed. */
const SEED_ADMIN_EMAIL = 'admin@isptest.co';

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
        return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
      adminEmail: SEED_ADMIN_EMAIL,
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
    // El ADMIN nace bloqueado: la contraseña que se hashea es aleatoria y nadie
    // la conoce. Antes era la misma para todas las empresas del despliegue.
    const [hashedSecret, rounds] = (bcrypt.hash as jest.Mock).mock.calls[0] as [string, number];
    expect(rounds).toBe(12);
    expect(hashedSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(hashedSecret).not.toBe('InicioAdmin!2026');

    // Y es distinta en cada invocación: no se deriva de nada compartido.
    (bcrypt.hash as jest.Mock).mockClear();
    await service.seedInitialAdmin({
      tenantId: 'tenant-uuid-2',
      tenantSlug: 'otro-isp',
      schemaName: 'tenant_otro_isp',
      adminEmail: 'admin@otroisp.co',
    });
    const [segundoSecreto] = (bcrypt.hash as jest.Mock).mock.calls[0] as [string];
    expect(segundoSecreto).not.toBe(hashedSecret);
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
      require('crypto').createHash('sha256').update(SEED_ADMIN_EMAIL).digest('hex'),
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
      adminEmail: SEED_ADMIN_EMAIL,
    });

    expect(result).toEqual({ created: false });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  describe('seedTaxPresets', () => {
    it('siembra los 6 presets Colombia si no existen', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([]) // primer preset no existe
          .mockResolvedValueOnce(undefined) // insert
          .mockResolvedValueOnce([]) // segundo preset no existe
          .mockResolvedValueOnce(undefined) // insert
          .mockResolvedValueOnce([]) // tercer preset no existe
          .mockResolvedValueOnce(undefined) // insert
          .mockResolvedValueOnce([]) // cuarto preset no existe
          .mockResolvedValueOnce(undefined) // insert
          .mockResolvedValueOnce([]) // quinto preset no existe
          .mockResolvedValueOnce(undefined) // insert
          .mockResolvedValueOnce([]) // sexto preset no existe
          .mockResolvedValueOnce(undefined), // insert
      };

      mockRunInTenantSchema.mockImplementation(
        async (
          _ds: unknown,
          _schema: string,
          cb: (qr: { manager: typeof manager }) => Promise<unknown>,
        ) => cb({ manager }),
      );

      await service.seedTaxPresets('tenant_test_schema');

      // Se hacen 12 llamadas: 6 SELECT (check) + 6 INSERT
      expect(manager.query).toHaveBeenCalledTimes(12);
      // Primer SELECT verifica 'IVA_19'
      expect(manager.query.mock.calls[0][1]).toContain('IVA_19');
    });

    it('omite presets que ya existen (idempotencia)', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([{ id: 'existing-uuid' }]), // todos existen
      };

      mockRunInTenantSchema.mockImplementation(
        async (
          _ds: unknown,
          _schema: string,
          cb: (qr: { manager: typeof manager }) => Promise<unknown>,
        ) => cb({ manager }),
      );

      await service.seedTaxPresets('tenant_test_schema');

      // Solo SELECTs, ningún INSERT
      expect(manager.query).toHaveBeenCalledTimes(6); // 6 checks, 0 inserts
    });
  });
});
