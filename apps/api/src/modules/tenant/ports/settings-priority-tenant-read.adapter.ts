import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenant.service';
import {
  SettingsPriorityTenantReadInput,
  SettingsPriorityTenantReadPort,
  SettingsPriorityTenantSnapshot,
} from './settings-priority-tenant-read.port';

const BRANDING_FIELDS = [
  'logoLightUrl',
  'logoLightAssetId',
  'logoDarkUrl',
  'logoDarkAssetId',
  'sealLightUrl',
  'sealLightAssetId',
  'sealDarkUrl',
  'sealDarkAssetId',
  'faviconLightUrl',
  'faviconLightAssetId',
  'faviconDarkUrl',
  'faviconDarkAssetId',
  'loginBackgroundLightUrl',
  'loginBackgroundLightAssetId',
  'loginBackgroundDarkUrl',
  'loginBackgroundDarkAssetId',
  'brandingProductName',
  'brandingSurfaceName',
  'brandingMetadataTitle',
  'brandingMetadataDescription',
] as const;

@Injectable()
export class SettingsPriorityTenantReadAdapter extends SettingsPriorityTenantReadPort {
  constructor(private readonly tenantService: TenantService) {
    super();
  }

  async getSnapshot(
    input: SettingsPriorityTenantReadInput,
  ): Promise<SettingsPriorityTenantSnapshot> {
    const [settings, tenant] = await Promise.all([
      this.tenantService.getTenantSelfSettings(input.tenantId),
      this.tenantService.getTenantSelf(input.tenantId),
    ]);

    return {
      mfaRequiredAll: settings.features.mfa_required_all,
      brandingCustomized: BRANDING_FIELDS.some((field) => {
        const value = tenant[field];
        return typeof value === 'string' && value.trim().length > 0;
      }),
    };
  }
}
