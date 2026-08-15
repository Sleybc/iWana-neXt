export interface SettingsPriorityOrganizationSnapshot {
  activeOrganizationSites: number;
  validOpenCompanyDays: number;
}

export interface SettingsPriorityOrganizationReadInput {
  tenantId: string;
  schemaName: string;
}

export abstract class SettingsPriorityOrganizationReadPort {
  abstract getSnapshot(
    input: SettingsPriorityOrganizationReadInput,
  ): Promise<SettingsPriorityOrganizationSnapshot>;
}
