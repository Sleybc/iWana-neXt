import { Injectable } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { TenantContactInfo, TenantContactPort } from './tenant-contact.port';

@Injectable()
export class TenantContactPortAdapter extends TenantContactPort {
  constructor(private readonly tenantService: TenantService) {
    super();
  }

  async getContactInfo(tenantId: string): Promise<TenantContactInfo> {
    // findOne proyecta TenantResponseDto (no la entidad) y lanza 404 si no existe.
    const tenant = await this.tenantService.findOne(tenantId);

    return {
      contactEmail: tenant.contactEmail,
      phone: tenant.phone ?? null,
      legalName: tenant.legalName ?? null,
    };
  }
}
