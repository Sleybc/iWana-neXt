import { Injectable } from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { WfmTenantSettingsReadPort } from './wfm-tenant-settings-read.port';

@Injectable()
export class WfmTenantSettingsReadAdapter extends WfmTenantSettingsReadPort {
  constructor(private readonly tenantService: TenantService) {
    super();
  }

  async getTimezone(tenantId: string): Promise<string> {
    const settings = await this.tenantService.getTenantSelfSettings(tenantId);
    return settings.timezone;
  }
}
