import { Processor, WorkerHost } from '@nestjs/bullmq';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';
import { InjectDataSource } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  isValidSchemaName,
  readFieldServiceTicketContext,
  runInTenantSchema,
  VisitRequest,
} from '@iwana/db';
import {
  ASSURANCE_FIELD_SERVICE_QUEUE,
  type FieldServiceRequest,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';

@Processor(ASSURANCE_FIELD_SERVICE_QUEUE)
export class AssuranceFieldServiceProcessor extends WorkerHost {
  private readonly logger = new Logger(AssuranceFieldServiceProcessor.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  @SanitizeFailedReason()
  async process(job: Job<FieldServiceRequest>): Promise<void> {
    if (job.name !== 'request-field-service') {
      this.logger.warn(`Job Assurance no soportado: ${job.name}`);
      return;
    }

    const payload = job.data;

    if (!isValidSchemaName(payload.schemaName)) {
      throw new UnrecoverableError(
        `schemaName invalido para request-field-service: ${payload.schemaName}`,
      );
    }

    await runInTenantSchema(this.dataSource, payload.schemaName, async (qr) => {
      // sec-eng C-1: el job solo lleva ids; asunto, prioridad y notas los lee el lector de
      // Assurance publicado en @iwana/db (ADR-076 D6), que espera el commit del API.
      const ticket = await readFieldServiceTicketContext(qr, payload);
      if (!ticket) {
        // Sin ticket o sin solicitud: la transacción del API se revirtió después de encolar.
        this.logger.warn(
          `request-field-service sin solicitud confirmada: ticketId=${payload.ticketId}`,
        );
        return;
      }

      const duplicate = await qr.manager
        .createQueryBuilder(VisitRequest, 'vr')
        .where('vr.tenant_id = :tenantId', { tenantId: payload.tenantId })
        .andWhere('vr.origin_context = :originContext', {
          originContext: WorkOrderSourceContext.ASSURANCE,
        })
        .andWhere('vr.origin_ref = :originRef', { originRef: payload.ticketId })
        .andWhere('vr.deleted_at IS NULL')
        .andWhere('vr.status NOT IN (:...terminalStatuses)', {
          terminalStatuses: [
            VisitRequestStatus.SCHEDULED,
            VisitRequestStatus.CANCELLED,
            VisitRequestStatus.REJECTED,
            VisitRequestStatus.EXPIRED,
          ],
        })
        .orderBy('vr.created_at', 'DESC')
        .getOne();

      if (duplicate) {
        return;
      }

      const visitRequest = qr.manager.create(VisitRequest, {
        tenantId: payload.tenantId,
        status: VisitRequestStatus.NEEDS_CONTEXT,
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: payload.ticketId,
        // Rótulo visible en Programación: el número del ticket, nunca su identificador interno.
        originLabel: ticket.ticketNumber
          ? `Ticket ${ticket.ticketNumber}`
          : 'Ticket de Mesa de ayuda',
        workType: WfmWorkType.SUPPORT,
        priority: this.mapPriority(ticket.priority),
        title: ticket.subject.slice(0, 160),
        description: ticket.notes,
        ticketId: payload.ticketId,
        requestedByUserId: payload.requestedByUserId,
      });

      try {
        await qr.manager.save(VisitRequest, visitRequest);
      } catch (error) {
        const candidate = error as { code?: string; constraint?: string; driverError?: unknown };
        const driverError = candidate.driverError as
          | { code?: string; constraint?: string }
          | undefined;

        if (
          (candidate.code === '23505' || driverError?.code === '23505') &&
          (candidate.constraint === 'idx_visit_requests_active_origin_unique' ||
            driverError?.constraint === 'idx_visit_requests_active_origin_unique')
        ) {
          return;
        }

        throw error;
      }
    });
  }

  private mapPriority(priority: string): WorkOrderPriority {
    switch (priority) {
      case 'LOW':
        return WorkOrderPriority.LOW;
      case 'HIGH':
        return WorkOrderPriority.HIGH;
      case 'URGENT':
      case 'CRITICAL':
        return WorkOrderPriority.URGENT;
      default:
        return WorkOrderPriority.NORMAL;
    }
  }
}
