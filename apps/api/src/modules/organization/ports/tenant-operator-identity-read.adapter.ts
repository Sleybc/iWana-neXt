import { Injectable } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { OperatorIdentityReadPort, type OperatorIdentity } from './operator-identity-read.port';

@Injectable()
export class TenantOperatorIdentityReadAdapter extends OperatorIdentityReadPort {
  constructor(private readonly tenants: TenantService) {
    super();
  }

  async getOperatorIdentity(tenantId: string): Promise<OperatorIdentity> {
    const tenant = await this.tenants.findById(tenantId);
    return { legalName: tenant?.legalName ?? null, nit: tenant?.nit ?? null };
  }
}
