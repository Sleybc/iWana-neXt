import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { TenantContext, summarizeErrorForLog } from '@iwana/db';
import {
  CONTRACT_SIGNED_COPY_JOB,
  CONTRACT_SIGNED_COPY_QUEUE,
  contractSignedCopyJobId,
  type ContractSignedCopyJobPayload,
} from './contract-signed-copy.constants';

/**
 * Encola la copia del contrato firmado (bloque G; CA-9). Asíncrona: la firma no espera el
 * correo ni falla si la cola no responde; el replay de la firma vuelve a encolarla y el
 * jobId por firma más `copy_email_status` evitan el doble envío.
 */
@Injectable()
export class ContractSignedCopyProducer {
  private readonly logger = new Logger(ContractSignedCopyProducer.name);

  constructor(@InjectQueue(CONTRACT_SIGNED_COPY_QUEUE) private readonly queue: Queue) {}

  async enqueue(signatureId: string): Promise<void> {
    const { tenantId, schemaName, tenantSlug } = TenantContext.getOrThrow();
    const payload: ContractSignedCopyJobPayload = { tenantId, tenantSlug, schemaName, signatureId };
    try {
      await this.queue.add(CONTRACT_SIGNED_COPY_JOB, payload, {
        jobId: contractSignedCopyJobId(signatureId),
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      });
    } catch (error) {
      this.logger.warn(
        `crm.contract.signed_copy_enqueue_failed signatureId=${signatureId} ` +
          summarizeErrorForLog(error),
      );
    }
  }
}
