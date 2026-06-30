import { Injectable } from '@nestjs/common';

export interface InventoryAssignmentReference {
  inventoryAssignmentRef: string;
}

@Injectable()
export abstract class InventoryAssignmentPort {
  abstract registerAssignment(input: {
    tenantId: string;
    schemaName: string;
    prospectId: string;
  }): Promise<InventoryAssignmentReference>;
}
