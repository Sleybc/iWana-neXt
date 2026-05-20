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
  WfmOperatingSite,
  WfmSiteBusinessHours,
  WfmTechnicianBusinessOverride,
} from '@iwana/db';
import { TenantModule } from '../tenant/tenant.module';
import { WfmController } from './wfm.controller';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleEventsService } from './services/schedule-events.service';
import { VisitRequestsService } from './services/visit-requests.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import { ScheduleRecommendationsService } from './services/schedule-recommendations.service';
import { OperatingSitesService } from './services/operating-sites.service';
import { CompanyBusinessHoursService } from './services/company-business-hours.service';
import { SiteBusinessHoursService } from './services/site-business-hours.service';
import { TechnicianBusinessOverridesService } from './services/technician-business-overrides.service';
import { HolidayBlackoutsService } from './services/holiday-blackouts.service';
import { OperatingWindowResolverService } from './services/operating-window-resolver.service';
import { WfmWorkOrderReadPort } from './ports/wfm-work-order-read.port';
import { WfmWorkOrderReadAdapter } from './ports/wfm-work-order-read.adapter';
import { WfmTenantSettingsReadPort } from './ports/wfm-tenant-settings-read.port';
import { WfmTenantSettingsReadAdapter } from './ports/wfm-tenant-settings-read.adapter';

/**
 * Modulo WFM — Fase 01: Agenda, Work Orders y disponibilidad de tecnicos.
 * Bounded context: agenda operativa, reagendamiento, dashboard.
 * Expone WfmWorkOrderReadPort para comunicacion inter-modulo con CRM.
 */
@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([
      ScheduleEvent,
      WorkOrder,
      WorkOrderTask,
      ScheduleRescheduleLog,
      TechnicianAvailability,
      VisitRequest,
      WfmOperatingSite,
      WfmCompanyBusinessHours,
      WfmSiteBusinessHours,
      WfmTechnicianBusinessOverride,
      WfmHolidayBlackout,
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
    OperatingSitesService,
    CompanyBusinessHoursService,
    SiteBusinessHoursService,
    TechnicianBusinessOverridesService,
    HolidayBlackoutsService,
    OperatingWindowResolverService,
    WfmTenantSettingsReadAdapter,
    {
      provide: WfmWorkOrderReadPort,
      useClass: WfmWorkOrderReadAdapter,
    },
    {
      provide: WfmTenantSettingsReadPort,
      useExisting: WfmTenantSettingsReadAdapter,
    },
  ],
  exports: [WfmWorkOrderReadPort],
})
export class WfmModule {}
