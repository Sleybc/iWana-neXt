import { Injectable } from '@nestjs/common';

export interface WorkOrderReference {
  workOrderId: string;
  status: string;
}

@Injectable()
export abstract class WorkOrderReferencePort {
  abstract ensureReference(input: {
    tenantId: string;
    schemaName: string;
    workOrderId: string;
  }): Promise<WorkOrderReference>;
}
