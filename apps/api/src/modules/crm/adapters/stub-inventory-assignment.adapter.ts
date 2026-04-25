import { Injectable } from '@nestjs/common';
import {
  InventoryAssignmentPort,
  type InventoryAssignmentReference,
} from '../ports/inventory-assignment.port';

@Injectable()
export class StubInventoryAssignmentAdapter extends InventoryAssignmentPort {
  async registerAssignment(input: { prospectId: string }): Promise<InventoryAssignmentReference> {
    return { inventoryAssignmentRef: `inv-${input.prospectId}` };
  }
}
