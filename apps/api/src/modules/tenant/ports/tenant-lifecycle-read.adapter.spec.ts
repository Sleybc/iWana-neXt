import { Tenant } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { IsNull, Repository } from 'typeorm';
import { TenantLifecycleReadAdapter } from './tenant-lifecycle-read.adapter';

describe('TenantLifecycleReadAdapter', () => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tenant-mod13',
    schemaName: 'tenant_mod13',
    status: TenantStatus.ACTIVE,
    deletedAt: null,
  } as Tenant;

  it('lista solo tenants activos y no eliminados en orden estable', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([tenant]),
      findOne: jest.fn(),
    } as unknown as Repository<Tenant>;
    const adapter = new TenantLifecycleReadAdapter(repository);

    await expect(adapter.listActiveTenantContexts()).resolves.toEqual([
      {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schemaName,
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      },
    ]);

    expect(repository.find).toHaveBeenCalledWith({
      where: { status: TenantStatus.ACTIVE, deletedAt: IsNull() },
      select: ['id', 'slug', 'schemaName', 'status', 'deletedAt'],
      order: { schemaName: 'ASC' },
    });
  });

  it('lee el estado por ID sin ocultar estados no activos ni borrado lógico', async () => {
    const suspended = { ...tenant, status: TenantStatus.SUSPENDED, deletedAt: null } as Tenant;
    const repository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(suspended),
    } as unknown as Repository<Tenant>;
    const adapter = new TenantLifecycleReadAdapter(repository);

    await expect(adapter.findTenantLifecycleById(suspended.id)).resolves.toEqual({
      id: suspended.id,
      slug: suspended.slug,
      schemaName: suspended.schemaName,
      status: TenantStatus.SUSPENDED,
      deletedAt: null,
    });

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: suspended.id },
      select: ['id', 'slug', 'schemaName', 'status', 'deletedAt'],
    });
  });

  it('devuelve null cuando el tenant no existe', async () => {
    const repository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<Tenant>;
    const adapter = new TenantLifecycleReadAdapter(repository);

    await expect(adapter.findTenantLifecycleById(tenant.id)).resolves.toBeNull();
  });
});
