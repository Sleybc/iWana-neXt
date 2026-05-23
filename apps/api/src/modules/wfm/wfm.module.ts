import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ScheduleEvent,
  WorkOrder,
  WorkOrderTask,
  ScheduleRescheduleLog,
  TechnicianAvailability,
  VisitRequest,
  WfmCompanyBusinessHours,
  WfmHolidayBlackout,
  WfmSiteBusinessHours,
  WfmOperationalEventuality,
} from '@iwana/db';
import { OrganizationModule } from '../organization/organization.module';
import { TenantModule } from '../tenant/tenant.module';
import { WfmController } from './wfm.controller';
import { OperationalEventualitiesService } from './services/operational-eventualities.service';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleEventsService } from './services/schedule-events.service';
import { VisitRequestsService } from './services/visit-requests.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import { ScheduleRecommendationsService } from './services/schedule-recommendations.service';
import { CompanyBusinessHoursService } from './services/company-business-hours.service';
import { SiteBusinessHoursService } from './services/site-business-hours.service';
import { HolidayBlackoutsService } from './services/holiday-blackouts.service';
import { OperatingWindowResolverService } from './services/operating-window-resolver.service';
import { WfmWorkOrderReadPort } from './ports/wfm-work-order-read.port';
import { WfmWorkOrderReadAdapter } from './ports/wfm-work-order-read.adapter';
import { WfmTenantSettingsReadPort } from './ports/wfm-tenant-settings-read.port';
import { WfmTenantSettingsReadAdapter } from './ports/wfm-tenant-settings-read.adapter';
import { WfmOrganizationSitesReadPort } from './ports/wfm-organization-sites-read.port';
import { WfmOrganizationSitesAdapter } from './services/wfm-organization-sites.adapter';

/**
 * Modulo WFM — Fase 01: Agenda, Work Orders y disponibilidad de tecnicos.
 * Bounded context: agenda operativa, reagendamiento, dashboard.
 * Expone WfmWorkOrderReadPort para comunicacion inter-modulo con CRM.
 */
@Module({
  imports: [
    TenantModule,
    OrganizationModule,
    TypeOrmModule.forFeature([
      ScheduleEvent,
      WorkOrder,
      WorkOrderTask,
      ScheduleRescheduleLog,
      TechnicianAvailability,
      VisitRequest,
      WfmCompanyBusinessHours,
      WfmSiteBusinessHours,
      WfmHolidayBlackout,
      WfmOperationalEventuality,
    ]),
  ],
  controllers: [WfmController],
  providers: [
    ScheduleConflictService,
    ScheduleEventsService,
    VisitRequestsService,
    WorkOrdersService,
    TechnicianAvailabilityService,
    WfmDashboardService,
    ScheduleRecommendationsService,
    CompanyBusinessHoursService,
    SiteBusinessHoursService,
    HolidayBlackoutsService,
    OperatingWindowResolverService,
    OperationalEventualitiesService,
    WfmOrganizationSitesAdapter,
    WfmTenantSettingsReadAdapter,
    {
      provide: WfmWorkOrderReadPort,
      useClass: WfmWorkOrderReadAdapter,
    },
    {
      provide: WfmTenantSettingsReadPort,
      useExisting: WfmTenantSettingsReadAdapter,
    },
    {
      provide: WfmOrganizationSitesReadPort,
      useExisting: WfmOrganizationSitesAdapter,
    },
  ],
  exports: [WfmWorkOrderReadPort],
})
export class WfmModule {}
