import { Injectable } from '@nestjs/common';
import { ExecutionPolicyMode } from '../enums/execution-policy-mode.enum';

export interface ExecutionPolicySnapshot {
  ref: string;
  mode: ExecutionPolicyMode;
  requiresApproval: boolean;
  sourceModule: 'MOD03';
}

@Injectable()
export abstract class ExecutionPolicyReadPort {
  abstract resolvePolicy(tenantId: string, schemaName: string): Promise<ExecutionPolicySnapshot>;
}
