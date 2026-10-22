import { z } from 'zod';

export const CONTROL_METHODS = ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'] as const;
export type ControlMethod = (typeof CONTROL_METHODS)[number];

export const SERVICE_PROVISIONING_STATUSES = [
  'RESERVED',
  'CERTIFIED',
  'ACTIVE',
  'FAILED',
  'RELEASED',
] as const;
export type ServiceProvisioningStatus = (typeof SERVICE_PROVISIONING_STATUSES)[number];

export const IP_ASSIGNMENT_STATUSES = ['RESERVED', 'ACTIVE', 'RELEASED'] as const;
export type IpAssignmentStatus = (typeof IP_ASSIGNMENT_STATUSES)[number];

export const PROVISIONING_RELEASE_REASONS = [
  'NOT_EXECUTED',
  'CANCELLED',
  'ANNULLED',
  'REPLACED',
  'MANUAL',
  'RECONCILED',
] as const;
export type ProvisioningReleaseReason = (typeof PROVISIONING_RELEASE_REASONS)[number];

export const COMMERCIAL_ACTIVATION_STATUSES = [
  'NOT_APPLICABLE',
  'PENDING',
  'DONE',
  'BLOCKED',
] as const;
export type CommercialActivationStatus = (typeof COMMERCIAL_ACTIVATION_STATUSES)[number];

const controlNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

export const ControlParamsSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('SIMPLE_QUEUE_STATIC_IP'),
      queueName: controlNameSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal('PCQ_ADDRESS_LIST'),
      addressList: controlNameSchema,
    })
    .strict(),
]);

export type ControlParams = z.infer<typeof ControlParamsSchema>;

export const NetworkExecutionEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([
    'ExecutionOrderClosedV1',
    'ExecutionOrderCancelledV1',
    'ExecutionOrderAnnulledV1',
  ]),
  executionOrderId: z.string().uuid(),
  aggregateVersion: z.number().int().positive(),
  result: z
    .enum(['EXECUTED', 'EXECUTED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'])
    .nullable(),
  occurredAt: z.string().datetime(),
});

export type NetworkExecutionEvent = z.infer<typeof NetworkExecutionEventSchema>;

export const SignedNetworkExecutionEventSchema = z.object({
  tenantId: z.string().uuid(),
  envelope: NetworkExecutionEventSchema,
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export type SignedNetworkExecutionEvent = z.infer<typeof SignedNetworkExecutionEventSchema>;

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sortJsonKeys(item)]),
    );
  }
  return value;
}

/** JSON canónico compartido por el firmante worker y el verificador API. */
export function canonicalizeNetworkExecutionEvent(
  tenantId: string,
  event: NetworkExecutionEvent,
): string {
  return JSON.stringify(sortJsonKeys({ tenantId, envelope: event }));
}
