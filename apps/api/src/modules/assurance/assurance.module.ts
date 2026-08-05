import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SupportTicket,
  TicketComment,
  TicketPqrRecord,
  TicketSlaPolicy,
  TicketTimelineEvent,
  TicketWorkOrderLink,
} from '@iwana/db';
import { ASSURANCE_FIELD_SERVICE_QUEUE } from '@iwana/shared';
import { WfmModule } from '../wfm/wfm.module';
import { AssuranceController } from './assurance.controller';
import { AssuranceExecutionOrderNotifierAdapter } from './ports/assurance-execution-order-notifier.adapter';
import { AssuranceFieldServiceAdapter } from './ports/assurance-field-service.adapter';
import { AssuranceFieldServicePort } from './ports/assurance-field-service.port';
import { ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT } from '../tasks/ports/assurance-execution-order-notifier.port';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { PqrService } from './services/pqr.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';

@Module({
  imports: [
    forwardRef(() => WfmModule),
    TypeOrmModule.forFeature([
      SupportTicket,
      TicketComment,
      TicketTimelineEvent,
      TicketSlaPolicy,
      TicketPqrRecord,
      TicketWorkOrderLink,
    ]),
    BullModule.registerQueue({
      name: ASSURANCE_FIELD_SERVICE_QUEUE,
    }),
  ],
  controllers: [AssuranceController],
  providers: [
    TicketsService,
    CommentsService,
    TimelineService,
    SlaService,
    PqrService,
    AssuranceDashboardService,
    {
      provide: AssuranceFieldServicePort,
      useClass: AssuranceFieldServiceAdapter,
    },
    {
      provide: ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT,
      useClass: AssuranceExecutionOrderNotifierAdapter,
    },
  ],
  exports: [ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT],
})
export class AssuranceModule {}
