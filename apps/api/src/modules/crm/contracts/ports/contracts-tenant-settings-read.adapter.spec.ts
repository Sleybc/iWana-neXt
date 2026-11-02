import { ContractsTenantSettingsReadAdapter } from './contracts-tenant-settings-read.adapter';
import { SettingsPriorityTenantReadPort } from '../../../tenant/ports/settings-priority-tenant-read.port';

it('lee timezone mediante el port público de Tenant', async () => {
  const getSnapshot = jest.fn().mockResolvedValue({
    timezone: 'America/Bogota',
    mfaRequiredAll: false,
    brandingCustomized: false,
  });
  const adapter = new ContractsTenantSettingsReadAdapter({
    getSnapshot,
  } as SettingsPriorityTenantReadPort);
  expect(await adapter.getTimezone('tenant-synthetic')).toBe('America/Bogota');
  expect(getSnapshot).toHaveBeenCalledWith({ tenantId: 'tenant-synthetic' });
});
