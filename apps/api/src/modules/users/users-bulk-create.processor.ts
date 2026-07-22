import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  USERS_BULK_CREATE_JOB,
  USERS_BULK_CREATE_QUEUE,
  type UsersBulkCreateJobPayload,
} from '@iwana/shared';
import { UsersService } from './users.service';

/**
 * Consumidor del job de alta masiva.
 *
 * Vive en `@iwana/api` (no en worker) porque reutiliza `UsersService.create`
 * (audit, idempotencia, search queue, límites de rol). El payload trae tenant
 * explícito; ALS no se usa. Deuda residual: mover a `@iwana/worker` cuando el
 * alta de usuario se extraiga a un servicio de dominio compartido.
 */
@Processor(USERS_BULK_CREATE_QUEUE)
export class UsersBulkCreateProcessor extends WorkerHost {
  private readonly logger = new Logger(UsersBulkCreateProcessor.name);

  constructor(private readonly usersService: UsersService) {
    super();
  }

  async process(job: Job<UsersBulkCreateJobPayload>): Promise<void> {
    if (job.name !== USERS_BULK_CREATE_JOB) {
      this.logger.warn(`Job de bulk users no soportado: ${job.name}`);
      return;
    }

    const jobId = String(job.id);
    this.logger.log(
      `Procesando bulk create job=${jobId} tenant=${job.data.tenantId} items=${job.data.users.length}`,
    );
    await this.usersService.executeBulkCreateJob(job.data, jobId);
  }
}
