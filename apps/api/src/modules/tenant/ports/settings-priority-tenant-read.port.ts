export interface SettingsPriorityTenantSnapshot {
  mfaRequiredAll: boolean;
  brandingCustomized: boolean;
}

export interface SettingsPriorityTenantReadInput {
  tenantId: string;
}

export abstract class SettingsPriorityTenantReadPort {
  abstract getSnapshot(
    input: SettingsPriorityTenantReadInput,
  ): Promise<SettingsPriorityTenantSnapshot>;
}
