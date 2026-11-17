import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SupportTicket,
  TicketComment,
  TicketCommentAttachment,
  TicketPqrRecord,
  TicketSlaPolicy,
  TicketTimelineEvent,
  TicketWorkOrderLink,
} from '@iwana/db';
import { ASSURANCE_FIELD_SERVICE_QUEUE } from '@iwana/shared';
import { WfmModule } from '../wfm/wfm.module';
import { SubscribersModule } from '../crm/subscribers/subscribers.module';
import { ExecutionOrderSchedulingModule } from '../tasks/execution-order-scheduling.module';
import { AssuranceAssigneeNamesModule } from '../users/ports/assurance-assignee-names.module';
import { AssuranceController } from './assurance.controller';
import { AccessControlModule } from '../access-control/access-control.module';
import { MediaModule } from '../media/media.module';
import { AssuranceExecutionOrderNotifierAdapter } from './ports/assurance-execution-order-notifier.adapter';
import { AssuranceFieldServiceAdapter } from './ports/assurance-field-service.adapter';
import { AssuranceFieldServicePort } from './ports/assurance-field-service.port';
import { AssuranceSubscriberTicketLinksReadAdapter } from './ports/assurance-subscriber-ticket-links-read.adapter';
import { AssuranceSubscriberTicketLinksReadPort } from './ports/assurance-subscriber-ticket-links-read.port';
import { ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT } from '../tasks/ports/assurance-execution-order-notifier.port';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { PqrService } from './services/pqr.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';
import { TicketAttachmentsService } from './services/ticket-attachments.service';

@Module({
  imports: [
    forwardRef(() => WfmModule),
    SubscribersModule,
    // Puerto de lectura de órdenes de ejecución (MOD10 D4) sin importar TasksModule (ciclo).
    ExecutionOrderSchedulingModule,
    // Nombre del responsable en el listado (spec MOD05 Soporte §16 B-1), solo el puerto.
    AssuranceAssigneeNamesModule,
    TypeOrmModule.forFeature([
      SupportTicket,
      TicketComment,
      TicketCommentAttachment,
      TicketTimelineEvent,
      TicketSlaPolicy,
      TicketPqrRecord,
      TicketWorkOrderLink,
    ]),
    BullModule.registerQueue({
      name: ASSURANCE_FIELD_SERVICE_QUEUE,
    }),
    AccessControlModule,
    // Solo por el puerto TicketAttachmentMediaPort (adjuntos de tickets, spec MOD09 §2.2).
    MediaModule,
  ],
  controllers: [AssuranceController],
  providers: [
    TicketsService,
    CommentsService,
    TimelineService,
    SlaService,
    PqrService,
    AssuranceDashboardService,
    TicketAttachmentsService,
    {
      provide: AssuranceSubscriberTicketLinksReadPort,
      useClass: AssuranceSubscriberTicketLinksReadAdapter,
    },
    {
      provide: AssuranceFieldServicePort,
      useClass: AssuranceFieldServiceAdapter,
    },
    {
      provide: ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT,
      useClass: AssuranceExecutionOrderNotifierAdapter,
    },
  ],
  exports: [ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT, AssuranceSubscriberTicketLinksReadPort],
})
export class AssuranceModule {}
