import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  NonRealizationCause,
  ScheduleEvent,
  WorkOrder,
  WorkOrderTask,
  ScheduleRescheduleLog,
  TechnicianAvailability,
  VisitRequest,
  WfmOperationalEventuality,
} from '@iwana/db';
import { OrganizationModule } from '../organization/organization.module';
import { TenantModule } from '../tenant/tenant.module';
import { ExpedientesModule } from '../crm/expedientes/expedientes.module';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { WfmController } from './wfm.controller';
import { NonRealizationCausesService } from './services/non-realization-causes.service';
import { NonRealizationSlaService } from './services/non-realization-sla.service';
import { OperationalEventualitiesService } from './services/operational-eventualities.service';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleEventsService } from './services/schedule-events.service';
import { VisitRequestsService } from './services/visit-requests.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import { ScheduleRecommendationsService } from './services/schedule-recommendations.service';
import { OperatingWindowResolverService } from './services/operating-window-resolver.service';
import { WfmWorkOrderReadPort } from './ports/wfm-work-order-read.port';
import { WfmWorkOrderReadAdapter } from './ports/wfm-work-order-read.adapter';
import { WfmTenantSettingsReadPort } from './ports/wfm-tenant-settings-read.port';
import { WfmTenantSettingsReadAdapter } from './ports/wfm-tenant-settings-read.adapter';
import { WfmOrganizationSitesReadPort } from './ports/wfm-organization-sites-read.port';
import { WfmOrganizationSitesAdapter } from './services/wfm-organization-sites.adapter';
import { FieldServiceWorkAdapter } from './ports/field-service-work.adapter';
import { FieldServiceWorkPort } from '../assurance/ports/field-service-work.port';

/**
 * Modulo WFM — Fase 01: Agenda, Work Orders y disponibilidad de tecnicos.
 * Bounded context: agenda operativa, reagendamiento, dashboard.
 * Expone WfmWorkOrderReadPort para comunicacion inter-modulo con CRM.
 */
@Module({
  imports: [
    TenantModule,
    OrganizationModule,
    ExpedientesModule,
    UsersModule,
    TasksModule,
    TypeOrmModule.forFeature([
      NonRealizationCause,
      ScheduleEvent,
      WorkOrder,
      WorkOrderTask,
      ScheduleRescheduleLog,
      TechnicianAvailability,
      VisitRequest,
      WfmOperationalEventuality,
    ]),
  ],
  controllers: [WfmController],
  providers: [
    NonRealizationCausesService,
    NonRealizationSlaService,
    ScheduleConflictService,
    ScheduleEventsService,
    VisitRequestsService,
    WorkOrdersService,
    TechnicianAvailabilityService,
    WfmDashboardService,
    ScheduleRecommendationsService,
    OperatingWindowResolverService,
    OperationalEventualitiesService,
    WfmOrganizationSitesAdapter,
    FieldServiceWorkAdapter,
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
    {
      provide: FieldServiceWorkPort,
      useClass: FieldServiceWorkAdapter,
    },
  ],
  exports: [WfmWorkOrderReadPort, FieldServiceWorkPort],
})
export class WfmModule implements OnModuleInit {
  constructor(
    private readonly scheduleEventsService: ScheduleEventsService,
    private readonly nonRealizationSlaService: NonRealizationSlaService,
  ) {}

  onModuleInit() {
    // Cablear NonRealizationSlaService en ScheduleEventsService
    // (evita dependencia circular vía constructor)
    this.scheduleEventsService.nonRealizationSlaService = this.nonRealizationSlaService;
  }
}
