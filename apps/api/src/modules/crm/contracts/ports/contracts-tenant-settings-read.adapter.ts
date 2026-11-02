import { Injectable } from '@nestjs/common';
import { SettingsPriorityTenantReadPort } from '../../../tenant/ports/settings-priority-tenant-read.port';
import { ContractsTenantSettingsReadPort } from './contracts-tenant-settings-read.port';

@Injectable()
export class ContractsTenantSettingsReadAdapter extends ContractsTenantSettingsReadPort {
  constructor(private readonly tenantSettings: SettingsPriorityTenantReadPort) {
    super();
  }

  async getTimezone(tenantId: string): Promise<string> {
    const settings = await this.tenantSettings.getSnapshot({ tenantId });
    return settings.timezone;
  }
}
