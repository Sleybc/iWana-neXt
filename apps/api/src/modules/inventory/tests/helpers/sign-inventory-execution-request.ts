import { createHmac } from 'node:crypto';
import {
  canonicalizeInventoryExecutionRequest,
  InventoryConsumptionRequestedV2EnvelopeSchema,
  SignedInventoryExecutionRequestSchema,
  type SignedInventoryExecutionRequest,
} from '@iwana/shared';

export function signInventoryExecutionRequestForTest(
  tenantId: string,
  candidate: unknown,
  signingKey: string,
): SignedInventoryExecutionRequest {
  const envelope = InventoryConsumptionRequestedV2EnvelopeSchema.parse(candidate);
  const signature = createHmac('sha256', Buffer.from(signingKey, 'base64'))
    .update(canonicalizeInventoryExecutionRequest(tenantId, envelope))
    .digest('hex');

  return SignedInventoryExecutionRequestSchema.parse({ tenantId, envelope, signature });
}
