import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ScheduleEvent,
  WorkOrder,
  WorkOrderTask,
  ScheduleRescheduleLog,
  TechnicianAvailability,
} from '@iwana/db';
import { WfmController } from './wfm.controller';
import { ScheduleConflictService } from './services/schedule-conflict.service';
import { ScheduleEventsService } from './services/schedule-events.service';
import { WorkOrdersService } from './services/work-orders.service';
import { TechnicianAvailabilityService } from './services/technician-availability.service';
import { WfmDashboardService } from './services/wfm-dashboard.service';
import { WfmWorkOrderReadPort } from './ports/wfm-work-order-read.port';
import { WfmWorkOrderReadAdapter } from './ports/wfm-work-order-read.adapter';

/**
 * Modulo WFM — Fase 01: Agenda, Work Orders y disponibilidad de tecnicos.
 * Bounded context: agenda operativa, reagendamiento, dashboard.
 * Expone WfmWorkOrderReadPort para comunicacion inter-modulo con CRM.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduleEvent,
      WorkOrder,
      WorkOrderTask,
      ScheduleRescheduleLog,
      TechnicianAvailability,
    ]),
  ],
  controllers: [WfmController],
  providers: [
    ScheduleConflictService,
    ScheduleEventsService,
    WorkOrdersService,
    TechnicianAvailabilityService,
    WfmDashboardService,
    {
      provide: WfmWorkOrderReadPort,
      useClass: WfmWorkOrderReadAdapter,
    },
  ],
  exports: [WfmWorkOrderReadPort],
})
export class WfmModule {}
