import { runInTenantSchema, TenantContext, User } from '@iwana/db';
import { DataSource, FindManyOptions } from 'typeorm';
import { NetworkActorReadAdapter } from './network-actor-read.adapter';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
  TenantContext: { getOrThrow: jest.fn() },
}));

describe('NetworkActorReadAdapter', () => {
  const tenantId = 'b57994a2-37da-4b2b-9cdb-fdd7abf49dd0';
  const actorId = 'c87cb0cf-09b5-4f87-bc76-b305441cddc3';
  const find = jest.fn();
  let adapter: NetworkActorReadAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId,
      schemaName: 'tenant_mod13_actor_read',
      tenantSlug: 'mod13-actor-read',
    });
    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource: DataSource,
        _schemaName: string,
        operation: (runner: unknown) => unknown,
      ) => operation({ manager: { find } }),
    );
    find.mockResolvedValue([]);
    adapter = new NetworkActorReadAdapter({} as DataSource);
  });

  it('filtra los usuarios del tenant por el tenant autenticado y consulta usuarios de plataforma aparte', async () => {
    await adapter.findByIds('tenant_mod13_actor_read', [actorId]);

    const tenantUserOptions = find.mock.calls[0]?.[1] as FindManyOptions<User>;
    expect(tenantUserOptions.where).toMatchObject({ id: expect.anything(), tenantId });
    expect(find.mock.calls[0]?.[0]).toBe(User);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[1]?.[1]).toMatchObject({
      where: { id: expect.anything() },
    });
    expect(find.mock.calls[1]?.[1].where).not.toHaveProperty('tenantId');
  });
});
