import { NotFoundException } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { TenantContactPortAdapter } from '../ports/tenant-contact.adapter';

describe('TenantContactPortAdapter', () => {
  const tenantServiceMock = {
    findOne: jest.fn(),
  } as unknown as TenantService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getContactInfo mapea email, teléfono y razón social desde findOne', async () => {
    tenantServiceMock.findOne = jest.fn().mockResolvedValue({
      contactEmail: 'compras@tenant.example',
      phone: '+57 300 000 0000',
      legalName: 'Tenant Demo SAS',
    });

    const adapter = new TenantContactPortAdapter(tenantServiceMock);
    const result = await adapter.getContactInfo('tenant-001');

    expect(tenantServiceMock.findOne).toHaveBeenCalledWith('tenant-001');
    expect(result).toEqual({
      contactEmail: 'compras@tenant.example',
      phone: '+57 300 000 0000',
      legalName: 'Tenant Demo SAS',
    });
  });

  it('getContactInfo normaliza phone y legalName nulos', async () => {
    tenantServiceMock.findOne = jest.fn().mockResolvedValue({
      contactEmail: 'compras@tenant.example',
      phone: null,
      legalName: null,
    });

    const adapter = new TenantContactPortAdapter(tenantServiceMock);
    const result = await adapter.getContactInfo('tenant-001');

    expect(result).toEqual({
      contactEmail: 'compras@tenant.example',
      phone: null,
      legalName: null,
    });
  });

  it('getContactInfo propaga 404 de findOne', async () => {
    tenantServiceMock.findOne = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Tenant con id "tenant-missing" no encontrado.'));
    const adapter = new TenantContactPortAdapter(tenantServiceMock);

    await expect(adapter.getContactInfo('tenant-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
