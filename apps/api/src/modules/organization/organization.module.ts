import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  OrganizationBusinessHoursException,
  OrganizationCompanyBusinessHours,
  OrganizationSite,
  OrganizationSiteAssignment,
  OrganizationSiteBusinessHour,
  OrganizationSiteCapabilityEntity,
  OrganizationSiteResponsibilityEntity,
} from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OperatorContractProfileController } from './operator-contract-profile.controller';
import { OperatorContractProfileService } from './operator-contract-profile.service';
import { OperatorContractProfileReadPort } from './ports/operator-contract-profile-read.port';
import { OperatorIdentityReadPort } from './ports/operator-identity-read.port';
import { TenantOperatorIdentityReadAdapter } from './ports/tenant-operator-identity-read.adapter';
import { TenantModule } from '../tenant/tenant.module';
import { OrganizationSiteReadAdapter } from './ports/organization-site-read.adapter';
import { OrganizationSiteReadPort } from './ports/organization-site-read.port';
import { OrganizationOperationalAccessAdapter } from './ports/organization-operational-access.adapter';
import { OrganizationOperationalAccessPort } from './ports/organization-operational-access.port';
import { SettingsPriorityOrganizationReadAdapter } from './ports/settings-priority-organization-read.adapter';
import { SettingsPriorityOrganizationReadPort } from './ports/settings-priority-organization-read.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationSite,
      OrganizationSiteCapabilityEntity,
      OrganizationSiteBusinessHour,
      OrganizationCompanyBusinessHours,
      OrganizationBusinessHoursException,
      OrganizationSiteAssignment,
      OrganizationSiteResponsibilityEntity,
    ]),
    AccessControlModule,
    AuditModule,
    TenantModule,
  ],
  controllers: [OrganizationController, OperatorContractProfileController],
  providers: [
    OrganizationService,
    OperatorContractProfileService,
    TenantOperatorIdentityReadAdapter,
    { provide: OperatorIdentityReadPort, useExisting: TenantOperatorIdentityReadAdapter },
    { provide: OperatorContractProfileReadPort, useExisting: OperatorContractProfileService },
    OrganizationSiteReadAdapter,
    OrganizationOperationalAccessAdapter,
    SettingsPriorityOrganizationReadAdapter,
    { provide: OrganizationSiteReadPort, useExisting: OrganizationSiteReadAdapter },
    {
      provide: OrganizationOperationalAccessPort,
      useExisting: OrganizationOperationalAccessAdapter,
    },
    {
      provide: SettingsPriorityOrganizationReadPort,
      useExisting: SettingsPriorityOrganizationReadAdapter,
    },
  ],
  exports: [
    OrganizationService,
    OperatorContractProfileReadPort,
    OrganizationSiteReadPort,
    OrganizationOperationalAccessPort,
    SettingsPriorityOrganizationReadPort,
  ],
})
export class OrganizationModule {}
