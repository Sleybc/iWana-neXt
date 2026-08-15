import { Injectable } from '@nestjs/common';
import { OrganizationCompanyBusinessHours, OrganizationSite, runInTenantSchema } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  SettingsPriorityOrganizationReadInput,
  SettingsPriorityOrganizationReadPort,
  SettingsPriorityOrganizationSnapshot,
} from './settings-priority-organization-read.port';

@Injectable()
export class SettingsPriorityOrganizationReadAdapter extends SettingsPriorityOrganizationReadPort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async getSnapshot(
    input: SettingsPriorityOrganizationReadInput,
  ): Promise<SettingsPriorityOrganizationSnapshot> {
    return runInTenantSchema(this.dataSource, input.schemaName, async (queryRunner) => {
      const siteRepository = queryRunner.manager.getRepository(OrganizationSite);
      const hoursRepository = queryRunner.manager.getRepository(OrganizationCompanyBusinessHours);

      const [activeOrganizationSites, validOpenCompanyDays] = await Promise.all([
        siteRepository.count({
          where: { tenantId: input.tenantId, isActive: true },
        }),
        hoursRepository
          .createQueryBuilder('hours')
          .where('hours.tenantId = :tenantId', { tenantId: input.tenantId })
          .andWhere('hours.isOpen = :isOpen', { isOpen: true })
          .andWhere('hours.opensAt IS NOT NULL')
          .andWhere('hours.closesAt IS NOT NULL')
          .andWhere('hours.opensAt < hours.closesAt')
          .getCount(),
      ]);

      return { activeOrganizationSites, validOpenCompanyDays };
    });
  }
}
