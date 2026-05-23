import { BadRequestException } from '@nestjs/common';
import { OrganizationSiteCapability, UserRole } from '@iwana/shared';
import { OrganizationSiteReadPort } from '../../organization/ports/organization-site-read.port';
import { WfmOrganizationSitesAdapter } from './wfm-organization-sites.adapter';

describe('WfmOrganizationSitesAdapter', () => {
  const organizationSiteReadPort = {
    listByCapability: jest.fn(),
  } as jest.Mocked<OrganizationSiteReadPort>;

  const service = new WfmOrganizationSitesAdapter(organizationSiteReadPort);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list dispatch sites through OrganizationSiteReadPort', async () => {
    organizationSiteReadPort.listByCapability.mockResolvedValue([
      {
        id: '4a98ba31-9c6f-4a3b-a21d-f0b6de5e7161',
        name: 'Centro operativo norte',
        code: 'NORTE',
        capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
        isActive: true,
      },
    ]);

    await expect(
      service.listDispatchSites({
        sub: 'admin-1',
        email: 'admin@example.test',
        role: UserRole.ADMIN,
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      }),
    ).resolves.toEqual([
      {
        id: '4a98ba31-9c6f-4a3b-a21d-f0b6de5e7161',
        name: 'Centro operativo norte',
        code: 'NORTE',
        capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
        isActive: true,
      },
    ]);

    expect(organizationSiteReadPort.listByCapability).toHaveBeenCalledWith({
      tenantId: 'tenant-001',
      capability: OrganizationSiteCapability.TECH_DISPATCH,
    });
  });

  it('should reject listing dispatch sites without tenantId', async () => {
    await expect(
      service.listDispatchSites({
        sub: 'admin-1',
        email: 'admin@example.test',
        role: UserRole.ADMIN,
        tenantId: '',
        schemaName: 'tenant_001',
        jti: 'jti-001',
        type: 'tenant',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(organizationSiteReadPort.listByCapability).not.toHaveBeenCalled();
  });
});
