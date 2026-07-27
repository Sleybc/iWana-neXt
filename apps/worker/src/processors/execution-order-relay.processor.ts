import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { OPERATIONS_EXECUTION_RELAY_QUEUE } from '@iwana/shared';
import { ExecutionOrderRelayService } from '../services/execution-order-relay.service';

@Injectable()
@Processor(OPERATIONS_EXECUTION_RELAY_QUEUE)
export class ExecutionOrderRelayProcessor extends WorkerHost {
  constructor(private readonly relay: ExecutionOrderRelayService) {
    super();
  }
  async process(_job: Job): Promise<void> {
    await this.relay.scanAndRelay();
  }
}
