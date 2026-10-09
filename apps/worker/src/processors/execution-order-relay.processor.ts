import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
  INVENTORY_SOURCE_MAX_AGE_MS,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_RELAY_QUEUE,
} from '@iwana/shared';
import { ExecutionOrderRelayService } from '../services/execution-order-relay.service';
import { ExecutionOrderInventoryRescanService } from '../services/execution-order-inventory-rescan.service';

const FAILED_JOBS_BATCH_SIZE = 1_000;
const INVENTORY_SOURCE_CLEANUP_JOB = 'clean-expired-inventory-source-failures';

function cleanupErrorType(error: unknown): string {
  const knownTypes = new Set(['Error', 'QueryFailedError', 'TimeoutError', 'AbortError']);
  return error instanceof Error && knownTypes.has(error.name)
    ? error.name
    : 'INVENTORY_SOURCE_CLEANUP_FAILURE';
}

@Injectable()
@Processor(OPERATIONS_EXECUTION_RELAY_QUEUE)
export class ExecutionOrderRelayProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionOrderRelayProcessor.name);

  constructor(
    private readonly relay: ExecutionOrderRelayService,
    private readonly inventoryRescan: ExecutionOrderInventoryRescanService,
    @InjectQueue(OPERATIONS_EXECUTION_EVENTS_QUEUE)
    private readonly operationsEventsQueue: Queue,
    @InjectQueue(INVENTORY_EXECUTION_REQUESTS_QUEUE)
    private readonly inventoryRequestsQueue: Queue,
  ) {
    super();
  }
  async process(job: Job): Promise<void> {
    if (job.name === INVENTORY_SOURCE_CLEANUP_JOB) {
      await this.removeExpiredInventorySourceJobs();
      return;
    }
    if (job.name === 'scan-pending-inventory-consumptions') {
      await this.inventoryRescan.scanPendingRequests();
      return;
    }
    await this.relay.scanAndRelay();
  }

  private async removeExpiredInventorySourceJobs(): Promise<void> {
    await Promise.all([
      this.removeExpiredJobs(this.inventoryRequestsQueue, 'inventory-execution-requests'),
      this.removeExpiredJobs(this.operationsEventsQueue, 'operations-execution-events'),
    ]);
  }

  private async removeExpiredJobs(queue: Queue, queueName: string): Promise<void> {
    try {
      let removed: string[];
      do {
        removed = await queue.clean(
          INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
          FAILED_JOBS_BATCH_SIZE,
          'failed',
        );
      } while (removed.length === FAILED_JOBS_BATCH_SIZE);
    } catch (error) {
      this.logger.warn(
        `[execution-relay] inventory_source_cleanup_failed queue=${queueName} ` +
          `error_type=${cleanupErrorType(error)}`,
      );
    }
  }
}
