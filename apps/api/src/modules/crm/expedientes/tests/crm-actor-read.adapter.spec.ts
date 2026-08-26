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
});
