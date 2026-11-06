import { TenantService } from '../../tenant/tenant.service';
import { TenantBillingIssuerReadAdapter } from './tenant-billing-issuer-read.adapter';

describe('TenantBillingIssuerReadAdapter', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  let tenants: { findById: jest.Mock };
  let adapter: TenantBillingIssuerReadAdapter;

  beforeEach(() => {
    tenants = { findById: jest.fn() };
    adapter = new TenantBillingIssuerReadAdapter(tenants as unknown as TenantService);
  });

  it('proyecta la identidad fiscal del tenant con su dígito de verificación', async () => {
    tenants.findById.mockResolvedValueOnce({
      legalName: 'Proveedor S.A.S.',
      nit: '900123456',
      nitDv: '7',
    });

    await expect(adapter.getIssuerIdentity(tenantId)).resolves.toEqual({
      legalName: 'Proveedor S.A.S.',
      nit: '900123456',
      verificationDigit: '7',
    });
    expect(tenants.findById).toHaveBeenCalledWith(tenantId);
  });

  it('devuelve nulos cuando el tenant no existe, sin inventar identidad fiscal', async () => {
    tenants.findById.mockResolvedValueOnce(null);

    await expect(adapter.getIssuerIdentity(tenantId)).resolves.toEqual({
      legalName: null,
      nit: null,
      verificationDigit: null,
    });
  });
});
