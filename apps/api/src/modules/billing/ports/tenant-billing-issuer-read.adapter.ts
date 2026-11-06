import { Injectable } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { BillingIssuerReadPort, type BillingIssuerIdentity } from './billing-issuer-read.port';

@Injectable()
export class TenantBillingIssuerReadAdapter extends BillingIssuerReadPort {
  constructor(private readonly tenants: TenantService) {
    super();
  }

  async getIssuerIdentity(tenantId: string): Promise<BillingIssuerIdentity> {
    const tenant = await this.tenants.findById(tenantId);
    return {
      legalName: tenant?.legalName ?? null,
      nit: tenant?.nit ?? null,
      verificationDigit: tenant?.nitDv ?? null,
    };
  }
}
