import { Injectable } from '@nestjs/common';
import { runInTenantSchema, User } from '@iwana/db';
import { UserStatus } from '@iwana/shared';
import { DataSource } from 'typeorm';
import {
  SettingsPriorityUsersReadInput,
  SettingsPriorityUsersReadPort,
  SettingsPriorityUsersSnapshot,
} from './settings-priority-users-read.port';

@Injectable()
export class SettingsPriorityUsersReadAdapter extends SettingsPriorityUsersReadPort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async getSnapshot(input: SettingsPriorityUsersReadInput): Promise<SettingsPriorityUsersSnapshot> {
    return runInTenantSchema(this.dataSource, input.schemaName, async (queryRunner) => {
      const repository = queryRunner.manager.getRepository(User);
      const [activeUsers, mfaEnabledActiveUsers] = await Promise.all([
        repository.count({
          where: { tenantId: input.tenantId, status: UserStatus.ACTIVE },
        }),
        repository.count({
          where: {
            tenantId: input.tenantId,
            status: UserStatus.ACTIVE,
            mfaEnabled: true,
          },
        }),
      ]);

      return { activeUsers, mfaEnabledActiveUsers };
    });
  }
}
