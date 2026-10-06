import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { OPERATIONS_EXECUTION_RELAY_QUEUE } from '@iwana/shared';
import { ExecutionOrderRelayService } from '../services/execution-order-relay.service';
import { ExecutionOrderInventoryRescanService } from '../services/execution-order-inventory-rescan.service';

@Injectable()
@Processor(OPERATIONS_EXECUTION_RELAY_QUEUE)
export class ExecutionOrderRelayProcessor extends WorkerHost {
  constructor(
    private readonly relay: ExecutionOrderRelayService,
    private readonly inventoryRescan: ExecutionOrderInventoryRescanService,
  ) {
    super();
  }
  async process(job: Job): Promise<void> {
    if (job.name === 'scan-pending-inventory-consumptions') {
      await this.inventoryRescan.scanPendingRequests();
      return;
    }
    await this.relay.scanAndRelay();
  }
}
