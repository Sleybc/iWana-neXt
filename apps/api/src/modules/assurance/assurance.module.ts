import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
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
import { AssuranceController } from './assurance.controller';
import { AssuranceFieldServiceAdapter } from './ports/assurance-field-service.adapter';
import { AssuranceFieldServicePort } from './ports/assurance-field-service.port';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { PqrService } from './services/pqr.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';

@Module({
  imports: [
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
  ],
})
export class AssuranceModule {}
