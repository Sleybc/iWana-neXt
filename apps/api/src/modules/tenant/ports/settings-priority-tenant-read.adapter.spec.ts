import { TenantService } from '../tenant.service';
import { SettingsPriorityTenantReadAdapter } from './settings-priority-tenant-read.adapter';

describe('SettingsPriorityTenantReadAdapter', () => {
  const tenantService = {
    getTenantSelfSettings: jest.fn(),
    getTenantSelf: jest.fn(),
  };
  const adapter = new SettingsPriorityTenantReadAdapter(tenantService as unknown as TenantService);

  beforeEach(() => {
    jest.clearAllMocks();
    tenantService.getTenantSelfSettings.mockResolvedValue({
      features: { mfa_required_all: true },
    });
    tenantService.getTenantSelf.mockResolvedValue({
      logoLightUrl: null,
      logoLightAssetId: null,
      logoDarkUrl: null,
      logoDarkAssetId: null,
      sealLightUrl: null,
      sealLightAssetId: null,
      sealDarkUrl: null,
      sealDarkAssetId: null,
      faviconLightUrl: null,
      faviconLightAssetId: null,
      faviconDarkUrl: null,
      faviconDarkAssetId: null,
      loginBackgroundLightUrl: null,
      loginBackgroundLightAssetId: null,
      loginBackgroundDarkUrl: null,
      loginBackgroundDarkAssetId: null,
      brandingProductName: null,
      brandingSurfaceName: null,
      brandingMetadataTitle: null,
      brandingMetadataDescription: null,
    });
  });

  it('lee política MFA y detecta ausencia de branding explícito', async () => {
    await expect(
      adapter.getSnapshot({ tenantId: '11111111-1111-4111-8111-111111111111' }),
    ).resolves.toEqual({
      mfaRequiredAll: true,
      brandingCustomized: false,
    });
  });

  it.each([
    ['URL', { logoLightUrl: 'https://assets.example.test/logo.svg' }],
    ['asset', { sealDarkAssetId: '22222222-2222-4222-8222-222222222222' }],
    ['metadata', { brandingProductName: 'Empresa demo' }],
  ])('considera branding personalizado mediante %s', async (_source, brandingOverride) => {
    tenantService.getTenantSelf.mockResolvedValue(brandingOverride);

    const result = await adapter.getSnapshot({
      tenantId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.brandingCustomized).toBe(true);
  });

  it('no considera texto en blanco como metadata personalizada', async () => {
    tenantService.getTenantSelf.mockResolvedValue({ brandingMetadataTitle: '   ' });

    const result = await adapter.getSnapshot({
      tenantId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.brandingCustomized).toBe(false);
  });
});
