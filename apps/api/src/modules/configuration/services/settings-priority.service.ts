import { Injectable } from '@nestjs/common';
import { SettingsPrioritySource, type SettingsPriorityResponse } from '@iwana/shared';
import { SettingsPriorityOrganizationReadPort } from '../../organization/ports/settings-priority-organization-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { SettingsPriorityUsersReadPort } from '../../users/ports/settings-priority-users-read.port';
import { evaluateSettingsPriority } from './settings-priority-evaluator';

export interface SettingsPriorityContext {
  tenantId: string;
  schemaName: string;
}

@Injectable()
export class SettingsPriorityService {
  constructor(
    private readonly tenantPort: SettingsPriorityTenantReadPort,
    private readonly usersPort: SettingsPriorityUsersReadPort,
    private readonly organizationPort: SettingsPriorityOrganizationReadPort,
  ) {}

  async getPriority(context: SettingsPriorityContext): Promise<SettingsPriorityResponse> {
    const [tenantResult, usersResult, organizationResult] = await Promise.allSettled([
      this.tenantPort.getSnapshot({ tenantId: context.tenantId }),
      this.usersPort.getSnapshot(context),
      this.organizationPort.getSnapshot(context),
    ]);

    const unknownSources: SettingsPrioritySource[] = [];

    if (tenantResult.status === 'rejected') {
      unknownSources.push(SettingsPrioritySource.TENANT);
    }
    if (usersResult.status === 'rejected') {
      unknownSources.push(SettingsPrioritySource.USERS);
    }
    if (organizationResult.status === 'rejected') {
      unknownSources.push(SettingsPrioritySource.ORGANIZATION);
    }

    return evaluateSettingsPriority({
      tenant: tenantResult.status === 'fulfilled' ? tenantResult.value : null,
      users: usersResult.status === 'fulfilled' ? usersResult.value : null,
      organization: organizationResult.status === 'fulfilled' ? organizationResult.value : null,
      unknownSources,
    });
  }
}
