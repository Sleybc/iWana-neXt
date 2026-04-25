import { Injectable } from '@nestjs/common';
import {
  WorkOrderReferencePort,
  type WorkOrderReference,
} from '../ports/work-order-reference.port';

@Injectable()
export class StubWorkOrderReferenceAdapter extends WorkOrderReferencePort {
  async ensureReference(input: { workOrderId: string }): Promise<WorkOrderReference> {
    return { workOrderId: input.workOrderId, status: 'REGISTERED' };
  }
}
