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
import { OrganizationSiteReadAdapter } from './ports/organization-site-read.adapter';
import { OrganizationSiteReadPort } from './ports/organization-site-read.port';

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
  ],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationSiteReadAdapter,
    { provide: OrganizationSiteReadPort, useExisting: OrganizationSiteReadAdapter },
  ],
  exports: [OrganizationService, OrganizationSiteReadPort],
})
export class OrganizationModule {}
