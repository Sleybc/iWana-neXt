export interface SettingsPriorityUsersSnapshot {
  activeUsers: number;
  mfaEnabledActiveUsers: number;
}

export interface SettingsPriorityUsersReadInput {
  tenantId: string;
  schemaName: string;
}

export abstract class SettingsPriorityUsersReadPort {
  abstract getSnapshot(
    input: SettingsPriorityUsersReadInput,
  ): Promise<SettingsPriorityUsersSnapshot>;
}
