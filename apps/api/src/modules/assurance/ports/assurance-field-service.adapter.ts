import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ASSURANCE_FIELD_SERVICE_QUEUE, type FieldServiceRequest } from '@iwana/shared';
import { AssuranceFieldServicePort } from './assurance-field-service.port';

@Injectable()
export class AssuranceFieldServiceAdapter extends AssuranceFieldServicePort {
  private readonly logger = new Logger(AssuranceFieldServiceAdapter.name);

  constructor(
    @Optional()
    @InjectQueue(ASSURANCE_FIELD_SERVICE_QUEUE)
    private readonly queue?: Queue<FieldServiceRequest>,
  ) {
    super();
  }

  async requestFieldService(req: FieldServiceRequest): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `[${ASSURANCE_FIELD_SERVICE_QUEUE}] DEGRADED MODE: queue unavailable, request NOT sent to WFM consumer. ticketId=${req.ticketId} tenant=${req.tenantId}`,
      );
      return;
    }

    await this.queue.add('request-field-service', req, {
      jobId: `assurance-field-service-${req.tenantId}-${req.ticketId}`,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
