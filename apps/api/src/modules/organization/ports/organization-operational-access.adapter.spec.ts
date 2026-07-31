import { OrganizationOperationalAccessAdapter } from './organization-operational-access.adapter';

describe('OrganizationOperationalAccessAdapter', () => {
  it('resuelve permiso, perfil activo y asignación vigente en el manager recibido', async () => {
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: 'user-001' }),
    };
    const manager = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
    const adapter = new OrganizationOperationalAccessAdapter();

    await expect(
      adapter.canSuperviseExecutionOrder(manager as never, {
        tenantId: 'tenant-001',
        userId: 'user-001',
        organizationSiteId: 'site-001',
      }),
    ).resolves.toBe(true);

    expect(manager.createQueryBuilder).toHaveBeenCalled();
    expect(builder.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-001',
        siteId: 'site-001',
        supervisePermission: 'operations.execution_orders.supervise',
        supervisorAssignment: 'SUPERVISOR',
        fieldOperationsResponsibility: 'FIELD_OPERATIONS',
      }),
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(siteAssignment.id IS NOT NULL OR siteResponsibility.id IS NOT NULL)',
    );
  });

  it('falla cerrado cuando no existe una fila de autorización vigente', async () => {
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new OrganizationOperationalAccessAdapter();

    await expect(
      adapter.canSuperviseExecutionOrder(
        { createQueryBuilder: jest.fn().mockReturnValue(builder) } as never,
        { tenantId: 'tenant-002', userId: 'user-002', organizationSiteId: 'site-002' },
      ),
    ).resolves.toBe(false);
  });
});
