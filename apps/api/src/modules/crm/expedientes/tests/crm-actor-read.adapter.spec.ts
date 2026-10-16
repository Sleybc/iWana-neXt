import { DataSource } from 'typeorm';
import { PlatformUser, User } from '@iwana/db';
import { CrmActorReadAdapter } from '../crm-actor-read.adapter';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

describe('CrmActorReadAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selecciona únicamente campos operativos y devuelve null si no hay nombre compuesto', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'platform-user-1', firstName: null, lastName: null }]),
    };
    mockRunInTenantSchema.mockImplementationOnce(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );

    const adapter = new CrmActorReadAdapter({} as DataSource);
    await expect(adapter.findByIds('tenant_test', ['platform-user-1'])).resolves.toEqual([
      { id: 'platform-user-1', name: null, role: null },
    ]);

    expect(manager.find).toHaveBeenNthCalledWith(1, User, {
      where: { id: expect.anything() },
      select: ['id', 'firstName', 'lastName', 'role'],
    });
    expect(manager.find).toHaveBeenNthCalledWith(2, PlatformUser, {
      where: { id: expect.anything() },
      select: ['id', 'firstName', 'lastName'],
    });
  });

  it('devuelve vacío para búsquedas vacías y no consulta fuentes externas para un actor vacío', async () => {
    const manager = { find: jest.fn() };
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const adapter = new CrmActorReadAdapter({} as DataSource);

    await expect(adapter.findByIds('tenant_test', [])).resolves.toEqual([]);
    await expect(adapter.findById('tenant_test', '')).resolves.toBeNull();

    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    expect(manager.find).not.toHaveBeenCalled();
  });

  it('combina actores tenant y evita consultar plataforma cuando todos coinciden', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'tenant-user-1', firstName: 'Asesora', lastName: 'Sintética', role: 'SALES' },
        ]),
    };
    mockRunInTenantSchema.mockImplementationOnce(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const adapter = new CrmActorReadAdapter({} as DataSource);

    await expect(adapter.findById('tenant_test', 'tenant-user-1')).resolves.toEqual({
      id: 'tenant-user-1',
      name: 'Asesora Sintética',
      role: 'SALES',
    });

    expect(manager.find).toHaveBeenCalledTimes(1);
    expect(manager.find).toHaveBeenCalledWith(User, expect.any(Object));
  });

  it('devuelve null para ids no encontrados y conserva un nombre con un solo componente', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'platform-user-2', firstName: 'Agente', lastName: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const adapter = new CrmActorReadAdapter({} as DataSource);

    await expect(adapter.findById('tenant_test', 'platform-user-2')).resolves.toEqual({
      id: 'platform-user-2',
      name: 'Agente',
      role: null,
    });
    await expect(adapter.findById('tenant_test', 'missing-user')).resolves.toBeNull();

    expect(manager.find).toHaveBeenCalledTimes(4);
  });
});
